package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	AffRebateSourceTopUp      = "topup"
	AffRebateSourceRedemption = "redemption"

	// A pending rebate is locked until AvailableAt, then moves into the
	// inviter's wallet and becomes settled. Reversed rebates were taken back
	// because their payment was refunded or disputed.
	AffRebateStatusPending  = "pending"
	AffRebateStatusSettled  = "settled"
	AffRebateStatusReversed = "reversed"
	// AffRebateStatusCredited marks rebates written before the holding
	// period existed; their quota was added to the inviter's aff_quota.
	AffRebateStatusCredited = "credited"
)

// AffRebate records one invitation rebate: a share of an invitee's top-up or
// redemption that reaches the inviter's wallet AffRebateHoldDays after it
// was earned. The unique source keeps each payment or redemption code
// rebated once.
type AffRebate struct {
	Id          int    `json:"id"`
	InviterId   int    `json:"inviter_id" gorm:"index"`
	InviteeId   int    `json:"invitee_id" gorm:"index"`
	SourceType  string `json:"source_type" gorm:"type:varchar(16);uniqueIndex:idx_aff_rebate_source"`
	SourceRef   string `json:"-" gorm:"type:varchar(255);uniqueIndex:idx_aff_rebate_source"`
	SourceQuota int    `json:"source_quota"`
	RebateQuota int    `json:"rebate_quota"`
	Status      string `json:"status" gorm:"type:varchar(16);index"`
	CreatedAt   int64  `json:"created_at" gorm:"autoCreateTime"`
	AvailableAt int64  `json:"available_at" gorm:"index;default:0"`
	SettledAt   int64  `json:"settled_at" gorm:"default:0"`
}

// creditAffRebate records the inviter's share of a credit that is being
// added to inviteeId in tx. The share stays pending for AffRebateHoldDays so
// a refund inside that window takes it back before it reaches the wallet.
// It returns nil when nothing is owed: rebates are off, compliance is
// unconfirmed, the invitee has no live inviter, or the share rounds to zero.
func creditAffRebate(tx *gorm.DB, inviteeId int, sourceType string, sourceRef string, sourceQuota int) (*AffRebate, error) {
	if common.AffRebatePercent <= 0 || !operation_setting.IsPaymentComplianceConfirmed() {
		return nil, nil
	}
	var invitee User
	if err := tx.Select("id", "inviter_id").First(&invitee, inviteeId).Error; err != nil {
		return nil, err
	}
	if invitee.InviterId == 0 || invitee.InviterId == inviteeId {
		return nil, nil
	}
	var inviterCount int64
	if err := tx.Model(&User{}).Where("id = ?", invitee.InviterId).Count(&inviterCount).Error; err != nil {
		return nil, err
	}
	if inviterCount == 0 {
		// The inviter account was deleted; nobody is left to pay.
		return nil, nil
	}
	rebateQuota := int(decimal.NewFromInt(int64(sourceQuota)).
		Mul(decimal.NewFromFloat(common.AffRebatePercent)).
		Div(decimal.NewFromInt(100)).
		IntPart())
	if rebateQuota <= 0 {
		return nil, nil
	}
	now := common.GetTimestamp()
	rebate := &AffRebate{
		InviterId:   invitee.InviterId,
		InviteeId:   inviteeId,
		SourceType:  sourceType,
		SourceRef:   sourceRef,
		SourceQuota: sourceQuota,
		RebateQuota: rebateQuota,
		Status:      AffRebateStatusPending,
		CreatedAt:   now,
		AvailableAt: now + int64(max(common.AffRebateHoldDays, 0))*24*60*60,
	}
	if err := tx.Create(rebate).Error; err != nil {
		return nil, err
	}
	return rebate, nil
}

func recordAffRebateLog(rebate *AffRebate) {
	if rebate == nil {
		return
	}
	RecordLog(rebate.InviterId, LogTypeSystem, common.NewMessage("Invitation rebate {{quota}} earned, it reaches your balance on {{date}}", map[string]any{
		"quota": logger.FormatQuota(rebate.RebateQuota),
		"date":  time.Unix(rebate.AvailableAt, 0).Format(time.DateOnly),
	}))
}

// reverseAffRebate takes back the rebate earned from a source whose credit
// is being reversed in tx (a refunded or disputed payment). A pending rebate
// is simply cancelled. A settled one is debited from the wallet, which may
// go negative like the reversed top-up itself; a legacy credited one is
// debited from aff_quota first. It returns the reversed rebate and the part
// taken from the wallet, or nil when the source earned no rebate.
func reverseAffRebate(tx *gorm.DB, sourceType string, sourceRef string) (*AffRebate, int, error) {
	var rebate AffRebate
	err := lockForUpdate(tx).
		Where("source_type = ? AND source_ref = ? AND status IN ?", sourceType, sourceRef,
			[]string{AffRebateStatusPending, AffRebateStatusSettled, AffRebateStatusCredited}).
		First(&rebate).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, 0, nil
	}
	if err != nil {
		return nil, 0, err
	}
	fromPending, fromWallet := 0, 0
	switch rebate.Status {
	case AffRebateStatusSettled:
		fromWallet = rebate.RebateQuota
	case AffRebateStatusCredited:
		var inviter User
		if err := lockForUpdate(tx.Unscoped()).Select("id", "aff_quota").First(&inviter, rebate.InviterId).Error; err != nil {
			return nil, 0, err
		}
		fromPending = min(max(inviter.AffQuota, 0), rebate.RebateQuota)
		fromWallet = rebate.RebateQuota - fromPending
	}
	if fromPending > 0 || fromWallet > 0 {
		updates := map[string]any{"quota": gorm.Expr("quota - ?", fromWallet)}
		if rebate.Status == AffRebateStatusCredited {
			updates["aff_quota"] = gorm.Expr("aff_quota - ?", fromPending)
			updates["aff_history"] = gorm.Expr("aff_history - ?", rebate.RebateQuota)
		}
		if err := tx.Unscoped().Model(&User{}).Where("id = ?", rebate.InviterId).Updates(updates).Error; err != nil {
			return nil, 0, err
		}
	}
	rebate.Status = AffRebateStatusReversed
	if err := tx.Model(&AffRebate{}).Where("id = ?", rebate.Id).Update("status", rebate.Status).Error; err != nil {
		return nil, 0, err
	}
	return &rebate, fromWallet, nil
}

// restoreAffRebate earns a reversed rebate again after its source credit was
// restored (a dispute closed in the merchant's favour). It goes back to
// pending and reaches the wallet on its original date, or on the next
// settlement run when that date has passed.
func restoreAffRebate(tx *gorm.DB, sourceType string, sourceRef string) (*AffRebate, error) {
	var rebate AffRebate
	err := lockForUpdate(tx).
		Where("source_type = ? AND source_ref = ? AND status = ?", sourceType, sourceRef, AffRebateStatusReversed).
		First(&rebate).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rebate.Status = AffRebateStatusPending
	rebate.AvailableAt = max(rebate.AvailableAt, rebate.CreatedAt)
	if err := tx.Model(&AffRebate{}).Where("id = ?", rebate.Id).Updates(map[string]any{
		"status":       rebate.Status,
		"available_at": rebate.AvailableAt,
		"settled_at":   0,
	}).Error; err != nil {
		return nil, err
	}
	return &rebate, nil
}

// SettleDueAffRebates moves every pending rebate whose holding period ended
// by now into its inviter's wallet and returns how many were settled. A
// rebate that cannot be settled (inviter deleted, wallet at its ceiling)
// stays pending and is retried on the next run.
func SettleDueAffRebates(now int64) (int, error) {
	var ids []int
	if err := DB.Model(&AffRebate{}).
		Where("status = ? AND available_at <= ?", AffRebateStatusPending, now).
		Order("id").
		Pluck("id", &ids).Error; err != nil {
		return 0, err
	}
	settled := 0
	for _, id := range ids {
		var rebate AffRebate
		settledNow := false
		err := DB.Transaction(func(tx *gorm.DB) error {
			if err := lockForUpdate(tx).First(&rebate, id).Error; err != nil {
				return err
			}
			if rebate.Status != AffRebateStatusPending || rebate.AvailableAt > now {
				return nil
			}
			if err := creditTopUpQuota(tx, rebate.InviterId, rebate.RebateQuota, nil); err != nil {
				return err
			}
			settledNow = true
			return tx.Model(&AffRebate{}).Where("id = ?", rebate.Id).Updates(map[string]any{
				"status":     AffRebateStatusSettled,
				"settled_at": now,
			}).Error
		})
		if err != nil {
			common.SysError(common.LogText("failed to settle invitation rebate %d: %s", id, err.Error()))
			continue
		}
		if !settledNow {
			continue
		}
		settled++
		syncCreditUserQuotaCache(rebate.InviterId, rebate.RebateQuota, common.LogText("invitation rebate settlement"))
		RecordLog(rebate.InviterId, LogTypeSystem, common.NewMessage("Invitation rebate {{quota}} moved to balance", map[string]any{"quota": logger.FormatQuota(rebate.RebateQuota)}))
	}
	return settled, nil
}

// GetAffRebatesByInviterId lists the rebates earned by inviterId, newest
// first.
func GetAffRebatesByInviterId(inviterId int, pageInfo *common.PageInfo) ([]*AffRebate, int64, error) {
	var rebates []*AffRebate
	var total int64
	query := DB.Model(&AffRebate{}).Where("inviter_id = ?", inviterId)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&rebates).Error
	return rebates, total, err
}

// liveAffRebateStatuses are the rebates that count as earned: everything
// except reversed ones.
var liveAffRebateStatuses = []string{AffRebateStatusPending, AffRebateStatusSettled, AffRebateStatusCredited}

// SumAffRebatesByInvitee returns, per invitee, the rebates inviterId earned
// from them, reversed ones excluded.
func SumAffRebatesByInvitee(inviterId int, inviteeIds []int) (map[int]int, error) {
	sums := make(map[int]int, len(inviteeIds))
	if len(inviteeIds) == 0 {
		return sums, nil
	}
	var rows []struct {
		InviteeId int
		Total     int
	}
	err := DB.Model(&AffRebate{}).
		Select("invitee_id, SUM(rebate_quota) AS total").
		Where("inviter_id = ? AND status IN ? AND invitee_id IN ?", inviterId, liveAffRebateStatuses, inviteeIds).
		Group("invitee_id").
		Scan(&rows).Error
	for _, row := range rows {
		sums[row.InviteeId] = row.Total
	}
	return sums, err
}

// AffRebateSummary totals the rebates of one inviter: Pending is still in
// its holding period, Earned is every rebate not reversed.
type AffRebateSummary struct {
	PendingQuota int `json:"pending_quota"`
	EarnedQuota  int `json:"earned_quota"`
}

func GetAffRebateSummary(inviterId int) (AffRebateSummary, error) {
	var rows []struct {
		Status string
		Total  int
	}
	err := DB.Model(&AffRebate{}).
		Select("status, SUM(rebate_quota) AS total").
		Where("inviter_id = ? AND status IN ?", inviterId, liveAffRebateStatuses).
		Group("status").
		Scan(&rows).Error
	var summary AffRebateSummary
	for _, row := range rows {
		summary.EarnedQuota += row.Total
		if row.Status == AffRebateStatusPending {
			summary.PendingQuota += row.Total
		}
	}
	return summary, err
}
