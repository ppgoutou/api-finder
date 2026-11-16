package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// MembershipChange names the group a user was moved to by their paid
// top-up history; empty means the group stayed the same.
type MembershipChange struct {
	UserId int
	Group  string
	Vip    bool
}

type topUpTotals struct {
	Total  int64
	Single int64
}

func paidTopUpTotals(tx *gorm.DB, userId int) (topUpTotals, error) {
	var totals topUpTotals
	err := tx.Model(&TopUp{}).
		Select("COALESCE(SUM(credited_quota), 0) AS total, COALESCE(MAX(credited_quota), 0) AS single").
		Where("user_id = ? AND status = ?", userId, common.TopUpStatusSuccess).
		Scan(&totals).Error
	return totals, err
}

func membershipThresholdQuota(usd float64) int64 {
	if usd <= 0 {
		return 0
	}
	return decimal.NewFromFloat(usd).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Ceil().IntPart()
}

// qualifiesForVip applies the membership thresholds to paid top-up totals.
func qualifiesForVip(setting *operation_setting.MembershipSetting, totals topUpTotals) bool {
	totalNeed := membershipThresholdQuota(setting.TotalTopUpUSD)
	singleNeed := membershipThresholdQuota(setting.SingleTopUpUSD)
	return (totalNeed > 0 && totals.Total >= totalNeed) || (singleNeed > 0 && totals.Single >= singleNeed)
}

// addTopUpCreditedQuota records quota a paid order credited and re-evaluates
// the user's membership in the same transaction, so a repeated payment
// callback can neither count twice nor miss the upgrade.
func addTopUpCreditedQuota(tx *gorm.DB, topUp *TopUp, quota int) (*MembershipChange, error) {
	if err := tx.Model(&TopUp{}).Where("id = ?", topUp.Id).
		Update("credited_quota", gorm.Expr("credited_quota + ?", quota)).Error; err != nil {
		return nil, err
	}
	topUp.CreditedQuota += quota
	return upgradeMembershipTx(tx, topUp.UserId)
}

// upgradeMembershipTx moves a user in the base group to the VIP group when
// their successful top-ups reach a threshold. Users in any other group
// (set by an administrator or a subscription) are left alone.
func upgradeMembershipTx(tx *gorm.DB, userId int) (*MembershipChange, error) {
	setting := operation_setting.GetMembershipSetting()
	if !setting.Enabled || setting.VipGroup == "" || !ratio_setting.ContainsGroupRatio(setting.VipGroup) {
		return nil, nil
	}
	totals, err := paidTopUpTotals(tx, userId)
	if err != nil {
		return nil, err
	}
	if !qualifiesForVip(setting, totals) {
		return nil, nil
	}
	return moveMembershipGroupTx(tx, userId, setting.BaseGroup, setting.VipGroup, true)
}

// downgradeMembershipTx runs after a top-up of reversedQuota stopped
// counting. It moves a VIP back to the base group only when that order was
// part of what qualified them, so VIPs appointed by an administrator keep
// their group.
func downgradeMembershipTx(tx *gorm.DB, userId int, reversedQuota int) (*MembershipChange, error) {
	setting := operation_setting.GetMembershipSetting()
	if !setting.Enabled || !setting.DowngradeOnReversal || setting.VipGroup == "" || setting.BaseGroup == "" {
		return nil, nil
	}
	totals, err := paidTopUpTotals(tx, userId)
	if err != nil {
		return nil, err
	}
	if qualifiesForVip(setting, totals) {
		return nil, nil
	}
	before := topUpTotals{Total: totals.Total + int64(reversedQuota), Single: max(totals.Single, int64(reversedQuota))}
	if !qualifiesForVip(setting, before) {
		return nil, nil
	}
	return moveMembershipGroupTx(tx, userId, setting.VipGroup, setting.BaseGroup, false)
}

func moveMembershipGroupTx(tx *gorm.DB, userId int, from string, to string, vip bool) (*MembershipChange, error) {
	if from == to {
		return nil, nil
	}
	result := tx.Model(&User{}).Where("id = ? AND "+commonGroupCol+" = ?", userId, from).Update("group", to)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &MembershipChange{UserId: userId, Group: to, Vip: vip}, nil
}

// announceMembershipChange runs after the transaction commits: it refreshes
// the cached group the relay prices with and tells the user.
func announceMembershipChange(change *MembershipChange) {
	if change == nil {
		return
	}
	if err := RefreshUserGroupCache(change.UserId); err != nil {
		common.SysError(common.LogText("failed to refresh user group cache after membership change: %s", err.Error()))
	}
	common.SysLog(common.LogText("membership group changed user_id=%d group=%s", change.UserId, change.Group))
	if change.Vip {
		RecordLog(change.UserId, LogTypeSystem, common.NewMessage("Your top-ups reached the VIP threshold, your account is now VIP"))
		return
	}
	RecordLog(change.UserId, LogTypeSystem, common.NewMessage("A refunded top-up brought your account below the VIP threshold, your account is back to the standard tier"))
}

// legacyTopUpCreditedQuota rebuilds the quota a successful order credited
// before credited_quota existed, following each provider's credit rule.
func legacyTopUpCreditedQuota(tx *gorm.DB, topUp *TopUp) (int, error) {
	switch topUp.PaymentProvider {
	case PaymentProviderStripe:
		return common.WalletQuotaFromDecimalStrict(decimal.NewFromFloat(topUp.Money).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	case PaymentProviderCreem:
		return common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(topUp.Amount))
	case PaymentProviderUSDT:
		var quota int64
		err := tx.Model(&USDTReceipt{}).Select("COALESCE(SUM(credited_quota), 0)").
			Where("trade_no = ? AND status = ?", topUp.TradeNo, USDTReceiptStatusCredited).Scan(&quota).Error
		if err != nil {
			return 0, err
		}
		return common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(quota))
	default:
		return common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	}
}

// BackfillTopUpMembership fills credited_quota on successful orders paid
// before the column existed and upgrades the users those orders qualify.
// Filled orders no longer match, so later startups leave alone any group an
// administrator has changed since.
func BackfillTopUpMembership() {
	var topUps []*TopUp
	if err := DB.Where("status = ? AND credited_quota = 0", common.TopUpStatusSuccess).Find(&topUps).Error; err != nil {
		common.SysError(common.LogText("failed to load top-ups for membership backfill: %s", err.Error()))
		return
	}
	userIds := make(map[int]struct{})
	for _, topUp := range topUps {
		quota, err := legacyTopUpCreditedQuota(DB, topUp)
		if err != nil || quota <= 0 {
			continue
		}
		if err := DB.Model(&TopUp{}).Where("id = ? AND credited_quota = 0", topUp.Id).
			Update("credited_quota", quota).Error; err != nil {
			common.SysError(common.LogText("failed to backfill top-up credited quota: %s", err.Error()))
			return
		}
		userIds[topUp.UserId] = struct{}{}
	}
	for userId := range userIds {
		var change *MembershipChange
		err := DB.Transaction(func(tx *gorm.DB) error {
			var err error
			change, err = upgradeMembershipTx(tx, userId)
			return err
		})
		if err != nil {
			common.SysError(common.LogText("failed to backfill membership: %s", err.Error()))
			continue
		}
		announceMembershipChange(change)
	}
	if len(topUps) > 0 {
		common.SysLog(common.LogText("membership backfill checked %d top-ups for %d users", len(topUps), len(userIds)))
	}
}
