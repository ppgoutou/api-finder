package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"github.com/thanhpk/randstr"
)

const (
	usdtIntentExpiresInSeconds = 1800
	usdtAmountDecimals         = 6
	usdtMaxTopUpAmount         = 10000
	// An order with no intent at the gateway this long after it was made was
	// never created there.
	usdtOrphanOrderSeconds = 600
	usdtSyncInterval       = time.Minute
	usdtSyncBatchSize      = 100
	usdtReconcileEveryTick = 5
	usdtReconcileMaxPages  = 20
	usdtWebhookCallerIp    = "usdt-gateway"

	usdtEventReceived           = "payment.received"
	usdtEventAdditionalReceived = "payment.additional_received"
	usdtEventExpired            = "payment.expired"
	usdtEventCancelled          = "payment.cancelled"
	usdtEventUnmatchedReceived  = "payment.unmatched_received"
)

// ErrUSDTWebhookUnauthorized is a webhook call that failed verification.
var ErrUSDTWebhookUnauthorized = errors.New("usdt webhook verification failed")

var usdtTxHashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// USDTQuote is what a wallet top-up amount costs and buys.
type USDTQuote struct {
	ExpectedAmount decimal.Decimal
	CreditUSD      decimal.Decimal
	Discount       decimal.Decimal
}

// USDTPayResult is the checkout a top-up request leads to. Reused is set when
// it is the user's unfinished order instead of a new one.
type USDTPayResult struct {
	PayLink string
	Reused  bool
}

// IsUSDTTopUpEnabled reports whether USDT top-ups can be taken.
func IsUSDTTopUpEnabled() bool {
	return operation_setting.IsPaymentComplianceConfirmed() && setting.IsUSDTConfigured()
}

// QuoteUSDTTopUp prices a wallet amount in USDT. One USDT counts as one USD, so
// the administrator's USD exchange rate alone turns a yuan amount into USDT.
// The group ratio raises price and credit alike, leaving the discount as the
// only thing that changes how much credit one USDT buys.
func QuoteUSDTTopUp(amount int64, group string) USDTQuote {
	baseUSD := decimal.NewFromInt(amount)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeTokens:
		baseUSD = baseUSD.Div(decimal.NewFromFloat(common.QuotaPerUnit))
	case operation_setting.QuotaDisplayTypeCNY:
		if operation_setting.USDExchangeRate > 0 {
			baseUSD = baseUSD.Div(decimal.NewFromFloat(operation_setting.USDExchangeRate))
		}
	}
	groupRatio := common.GetTopupGroupRatio(group)
	if groupRatio == 0 {
		groupRatio = 1
	}
	discount := decimal.NewFromInt(1)
	if rate, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok && rate > 0 {
		discount = decimal.NewFromFloat(rate)
	}
	creditUSD := baseUSD.Mul(decimal.NewFromFloat(groupRatio))
	return USDTQuote{
		// Rounded up so that paying exactly this amount is never short.
		ExpectedAmount: creditUSD.Mul(discount).RoundCeil(usdtAmountDecimals),
		CreditUSD:      creditUSD,
		Discount:       discount,
	}
}

// GetUSDTMinTopUp is the smallest wallet amount in the site's display unit.
func GetUSDTMinTopUp() int64 {
	minTopUp := int64(setting.USDTMinTopUp)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		minTopUp *= int64(common.QuotaPerUnit)
	}
	return minTopUp
}

// ValidateUSDTTopUpAmount applies the wallet's top-up bounds.
func ValidateUSDTTopUpAmount(amount int64) error {
	if amount < GetUSDTMinTopUp() {
		return common.NewMessage("Top-up amount cannot be less than {{min}}", map[string]any{"min": GetUSDTMinTopUp()})
	}
	if amount > usdtMaxTopUpAmount {
		return common.NewMessage("Top-up amount cannot exceed {{max}}", map[string]any{"max": usdtMaxTopUpAmount})
	}
	return nil
}

// StartUSDTTopUp sends the user to a checkout page. The gateway allows one
// open intent per payer until it expires, so an unfinished order is reused.
func StartUSDTTopUp(ctx context.Context, userId int, amount int64, group string, returnUrl string) (*USDTPayResult, error) {
	active, err := model.GetActiveUSDTOrder(userId, time.Now().Unix())
	if err != nil {
		return nil, err
	}
	if active != nil {
		return &USDTPayResult{PayLink: active.CheckoutUrl, Reused: true}, nil
	}

	quote := QuoteUSDTTopUp(amount, group)
	if !quote.ExpectedAmount.IsPositive() {
		return nil, common.NewMessage("Payment amount is too low")
	}

	reference := fmt.Sprintf("new-api-usdt-%d-%d-%s", userId, time.Now().UnixMilli(), randstr.String(4))
	tradeNo := "usdt_" + common.Sha1([]byte(reference))
	now := time.Now().Unix()
	expectedAmount := quote.ExpectedAmount.StringFixed(usdtAmountDecimals)
	topUp := &model.TopUp{
		UserId:          userId,
		Amount:          amount,
		Money:           quote.CreditUSD.InexactFloat64(),
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodUSDT,
		PaymentProvider: model.PaymentProviderUSDT,
		CreateTime:      now,
		Status:          common.TopUpStatusPending,
	}
	order := &model.USDTOrder{
		TradeNo:        tradeNo,
		UserId:         userId,
		ExpectedAmount: expectedAmount,
		ReceivedTotal:  "0",
		DiscountRate:   quote.Discount.String(),
		ExpiresAt:      now + usdtIntentExpiresInSeconds,
		SyncStatus:     model.USDTOrderSyncOpen,
	}
	if err := model.CreateUSDTOrder(topUp, order); err != nil {
		return nil, err
	}

	request := &usdtCreateIntentRequest{
		ExternalOrderId: tradeNo,
		PayerRef:        model.USDTPayerRef(userId),
		ExpectedAmount:  expectedAmount,
		ExpiresIn:       usdtIntentExpiresInSeconds,
	}
	if strings.HasPrefix(returnUrl, "https://") {
		request.ReturnUrl = &returnUrl
	}
	intent, err := createUSDTIntent(ctx, request)
	if err != nil {
		return nil, closeRefusedUSDTOrder(tradeNo, err)
	}
	if err := validateUSDTIntent(intent); err != nil {
		closeErr := model.CloseUnpaidUSDTOrder(tradeNo, common.TopUpStatusFailed)
		return nil, errors.Join(err, closeErr)
	}
	expiresAt, err := time.Parse(time.RFC3339, intent.ExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("invalid usdt intent expiry: %w", err)
	}
	if err := model.AttachUSDTIntent(tradeNo, intent.Id, intent.DepositAddress, intent.CheckoutUrl, expiresAt.Unix()); err != nil {
		return nil, err
	}
	return &USDTPayResult{PayLink: intent.CheckoutUrl}, nil
}

// closeRefusedUSDTOrder settles the local order after a failed create and
// returns the error to report. Only a definite refusal closes it: an unknown
// outcome stays open for the sync task, as the intent may exist at the gateway.
func closeRefusedUSDTOrder(tradeNo string, createErr error) error {
	if !isDefiniteUSDTRefusal(createErr) {
		return createErr
	}
	if err := model.CloseUnpaidUSDTOrder(tradeNo, common.TopUpStatusFailed); err != nil {
		return errors.Join(createErr, err)
	}
	var gatewayErr *usdtGatewayError
	if errors.As(createErr, &gatewayErr) && gatewayErr.Code == usdtGatewayErrPayerLock {
		return common.NewMessage("You have an unfinished USDT order. Please try again after it expires")
	}
	return createErr
}

// validateUSDTIntent rejects an answer that does not belong to the configured
// environment. It is what stops testnet money from buying real quota.
func validateUSDTIntent(intent *usdtGatewayIntent) error {
	if intent.Environment != strings.TrimSpace(setting.USDTEnvironment) {
		return fmt.Errorf("usdt intent environment %q does not match the configured one", intent.Environment)
	}
	if intent.Network != usdtGatewayNetwork || intent.Asset != usdtGatewayAsset {
		return fmt.Errorf("usdt intent has unexpected network %q or asset %q", intent.Network, intent.Asset)
	}
	if intent.ContractAddress != strings.TrimSpace(setting.USDTContractAddress) {
		return fmt.Errorf("usdt intent contract %q does not match the configured one", intent.ContractAddress)
	}
	if checkout, err := url.Parse(intent.CheckoutUrl); err != nil || checkout.Scheme != "https" || checkout.Host == "" {
		return errors.New("usdt intent has an invalid checkout url")
	}
	for i := range intent.Receipts {
		if err := validateUSDTReceipt(&intent.Receipts[i]); err != nil {
			return err
		}
		if intent.Receipts[i].ToAddress != intent.DepositAddress {
			return fmt.Errorf("usdt receipt %s was not sent to the intent's deposit address", intent.Receipts[i].TxHash)
		}
	}
	return nil
}

func validateUSDTReceipt(receipt *usdtGatewayReceipt) error {
	if !usdtTxHashPattern.MatchString(receipt.TxHash) || receipt.LogIndex < 0 {
		return fmt.Errorf("usdt receipt has invalid transfer id %q", receipt.TxHash)
	}
	amount, err := decimal.NewFromString(receipt.Amount)
	if err != nil || !amount.IsPositive() {
		return fmt.Errorf("usdt receipt %s has invalid amount %q", receipt.TxHash, receipt.Amount)
	}
	if receipt.RawAmount != "" {
		raw, err := decimal.NewFromString(receipt.RawAmount)
		if err != nil || !raw.Shift(-usdtAmountDecimals).Equal(amount) {
			return fmt.Errorf("usdt receipt %s amount %q does not match raw amount %q", receipt.TxHash, receipt.Amount, receipt.RawAmount)
		}
	}
	return nil
}

func settleUSDTGatewayIntent(intent *usdtGatewayIntent, callerIp string) error {
	if err := validateUSDTIntent(intent); err != nil {
		return err
	}
	snapshot := &model.USDTIntentSnapshot{
		IntentId:       intent.Id,
		TradeNo:        intent.ExternalOrderId,
		PayerRef:       intent.PayerRef,
		Status:         intent.Status,
		ReceivedTotal:  intent.ReceivedTotal,
		DepositAddress: intent.DepositAddress,
		Receipts:       make([]model.USDTReceipt, 0, len(intent.Receipts)),
	}
	for i := range intent.Receipts {
		receipt := &intent.Receipts[i]
		snapshot.Receipts = append(snapshot.Receipts, model.USDTReceipt{
			Network:        usdtGatewayNetwork,
			TxHash:         receipt.TxHash,
			LogIndex:       receipt.LogIndex,
			IntentId:       intent.Id,
			Kind:           receipt.Kind,
			Amount:         receipt.Amount,
			FromAddress:    receipt.FromAddress,
			ToAddress:      receipt.ToAddress,
			BlockTimestamp: receipt.BlockTimestamp,
		})
	}
	return model.SettleUSDTIntent(snapshot, callerIp)
}

// usdtEventReference finds the order an event is about. The contract leaves
// the fields of event data open, so both flat and nested shapes are accepted.
func usdtEventReference(data map[string]any) (tradeNo string, intentId string) {
	sources := []map[string]any{data}
	for _, key := range []string{"payment_intent", "intent"} {
		if nested, ok := data[key].(map[string]any); ok {
			sources = append(sources, nested)
		}
	}
	for _, source := range sources {
		if value, ok := source["external_order_id"].(string); ok && tradeNo == "" {
			tradeNo = value
		}
		for _, key := range []string{"payment_intent_id", "intent_id", "id"} {
			if value, ok := source[key].(string); ok && intentId == "" && strings.HasPrefix(value, "pi_") {
				intentId = value
			}
		}
	}
	return tradeNo, intentId
}

// usdtEventReceipt reads the Receipt in event data, flat or under "receipt".
func usdtEventReceipt(data map[string]any) (*usdtGatewayReceipt, error) {
	source := data
	if nested, ok := data["receipt"].(map[string]any); ok {
		source = nested
	}
	raw, err := common.Marshal(source)
	if err != nil {
		return nil, err
	}
	receipt := &usdtGatewayReceipt{}
	if err := common.Unmarshal(raw, receipt); err != nil {
		return nil, err
	}
	if err := validateUSDTReceipt(receipt); err != nil {
		return nil, err
	}
	return receipt, nil
}

// handleUSDTEvent applies one webhook or receipt feed event. Events only say
// that something changed: the money comes from querying the intent, because an
// event snapshot's received_total is not the order's latest total.
func handleUSDTEvent(ctx context.Context, event *usdtGatewayEvent) error {
	switch event.Type {
	case usdtEventUnmatchedReceived:
		receipt, err := usdtEventReceipt(event.Data)
		if err != nil {
			return err
		}
		return model.RecordUnmatchedUSDTReceipt(&model.USDTReceipt{
			Network:        usdtGatewayNetwork,
			TxHash:         receipt.TxHash,
			LogIndex:       receipt.LogIndex,
			Kind:           event.Type,
			Amount:         receipt.Amount,
			FromAddress:    receipt.FromAddress,
			ToAddress:      receipt.ToAddress,
			BlockTimestamp: receipt.BlockTimestamp,
		})
	case usdtEventReceived, usdtEventAdditionalReceived, usdtEventExpired, usdtEventCancelled:
	default:
		return nil
	}

	tradeNo, intentId := usdtEventReference(event.Data)
	var intent *usdtGatewayIntent
	var err error
	switch {
	case tradeNo != "":
		intent, err = getUSDTIntentByExternalOrder(ctx, tradeNo)
	case intentId != "":
		intent, err = getUSDTIntentById(ctx, intentId)
	case event.Type == usdtEventExpired || event.Type == usdtEventCancelled:
		// No money moved, and the sync task will see the new status itself.
		return nil
	default:
		// Refused so the gateway delivers it again and the failure stays visible.
		return fmt.Errorf("usdt event %s of type %s names no order", event.Id, event.Type)
	}
	if isUSDTGatewayStatus(err, http.StatusNotFound) {
		common.SysError(common.LogText("usdt event %s refers to an intent the gateway does not know", event.Id))
		return nil
	}
	if err != nil {
		return err
	}
	err = settleUSDTGatewayIntent(intent, usdtWebhookCallerIp)
	if errors.Is(err, model.ErrTopUpNotFound) {
		common.SysError(common.LogText("usdt event %s refers to an order this site does not have", event.Id))
		return nil
	}
	return err
}

// HandleUSDTWebhook verifies a webhook delivery and applies it. A nil error
// means the event is safely stored and the gateway can stop delivering it.
func HandleUSDTWebhook(ctx context.Context, timestamp string, signature string, body []byte) error {
	secret := strings.TrimSpace(setting.USDTWebhookSecret)
	if secret == "" || !verifyUSDTWebhookSignature(secret, timestamp, body, signature, time.Now()) {
		return ErrUSDTWebhookUnauthorized
	}
	event := &usdtGatewayEvent{}
	if err := common.Unmarshal(body, event); err != nil {
		return err
	}
	return handleUSDTEvent(ctx, event)
}

// syncOpenUSDTOrders polls unfinished orders so a lost webhook only delays a
// credit, and finishes orders whose intent was never created.
func syncOpenUSDTOrders(ctx context.Context) {
	orders, err := model.GetOpenUSDTOrders(usdtSyncBatchSize)
	if err != nil {
		common.SysError(common.LogText("failed to list open usdt orders: %s", err.Error()))
		return
	}
	for _, order := range orders {
		if err := syncUSDTOrder(ctx, order.TradeNo, order.CreatedAt); err != nil {
			common.SysError(common.LogText("failed to sync usdt order %s: %s", order.TradeNo, err.Error()))
			if isUSDTGatewayStatus(err, http.StatusTooManyRequests) {
				return
			}
		}
	}

	tradeNos, err := model.GetUSDTCreditFailedTradeNos(usdtSyncBatchSize)
	if err != nil {
		common.SysError(common.LogText("failed to list usdt credit retries: %s", err.Error()))
		return
	}
	for _, tradeNo := range tradeNos {
		if err := syncUSDTOrder(ctx, tradeNo, 0); err != nil {
			common.SysError(common.LogText("failed to sync usdt order %s: %s", tradeNo, err.Error()))
			if isUSDTGatewayStatus(err, http.StatusTooManyRequests) {
				return
			}
		}
	}
}

func syncUSDTOrder(ctx context.Context, tradeNo string, createdAt int64) error {
	intent, err := getUSDTIntentByExternalOrder(ctx, tradeNo)
	if isUSDTGatewayStatus(err, http.StatusNotFound) {
		if createdAt > 0 && time.Now().Unix()-createdAt > usdtOrphanOrderSeconds {
			return model.CloseUnpaidUSDTOrder(tradeNo, common.TopUpStatusExpired)
		}
		return nil
	}
	if err != nil {
		return err
	}
	return settleUSDTGatewayIntent(intent, usdtWebhookCallerIp)
}

// reconcileUSDTReceiptFeed walks the gateway's receipt feed from the saved
// cursor. A page's cursor is only saved after all its events are stored.
func reconcileUSDTReceiptFeed(ctx context.Context) error {
	cursor := setting.USDTReconcileCursor
	for range usdtReconcileMaxPages {
		query := url.Values{}
		query.Set("limit", fmt.Sprint(usdtGatewayReceiptsLimit))
		if cursor != "" {
			query.Set("cursor", cursor)
		}
		page := &usdtReceiptFeedPage{}
		err := callUSDTGateway(ctx, http.MethodGet, usdtGatewayReceiptsPath+"?"+query.Encode(), "", nil, page)
		if isUSDTGatewayStatus(err, http.StatusUnprocessableEntity) && cursor != "" {
			// The cursor no longer applies: read from the start, events dedupe.
			cursor = ""
			continue
		}
		if err != nil {
			return err
		}
		if page.Meta.Environment != strings.TrimSpace(setting.USDTEnvironment) {
			return fmt.Errorf("usdt receipt feed environment %q does not match the configured one", page.Meta.Environment)
		}
		for i := range page.Data {
			if err := handleUSDTEvent(ctx, &page.Data[i]); err != nil {
				return err
			}
		}
		if page.Meta.NextCursor != cursor {
			if err := model.UpdateOption("USDTReconcileCursor", page.Meta.NextCursor); err != nil {
				return err
			}
			cursor = page.Meta.NextCursor
		}
		if !page.Meta.HasMore {
			return nil
		}
	}
	return nil
}

// StartUSDTSyncTask runs the compensation for lost webhooks. Only the master
// instance runs it.
func StartUSDTSyncTask() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		ticker := time.NewTicker(usdtSyncInterval)
		defer ticker.Stop()
		for tick := 0; ; tick++ {
			<-ticker.C
			if !IsUSDTTopUpEnabled() {
				continue
			}
			ctx := context.Background()
			syncOpenUSDTOrders(ctx)
			if tick%usdtReconcileEveryTick == 0 {
				if err := reconcileUSDTReceiptFeed(ctx); err != nil {
					common.SysError(common.LogText("failed to reconcile usdt receipts: %s", err.Error()))
				}
			}
		}
	}()
}
