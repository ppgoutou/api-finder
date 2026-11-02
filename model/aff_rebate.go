package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	AffRebateSourceTopUp      = "topup"
	AffRebateSourceRedemption = "redemption"

	AffRebateStatusCredited = "credited"
	AffRebateStatusReversed = "reversed"
)

// AffRebate records one invitation rebate: a share of an invitee's top-up or
// redemption, credited to the inviter's pending invitation quota (aff_quota).
// The unique source keeps each payment or redemption code rebated once.
type AffRebate struct {
	Id          int    `json:"id"`
	InviterId   int    `json:"inviter_id" gorm:"index"`
	InviteeId   int    `json:"invitee_id" gorm:"index"`
	SourceType  string `json:"source_type" gorm:"type:varchar(16);uniqueIndex:idx_aff_rebate_source"`
	SourceRef   string `json:"-" gorm:"type:varchar(255);uniqueIndex:idx_aff_rebate_source"`
	SourceQuota int    `json:"source_quota"`
	RebateQuota int    `json:"rebate_quota"`
	Status      string `json:"status" gorm:"type:varchar(16)"`
	CreatedAt   int64  `json:"created_at" gorm:"autoCreateTime"`
}

// creditAffRebate pays the inviter of inviteeId their share of a credit that
// is being added in tx. It returns nil when nothing is owed: rebates are off,
// compliance is unconfirmed, the invitee has no (live) inviter, or the share
// rounds down to zero.
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
	rebateQuota := int(decimal.NewFromInt(int64(sourceQuota)).
		Mul(decimal.NewFromFloat(common.AffRebatePercent)).
		Div(decimal.NewFromInt(100)).
		IntPart())
	if rebateQuota <= 0 {
		return nil, nil
	}
	result := tx.Model(&User{}).Where("id = ?", invitee.InviterId).Updates(map[string]any{
		"aff_quota":   gorm.Expr("aff_quota + ?", rebateQuota),
		"aff_history": gorm.Expr("aff_history + ?", rebateQuota),
	})
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		// The inviter account was deleted; nobody is left to pay.
		return nil, nil
	}
	rebate := &AffRebate{
		InviterId:   invitee.InviterId,
		InviteeId:   inviteeId,
		SourceType:  sourceType,
		SourceRef:   sourceRef,
		SourceQuota: sourceQuota,
		RebateQuota: rebateQuota,
		Status:      AffRebateStatusCredited,
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
	RecordLog(rebate.InviterId, LogTypeSystem, common.NewMessage("Invitation rebate {{quota}} added to pending invitation quota", map[string]any{"quota": logger.FormatQuota(rebate.RebateQuota)}))
}

// reverseAffRebate takes back the rebate paid for a source whose credit is
// being reversed in tx (a refunded or disputed payment). The pending
// invitation quota is debited first; whatever already moved to the wallet
// is debited from the wallet, which may go negative like the reversed
// top-up itself. It returns the reversed rebate and the part taken from the
// wallet, or nil when the source earned no rebate.
func reverseAffRebate(tx *gorm.DB, sourceType string, sourceRef string) (*AffRebate, int, error) {
	var rebate AffRebate
	err := lockForUpdate(tx).
		Where("source_type = ? AND source_ref = ? AND status = ?", sourceType, sourceRef, AffRebateStatusCredited).
		First(&rebate).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, 0, nil
	}
	if err != nil {
		return nil, 0, err
	}
	var inviter User
	if err := lockForUpdate(tx.Unscoped()).Select("id", "aff_quota").First(&inviter, rebate.InviterId).Error; err != nil {
		return nil, 0, err
	}
	fromPending := min(max(inviter.AffQuota, 0), rebate.RebateQuota)
	fromWallet := rebate.RebateQuota - fromPending
	if err := tx.Unscoped().Model(&User{}).Where("id = ?", inviter.Id).Updates(map[string]any{
		"aff_quota":   gorm.Expr("aff_quota - ?", fromPending),
		"aff_history": gorm.Expr("aff_history - ?", rebate.RebateQuota),
		"quota":       gorm.Expr("quota - ?", fromWallet),
	}).Error; err != nil {
		return nil, 0, err
	}
	rebate.Status = AffRebateStatusReversed
	if err := tx.Model(&AffRebate{}).Where("id = ?", rebate.Id).Update("status", rebate.Status).Error; err != nil {
		return nil, 0, err
	}
	return &rebate, fromWallet, nil
}

// restoreAffRebate pays a reversed rebate again after its source credit was
// restored (a dispute closed in the merchant's favour).
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
	if err := tx.Unscoped().Model(&User{}).Where("id = ?", rebate.InviterId).Updates(map[string]any{
		"aff_quota":   gorm.Expr("aff_quota + ?", rebate.RebateQuota),
		"aff_history": gorm.Expr("aff_history + ?", rebate.RebateQuota),
	}).Error; err != nil {
		return nil, err
	}
	rebate.Status = AffRebateStatusCredited
	if err := tx.Model(&AffRebate{}).Where("id = ?", rebate.Id).Update("status", rebate.Status).Error; err != nil {
		return nil, err
	}
	return &rebate, nil
}

// GetAffRebatesByInviterId lists the rebates paid to inviterId, newest first.
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

// SumAffRebatesByInvitee returns, per invitee, the credited rebates inviterId
// earned from them.
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
		Where("inviter_id = ? AND status = ? AND invitee_id IN ?", inviterId, AffRebateStatusCredited, inviteeIds).
		Group("invitee_id").
		Scan(&rows).Error
	for _, row := range rows {
		sums[row.InviteeId] = row.Total
	}
	return sums, err
}

// MovePendingAffQuotaToWallet moves one user's whole pending invitation quota
// into their wallet. It returns the amount moved; zero means there was
// nothing to move. Running it twice moves nothing the second time.
func MovePendingAffQuotaToWallet(userId int) (int, error) {
	moved := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "aff_quota").First(&user, userId).Error; err != nil {
			return err
		}
		if user.AffQuota <= 0 {
			return nil
		}
		moved = user.AffQuota
		return creditTopUpQuota(tx, userId, moved, map[string]any{"aff_quota": 0})
	})
	if err != nil || moved == 0 {
		return 0, err
	}
	syncCreditUserQuotaCache(userId, moved, common.LogText("invitation quota auto transfer"))
	RecordLog(userId, LogTypeSystem, common.NewMessage("Pending invitation quota {{quota}} moved to balance", map[string]any{"quota": logger.FormatQuota(moved)}))
	return moved, nil
}

// GetUserIdsWithPendingAffQuota lists the users who have pending invitation
// quota to move into their wallet.
func GetUserIdsWithPendingAffQuota() ([]int, error) {
	var ids []int
	err := DB.Model(&User{}).Where("aff_quota > 0").Order("id").Pluck("id", &ids).Error
	return ids, err
}
