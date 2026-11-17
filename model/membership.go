package model

import (
	"slices"

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

// paidTopUpTotals sums what a user paid for: successful top-up orders and
// redeemed redemption codes, which are sold for money. Invitation rebates,
// check-in rewards, test credit and administrator adjustments are not here.
func paidTopUpTotals(tx *gorm.DB, userId int) (topUpTotals, error) {
	var orders, codes topUpTotals
	err := tx.Model(&TopUp{}).
		Select("COALESCE(SUM(credited_quota), 0) AS total, COALESCE(MAX(credited_quota), 0) AS single").
		Where("user_id = ? AND status = ?", userId, common.TopUpStatusSuccess).
		Scan(&orders).Error
	if err != nil {
		return topUpTotals{}, err
	}
	err = tx.Model(&Redemption{}).
		Select("COALESCE(SUM(quota), 0) AS total, COALESCE(MAX(quota), 0) AS single").
		Where("used_user_id = ? AND status = ?", userId, common.RedemptionCodeStatusUsed).
		Scan(&codes).Error
	if err != nil {
		return topUpTotals{}, err
	}
	return topUpTotals{Total: orders.Total + codes.Total, Single: max(orders.Single, codes.Single)}, nil
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

// PaidTopUpQuota returns the quota a user has paid for in total and in their
// largest single top-up or redemption code, the figures VIP is measured by.
func PaidTopUpQuota(userId int) (total int64, single int64, err error) {
	totals, err := paidTopUpTotals(DB, userId)
	return totals.Total, totals.Single, err
}

// MembershipThresholdQuota converts a USD threshold to quota; 0 means the
// rule is off.
func MembershipThresholdQuota(usd float64) int64 {
	return membershipThresholdQuota(usd)
}

// MembershipGroupPairs returns the standard-to-VIP group pairs whose VIP
// group exists in the group ratios, or nothing while the program is off.
func MembershipGroupPairs() []operation_setting.MembershipGroupPair {
	setting := operation_setting.GetMembershipSetting()
	if !setting.Enabled {
		return nil
	}
	var pairs []operation_setting.MembershipGroupPair
	for _, pair := range setting.GroupPairs() {
		if ratio_setting.ContainsGroupRatio(pair.Vip) {
			pairs = append(pairs, pair)
		}
	}
	return pairs
}

// userGroupTx reads a user's group; a missing user has none, so a payment
// for a deleted account still settles.
func userGroupTx(tx *gorm.DB, userId int) (string, error) {
	var user User
	// GORM quotes the reserved column for each database.
	if err := tx.Select("group").Where("id = ?", userId).Limit(1).Find(&user).Error; err != nil {
		return "", err
	}
	return user.Group, nil
}

// upgradeMembershipTx moves a user in a standard group to that group's VIP
// group when their successful top-ups reach a threshold. Users in any other
// group (set by an administrator or a subscription) are left alone.
func upgradeMembershipTx(tx *gorm.DB, userId int) (*MembershipChange, error) {
	pairs := MembershipGroupPairs()
	if len(pairs) == 0 {
		return nil, nil
	}
	group, err := userGroupTx(tx, userId)
	if err != nil {
		return nil, err
	}
	index := slices.IndexFunc(pairs, func(pair operation_setting.MembershipGroupPair) bool { return pair.Base == group })
	if index < 0 {
		return nil, nil
	}
	totals, err := paidTopUpTotals(tx, userId)
	if err != nil {
		return nil, err
	}
	if !qualifiesForVip(operation_setting.GetMembershipSetting(), totals) {
		return nil, nil
	}
	return moveMembershipGroupTx(tx, userId, group, pairs[index].Vip, true)
}

// downgradeMembershipTx runs after a top-up of reversedQuota stopped
// counting. It moves a VIP back to the standard group their VIP group pairs
// with, and only when that order was part of what qualified them, so VIPs
// appointed by an administrator keep their group.
func downgradeMembershipTx(tx *gorm.DB, userId int, reversedQuota int) (*MembershipChange, error) {
	setting := operation_setting.GetMembershipSetting()
	if !setting.DowngradeOnReversal {
		return nil, nil
	}
	pairs := MembershipGroupPairs()
	if len(pairs) == 0 {
		return nil, nil
	}
	group, err := userGroupTx(tx, userId)
	if err != nil {
		return nil, err
	}
	index := slices.IndexFunc(pairs, func(pair operation_setting.MembershipGroupPair) bool { return pair.Vip == group })
	if index < 0 {
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
	return moveMembershipGroupTx(tx, userId, group, pairs[index].Base, false)
}

func moveMembershipGroupTx(tx *gorm.DB, userId int, from string, to string, vip bool) (*MembershipChange, error) {
	if from == to {
		return nil, nil
	}
	result := tx.Model(&User{}).Where("id = ?", userId).Where(map[string]any{"group": from}).Update("group", to)
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
	redemptionUserIds, err := redemptionUsersToBackfill()
	if err != nil {
		common.SysError(common.LogText("failed to load redemption users for membership backfill: %s", err.Error()))
		return
	}
	for _, userId := range redemptionUserIds {
		userIds[userId] = struct{}{}
	}
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
	if redemptionUserIds != nil {
		if err := DB.Create(&Option{Key: membershipRedemptionBackfillKey, Value: "true"}).Error; err != nil {
			common.SysError(common.LogText("failed to mark redemption membership backfill: %s", err.Error()))
		}
	}
	if len(topUps) > 0 {
		common.SysLog(common.LogText("membership backfill checked %d top-ups for %d users", len(topUps), len(userIds)))
	}
}

// membershipRedemptionBackfillKey marks that users who redeemed codes before
// redemption codes counted toward VIP have been checked once.
const membershipRedemptionBackfillKey = "MembershipRedemptionBackfilled"

// redemptionUsersToBackfill returns the users who redeemed codes, or nil once
// they have been checked, so an administrator's later group change is kept.
func redemptionUsersToBackfill() ([]int, error) {
	var marked int64
	if err := DB.Model(&Option{}).Where(commonKeyCol+" = ?", membershipRedemptionBackfillKey).Count(&marked).Error; err != nil {
		return nil, err
	}
	if marked > 0 {
		return nil, nil
	}
	userIds := []int{}
	err := DB.Model(&Redemption{}).Distinct("used_user_id").
		Where("status = ? AND used_user_id > 0", common.RedemptionCodeStatusUsed).
		Pluck("used_user_id", &userIds).Error
	return userIds, err
}
