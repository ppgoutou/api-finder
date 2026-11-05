package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	USDTOrderSyncOpen   = "open"
	USDTOrderSyncClosed = "closed"

	USDTReceiptStatusCredited     = "credited"
	USDTReceiptStatusCreditFailed = "credit_failed"
	USDTReceiptStatusUnmatched    = "unmatched"
	USDTReceiptStatusResolved     = "resolved"

	USDTIntentStatusExpired   = "expired"
	USDTIntentStatusCancelled = "cancelled"

	usdtOrderSyncGraceSeconds = 3600
)

var ErrUSDTPayerMismatch = errors.New("usdt intent belongs to a different payer")

// USDTOrder holds the gateway side of a USDT top-up. The TopUp row with the
// same TradeNo stays the wallet's record of the order.
type USDTOrder struct {
	Id             int    `json:"id"`
	TradeNo        string `json:"trade_no" gorm:"type:varchar(64);uniqueIndex"`
	UserId         int    `json:"user_id" gorm:"index"`
	IntentId       string `json:"intent_id" gorm:"type:varchar(64);index"`
	CheckoutUrl    string `json:"-" gorm:"type:text"`
	ExpectedAmount string `json:"expected_amount" gorm:"type:varchar(40)"`
	ReceivedTotal  string `json:"received_total" gorm:"type:varchar(40)"`
	// DiscountRate is the preset discount in force when the order was made;
	// one USDT buys 1/DiscountRate USD of credit, whatever amount arrives.
	DiscountRate string `json:"discount_rate" gorm:"type:varchar(40)"`
	ExpiresAt    int64  `json:"expires_at" gorm:"index"`
	SyncStatus   string `json:"sync_status" gorm:"type:varchar(16);index"`
	CreatedAt    int64  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt    int64  `json:"updated_at" gorm:"autoUpdateTime"`
}

func (USDTOrder) TableName() string {
	return "usdt_orders"
}

// USDTReceipt is one on-chain transfer the gateway reported. The unique
// (network, tx_hash, log_index) is what keeps a transfer credited only once.
type USDTReceipt struct {
	Id             int    `json:"id"`
	Network        string `json:"network" gorm:"type:varchar(16);uniqueIndex:idx_usdt_receipt_transfer"`
	TxHash         string `json:"tx_hash" gorm:"type:varchar(64);uniqueIndex:idx_usdt_receipt_transfer"`
	LogIndex       int    `json:"log_index" gorm:"uniqueIndex:idx_usdt_receipt_transfer"`
	TradeNo        string `json:"trade_no" gorm:"type:varchar(64);index"`
	UserId         int    `json:"user_id" gorm:"index"`
	IntentId       string `json:"intent_id" gorm:"type:varchar(64)"`
	Kind           string `json:"kind" gorm:"type:varchar(32)"`
	Amount         string `json:"amount" gorm:"type:varchar(40)"`
	FromAddress    string `json:"from_address" gorm:"type:varchar(64)"`
	ToAddress      string `json:"to_address" gorm:"type:varchar(64)"`
	BlockTimestamp string `json:"block_timestamp" gorm:"type:varchar(40)"`
	CreditedQuota  int    `json:"credited_quota"`
	Status         string `json:"status" gorm:"type:varchar(16);index"`
	Note           string `json:"note" gorm:"type:varchar(255)"`
	CreatedAt      int64  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt      int64  `json:"updated_at" gorm:"autoUpdateTime"`
}

func (USDTReceipt) TableName() string {
	return "usdt_receipts"
}

// USDTIntentSnapshot is a gateway answer the caller has already validated
// against the configured environment and contract.
type USDTIntentSnapshot struct {
	IntentId      string
	TradeNo       string
	PayerRef      string
	Status        string
	ReceivedTotal string
	Receipts      []USDTReceipt
}

// USDTPayerRef is the stable payer identifier sent to the gateway.
func USDTPayerRef(userId int) string {
	return fmt.Sprintf("user-%d", userId)
}

// CreateUSDTOrder stores the wallet order and its gateway row together, before
// the gateway is called, so an answer lost in a timeout can still be matched.
func CreateUSDTOrder(topUp *TopUp, order *USDTOrder) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(topUp).Error; err != nil {
			return err
		}
		return tx.Create(order).Error
	})
}

// AttachUSDTIntent records the payment intent the gateway created for an order.
func AttachUSDTIntent(tradeNo string, intentId string, checkoutUrl string, expiresAt int64) error {
	return DB.Model(&USDTOrder{}).Where("trade_no = ?", tradeNo).Updates(map[string]any{
		"intent_id":    intentId,
		"checkout_url": checkoutUrl,
		"expires_at":   expiresAt,
	}).Error
}

// GetActiveUSDTOrder returns the user's order whose checkout page can still
// take a transfer. The gateway keeps the payer locked to it until it expires.
func GetActiveUSDTOrder(userId int, now int64) (*USDTOrder, error) {
	var order USDTOrder
	err := DB.Where("user_id = ? AND sync_status = ? AND expires_at > ? AND checkout_url <> ?",
		userId, USDTOrderSyncOpen, now, "").
		Order("id DESC").First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &order, nil
}

// GetOpenUSDTOrders lists the orders the background sync still has to poll.
func GetOpenUSDTOrders(limit int) ([]*USDTOrder, error) {
	var orders []*USDTOrder
	err := DB.Where("sync_status = ?", USDTOrderSyncOpen).Order("id ASC").Limit(limit).Find(&orders).Error
	return orders, err
}

// CloseUnpaidUSDTOrder ends an order that never received a credited transfer.
// A top-up that was credited in the meantime keeps its status.
func CloseUnpaidUSDTOrder(tradeNo string, targetStatus string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if topUp.PaymentProvider != PaymentProviderUSDT {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status == common.TopUpStatusPending {
			topUp.Status = targetStatus
			if err := tx.Save(topUp).Error; err != nil {
				return err
			}
		}
		return tx.Model(&USDTOrder{}).Where("trade_no = ?", tradeNo).
			Update("sync_status", USDTOrderSyncClosed).Error
	})
}

type usdtCredit struct {
	quota  int
	amount string
	rebate *AffRebate
}

// SettleUSDTIntent credits every transfer of the intent not yet credited. The
// wallet is paid per transfer by the amount that actually arrived, so
// underpaid, overpaid and repeated transfers all follow the same rule. It can
// be called any number of times with any snapshot of the same intent.
func SettleUSDTIntent(snapshot *USDTIntentSnapshot, callerIp string) error {
	topUp := &TopUp{}
	var credits []usdtCredit
	completedNow := false

	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("trade_no = ?", snapshot.TradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if topUp.PaymentProvider != PaymentProviderUSDT {
			return ErrPaymentMethodMismatch
		}
		if snapshot.PayerRef != USDTPayerRef(topUp.UserId) {
			return ErrUSDTPayerMismatch
		}
		order := &USDTOrder{}
		if err := tx.Where("trade_no = ?", snapshot.TradeNo).First(order).Error; err != nil {
			return err
		}
		discount, err := decimal.NewFromString(order.DiscountRate)
		if err != nil || !discount.IsPositive() {
			return fmt.Errorf("invalid usdt order discount rate: %q", order.DiscountRate)
		}

		creditFailed := false
		// The first credit replaces the expected credit stored at order time.
		money := decimal.Zero
		if topUp.Status == common.TopUpStatusSuccess {
			money = decimal.NewFromFloat(topUp.Money)
		}
		for i := range snapshot.Receipts {
			receipt := &snapshot.Receipts[i]
			credit, creditUSD, failed, err := settleUSDTReceipt(tx, topUp, receipt, discount)
			if err != nil {
				return err
			}
			creditFailed = creditFailed || failed
			if credit != nil {
				credits = append(credits, *credit)
				money = money.Add(creditUSD)
			}
		}

		if len(credits) > 0 {
			topUp.Money = money.InexactFloat64()
			if topUp.Status != common.TopUpStatusSuccess {
				topUp.Status = common.TopUpStatusSuccess
				topUp.CompleteTime = common.GetTimestamp()
				completedNow = true
			}
		}

		ended := snapshot.Status == USDTIntentStatusExpired || snapshot.Status == USDTIntentStatusCancelled
		if ended && !creditFailed && topUp.Status == common.TopUpStatusPending {
			topUp.Status = common.TopUpStatusExpired
		}
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		order.IntentId = snapshot.IntentId
		order.ReceivedTotal = snapshot.ReceivedTotal
		if ended || time.Now().Unix() > order.ExpiresAt+usdtOrderSyncGraceSeconds {
			order.SyncStatus = USDTOrderSyncClosed
		}
		return tx.Save(order).Error
	})
	if err != nil {
		return err
	}

	for _, credit := range credits {
		syncCreditUserQuotaCache(topUp.UserId, credit.quota, common.LogText("usdt topup"))
		RecordTopupLog(topUp.UserId, common.NewMessage("Online top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}", map[string]any{"quota": logger.FormatQuota(credit.quota), "amount": credit.amount + " USDT"}), callerIp, topUp.PaymentMethod, PaymentProviderUSDT)
		recordAffRebateLog(credit.rebate)
	}
	if completedNow {
		notifyTopUpCompleted(topUp.UserId, topUp.TradeNo)
	}
	return nil
}

// settleUSDTReceipt credits one transfer inside the settlement transaction. A
// wallet at its limit does not fail the transaction: the transfer is recorded
// as credit_failed so the rest of the intent settles and it can be retried.
func settleUSDTReceipt(tx *gorm.DB, topUp *TopUp, receipt *USDTReceipt, discount decimal.Decimal) (*usdtCredit, decimal.Decimal, bool, error) {
	row := &USDTReceipt{}
	err := tx.Where("network = ? AND tx_hash = ? AND log_index = ?", receipt.Network, receipt.TxHash, receipt.LogIndex).First(row).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, decimal.Zero, false, err
	}
	isNew := errors.Is(err, gorm.ErrRecordNotFound)
	if !isNew && (row.TradeNo != topUp.TradeNo || row.Status != USDTReceiptStatusCreditFailed) {
		return nil, decimal.Zero, false, nil
	}
	if isNew {
		*row = *receipt
		row.TradeNo = topUp.TradeNo
		row.UserId = topUp.UserId
	}

	amount, err := decimal.NewFromString(receipt.Amount)
	if err != nil || !amount.IsPositive() {
		return nil, decimal.Zero, false, fmt.Errorf("invalid usdt receipt amount: %q", receipt.Amount)
	}
	creditUSD := amount.Div(discount)
	quotaAmount := creditUSD.Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Floor()

	row.Status = USDTReceiptStatusCredited
	row.CreditedQuota = 0
	var quota int
	var rebate *AffRebate
	if quotaAmount.IsPositive() {
		var clampErr error
		quota, clampErr = common.WalletQuotaFromDecimalStrict(quotaAmount)
		if clampErr != nil {
			row.Status = USDTReceiptStatusCreditFailed
		} else {
			err = creditTopUpQuota(tx, topUp.UserId, quota, nil)
			switch {
			case err == nil:
				row.CreditedQuota = quota
				rebate, err = creditAffRebate(tx, topUp.UserId, AffRebateSourceTopUp, fmt.Sprintf("usdt:%s:%d", receipt.TxHash, receipt.LogIndex), quota)
				if err != nil {
					return nil, decimal.Zero, false, err
				}
			case errors.Is(err, ErrTopUpQuotaLimitExceeded), errors.Is(err, ErrInvalidTopUpQuota), errors.Is(err, gorm.ErrRecordNotFound):
				row.Status = USDTReceiptStatusCreditFailed
			default:
				return nil, decimal.Zero, false, err
			}
		}
	}
	if err := tx.Save(row).Error; err != nil {
		return nil, decimal.Zero, false, err
	}
	if row.Status == USDTReceiptStatusCreditFailed {
		return nil, decimal.Zero, true, nil
	}
	if row.CreditedQuota == 0 {
		return nil, decimal.Zero, false, nil
	}
	return &usdtCredit{quota: quota, amount: receipt.Amount, rebate: rebate}, creditUSD, false, nil
}

// RecordUnmatchedUSDTReceipt stores a transfer no order claims, for an
// administrator to handle. Delivering it again changes nothing.
func RecordUnmatchedUSDTReceipt(receipt *USDTReceipt) error {
	receipt.Status = USDTReceiptStatusUnmatched
	return DB.Clauses(clause.OnConflict{DoNothing: true}).Create(receipt).Error
}

// GetUSDTCreditFailedTradeNos lists orders with transfers still to be credited.
func GetUSDTCreditFailedTradeNos(limit int) ([]string, error) {
	var tradeNos []string
	err := DB.Model(&USDTReceipt{}).Where("status = ?", USDTReceiptStatusCreditFailed).
		Distinct("trade_no").Limit(limit).Pluck("trade_no", &tradeNos).Error
	return tradeNos, err
}

// GetUSDTExceptionReceipts lists the transfers that need an administrator.
func GetUSDTExceptionReceipts(pageInfo *common.PageInfo) ([]*USDTReceipt, int64, error) {
	var receipts []*USDTReceipt
	var total int64
	statuses := []string{USDTReceiptStatusUnmatched, USDTReceiptStatusCreditFailed}
	query := DB.Model(&USDTReceipt{}).Where("status IN ?", statuses)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id DESC").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&receipts).Error
	return receipts, total, err
}

// ResolveUSDTReceipt closes a transfer an administrator handled by hand, which
// also stops the automatic retry of a failed credit.
func ResolveUSDTReceipt(id int, note string) error {
	result := DB.Model(&USDTReceipt{}).
		Where("id = ? AND status IN ?", id, []string{USDTReceiptStatusUnmatched, USDTReceiptStatusCreditFailed}).
		Updates(map[string]any{"status": USDTReceiptStatusResolved, "note": strings.TrimSpace(note)})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
