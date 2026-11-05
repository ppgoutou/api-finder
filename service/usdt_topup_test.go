package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	usdtTestContract = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
	usdtTestDeposit  = "TDepositAddress11111111111111111111"
)

func usdtTestHash(seed int) string {
	return fmt.Sprintf("%064x", seed)
}

func usdtTestReceipt(seed int, amount string, kind string) usdtGatewayReceipt {
	return usdtGatewayReceipt{
		TxHash:    usdtTestHash(seed),
		LogIndex:  0,
		ToAddress: usdtTestDeposit,
		Amount:    amount,
		Kind:      kind,
	}
}

// usdtFakeGateway stands in for the gateway at the HTTP boundary and checks
// that every call carries a valid signature.
type usdtFakeGateway struct {
	t       *testing.T
	intents map[string]*usdtGatewayIntent
	// createResponses answers POSTs in order; once used up, intents are created.
	createResponses []int
	createCode      string
	feed            func(cursor string) (int, string)
	createCalls     int
}

func (g *usdtFakeGateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	require.NoError(g.t, err)
	expected := signUSDTRequest("api-secret", r.Method, r.URL.RequestURI(), body, r.Header.Get("X-Timestamp"), r.Header.Get("X-Nonce"))
	assert.Equal(g.t, expected, r.Header.Get("X-Signature"))
	assert.Equal(g.t, "cli_test", r.Header.Get("X-Client-Id"))

	w.Header().Set("Content-Type", "application/json")
	switch {
	case r.Method == http.MethodPost && r.URL.Path == usdtGatewayIntentsPath:
		g.handleCreate(w, r, body)
	case strings.HasPrefix(r.URL.Path, usdtGatewayIntentsPath+"/by-external-order/"):
		intent := g.intents[strings.TrimPrefix(r.URL.Path, usdtGatewayIntentsPath+"/by-external-order/")]
		if intent == nil {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		g.writeJSON(w, http.StatusOK, intent)
	case r.URL.Path == usdtGatewayReceiptsPath:
		status, payload := g.feed(r.URL.Query().Get("cursor"))
		w.WriteHeader(status)
		_, _ = w.Write([]byte(payload))
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (g *usdtFakeGateway) handleCreate(w http.ResponseWriter, r *http.Request, body []byte) {
	g.createCalls++
	assert.NotEmpty(g.t, r.Header.Get("Idempotency-Key"))
	if len(g.createResponses) > 0 {
		status := g.createResponses[0]
		g.createResponses = g.createResponses[1:]
		w.WriteHeader(status)
		_, _ = fmt.Fprintf(w, `{"error":{"code":%q,"message":"refused"}}`, g.createCode)
		return
	}
	var request usdtCreateIntentRequest
	require.NoError(g.t, common.Unmarshal(body, &request))
	intent := usdtTestIntent(request.ExternalOrderId, request.PayerRef, "open", "0.000000")
	g.intents[request.ExternalOrderId] = intent
	g.writeJSON(w, http.StatusCreated, intent)
}

func (g *usdtFakeGateway) writeJSON(w http.ResponseWriter, status int, value any) {
	payload, err := common.Marshal(value)
	require.NoError(g.t, err)
	w.WriteHeader(status)
	_, _ = w.Write(payload)
}

func usdtTestIntent(tradeNo string, payerRef string, status string, total string, receipts ...usdtGatewayReceipt) *usdtGatewayIntent {
	return &usdtGatewayIntent{
		Id:              "pi_01K4G000000000000000000000",
		ExternalOrderId: tradeNo,
		PayerRef:        payerRef,
		Status:          status,
		Network:         "tron",
		Environment:     "nile",
		Asset:           "USDT",
		ContractAddress: usdtTestContract,
		DepositAddress:  usdtTestDeposit,
		ReceivedTotal:   total,
		Receipts:        receipts,
		ExpiresAt:       time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339),
		CheckoutUrl:     "https://gateway.test/pay/token",
	}
}

func setupUSDTTest(t *testing.T, userId int, quota int) *usdtFakeGateway {
	t.Helper()
	for _, table := range []any{&model.USDTOrder{}, &model.USDTReceipt{}, &model.TopUp{}, &model.User{}, &model.Option{}} {
		require.NoError(t, model.DB.Unscoped().Where("1 = 1").Delete(table).Error)
	}
	require.NoError(t, model.DB.Create(&model.User{Id: userId, Username: fmt.Sprintf("usdt_%d", userId), AffCode: fmt.Sprintf("usdt%d", userId), Quota: quota, Status: common.UserStatusEnabled}).Error)

	common.OptionMap = map[string]string{}

	gateway := &usdtFakeGateway{t: t, intents: map[string]*usdtGatewayIntent{}}
	server := httptest.NewServer(gateway)
	t.Cleanup(server.Close)

	general := operation_setting.GetGeneralSetting()
	previousDisplay, previousRate := general.QuotaDisplayType, operation_setting.USDExchangeRate
	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
	operation_setting.USDExchangeRate = 6.8
	setting.USDTEnabled = true
	setting.USDTGatewayAddress = server.URL
	setting.USDTClientId = "cli_test"
	setting.USDTApiSecret = "api-secret"
	setting.USDTWebhookSecret = "hook-secret"
	setting.USDTEnvironment = "nile"
	setting.USDTContractAddress = usdtTestContract
	setting.USDTMinTopUp = 10
	setting.USDTReconcileCursor = ""
	t.Cleanup(func() {
		general.QuotaDisplayType = previousDisplay
		operation_setting.USDExchangeRate = previousRate
		setting.USDTEnabled = false
		setting.USDTGatewayAddress = ""
		setting.USDTReconcileCursor = ""
	})
	return gateway
}

func createUSDTTestOrder(t *testing.T, tradeNo string, userId int, discount string) {
	t.Helper()
	require.NoError(t, model.CreateUSDTOrder(&model.TopUp{
		UserId:          userId,
		Amount:          100,
		Money:           14.705882,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodUSDT,
		PaymentProvider: model.PaymentProviderUSDT,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}, &model.USDTOrder{
		TradeNo:        tradeNo,
		UserId:         userId,
		ExpectedAmount: "14.705883",
		DiscountRate:   discount,
		ExpiresAt:      time.Now().Add(30 * time.Minute).Unix(),
		SyncStatus:     model.USDTOrderSyncOpen,
	}))
}

func usdtTestQuota(t *testing.T, userId int) int {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.First(&user, userId).Error)
	return user.Quota
}

func usdtTestTopUp(t *testing.T, tradeNo string) *model.TopUp {
	t.Helper()
	topUp := model.GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp)
	return topUp
}

func usdtPaymentEvent(tradeNo string, eventType string) *usdtGatewayEvent {
	return &usdtGatewayEvent{Id: "evt_1", Type: eventType, Data: map[string]any{"external_order_id": tradeNo}}
}

func TestUSDTRequestSignatureMatchesKnownVector(t *testing.T) {
	signature := signUSDTRequest("test-secret", "POST", "/api/v1/payment-intents?x=1", []byte(`{"a":1}`), "1793843407", "nonce-12345")
	assert.Equal(t, "080ee9382c255ce94d827a4da9ec88ee7c80e5c093fd793727ea15c1ebb5c678", signature)
}

func TestUSDTWebhookSignatureVerification(t *testing.T) {
	const signature = "a187dfd5e2c8f7e0944e1d7bac3cc1c30bca665f77242d87b6c2ea6e36aa610e"
	sentAt := time.Unix(1793843407, 0)
	body := []byte(`{"a":1}`)

	assert.True(t, verifyUSDTWebhookSignature("hook-secret", "1793843407", body, signature, sentAt))
	assert.False(t, verifyUSDTWebhookSignature("hook-secret", "1793843407", []byte(`{"a":2}`), signature, sentAt), "changed body")
	assert.False(t, verifyUSDTWebhookSignature("other-secret", "1793843407", body, signature, sentAt), "wrong secret")
	assert.False(t, verifyUSDTWebhookSignature("hook-secret", "1793843407", body, signature, sentAt.Add(301*time.Second)), "replayed after the window")
	assert.False(t, verifyUSDTWebhookSignature("hook-secret", "not-a-time", body, signature, sentAt), "bad timestamp")
}

func TestUSDTQuoteFollowsAdminExchangeRateAndDiscount(t *testing.T) {
	setupUSDTTest(t, 9001, 0)

	quote := QuoteUSDTTopUp(100, "default")
	assert.Equal(t, "14.705883", quote.ExpectedAmount.StringFixed(6), "rounded up so the exact amount is never short")

	operation_setting.USDExchangeRate = 7
	assert.Equal(t, "14.285715", QuoteUSDTTopUp(100, "default").ExpectedAmount.StringFixed(6), "follows an admin rate change")

	paymentSetting := operation_setting.GetPaymentSetting()
	previous := paymentSetting.AmountDiscount
	paymentSetting.AmountDiscount = map[int]float64{100: 0.9}
	t.Cleanup(func() { paymentSetting.AmountDiscount = previous })
	discounted := QuoteUSDTTopUp(100, "default")
	assert.Equal(t, "12.857143", discounted.ExpectedAmount.StringFixed(6))
	assert.Equal(t, "0.9", discounted.Discount.String())
}

func TestUSDTMinTopUpIsSetInUSDAndShownInTheDisplayUnit(t *testing.T) {
	setupUSDTTest(t, 9015, 0)
	setting.USDTMinTopUp = 10

	assert.EqualValues(t, 68, GetUSDTMinTopUp(), "yuan site at 6.8")
	assert.Error(t, ValidateUSDTTopUpAmount(67))
	assert.NoError(t, ValidateUSDTTopUpAmount(68))

	operation_setting.USDExchangeRate = 7.05
	assert.EqualValues(t, 71, GetUSDTMinTopUp(), "rounded up so the minimum is never below 10 USD")

	general := operation_setting.GetGeneralSetting()
	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	assert.EqualValues(t, 10, GetUSDTMinTopUp())

	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
	assert.EqualValues(t, int64(10*common.QuotaPerUnit), GetUSDTMinTopUp())
}

func TestUSDTSettlementCreditsActualAmountOncePerTransfer(t *testing.T) {
	const userId, tradeNo = 9002, "usdt_settle"
	gateway := setupUSDTTest(t, userId, 0)
	createUSDTTestOrder(t, tradeNo, userId, "1")
	payer := model.USDTPayerRef(userId)
	ctx := context.Background()

	// Underpaid: 14 instead of 14.705883 credits what arrived.
	first := usdtTestReceipt(1, "14.000000", "received")
	gateway.intents[tradeNo] = usdtTestIntent(tradeNo, payer, "received", "14.000000", first)
	require.NoError(t, handleUSDTEvent(ctx, usdtPaymentEvent(tradeNo, usdtEventReceived)))
	assert.Equal(t, int(14*common.QuotaPerUnit), usdtTestQuota(t, userId))
	assert.Equal(t, common.TopUpStatusSuccess, usdtTestTopUp(t, tradeNo).Status)
	assert.InDelta(t, 14, usdtTestTopUp(t, tradeNo).Money, 1e-9)

	// The same event delivered again changes nothing.
	require.NoError(t, handleUSDTEvent(ctx, usdtPaymentEvent(tradeNo, usdtEventReceived)))
	assert.Equal(t, int(14*common.QuotaPerUnit), usdtTestQuota(t, userId))

	// A later transfer on the completed order is credited too.
	second := usdtTestReceipt(2, "2.500000", "additional_received")
	gateway.intents[tradeNo] = usdtTestIntent(tradeNo, payer, "received", "16.500000", first, second)
	require.NoError(t, handleUSDTEvent(ctx, usdtPaymentEvent(tradeNo, usdtEventAdditionalReceived)))
	assert.Equal(t, int(16.5*common.QuotaPerUnit), usdtTestQuota(t, userId))
	assert.InDelta(t, 16.5, usdtTestTopUp(t, tradeNo).Money, 1e-9)
}

func TestUSDTSettlementAppliesOrderDiscountNotCurrentRate(t *testing.T) {
	const userId, tradeNo = 9003, "usdt_discount"
	gateway := setupUSDTTest(t, userId, 0)
	createUSDTTestOrder(t, tradeNo, userId, "0.5")
	operation_setting.USDExchangeRate = 7.5

	gateway.intents[tradeNo] = usdtTestIntent(tradeNo, model.USDTPayerRef(userId), "received", "10.000000", usdtTestReceipt(3, "10.000000", "received"))
	require.NoError(t, handleUSDTEvent(context.Background(), usdtPaymentEvent(tradeNo, usdtEventReceived)))
	assert.Equal(t, int(20*common.QuotaPerUnit), usdtTestQuota(t, userId), "1 USDT buys 1/discount USD whatever the rate is now")
}

func TestUSDTSettlementRejectsAnswersFromOtherEnvironments(t *testing.T) {
	const userId, tradeNo = 9004, "usdt_guard"
	receipt := usdtTestReceipt(4, "100.000000", "received")
	cases := []struct {
		name   string
		mutate func(intent *usdtGatewayIntent)
	}{
		{"testnet answer on a mainnet site", func(intent *usdtGatewayIntent) { intent.Environment = "mainnet" }},
		{"another token contract", func(intent *usdtGatewayIntent) { intent.ContractAddress = "TFakeContract" }},
		{"another asset", func(intent *usdtGatewayIntent) { intent.Asset = "USDC" }},
		{"transfer to another address", func(intent *usdtGatewayIntent) { intent.Receipts[0].ToAddress = "TOther" }},
		{"amount disagreeing with raw amount", func(intent *usdtGatewayIntent) { intent.Receipts[0].RawAmount = "1000000" }},
		{"another payer's intent", func(intent *usdtGatewayIntent) { intent.PayerRef = "user-1" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gateway := setupUSDTTest(t, userId, 0)
			createUSDTTestOrder(t, tradeNo, userId, "1")
			intent := usdtTestIntent(tradeNo, model.USDTPayerRef(userId), "received", "100.000000", receipt)
			tc.mutate(intent)
			gateway.intents[tradeNo] = intent

			require.Error(t, handleUSDTEvent(context.Background(), usdtPaymentEvent(tradeNo, usdtEventReceived)))
			assert.Zero(t, usdtTestQuota(t, userId))
			assert.Equal(t, common.TopUpStatusPending, usdtTestTopUp(t, tradeNo).Status)
		})
	}
}

func TestUSDTCreditRetriedAfterWalletLimitClears(t *testing.T) {
	const userId, tradeNo = 9005, "usdt_limit"
	gateway := setupUSDTTest(t, userId, common.MaxWalletQuota)
	createUSDTTestOrder(t, tradeNo, userId, "1")
	gateway.intents[tradeNo] = usdtTestIntent(tradeNo, model.USDTPayerRef(userId), "received", "5.000000", usdtTestReceipt(5, "5.000000", "received"))
	ctx := context.Background()

	require.NoError(t, handleUSDTEvent(ctx, usdtPaymentEvent(tradeNo, usdtEventReceived)), "the money is on record, so the gateway can stop retrying")
	assert.Equal(t, common.TopUpStatusPending, usdtTestTopUp(t, tradeNo).Status)
	pending, _, err := model.GetUSDTExceptionReceipts(&common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.Len(t, pending, 1)
	assert.Equal(t, model.USDTReceiptStatusCreditFailed, pending[0].Status)

	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userId).Update("quota", 0).Error)
	syncOpenUSDTOrders(ctx)
	assert.Equal(t, int(5*common.QuotaPerUnit), usdtTestQuota(t, userId))
	assert.Equal(t, common.TopUpStatusSuccess, usdtTestTopUp(t, tradeNo).Status)
}

func TestUSDTExpiredOrderCreditedWhenLateTransferArrives(t *testing.T) {
	const userId, tradeNo = 9006, "usdt_late"
	gateway := setupUSDTTest(t, userId, 0)
	createUSDTTestOrder(t, tradeNo, userId, "1")
	payer := model.USDTPayerRef(userId)
	ctx := context.Background()

	gateway.intents[tradeNo] = usdtTestIntent(tradeNo, payer, "expired", "0.000000")
	require.NoError(t, handleUSDTEvent(ctx, usdtPaymentEvent(tradeNo, usdtEventExpired)))
	assert.Equal(t, common.TopUpStatusExpired, usdtTestTopUp(t, tradeNo).Status)
	open, err := model.GetOpenUSDTOrders(10)
	require.NoError(t, err)
	assert.Empty(t, open)

	gateway.intents[tradeNo] = usdtTestIntent(tradeNo, payer, "received", "3.000000", usdtTestReceipt(6, "3.000000", "received"))
	require.NoError(t, handleUSDTEvent(ctx, usdtPaymentEvent(tradeNo, usdtEventReceived)))
	assert.Equal(t, int(3*common.QuotaPerUnit), usdtTestQuota(t, userId))
	assert.Equal(t, common.TopUpStatusSuccess, usdtTestTopUp(t, tradeNo).Status)
}

func TestStartUSDTTopUpReusesTheUnfinishedOrder(t *testing.T) {
	const userId = 9007
	gateway := setupUSDTTest(t, userId, 0)
	ctx := context.Background()

	first, err := StartUSDTTopUp(ctx, userId, 100, "default", "https://site.test/wallet")
	require.NoError(t, err)
	assert.Equal(t, "https://gateway.test/pay/token", first.PayLink)
	assert.False(t, first.Reused)

	second, err := StartUSDTTopUp(ctx, userId, 500, "default", "https://site.test/wallet")
	require.NoError(t, err)
	assert.True(t, second.Reused)
	assert.Equal(t, first.PayLink, second.PayLink)
	assert.Equal(t, 1, gateway.createCalls)
}

func TestStartUSDTTopUpRecoversFromAnUnknownOutcome(t *testing.T) {
	const userId = 9008
	gateway := setupUSDTTest(t, userId, 0)
	gateway.createResponses = []int{http.StatusBadGateway}

	result, err := StartUSDTTopUp(context.Background(), userId, 100, "default", "")
	require.NoError(t, err)
	assert.NotEmpty(t, result.PayLink)
	assert.Equal(t, 2, gateway.createCalls, "repeated only after the lookup found nothing")

	var topUpCount int64
	require.NoError(t, model.DB.Model(&model.TopUp{}).Where("user_id = ?", userId).Count(&topUpCount).Error)
	assert.EqualValues(t, 1, topUpCount)
}

func TestStartUSDTTopUpClosesOrderOnDefiniteRefusal(t *testing.T) {
	const userId = 9009
	gateway := setupUSDTTest(t, userId, 0)
	gateway.createResponses = []int{http.StatusConflict}
	gateway.createCode = usdtGatewayErrPayerLock

	_, err := StartUSDTTopUp(context.Background(), userId, 100, "default", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unfinished USDT order")
	assert.Equal(t, 1, gateway.createCalls)

	var topUp model.TopUp
	require.NoError(t, model.DB.Where("user_id = ?", userId).First(&topUp).Error)
	assert.Equal(t, common.TopUpStatusFailed, topUp.Status)
}

func TestUSDTEventsThatNameNoOrder(t *testing.T) {
	setupUSDTTest(t, 9010, 0)
	ctx := context.Background()

	err := handleUSDTEvent(ctx, &usdtGatewayEvent{Id: "evt_x", Type: usdtEventReceived, Data: map[string]any{"foo": "bar"}})
	assert.Error(t, err, "money may have moved, so the event must be delivered again")
	assert.NoError(t, handleUSDTEvent(ctx, &usdtGatewayEvent{Id: "evt_y", Type: usdtEventExpired, Data: map[string]any{"foo": "bar"}}))
	assert.NoError(t, handleUSDTEvent(ctx, &usdtGatewayEvent{Id: "evt_z", Type: "sweep.confirmed"}))
}

func TestUSDTUnmatchedTransferRecordedOnceAndResolvable(t *testing.T) {
	setupUSDTTest(t, 9011, 0)
	event := &usdtGatewayEvent{Id: "evt_u", Type: usdtEventUnmatchedReceived, Data: map[string]any{
		"receipt": map[string]any{"tx_hash": usdtTestHash(7), "log_index": 2, "amount": "9.000000", "to_address": usdtTestDeposit},
	}}
	ctx := context.Background()
	require.NoError(t, handleUSDTEvent(ctx, event))
	require.NoError(t, handleUSDTEvent(ctx, event))

	page := &common.PageInfo{Page: 1, PageSize: 10}
	receipts, total, err := model.GetUSDTExceptionReceipts(page)
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	assert.Equal(t, 2, receipts[0].LogIndex)

	require.NoError(t, model.ResolveUSDTReceipt(receipts[0].Id, "refunded by hand"))
	_, total, err = model.GetUSDTExceptionReceipts(page)
	require.NoError(t, err)
	assert.Zero(t, total)
	assert.Error(t, model.ResolveUSDTReceipt(receipts[0].Id, "again"))
}

func TestUSDTUnmatchedTransferNamesTheUserWhoLastHeldTheAddress(t *testing.T) {
	const userId = 9014
	setupUSDTTest(t, userId, 0)
	ctx := context.Background()
	_, err := StartUSDTTopUp(ctx, userId, 100, "default", "")
	require.NoError(t, err)

	now := time.Now().UTC()
	cases := []struct {
		name    string
		logIdx  int
		to      string
		sent    string
		wantUid int
	}{
		{"sent to the order's address after it was made", 1, usdtTestDeposit, now.Add(time.Minute).Format(time.RFC3339), userId},
		{"sent before any order held the address", 2, usdtTestDeposit, now.Add(-time.Hour).Format(time.RFC3339), 0},
		{"sent to an address no order held", 3, "TOtherAddress", now.Add(time.Minute).Format(time.RFC3339), 0},
		{"sent at an unreadable time", 4, usdtTestDeposit, "soon", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			hash := usdtTestHash(20)
			require.NoError(t, handleUSDTEvent(ctx, &usdtGatewayEvent{Id: "evt", Type: usdtEventUnmatchedReceived, Data: map[string]any{
				"receipt": map[string]any{"tx_hash": hash, "log_index": tc.logIdx, "amount": "1.000000", "to_address": tc.to, "block_timestamp": tc.sent},
			}}))

			var receipt model.USDTReceipt
			require.NoError(t, model.DB.Where("tx_hash = ? AND log_index = ?", hash, tc.logIdx).First(&receipt).Error)
			assert.Equal(t, tc.wantUid, receipt.UserId)
			assert.Equal(t, model.USDTReceiptStatusUnmatched, receipt.Status)
			assert.Zero(t, receipt.CreditedQuota, "naming a user must not credit them")
		})
	}
	assert.Zero(t, usdtTestQuota(t, userId))
}

func TestUSDTReceiptFeedSavesCursorOnlyAfterEventsAreStored(t *testing.T) {
	const userId, tradeNo = 9012, "usdt_feed"
	gateway := setupUSDTTest(t, userId, 0)
	createUSDTTestOrder(t, tradeNo, userId, "1")
	gateway.intents[tradeNo] = usdtTestIntent(tradeNo, model.USDTPayerRef(userId), "received", "1.000000", usdtTestReceipt(8, "1.000000", "received"))
	feedPage := func(data string, next string) string {
		return fmt.Sprintf(`{"data":[%s],"meta":{"environment":"nile","next_cursor":%s,"has_more":false,"snapshot_sequence":1}}`, data, strconv.Quote(next))
	}
	ctx := context.Background()

	gateway.feed = func(string) (int, string) {
		return http.StatusOK, feedPage(`{"id":"evt_bad","type":"payment.received","data":{}}`, "after-bad")
	}
	require.Error(t, reconcileUSDTReceiptFeed(ctx))
	assert.Empty(t, setting.USDTReconcileCursor)

	gateway.feed = func(string) (int, string) {
		return http.StatusOK, feedPage(fmt.Sprintf(`{"id":"evt_ok","type":"payment.received","data":{"external_order_id":%q}}`, tradeNo), "cursor-1")
	}
	require.NoError(t, reconcileUSDTReceiptFeed(ctx))
	assert.Equal(t, "cursor-1", setting.USDTReconcileCursor)
	assert.Equal(t, int(common.QuotaPerUnit), usdtTestQuota(t, userId))

	// A cursor the gateway no longer accepts restarts from the beginning.
	var cursors []string
	gateway.feed = func(cursor string) (int, string) {
		cursors = append(cursors, cursor)
		if cursor != "" {
			return http.StatusUnprocessableEntity, `{"error":{"code":"RECONCILIATION_CURSOR_INVALID","message":"bad"}}`
		}
		return http.StatusOK, feedPage("", "cursor-2")
	}
	require.NoError(t, reconcileUSDTReceiptFeed(ctx))
	assert.Equal(t, []string{"cursor-1", ""}, cursors)
	assert.Equal(t, "cursor-2", setting.USDTReconcileCursor)
	assert.Equal(t, int(common.QuotaPerUnit), usdtTestQuota(t, userId), "re-read events do not credit twice")
}

func TestManualCompleteRefusesUSDTOrders(t *testing.T) {
	const userId, tradeNo = 9013, "usdt_manual"
	setupUSDTTest(t, userId, 0)
	createUSDTTestOrder(t, tradeNo, userId, "1")

	require.Error(t, model.ManualCompleteTopUp(tradeNo, "127.0.0.1"))
	assert.Zero(t, usdtTestQuota(t, userId), "the yuan Amount must never be credited as USD")
	assert.Equal(t, common.TopUpStatusPending, usdtTestTopUp(t, tradeNo).Status)
}
