package model

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupMembershipTest(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}, &Option{}))
	original := *operation_setting.GetMembershipSetting()
	originalRatio := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":0.85,"svip":0.7}`))
	*operation_setting.GetMembershipSetting() = operation_setting.MembershipSetting{
		Enabled: true, BaseGroup: "default", VipGroup: "vip",
		TotalTopUpUSD: 1000, SingleTopUpUSD: 500, DowngradeOnReversal: true,
	}
	t.Cleanup(func() {
		*operation_setting.GetMembershipSetting() = original
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatio))
		DB.Exec("DELETE FROM top_ups")
		DB.Exec("DELETE FROM users")
		DB.Exec("DELETE FROM logs")
		DB.Exec("DELETE FROM redemptions")
		DB.Exec("DELETE FROM options")
	})
}

func insertMembershipUser(t *testing.T, id int, group string) {
	t.Helper()
	require.NoError(t, DB.Create(&User{Id: id, Username: fmt.Sprintf("member_%d", id), AffCode: fmt.Sprintf("mbr%d", id), Status: common.UserStatusEnabled, Group: group}).Error)
}

func insertPendingTopUp(t *testing.T, tradeNo string, userId int, provider string, usd float64) {
	t.Helper()
	require.NoError(t, DB.Create(&TopUp{
		UserId: userId, Amount: int64(usd), Money: usd, TradeNo: tradeNo,
		PaymentMethod: provider, PaymentProvider: provider,
		Status: common.TopUpStatusPending, CreateTime: time.Now().Unix(),
	}).Error)
}

func membershipGroup(t *testing.T, userId int) string {
	t.Helper()
	var user User
	require.NoError(t, DB.Select(commonGroupCol).Where("id = ?", userId).First(&user).Error)
	return user.Group
}

func TestTopUpMembershipUpgrade(t *testing.T) {
	setupMembershipTest(t)

	cases := []struct {
		name   string
		group  string
		orders []float64
		want   string
	}{
		{name: "below both thresholds", group: "default", orders: []float64{300, 400}, want: "default"},
		{name: "single order reaches 500", group: "default", orders: []float64{500}, want: "vip"},
		{name: "orders add up to 1000", group: "default", orders: []float64{400, 400, 200}, want: "vip"},
		{name: "administrator group is kept", group: "svip", orders: []float64{1000}, want: "svip"},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userId := 100 + i
			insertMembershipUser(t, userId, tc.group)
			for j, usd := range tc.orders {
				tradeNo := fmt.Sprintf("member-%d-%d", userId, j)
				insertPendingTopUp(t, tradeNo, userId, PaymentProviderEpay, usd)
				_, err := RechargeEpay(tradeNo, "", "127.0.0.1")
				require.NoError(t, err)
			}
			assert.Equal(t, tc.want, membershipGroup(t, userId))
		})
	}
}

func TestTopUpMembershipRepeatedCallbackCountsOnce(t *testing.T) {
	setupMembershipTest(t)
	insertMembershipUser(t, 200, "default")
	insertPendingTopUp(t, "member-repeat", 200, PaymentProviderEpay, 300)

	_, err := RechargeEpay("member-repeat", "", "127.0.0.1")
	require.NoError(t, err)
	alreadyDone, err := RechargeEpay("member-repeat", "", "127.0.0.1")
	require.NoError(t, err)
	assert.True(t, alreadyDone)

	topUp := GetTopUpByTradeNo("member-repeat")
	require.NotNil(t, topUp)
	assert.Equal(t, int(300*common.QuotaPerUnit), topUp.CreditedQuota)
	assert.Equal(t, "default", membershipGroup(t, 200))
}

func TestTopUpMembershipStripeReversal(t *testing.T) {
	setupMembershipTest(t)

	// Qualified by the refunded order: back to the base group, and a won
	// dispute restores VIP.
	insertMembershipUser(t, 300, "default")
	insertPendingTopUp(t, "member-stripe", 300, PaymentProviderStripe, 600)
	require.NoError(t, Recharge("member-stripe", "", "127.0.0.1"))
	require.Equal(t, "vip", membershipGroup(t, 300))

	_, err := ReverseStripeTopUp("member-stripe", common.TopUpStatusDisputed, "127.0.0.1")
	require.NoError(t, err)
	assert.Equal(t, "default", membershipGroup(t, 300))

	_, err = RestoreDisputedStripeTopUp("member-stripe", "127.0.0.1")
	require.NoError(t, err)
	assert.Equal(t, "vip", membershipGroup(t, 300))

	// Still qualified by the remaining orders: stays VIP.
	insertMembershipUser(t, 301, "default")
	insertPendingTopUp(t, "member-keep-a", 301, PaymentProviderStripe, 600)
	insertPendingTopUp(t, "member-keep-b", 301, PaymentProviderStripe, 100)
	require.NoError(t, Recharge("member-keep-a", "", "127.0.0.1"))
	require.NoError(t, Recharge("member-keep-b", "", "127.0.0.1"))
	_, err = ReverseStripeTopUp("member-keep-b", common.TopUpStatusRefunded, "127.0.0.1")
	require.NoError(t, err)
	assert.Equal(t, "vip", membershipGroup(t, 301))

	// Made VIP by an administrator without qualifying: a refund changes nothing.
	insertMembershipUser(t, 302, "vip")
	insertPendingTopUp(t, "member-admin-vip", 302, PaymentProviderStripe, 50)
	require.NoError(t, Recharge("member-admin-vip", "", "127.0.0.1"))
	_, err = ReverseStripeTopUp("member-admin-vip", common.TopUpStatusRefunded, "127.0.0.1")
	require.NoError(t, err)
	assert.Equal(t, "vip", membershipGroup(t, 302))
}

func TestBackfillTopUpMembership(t *testing.T) {
	setupMembershipTest(t)
	insertMembershipUser(t, 400, "default")
	insertMembershipUser(t, 401, "default")
	for _, topUp := range []*TopUp{
		{UserId: 400, Amount: 700, Money: 700, TradeNo: "legacy-stripe", PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess},
		{UserId: 401, Amount: 200, Money: 1400, TradeNo: "legacy-epay", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess},
		{UserId: 401, Amount: 900, Money: 900, TradeNo: "legacy-refunded", PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusRefunded},
	} {
		require.NoError(t, DB.Create(topUp).Error)
	}

	BackfillTopUpMembership()

	assert.Equal(t, "vip", membershipGroup(t, 400))
	assert.Equal(t, "default", membershipGroup(t, 401))
	epay := GetTopUpByTradeNo("legacy-epay")
	require.NotNil(t, epay)
	assert.Equal(t, int(200*common.QuotaPerUnit), epay.CreditedQuota)

	// An administrator's later change survives the next startup.
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 400).Update("group", "default").Error)
	BackfillTopUpMembership()
	assert.Equal(t, "default", membershipGroup(t, 400))
}

func TestRedemptionCodesCountTowardVip(t *testing.T) {
	setupMembershipTest(t)
	insertMembershipUser(t, 500, "default")
	for _, tradeNo := range []string{"member-mixed-a", "member-mixed-b"} {
		insertPendingTopUp(t, tradeNo, 500, PaymentProviderEpay, 400)
		_, err := RechargeEpay(tradeNo, "", "127.0.0.1")
		require.NoError(t, err)
	}
	require.Equal(t, "default", membershipGroup(t, 500))

	require.NoError(t, DB.Create(&Redemption{Key: "membercode300", Status: common.RedemptionCodeStatusEnabled, Quota: int(300 * common.QuotaPerUnit)}).Error)
	_, err := Redeem("membercode300", 500)
	require.NoError(t, err)
	assert.Equal(t, "vip", membershipGroup(t, 500))

	// Codes redeemed before they counted are checked once at startup.
	insertMembershipUser(t, 501, "default")
	require.NoError(t, DB.Create(&Redemption{Key: "membercode500", Status: common.RedemptionCodeStatusUsed, UsedUserId: 501, Quota: int(500 * common.QuotaPerUnit)}).Error)
	BackfillTopUpMembership()
	assert.Equal(t, "vip", membershipGroup(t, 501))

	require.NoError(t, DB.Model(&User{}).Where("id = ?", 501).Update("group", "default").Error)
	BackfillTopUpMembership()
	assert.Equal(t, "default", membershipGroup(t, 501))
}
