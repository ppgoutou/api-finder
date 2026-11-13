package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	opsTestDay   = int64(24 * 60 * 60)
	opsTestStart = 20 * opsTestDay
	opsTestEnd   = 23*opsTestDay - 1
)

var opsTestUnit = int64(common.QuotaPerUnit)

func opsTestQuery(channel string) OpsDashboardQuery {
	return OpsDashboardQuery{
		Start:           opsTestStart,
		End:             opsTestEnd,
		Now:             opsTestEnd,
		Channel:         channel,
		ExcludeInternal: true,
	}
}

// seedOpsDashboard writes one small site: an administrator, three customers
// with activity in the reported period, and one customer who only paid before
// it. seedOpsDashboard clears every table it writes, before and after the test.
func seedOpsDashboard(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&User{}, &TopUp{}, &QuotaData{}, &PerfMetric{}, &Task{}, &Channel{},
		&Redemption{}, &AffRebate{}, &Checkin{}, &USDTReceipt{}, &Log{}, &TestCredit{}))
	wipe := func() {
		for _, table := range []string{"users", "top_ups", "quota_data", "perf_metrics", "tasks", "channels",
			"redemptions", "aff_rebates", "checkins", "usdt_receipts", "logs", "test_credits"} {
			require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
		}
	}
	wipe()
	t.Cleanup(wipe)

	users := []User{
		{Id: 1, Username: "ops_admin", Password: "x", AffCode: "aff1", Role: common.RoleAdminUser, Quota: 1000, UsedQuota: 500, CreatedAt: opsTestStart + 5},
		{Id: 2, Username: "ops_new", Password: "x", AffCode: "aff2", Role: common.RoleCommonUser, Quota: 200, UsedQuota: 300, CreatedAt: opsTestStart + 10},
		{Id: 3, Username: "ops_paid", Password: "x", AffCode: "aff3", Role: common.RoleCommonUser, UsedQuota: 100, CreatedAt: opsTestStart - 10},
		{Id: 4, Username: "ops_owing", Password: "x", AffCode: "aff4", Role: common.RoleCommonUser, Quota: -50, UsedQuota: 50, CreatedAt: opsTestStart - 10},
		{Id: 5, Username: "ops_dormant", Password: "x", AffCode: "aff5", Role: common.RoleCommonUser, Quota: 400, CreatedAt: opsTestStart - 100000},
	}
	for i := range users {
		accessToken := "token-" + users[i].Username
		users[i].AccessToken = &accessToken
		require.NoError(t, DB.Omit("AdminPermissions").Create(&users[i]).Error)
	}

	orders := []TopUp{
		{UserId: 1, TradeNo: "o-admin", PaymentProvider: PaymentProviderStripe, PaymentMethod: "stripe", Amount: 9, Money: 9, Status: common.TopUpStatusSuccess, CompleteTime: opsTestStart + 1},
		{UserId: 2, TradeNo: "o-stripe", PaymentProvider: PaymentProviderStripe, PaymentMethod: "stripe", Amount: 68, Money: 10, Status: common.TopUpStatusSuccess, CompleteTime: opsTestStart + 100},
		{UserId: 2, TradeNo: "o-usdt", PaymentProvider: PaymentProviderUSDT, PaymentMethod: "usdt", Amount: 68, Money: 5, Status: common.TopUpStatusSuccess, CompleteTime: opsTestStart + opsTestDay + 5},
		{UserId: 3, TradeNo: "o-epay", PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Amount: 3, Money: 20.4, Status: common.TopUpStatusSuccess, CompleteTime: opsTestStart + 2*opsTestDay},
		{UserId: 3, TradeNo: "o-refund", PaymentProvider: PaymentProviderStripe, PaymentMethod: "stripe", Amount: 20, Money: 2, Status: common.TopUpStatusRefunded, CompleteTime: opsTestStart + 50},
		{UserId: 4, TradeNo: "o-dispute", PaymentProvider: PaymentProviderStripe, PaymentMethod: "stripe", Amount: 1, Money: 1, Status: common.TopUpStatusDisputed, CompleteTime: opsTestStart + 60},
		{UserId: 4, TradeNo: "o-failed", PaymentProvider: PaymentProviderStripe, PaymentMethod: "stripe", Amount: 1, Money: 1, Status: common.TopUpStatusFailed, CreateTime: opsTestStart + 70},
		{UserId: 4, TradeNo: "o-expired", PaymentProvider: PaymentProviderUSDT, PaymentMethod: "usdt", Amount: 1, Money: 1, Status: common.TopUpStatusExpired, CreateTime: opsTestStart + 71},
		{UserId: 4, TradeNo: "o-fresh", PaymentProvider: PaymentProviderStripe, PaymentMethod: "stripe", Amount: 1, Money: 1, Status: common.TopUpStatusPending, CreateTime: opsTestEnd - 100},
		{UserId: 4, TradeNo: "o-overdue", PaymentProvider: PaymentProviderUSDT, PaymentMethod: "usdt", Amount: 1, Money: 1, Status: common.TopUpStatusPending, CreateTime: opsTestEnd - 2*opsTestDay},
		// A subscription purchase is not a wallet top-up.
		{UserId: 2, TradeNo: "o-subscription", PaymentMethod: "stripe", Amount: 0, Money: 99, Status: common.TopUpStatusSuccess, CompleteTime: opsTestStart + 5},
		// A legacy row names its channel through the payment method only.
		{UserId: 5, TradeNo: "o-legacy", PaymentMethod: "stripe", Amount: 5, Money: 7, Status: common.TopUpStatusSuccess, CompleteTime: opsTestStart - opsTestDay},
	}
	require.NoError(t, DB.Create(&orders).Error)

	usage := []QuotaData{
		{UserID: 1, Username: "ops_admin", ModelName: "model-a", ChannelID: 1, CreatedAt: opsTestStart, Count: 5, Quota: 999},
		{UserID: 2, Username: "ops_new", ModelName: "model-a", ChannelID: 1, CreatedAt: opsTestStart + 3600, Count: 2, Quota: 100},
		{UserID: 3, Username: "ops_paid", ModelName: "model-b", ChannelID: 2, CreatedAt: opsTestStart + opsTestDay + 3600, Count: 1, Quota: 40},
		{UserID: 2, Username: "ops_new", ModelName: "model-a", ChannelID: 1, CreatedAt: opsTestStart - 3600, Count: 1, Quota: 7},
	}
	require.NoError(t, DB.Create(&usage).Error)
	require.NoError(t, DB.Create(&PerfMetric{ModelName: "model-a", Group: "default", BucketTs: opsTestStart, RequestCount: 10, SuccessCount: 9, TotalLatencyMs: 1000, TtftSumMs: 300, TtftCount: 3}).Error)

	channels := []Channel{
		{Id: 1, Name: "low", Key: "k1", Status: common.ChannelStatusEnabled, Balance: 10, BalanceUpdatedTime: 1},
		{Id: 2, Name: "healthy", Key: "k2", Status: common.ChannelStatusEnabled, Balance: 500, BalanceUpdatedTime: 1},
		{Id: 3, Name: "disabled", Key: "k3", Status: common.ChannelStatusManuallyDisabled, Balance: 1, BalanceUpdatedTime: 1},
		{Id: 4, Name: "unfetched", Key: "k4", Status: common.ChannelStatusEnabled},
	}
	require.NoError(t, DB.Create(&channels).Error)

	tasks := []Task{
		{UserId: 2, ChannelId: 1, Status: TaskStatusSuccess, CreatedAt: opsTestStart + 1},
		{UserId: 2, ChannelId: 1, Status: TaskStatusFailure, FailReason: "boom", CreatedAt: opsTestStart + 2},
		{UserId: 3, ChannelId: 1, Status: TaskStatusFailure, FailReason: "boom", CreatedAt: opsTestStart + 3},
		{UserId: 3, ChannelId: 2, Status: TaskStatusQueued, CreatedAt: opsTestStart + 4},
		{UserId: 1, ChannelId: 1, Status: TaskStatusFailure, FailReason: "admin", CreatedAt: opsTestStart + 5},
	}
	require.NoError(t, DB.Create(&tasks).Error)

	redemptions := []Redemption{
		{Key: "ops-key-in-period", Status: common.RedemptionCodeStatusUsed, Quota: 1000, UsedUserId: 2, RedeemedTime: opsTestStart + 1},
		{Key: "ops-key-before-period", Status: common.RedemptionCodeStatusUsed, Quota: 500, UsedUserId: 2, RedeemedTime: opsTestStart - 10},
		{Key: "ops-key-unused", Status: common.RedemptionCodeStatusEnabled, Quota: 700},
	}
	require.NoError(t, DB.Create(&redemptions).Error)
	rebates := []AffRebate{
		{InviterId: 3, InviteeId: 2, SourceType: AffRebateSourceTopUp, SourceRef: "o-stripe", RebateQuota: 300, Status: AffRebateStatusSettled, SettledAt: opsTestStart + 2},
		{InviterId: 3, InviteeId: 2, SourceType: AffRebateSourceTopUp, SourceRef: "o-usdt", RebateQuota: 900, Status: AffRebateStatusPending},
	}
	require.NoError(t, DB.Create(&rebates).Error)
	require.NoError(t, DB.Create(&Checkin{UserId: 3, CheckinDate: "1970-01-21", QuotaAwarded: 20, CreatedAt: opsTestStart + 3}).Error)

	testCredits := []TestCredit{
		// Used more than granted: the whole grant counts as spent.
		{UserId: 2, Quota: 100, CreatedAt: opsTestStart + 10},
		// Granted twice and barely used: only what was used counts.
		{UserId: 5, Quota: 40, CreatedAt: opsTestStart - 10},
		{UserId: 5, Quota: 60, CreatedAt: opsTestStart + 20},
		{UserId: 1, Quota: 1000, CreatedAt: opsTestStart + 30},
		// All usage came before the grant: none of the credit is spent yet.
		{UserId: 3, Quota: 50, UsedQuotaAtGrant: 100, CreatedAt: opsTestStart + 40},
		// Part of the usage came after the grant.
		{UserId: 4, Quota: 30, UsedQuotaAtGrant: 40, CreatedAt: opsTestStart + 50},
	}
	require.NoError(t, DB.Create(&testCredits).Error)

	refundLogs := []Log{
		{UserId: 2, Type: LogTypeRefund, ModelName: "model-a", ChannelId: 1, Quota: 30, CreatedAt: opsTestStart + 3700},
		{UserId: 3, Type: LogTypeRefund, ModelName: "model-b", ChannelId: 2, Quota: 10, CreatedAt: opsTestStart + opsTestDay + 3700},
		{UserId: 2, Type: LogTypeRefund, ModelName: "model-a", ChannelId: 1, Quota: 2, CreatedAt: opsTestStart - 100},
		{UserId: 1, Type: LogTypeRefund, ModelName: "model-a", ChannelId: 1, Quota: 500, CreatedAt: opsTestStart + 1},
		// Only refunds reduce usage; a consume log is already in quota_data.
		{UserId: 2, Type: LogTypeConsume, ModelName: "model-a", ChannelId: 1, Quota: 5, CreatedAt: opsTestStart + 3800},
	}
	require.NoError(t, DB.Create(&refundLogs).Error)

	receipts := []USDTReceipt{
		{Network: "tron", TxHash: "unmatched", Status: USDTReceiptStatusUnmatched},
		{Network: "tron", TxHash: "credited", Status: USDTReceiptStatusCredited},
	}
	require.NoError(t, DB.Create(&receipts).Error)
}

func assertOpsDashboardFigures(t *testing.T) {
	t.Helper()
	seedOpsDashboard(t)

	got, err := GetOpsDashboard(opsTestQuery(OpsChannelAll))
	require.NoError(t, err)

	assert.Equal(t, OpsPeriodStats{
		TopupQuota:       18 * opsTestUnit,
		TopupOrders:      3,
		RefundQuota:      2 * opsTestUnit,
		RefundOrders:     1,
		DisputedOrders:   1,
		ClosedOrders:     2,
		NewUsers:         1,
		Payers:           2,
		NewPayers:        2,
		ActiveUsers:      2,
		UsedQuota:        100,
		OtherCreditQuota: 1320,
		TestCreditQuota:  240,
		RegisteredPayers: 1,
		RepeatPayers:     1,
	}, got.Current)
	assert.Equal(t, OpsPeriodStats{
		TopupQuota:       7 * opsTestUnit,
		TopupOrders:      1,
		Payers:           1,
		NewPayers:        1,
		NewUsers:         3,
		ActiveUsers:      1,
		UsedQuota:        5,
		OtherCreditQuota: 500,
		TestCreditQuota:  40,
		RegisteredPayers: 2,
	}, got.Previous)

	assert.Equal(t, OpsWallet{
		TopupQuota:        25 * opsTestUnit,
		AllChannelsQuota:  25 * opsTestUnit,
		UsedQuota:         450,
		BalanceQuota:      600,
		NegativeUsers:     1,
		NegativeQuota:     -50,
		OtherCredit:       OpsOtherCredit{RedemptionQuota: 1500, RebateQuota: 300, CheckinQuota: 20},
		RecentUsedQuota:   105,
		RecentUsedSeconds: opsRunwayWindowSeconds,
		TestCredit:        OpsTestCredit{GrantedQuota: 280, UsedQuota: 110, Users: 4},
	}, got.Wallet)
	assert.Equal(t, OpsUsers{Registered: 4, TotalPayers: 3, RepeatPayer: 1, Dormant: 1}, got.Users)
	assert.Equal(t, OpsPending{Pending: 1, Overdue: 1}, got.Pending)
	assert.Equal(t, OpsAlerts{OverdueOrders: 1, USDTExceptions: 1, DisputedOrders: 1, LowBalanceChannels: 1}, got.Alerts)

	assert.Equal(t, []OpsChannelStats{
		{Channel: PaymentProviderStripe, TotalQuota: 17 * opsTestUnit, TopupQuota: 10 * opsTestUnit, TopupOrders: 1, Pending: 1, ClosedOrders: 1, RefundOrders: 1, DisputedOrders: 1},
		{Channel: PaymentProviderUSDT, TotalQuota: 5 * opsTestUnit, TopupQuota: 5 * opsTestUnit, TopupOrders: 1, Pending: 1, Overdue: 1, ClosedOrders: 1},
		{Channel: PaymentProviderEpay, TotalQuota: 3 * opsTestUnit, TopupQuota: 3 * opsTestUnit, TopupOrders: 1},
	}, got.Channels)

	assert.Equal(t, []OpsTrendDay{
		{Date: "1970-01-21", Topups: map[string]int64{PaymentProviderStripe: 10 * opsTestUnit}, UsedQuota: 70},
		{Date: "1970-01-22", Topups: map[string]int64{PaymentProviderUSDT: 5 * opsTestUnit}, UsedQuota: 30},
		{Date: "1970-01-23", Topups: map[string]int64{PaymentProviderEpay: 3 * opsTestUnit}},
	}, got.Trend)

	assert.Equal(t, []OpsModelUsage{
		{ModelName: "model-a", Count: 2, Quota: 70},
		{ModelName: "model-b", Count: 1, Quota: 30},
	}, got.Models)
	assert.Equal(t, []OpsModelPerf{
		{ModelName: "model-a", Requests: 10, Successes: 9, AvgLatencyMs: 100, AvgTtftMs: 100},
	}, got.Perf)
	assert.Equal(t, OpsTasks{
		Success: 1,
		Failure: 2,
		Queued:  1,
		Reasons: []OpsFailReason{{Reason: "boom", Count: 2}},
	}, got.Tasks)

	assert.Equal(t, []OpsUpstream{
		{ChannelId: 1, Name: "low", Quota: 70, Count: 2, Balance: 10, BalanceUpdatedTime: 1, TaskSuccess: 1, TaskFailure: 2},
		{ChannelId: 2, Name: "healthy", Quota: 30, Count: 1, Balance: 500, BalanceUpdatedTime: 1},
		{ChannelId: 4, Name: "unfetched"},
	}, got.Upstream)
	assert.Equal(t, []OpsTopUser{
		{UserId: 2, Username: "ops_new", Quota: 70, Balance: 200, LastUsedAt: opsTestStart + 3600},
		{UserId: 3, Username: "ops_paid", Quota: 30, Balance: 0, LastUsedAt: opsTestStart + opsTestDay + 3600},
	}, got.TopUsers)

	stripe, err := GetOpsDashboard(opsTestQuery(PaymentProviderStripe))
	require.NoError(t, err)
	assert.Equal(t, 10*opsTestUnit, stripe.Current.TopupQuota, "the period follows the channel")
	assert.Equal(t, int64(1), stripe.Current.Payers)
	assert.Equal(t, int64(1), stripe.Current.NewPayers)
	assert.Equal(t, 7*opsTestUnit, stripe.Previous.TopupQuota, "a legacy row counts for its payment method")
	assert.Equal(t, 17*opsTestUnit, stripe.Wallet.TopupQuota)
	assert.Equal(t, int64(240), stripe.Current.TestCreditQuota, "test credit has no order channel")
	assert.Equal(t, 25*opsTestUnit, stripe.Wallet.AllChannelsQuota, "reconciliation always spans every channel")
	assert.Equal(t, OpsPending{Pending: 1}, stripe.Pending)
	assert.Equal(t, int64(100), stripe.Current.UsedQuota, "usage has no order channel")
	assert.Len(t, stripe.Channels, 3, "the channel table is not filtered")
	assert.Equal(t, map[string]int64{PaymentProviderStripe: 10 * opsTestUnit}, stripe.Trend[0].Topups)
	assert.Empty(t, stripe.Trend[1].Topups)

	withInternal := opsTestQuery(OpsChannelAll)
	withInternal.ExcludeInternal = false
	everyone, err := GetOpsDashboard(withInternal)
	require.NoError(t, err)
	assert.Equal(t, 27*opsTestUnit, everyone.Current.TopupQuota)
	assert.Equal(t, int64(599), everyone.Current.UsedQuota)
	assert.Equal(t, int64(5), everyone.Users.Registered)
	assert.Equal(t, int64(950), everyone.Wallet.UsedQuota)
	assert.Equal(t, OpsTestCredit{GrantedQuota: 1280, UsedQuota: 610, Users: 5}, everyone.Wallet.TestCredit)
	assert.Equal(t, 27*opsTestUnit, everyone.Current.TopupQuota, "test credit never counts as a top-up")
}

func TestGetOpsDashboardFiguresFollowChannelAndInternalScope(t *testing.T) {
	assertOpsDashboardFigures(t)
}

func TestGetOpsDashboardTrendUsesAdministratorTimeZone(t *testing.T) {
	seedOpsDashboard(t)

	query := opsTestQuery(OpsChannelAll)
	// In UTC+8 the reported instants start 8 hours into 1970-01-21.
	query.TZOffsetMinutes = 8 * 60
	query.Start = opsTestStart - 8*3600
	query.End = opsTestStart + opsTestDay - 8*3600 - 1

	got, err := GetOpsDashboard(query)
	require.NoError(t, err)
	require.Len(t, got.Trend, 1)
	assert.Equal(t, "1970-01-21", got.Trend[0].Date)
	assert.Equal(t, int64(75), got.Trend[0].UsedQuota, "the hour before UTC midnight belongs to the same local day")
}

func TestGetOpsDashboardRefundsOfEarlierUsageStayAtZero(t *testing.T) {
	seedOpsDashboard(t)
	require.NoError(t, DB.Create(&Log{UserId: 3, Type: LogTypeRefund, ModelName: "model-b", ChannelId: 2, Quota: 1000, CreatedAt: opsTestStart + opsTestDay + 3800}).Error)

	got, err := GetOpsDashboard(opsTestQuery(OpsChannelAll))
	require.NoError(t, err)

	assert.Equal(t, int64(0), got.Current.UsedQuota)
	assert.Equal(t, int64(0), got.Trend[1].UsedQuota)
	assert.Equal(t, OpsModelUsage{ModelName: "model-b", Count: 1, Quota: 0}, got.Models[1])
	assert.Equal(t, int64(0), got.Upstream[1].Quota)
	require.Len(t, got.TopUsers, 1, "a user whose usage was fully refunded is not a top user")
	assert.Equal(t, 2, got.TopUsers[0].UserId)
}

func TestGetOpsDashboardAllTimeCoversEverythingWithoutComparison(t *testing.T) {
	seedOpsDashboard(t)

	query := opsTestQuery(OpsChannelAll)
	query.AllTime = true
	got, err := GetOpsDashboard(query)
	require.NoError(t, err)

	assert.Equal(t, 25*opsTestUnit, got.Current.TopupQuota, "every paid order up to the end")
	assert.Equal(t, int64(4), got.Current.TopupOrders)
	assert.Equal(t, got.Users.Registered, got.Current.NewUsers)
	assert.Equal(t, got.Users.TotalPayers, got.Current.RegisteredPayers)
	assert.Equal(t, int64(105), got.Current.UsedQuota)
	assert.Equal(t, OpsPeriodStats{}, got.Previous, "an all-time period has nothing to compare with")
	require.Len(t, got.Trend, 4, "the trend starts on the day of the first usage, not at the epoch")
	assert.Equal(t, "1970-01-20", got.Trend[0].Date)
	assert.Equal(t, int64(5), got.Trend[0].UsedQuota, "net of the refund that day")
}

func TestGetOpsDashboardUpstreamCostRemovesGroupMarkup(t *testing.T) {
	seedOpsDashboard(t)
	original := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1.25,"vip":2}`))
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(original)) })

	logs := []Log{
		{UserId: 2, Type: LogTypeConsume, ChannelId: 2, Group: "default", Quota: 1000, CreatedAt: opsTestStart + 10},
		{UserId: 3, Type: LogTypeConsume, ChannelId: 2, Group: "vip", Quota: 400, CreatedAt: opsTestStart + 20},
		// A refunded charge was not paid upstream.
		{UserId: 3, Type: LogTypeRefund, ChannelId: 2, Group: "vip", Quota: 100, CreatedAt: opsTestStart + 30},
		// A group without a ratio is billed at its charge.
		{UserId: 2, Type: LogTypeConsume, ChannelId: 4, Group: "gone", Quota: 60, CreatedAt: opsTestStart + 40},
		// Administrators are left out, and so is usage outside the period.
		{UserId: 1, Type: LogTypeConsume, ChannelId: 2, Group: "default", Quota: 5000, CreatedAt: opsTestStart + 50},
		{UserId: 2, Type: LogTypeConsume, ChannelId: 2, Group: "default", Quota: 5000, CreatedAt: opsTestStart - 50},
	}
	require.NoError(t, DB.Create(&logs).Error)

	got, err := GetOpsDashboard(opsTestQuery(OpsChannelAll))
	require.NoError(t, err)

	costs := make(map[int]int64)
	for _, row := range got.Upstream {
		costs[row.ChannelId] = row.CostQuota
	}
	// 1000/1.25 + (400-100)/2 - the seeded refund of 10 at no group's ratio.
	assert.Equal(t, map[int]int64{1: 0, 2: 940, 4: 60}, costs)
}

func TestOpsCreditedQuotaMirrorsProviderSettlement(t *testing.T) {
	cases := []struct {
		channel string
		amount  int64
		money   float64
		want    int64
	}{
		{PaymentProviderStripe, 68, 10, 10 * opsTestUnit},
		{PaymentProviderUSDT, 68, 5, 5 * opsTestUnit},
		{PaymentProviderCreem, 1234, 9.99, 1234},
		{PaymentProviderEpay, 3, 20.4, 3 * opsTestUnit},
		{PaymentProviderWaffo, 2, 2.5, 2 * opsTestUnit},
	}
	for _, tc := range cases {
		t.Run(tc.channel, func(t *testing.T) {
			assert.Equal(t, tc.want, opsCreditedQuota(tc.channel, tc.amount, tc.money))
		})
	}
}
