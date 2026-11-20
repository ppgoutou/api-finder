package model

import (
	"cmp"
	"math"
	"slices"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	// OpsChannelAll is the order channel filter that keeps every channel.
	OpsChannelAll = "all"
	// OpsChannelRedemption is the top-up channel of redemption codes. They
	// have no order, so every order figure leaves them out.
	OpsChannelRedemption = "redemption"

	// A pending order older than this is reported as overdue: closing an
	// order depends on a provider callback that may never arrive.
	opsPendingOverdueSeconds int64 = 24 * 60 * 60
	opsDormantSeconds        int64 = 30 * 24 * 60 * 60
	opsRunwayWindowSeconds   int64 = 7 * 24 * 60 * 60
	// Channels below this USD balance count as low in the dashboard alerts.
	opsLowChannelBalanceUSD = 50.0
	opsTopUserLimit         = 10
	opsFailReasonLimit      = 5
	opsFailReasonMaxRunes   = 160
	// The all-time trend shows at most this many of the latest days.
	opsTrendMaxDays int64 = 366
)

// OpsDashboardQuery selects one reporting period. Start and End are inclusive.
// AllTime ignores Start: the period then covers everything up to End, and
// there is no previous period to compare with.
type OpsDashboardQuery struct {
	AllTime         bool
	Start           int64
	End             int64
	Now             int64
	Channel         string
	ExcludeInternal bool
	TZOffsetMinutes int
}

// OpsPeriodStats holds the figures that are compared between two periods.
type OpsPeriodStats struct {
	TopupQuota       int64 `json:"topup_quota"`
	TopupOrders      int64 `json:"topup_orders"`
	RefundQuota      int64 `json:"refund_quota"`
	RefundOrders     int64 `json:"refund_orders"`
	DisputedOrders   int64 `json:"disputed_orders"`
	ClosedOrders     int64 `json:"closed_orders"`
	NewUsers         int64 `json:"new_users"`
	Payers           int64 `json:"payers"`
	NewPayers        int64 `json:"new_payers"`
	ActiveUsers      int64 `json:"active_users"`
	UsedQuota        int64 `json:"used_quota"`
	OtherCreditQuota int64 `json:"other_credit_quota"`
	TestCreditQuota  int64 `json:"test_credit_quota"`
	// RegisteredPayers are the users registered in the period who have paid.
	RegisteredPayers int64 `json:"registered_payers"`
	// RepeatPayers paid at least twice in the period.
	RepeatPayers int64 `json:"repeat_payers"`
	// Redemptions and RedemptionQuota count codes redeemed in the period when
	// the page shows every channel or only redemption codes.
	Redemptions     int64 `json:"redemptions"`
	RedemptionQuota int64 `json:"redemption_quota"`
	TaskSuccess     int64 `json:"task_success"`
	TaskFailure     int64 `json:"task_failure"`
	// TaskAvgSeconds and TaskMedianSeconds are how long the successful tasks
	// created in the period took from submission to completion; 0 without any.
	TaskAvgSeconds    int64 `json:"task_avg_seconds"`
	TaskMedianSeconds int64 `json:"task_median_seconds"`
}

// OpsOtherCredit breaks down wallet credits that did not come from an order.
// Redemption codes count as a top-up channel, so total leaves them out.
type OpsOtherCredit struct {
	RedemptionQuota int64 `json:"redemption_quota"`
	RebateQuota     int64 `json:"rebate_quota"`
	CheckinQuota    int64 `json:"checkin_quota"`
}

func (credit OpsOtherCredit) total() int64 {
	return credit.RebateQuota + credit.CheckinQuota
}

type OpsWallet struct {
	TopupQuota        int64          `json:"topup_quota"`
	AllChannelsQuota  int64          `json:"all_channels_quota"`
	UsedQuota         int64          `json:"used_quota"`
	BalanceQuota      int64          `json:"balance_quota"`
	NegativeUsers     int64          `json:"negative_users"`
	NegativeQuota     int64          `json:"negative_quota"`
	OtherCredit       OpsOtherCredit `json:"other_credit"`
	RecentUsedQuota   int64          `json:"recent_used_quota"`
	RecentUsedSeconds int64          `json:"recent_used_seconds"`
	TestCredit        OpsTestCredit  `json:"test_credit"`
}

// OpsTestCredit reports promotional money. Wallets do not separate it from paid
// balance, so UsedQuota assumes each user spends test credit first: it is the
// smaller of what the user was granted and what the user has used since the
// first grant.
type OpsTestCredit struct {
	GrantedQuota int64 `json:"granted_quota"`
	UsedQuota    int64 `json:"used_quota"`
	Users        int64 `json:"users"`
	// UsedUpUsers spent at least what they were granted.
	UsedUpUsers int64 `json:"used_up_users"`
	// PaidAfterUsers paid an order after their first grant.
	PaidAfterUsers int64 `json:"paid_after_users"`
}

type OpsUsers struct {
	Registered  int64 `json:"registered"`
	TotalPayers int64 `json:"total_payers"`
	RepeatPayer int64 `json:"repeat_payers"`
	Dormant     int64 `json:"dormant"`
}

type OpsPending struct {
	Pending int64 `json:"pending"`
	Overdue int64 `json:"overdue"`
}

// OpsChannelStats is one row of the per-channel order table.
type OpsChannelStats struct {
	Channel        string `json:"channel"`
	TotalQuota     int64  `json:"total_quota"`
	TopupQuota     int64  `json:"topup_quota"`
	TopupOrders    int64  `json:"topup_orders"`
	Pending        int64  `json:"pending"`
	Overdue        int64  `json:"overdue"`
	ClosedOrders   int64  `json:"closed_orders"`
	FailedOrders   int64  `json:"failed_orders"`
	ExpiredOrders  int64  `json:"expired_orders"`
	RefundOrders   int64  `json:"refund_orders"`
	DisputedOrders int64  `json:"disputed_orders"`
}

// OpsTrendDay carries one local calendar day of the top-up and usage chart.
type OpsTrendDay struct {
	Date        string           `json:"date"`
	Topups      map[string]int64 `json:"topups"`
	UsedQuota   int64            `json:"used_quota"`
	NewUsers    int64            `json:"new_users"`
	ActiveUsers int64            `json:"active_users"`
	NewPayers   int64            `json:"new_payers"`
	TaskSuccess int64            `json:"task_success"`
	TaskFailure int64            `json:"task_failure"`
}

type OpsModelUsage struct {
	ModelName string `json:"model_name"`
	Count     int64  `json:"count"`
	Quota     int64  `json:"quota"`
}

type OpsModelPerf struct {
	ModelName    string `json:"model_name"`
	Requests     int64  `json:"requests"`
	Successes    int64  `json:"successes"`
	AvgLatencyMs int64  `json:"avg_latency_ms"`
	AvgTtftMs    int64  `json:"avg_ttft_ms"`
}

type OpsTasks struct {
	Success    int64           `json:"success"`
	Failure    int64           `json:"failure"`
	InProgress int64           `json:"in_progress"`
	Queued     int64           `json:"queued"`
	Reasons    []OpsFailReason `json:"fail_reasons"`
}

type OpsFailReason struct {
	Reason string `json:"reason"`
	Count  int64  `json:"count"`
}

type OpsUpstream struct {
	ChannelId int    `json:"channel_id"`
	Name      string `json:"name"`
	Quota     int64  `json:"quota"`
	// CostQuota is what the supplier charged for the period, filled in by the
	// controller from the supplier's own logs when CostStatus is "ok".
	CostQuota          int64   `json:"cost_quota"`
	CostStatus         string  `json:"cost_status"`
	CostError          string  `json:"cost_error,omitempty"`
	Count              int64   `json:"count"`
	Balance            float64 `json:"balance"`
	BalanceUpdatedTime int64   `json:"balance_updated_time"`
	TaskSuccess        int64   `json:"task_success"`
	TaskFailure        int64   `json:"task_failure"`
	// RecentQuota is what users were charged on the channel in the last
	// seven days, whatever the period, to estimate how long its balance lasts.
	RecentQuota int64 `json:"recent_quota"`
	// TaskCostQuota is what the supplier charged for the channel's successful
	// tasks, read from their snapshots for suppliers without readable logs.
	// TaskCostCharged tasks carried a charge; TaskCostEstimated tasks did not
	// and are priced at the same ratio.
	TaskCostQuota     int64 `json:"task_cost_quota"`
	TaskCostCharged   int64 `json:"task_cost_charged"`
	TaskCostEstimated int64 `json:"task_cost_estimated"`
	// SupplyCostQuota is the channel's cost at the supply price recorded on
	// its billing logs. SupplyCoveredQuota is the revenue those logs cover;
	// SupplyEstimatedQuota prices the rest at the same ratio.
	SupplyCostQuota      int64 `json:"supply_cost_quota"`
	SupplyCoveredQuota   int64 `json:"supply_covered_quota"`
	SupplyEstimatedQuota int64 `json:"supply_estimated_quota"`
	// CostSource says where CostQuota came from: supplier or tasks when the
	// supplier reported its charges, supply otherwise.
	CostSource string `json:"cost_source,omitempty"`
}

type OpsTopUser struct {
	UserId     int    `json:"user_id"`
	Username   string `json:"username"`
	Quota      int64  `json:"quota"`
	Balance    int64  `json:"balance"`
	LastUsedAt int64  `json:"last_used_at"`
}

// OpsLive holds figures of the present moment, which no period changes.
type OpsLive struct {
	TasksInProgress int64 `json:"tasks_in_progress"`
	TasksQueued     int64 `json:"tasks_queued"`
}

type OpsAlerts struct {
	OverdueOrders      int64 `json:"overdue_orders"`
	USDTExceptions     int64 `json:"usdt_exceptions"`
	DisputedOrders     int64 `json:"disputed_orders"`
	LowBalanceChannels int64 `json:"low_balance_channels"`
}

type OpsDashboard struct {
	Current  OpsPeriodStats    `json:"current"`
	Previous OpsPeriodStats    `json:"previous"`
	Wallet   OpsWallet         `json:"wallet"`
	Users    OpsUsers          `json:"users"`
	Pending  OpsPending        `json:"pending"`
	Channels []OpsChannelStats `json:"channels"`
	Trend    []OpsTrendDay     `json:"trend"`
	Models   []OpsModelUsage   `json:"models"`
	Perf     []OpsModelPerf    `json:"model_perf"`
	Tasks    OpsTasks          `json:"tasks"`
	Upstream []OpsUpstream     `json:"upstream"`
	TopUsers []OpsTopUser      `json:"top_users"`
	Alerts   OpsAlerts         `json:"alerts"`
	Live     OpsLive           `json:"live"`

	Funnel         OpsFunnel          `json:"funnel"`
	Sources        []OpsSource        `json:"sources"`
	Inviters       []OpsInviter       `json:"inviters"`
	TopupTiers     []OpsTopupTier     `json:"topup_tiers"`
	ModelDurations []OpsModelDuration `json:"model_durations"`
}

// opsOrderChannel names the channel of a top-up. Orders written before
// payment_provider existed only carry their payment method.
func opsOrderChannel(provider string, method string) string {
	if provider != "" {
		return provider
	}
	if method != "" {
		return method
	}
	return "other"
}

// opsCreditedQuota is the quota a successful order put into the wallet. It
// mirrors the settlement of each provider: Stripe and USDT store the credited
// USD in money, Creem stores the quota itself in amount, and every other
// channel stores whole USD units in amount, with money being the charged price.
func opsCreditedQuota(channel string, amount int64, money float64) int64 {
	quotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	switch channel {
	case PaymentProviderStripe, PaymentProviderUSDT:
		return decimal.NewFromFloat(money).Mul(quotaPerUnit).Round(0).IntPart()
	case PaymentProviderCreem:
		return amount
	default:
		return decimal.NewFromInt(amount).Mul(quotaPerUnit).Round(0).IntPart()
	}
}

type opsScope struct {
	internalIds []int
}

func (scope opsScope) excludeUsers(query *gorm.DB, column string) *gorm.DB {
	if len(scope.internalIds) == 0 {
		return query
	}
	return query.Where(column+" NOT IN ?", scope.internalIds)
}

type opsChannelFilter string

// apply keeps the orders of one channel, including legacy rows that have no
// provider and name the channel through their payment method.
func (channel opsChannelFilter) apply(query *gorm.DB) *gorm.DB {
	if channel == OpsChannelAll {
		return query
	}
	return query.Where(
		"payment_provider = ? OR ((payment_provider = '' OR payment_provider IS NULL) AND payment_method = ?)",
		string(channel), string(channel),
	)
}

// opsOrders starts a query over real top-up orders. A subscription purchase
// also writes a top_ups row, with amount 0, and is left out here.
func opsOrders(scope opsScope) *gorm.DB {
	return scope.excludeUsers(DB.Model(&TopUp{}).Where("amount > 0"), "user_id")
}

type opsOrderAggregate struct {
	PaymentProvider string
	PaymentMethod   string
	Status          string
	Orders          int64
	Amount          int64
	Money           float64
}

const opsOrderAggregateSelect = "payment_provider, payment_method, status, count(*) as orders, coalesce(sum(amount), 0) as amount, coalesce(sum(money), 0) as money"

// opsOrdersInRange groups orders by channel and status. Paid orders belong to
// the period they were paid in, the rest to the period they were created in.
func opsOrdersInRange(scope opsScope, start int64, end int64) ([]opsOrderAggregate, error) {
	var rows []opsOrderAggregate
	err := opsOrders(scope).
		Select(opsOrderAggregateSelect).
		Where(
			"(status IN ? AND complete_time >= ? AND complete_time <= ?) OR (status IN ? AND create_time >= ? AND create_time <= ?)",
			[]string{common.TopUpStatusSuccess, common.TopUpStatusRefunded, common.TopUpStatusDisputed}, start, end,
			[]string{common.TopUpStatusFailed, common.TopUpStatusExpired}, start, end,
		).
		Group("payment_provider, payment_method, status").
		Scan(&rows).Error
	return rows, err
}

func opsApplyOrderAggregates(stats *OpsPeriodStats, rows []opsOrderAggregate, channel string) {
	for _, row := range rows {
		rowChannel := opsOrderChannel(row.PaymentProvider, row.PaymentMethod)
		if channel != OpsChannelAll && rowChannel != channel {
			continue
		}
		credited := opsCreditedQuota(rowChannel, row.Amount, row.Money)
		switch row.Status {
		case common.TopUpStatusSuccess:
			stats.TopupOrders += row.Orders
			stats.TopupQuota += credited
		case common.TopUpStatusRefunded:
			stats.RefundOrders += row.Orders
			stats.RefundQuota += credited
		case common.TopUpStatusDisputed:
			stats.DisputedOrders += row.Orders
		case common.TopUpStatusFailed, common.TopUpStatusExpired:
			stats.ClosedOrders += row.Orders
		}
	}
}

// opsRedemptionsShown says whether a channel filter includes redemption codes.
func opsRedemptionsShown(channel string) bool {
	return channel == OpsChannelAll || channel == OpsChannelRedemption
}

func opsUsedRedemptions(scope opsScope) *gorm.DB {
	return scope.excludeUsers(
		DB.Model(&Redemption{}).Unscoped().Where("status = ?", common.RedemptionCodeStatusUsed),
		"used_user_id",
	)
}

// opsPayment is one paid top-up: a successful order, or a used redemption
// code, which customers buy as a way to pay.
type opsPayment struct {
	UserId  int
	Channel string
	Time    int64
	Quota   int64
}

// opsLoadPayments reads every paid top-up on every channel, oldest first.
func opsLoadPayments(scope opsScope) ([]opsPayment, error) {
	var orders []struct {
		UserId          int
		PaymentProvider string
		PaymentMethod   string
		CompleteTime    int64
		Amount          int64
		Money           float64
	}
	err := opsOrders(scope).
		Select("user_id, payment_provider, payment_method, complete_time, amount, money").
		Where("status = ?", common.TopUpStatusSuccess).
		Scan(&orders).Error
	if err != nil {
		return nil, err
	}
	var codes []struct {
		UsedUserId   int
		RedeemedTime int64
		Quota        int64
	}
	err = opsUsedRedemptions(scope).Select("used_user_id, redeemed_time, quota").Scan(&codes).Error
	if err != nil {
		return nil, err
	}
	payments := make([]opsPayment, 0, len(orders)+len(codes))
	for _, order := range orders {
		channel := opsOrderChannel(order.PaymentProvider, order.PaymentMethod)
		payments = append(payments, opsPayment{
			UserId:  order.UserId,
			Channel: channel,
			Time:    order.CompleteTime,
			Quota:   opsCreditedQuota(channel, order.Amount, order.Money),
		})
	}
	for _, code := range codes {
		payments = append(payments, opsPayment{UserId: code.UsedUserId, Channel: OpsChannelRedemption, Time: code.RedeemedTime, Quota: code.Quota})
	}
	slices.SortStableFunc(payments, func(a, b opsPayment) int { return cmp.Compare(a.Time, b.Time) })
	return payments, nil
}

// opsPaymentsOn keeps the payments of the channels a filter selects.
func opsPaymentsOn(payments []opsPayment, channel string) []opsPayment {
	if channel == OpsChannelAll {
		return payments
	}
	return slices.DeleteFunc(slices.Clone(payments), func(payment opsPayment) bool {
		return payment.Channel != channel
	})
}

// opsPaymentCounts counts each user's payments in [start, end].
func opsPaymentCounts(payments []opsPayment, start int64, end int64) map[int]int64 {
	counts := make(map[int]int64)
	for _, payment := range payments {
		if payment.Time >= start && payment.Time <= end {
			counts[payment.UserId]++
		}
	}
	return counts
}

func opsQuotaData(scope opsScope, start int64, end int64) *gorm.DB {
	query := DB.Table("quota_data").Where("created_at >= ? AND created_at <= ?", start, end)
	return scope.excludeUsers(query, "user_id")
}

// opsRefundLog is one refund of task quota. quota_data only ever grows, so a
// failed task stays in it after its quota was returned; the refund log is what
// turns those figures into net usage. A refund counts in the period it happened.
type opsRefundLog struct {
	UserId    int
	ModelName string
	ChannelId int
	CreatedAt int64
	Quota     int64
}

func opsRefundLogs(scope opsScope, start int64, end int64) ([]opsRefundLog, error) {
	var refunds []opsRefundLog
	query := LOG_DB.Table("logs").
		Select("user_id, model_name, channel_id, created_at, quota").
		Where("type = ? AND created_at >= ? AND created_at <= ?", LogTypeRefund, start, end)
	err := scope.excludeUsers(query, "user_id").Scan(&refunds).Error
	return refunds, err
}

func opsRefundTotal(refunds []opsRefundLog) int64 {
	var total int64
	for _, refund := range refunds {
		total += refund.Quota
	}
	return total
}

// opsNetUsage stays at zero when a period holds refunds of usage from before it.
func opsNetUsage(gross int64, refunded int64) int64 {
	return max(gross-refunded, 0)
}

func opsOtherCredit(scope opsScope, start int64, end int64) (OpsOtherCredit, error) {
	var credit OpsOtherCredit
	redemptions := opsUsedRedemptions(scope)
	rebates := scope.excludeUsers(
		DB.Model(&AffRebate{}).Where("status = ?", AffRebateStatusSettled),
		"inviter_id",
	)
	checkins := scope.excludeUsers(DB.Model(&Checkin{}), "user_id")
	if start > 0 {
		redemptions = redemptions.Where("redeemed_time >= ? AND redeemed_time <= ?", start, end)
		rebates = rebates.Where("settled_at >= ? AND settled_at <= ?", start, end)
		checkins = checkins.Where("created_at >= ? AND created_at <= ?", start, end)
	}
	if err := redemptions.Select("coalesce(sum(quota), 0)").Scan(&credit.RedemptionQuota).Error; err != nil {
		return credit, err
	}
	if err := rebates.Select("coalesce(sum(rebate_quota), 0)").Scan(&credit.RebateQuota).Error; err != nil {
		return credit, err
	}
	err := checkins.Select("coalesce(sum(quota_awarded), 0)").Scan(&credit.CheckinQuota).Error
	return credit, err
}

type opsPayerRow struct {
	UserId    int
	Orders    int64
	FirstPaid int64
}

// payments are the paid top-ups on the page's channels, payers their users.
func opsPeriodStats(scope opsScope, query OpsDashboardQuery, start int64, end int64, payments []opsPayment, payers []opsPayerRow) (OpsPeriodStats, error) {
	var stats OpsPeriodStats
	orders, err := opsOrdersInRange(scope, start, end)
	if err != nil {
		return stats, err
	}
	opsApplyOrderAggregates(&stats, orders, query.Channel)

	periodPayments := opsPaymentCounts(payments, start, end)
	stats.Payers = int64(len(periodPayments))
	for _, count := range periodPayments {
		if count >= 2 {
			stats.RepeatPayers++
		}
	}
	everPaid := make(map[int]bool, len(payers))
	for _, payer := range payers {
		everPaid[payer.UserId] = true
		if payer.FirstPaid >= start && payer.FirstPaid <= end {
			stats.NewPayers++
		}
	}

	registered := func() *gorm.DB {
		users := DB.Model(&User{}).Where("created_at >= ? AND created_at <= ?", start, end)
		if query.ExcludeInternal {
			users = users.Where("role < ?", common.RoleAdminUser)
		}
		return users
	}
	if err = registered().Count(&stats.NewUsers).Error; err != nil {
		return stats, err
	}
	var registeredIds []int
	if err = registered().Pluck("id", &registeredIds).Error; err != nil {
		return stats, err
	}
	for _, id := range registeredIds {
		if everPaid[id] {
			stats.RegisteredPayers++
		}
	}

	err = opsQuotaData(scope, start, end).Where("user_id > 0").Distinct("user_id").Count(&stats.ActiveUsers).Error
	if err != nil {
		return stats, err
	}
	err = opsQuotaData(scope, start, end).Select("coalesce(sum(quota), 0)").Scan(&stats.UsedQuota).Error
	if err != nil {
		return stats, err
	}
	refunds, err := opsRefundLogs(scope, start, end)
	if err != nil {
		return stats, err
	}
	stats.UsedQuota = opsNetUsage(stats.UsedQuota, opsRefundTotal(refunds))

	credit, err := opsOtherCredit(scope, start, end)
	if err != nil {
		return stats, err
	}
	stats.OtherCreditQuota = credit.total()

	err = scope.excludeUsers(DB.Model(&TestCredit{}), "user_id").
		Where("created_at >= ? AND created_at <= ?", start, end).
		Select("coalesce(sum(quota), 0)").Scan(&stats.TestCreditQuota).Error
	if err != nil {
		return stats, err
	}

	if opsRedemptionsShown(query.Channel) {
		stats.RedemptionQuota = credit.RedemptionQuota
		err = opsUsedRedemptions(scope).Where("redeemed_time >= ? AND redeemed_time <= ?", start, end).Count(&stats.Redemptions).Error
		if err != nil {
			return stats, err
		}
	}

	var taskCounts []struct {
		Status string
		Total  int64
	}
	err = scope.excludeUsers(DB.Model(&Task{}), "user_id").
		Select("status, count(*) as total").
		Where("created_at >= ? AND created_at <= ? AND status IN ?", start, end, []string{TaskStatusSuccess, TaskStatusFailure}).
		Group("status").
		Scan(&taskCounts).Error
	if err != nil {
		return stats, err
	}
	for _, row := range taskCounts {
		if row.Status == TaskStatusSuccess {
			stats.TaskSuccess = row.Total
		} else {
			stats.TaskFailure = row.Total
		}
	}

	durations, err := opsTaskDurations(scope, start, end)
	if err != nil {
		return stats, err
	}
	var all []int64
	var total int64
	for _, values := range durations {
		all = append(all, values...)
		for _, seconds := range values {
			total += seconds
		}
	}
	if len(all) > 0 {
		slices.Sort(all)
		stats.TaskAvgSeconds = int64(math.Round(float64(total) / float64(len(all))))
		stats.TaskMedianSeconds = opsPercentile(all, 50)
	}
	return stats, nil
}

// payments are every paid top-up, on every channel.
func opsLoadTestCredit(scope opsScope, result *OpsDashboard, payments []opsPayment) error {
	var grants []struct {
		UserId      int
		Quota       int64
		UsedAtFirst int64
		FirstGrant  int64
	}
	err := scope.excludeUsers(DB.Model(&TestCredit{}), "user_id").
		Select("user_id, coalesce(sum(quota), 0) as quota, min(used_quota_at_grant) as used_at_first, min(created_at) as first_grant").
		Group("user_id").
		Scan(&grants).Error
	if err != nil || len(grants) == 0 {
		return err
	}
	ids := make([]int, 0, len(grants))
	for _, grant := range grants {
		ids = append(ids, grant.UserId)
	}
	var users []struct {
		Id        int
		UsedQuota int64
	}
	err = DB.Model(&User{}).Unscoped().Select("id, used_quota").Where("id IN ?", ids).Scan(&users).Error
	if err != nil {
		return err
	}
	usedByUser := make(map[int]int64, len(users))
	for _, user := range users {
		usedByUser[user.Id] = user.UsedQuota
	}
	lastPaidByUser := make(map[int]int64)
	for _, payment := range payments {
		lastPaidByUser[payment.UserId] = max(lastPaidByUser[payment.UserId], payment.Time)
	}
	credit := &result.Wallet.TestCredit
	credit.Users = int64(len(grants))
	for _, grant := range grants {
		used := min(grant.Quota, max(usedByUser[grant.UserId]-grant.UsedAtFirst, 0))
		credit.GrantedQuota += grant.Quota
		credit.UsedQuota += used
		if used >= grant.Quota {
			credit.UsedUpUsers++
		}
		if lastPaidByUser[grant.UserId] > grant.FirstGrant {
			credit.PaidAfterUsers++
		}
	}
	return nil
}

// payments are every paid top-up, on every channel; payers are the users of
// the page's channels.
func opsLoadUsersAndWallet(scope opsScope, query OpsDashboardQuery, result *OpsDashboard, payments []opsPayment, payers []opsPayerRow) error {
	users := func() *gorm.DB {
		q := DB.Model(&User{})
		if query.ExcludeInternal {
			q = q.Where("role < ?", common.RoleAdminUser)
		}
		return q
	}
	if err := users().Count(&result.Users.Registered).Error; err != nil {
		return err
	}
	result.Users.TotalPayers = int64(len(payers))
	for _, payer := range payers {
		if payer.Orders >= 2 {
			result.Users.RepeatPayer++
		}
	}

	dormantSince := query.Now - opsDormantSeconds
	var recentIds []int
	err := DB.Table("quota_data").Where("created_at >= ?", dormantSince).Distinct("user_id").Pluck("user_id", &recentIds).Error
	if err != nil {
		return err
	}
	recent := make(map[int]bool, len(recentIds))
	for _, id := range recentIds {
		recent[id] = true
	}
	var funded []int
	if err = users().Where("quota > 0").Pluck("id", &funded).Error; err != nil {
		return err
	}
	everPaid := make(map[int]bool)
	for _, payment := range payments {
		everPaid[payment.UserId] = true
	}
	for _, id := range funded {
		if everPaid[id] && !recent[id] {
			result.Users.Dormant++
		}
	}

	// Usage of a deleted account stays part of what its top-ups paid for.
	usedQuery := DB.Model(&User{}).Unscoped()
	if query.ExcludeInternal {
		usedQuery = usedQuery.Where("role < ?", common.RoleAdminUser)
	}
	if err = usedQuery.Select("coalesce(sum(used_quota), 0)").Scan(&result.Wallet.UsedQuota).Error; err != nil {
		return err
	}
	err = users().Where("quota > 0").Select("coalesce(sum(quota), 0)").Scan(&result.Wallet.BalanceQuota).Error
	if err != nil {
		return err
	}
	if err = users().Where("quota < 0").Count(&result.Wallet.NegativeUsers).Error; err != nil {
		return err
	}
	err = users().Where("quota < 0").Select("coalesce(sum(quota), 0)").Scan(&result.Wallet.NegativeQuota).Error
	if err != nil {
		return err
	}

	if result.Wallet.OtherCredit, err = opsOtherCredit(scope, 0, 0); err != nil {
		return err
	}
	if err = opsLoadTestCredit(scope, result, payments); err != nil {
		return err
	}
	result.Wallet.RecentUsedSeconds = opsRunwayWindowSeconds
	recentStart := query.Now - opsRunwayWindowSeconds
	err = opsQuotaData(scope, recentStart, query.Now).
		Select("coalesce(sum(quota), 0)").Scan(&result.Wallet.RecentUsedQuota).Error
	if err != nil {
		return err
	}
	refunds, err := opsRefundLogs(scope, recentStart, query.Now)
	if err != nil {
		return err
	}
	result.Wallet.RecentUsedQuota = opsNetUsage(result.Wallet.RecentUsedQuota, opsRefundTotal(refunds))
	return nil
}

// opsLoadChannels fills the per-channel table and the channel-scoped totals.
// The table always lists every channel, whichever one the page filters on.
func opsLoadChannels(scope opsScope, query OpsDashboardQuery, result *OpsDashboard, periodOrders []opsOrderAggregate) error {
	byChannel := make(map[string]*OpsChannelStats)
	stats := func(channel string) *OpsChannelStats {
		row, ok := byChannel[channel]
		if !ok {
			row = &OpsChannelStats{Channel: channel}
			byChannel[channel] = row
		}
		return row
	}

	var totals []opsOrderAggregate
	err := opsOrders(scope).Select(opsOrderAggregateSelect).
		Where("status = ?", common.TopUpStatusSuccess).
		Group("payment_provider, payment_method, status").
		Scan(&totals).Error
	if err != nil {
		return err
	}
	for _, row := range totals {
		channel := opsOrderChannel(row.PaymentProvider, row.PaymentMethod)
		credited := opsCreditedQuota(channel, row.Amount, row.Money)
		stats(channel).TotalQuota += credited
		result.Wallet.AllChannelsQuota += credited
		if query.Channel == OpsChannelAll || query.Channel == channel {
			result.Wallet.TopupQuota += credited
		}
	}

	for _, row := range periodOrders {
		channel := opsOrderChannel(row.PaymentProvider, row.PaymentMethod)
		var period OpsPeriodStats
		opsApplyOrderAggregates(&period, []opsOrderAggregate{row}, OpsChannelAll)
		target := stats(channel)
		target.TopupOrders += period.TopupOrders
		target.TopupQuota += period.TopupQuota
		target.RefundOrders += period.RefundOrders
		target.DisputedOrders += period.DisputedOrders
		target.ClosedOrders += period.ClosedOrders
		switch row.Status {
		case common.TopUpStatusFailed:
			target.FailedOrders += row.Orders
		case common.TopUpStatusExpired:
			target.ExpiredOrders += row.Orders
		}
	}

	// Redemption codes are a channel of their own in the table.
	redemption := OpsChannelStats{Channel: OpsChannelRedemption}
	var codes struct {
		Codes int64
		Quota int64
	}
	err = opsUsedRedemptions(scope).
		Where("redeemed_time >= ? AND redeemed_time <= ?", query.Start, query.End).
		Select("count(*) as codes, coalesce(sum(quota), 0) as quota").
		Scan(&codes).Error
	if err != nil {
		return err
	}
	redemption.TopupOrders = codes.Codes
	redemption.TopupQuota = codes.Quota
	redemption.TotalQuota = result.Wallet.OtherCredit.RedemptionQuota
	if redemption.TotalQuota > 0 || redemption.TopupOrders > 0 {
		byChannel[OpsChannelRedemption] = &redemption
	}

	var pending []struct {
		PaymentProvider string
		PaymentMethod   string
		Pending         int64
		Overdue         int64
	}
	err = opsOrders(scope).
		Select("payment_provider, payment_method, count(*) as pending, coalesce(sum(CASE WHEN create_time < ? THEN 1 ELSE 0 END), 0) as overdue", query.Now-opsPendingOverdueSeconds).
		Where("status = ?", common.TopUpStatusPending).
		Group("payment_provider, payment_method").
		Scan(&pending).Error
	if err != nil {
		return err
	}
	for _, row := range pending {
		channel := opsOrderChannel(row.PaymentProvider, row.PaymentMethod)
		target := stats(channel)
		target.Pending += row.Pending
		target.Overdue += row.Overdue
		result.Alerts.OverdueOrders += row.Overdue
		if query.Channel == OpsChannelAll || query.Channel == channel {
			result.Pending.Pending += row.Pending - row.Overdue
			result.Pending.Overdue += row.Overdue
		}
	}

	result.Channels = make([]OpsChannelStats, 0, len(byChannel))
	for _, row := range byChannel {
		result.Channels = append(result.Channels, *row)
	}
	slices.SortFunc(result.Channels, func(a, b OpsChannelStats) int {
		if a.TotalQuota != b.TotalQuota {
			return int(min(max(b.TotalQuota-a.TotalQuota, -1), 1))
		}
		if a.Channel < b.Channel {
			return -1
		}
		return 1
	})
	return nil
}

func opsDayKey(timestamp int64, offsetSeconds int64) string {
	return time.Unix(timestamp+offsetSeconds, 0).UTC().Format("2006-01-02")
}

// opsLoadTrend buckets per calendar day of the administrator's time zone. The
// days are always all present, so the chart has no gaps.
func opsLoadTrend(scope opsScope, query OpsDashboardQuery, result *OpsDashboard, refunds []opsRefundLog, payers []opsPayerRow) error {
	offset := int64(query.TZOffsetMinutes) * 60
	byDate := make(map[string]*OpsTrendDay)
	const daySeconds = int64(24 * 60 * 60)
	lastDay := (query.End + offset) / daySeconds
	for day := (query.Start + offset) / daySeconds; day <= lastDay; day++ {
		date := time.Unix(day*daySeconds, 0).UTC().Format("2006-01-02")
		result.Trend = append(result.Trend, OpsTrendDay{Date: date, Topups: map[string]int64{}})
	}
	for i := range result.Trend {
		byDate[result.Trend[i].Date] = &result.Trend[i]
	}

	var orders []struct {
		PaymentProvider string
		PaymentMethod   string
		CompleteTime    int64
		Amount          int64
		Money           float64
	}
	err := opsOrders(scope).
		Select("payment_provider, payment_method, complete_time, amount, money").
		Where("status = ? AND complete_time >= ? AND complete_time <= ?", common.TopUpStatusSuccess, query.Start, query.End).
		Scan(&orders).Error
	if err != nil {
		return err
	}
	for _, order := range orders {
		channel := opsOrderChannel(order.PaymentProvider, order.PaymentMethod)
		if query.Channel != OpsChannelAll && query.Channel != channel {
			continue
		}
		if day, ok := byDate[opsDayKey(order.CompleteTime, offset)]; ok {
			day.Topups[channel] += opsCreditedQuota(channel, order.Amount, order.Money)
		}
	}

	// Redemption codes are top-ups without an order.
	if opsRedemptionsShown(query.Channel) {
		var redemptions []struct {
			RedeemedTime int64
			Quota        int64
		}
		err = opsUsedRedemptions(scope).
			Select("redeemed_time, quota").
			Where("redeemed_time >= ? AND redeemed_time <= ?", query.Start, query.End).
			Scan(&redemptions).Error
		if err != nil {
			return err
		}
		for _, redemption := range redemptions {
			if day, ok := byDate[opsDayKey(redemption.RedeemedTime, offset)]; ok {
				day.Topups[OpsChannelRedemption] += redemption.Quota
			}
		}
	}

	var usage []struct {
		CreatedAt int64
		Quota     int64
	}
	err = opsQuotaData(scope, query.Start, query.End).
		Select("created_at, coalesce(sum(quota), 0) as quota").
		Group("created_at").
		Scan(&usage).Error
	if err != nil {
		return err
	}
	for _, bucket := range usage {
		if day, ok := byDate[opsDayKey(bucket.CreatedAt, offset)]; ok {
			day.UsedQuota += bucket.Quota
		}
	}
	for _, refund := range refunds {
		if day, ok := byDate[opsDayKey(refund.CreatedAt, offset)]; ok {
			day.UsedQuota -= refund.Quota
		}
	}
	for i := range result.Trend {
		result.Trend[i].UsedQuota = opsNetUsage(result.Trend[i].UsedQuota, 0)
	}

	var registered []int64
	users := DB.Model(&User{}).Where("created_at >= ? AND created_at <= ?", query.Start, query.End)
	if query.ExcludeInternal {
		users = users.Where("role < ?", common.RoleAdminUser)
	}
	if err = users.Pluck("created_at", &registered).Error; err != nil {
		return err
	}
	for _, createdAt := range registered {
		if day, ok := byDate[opsDayKey(createdAt, offset)]; ok {
			day.NewUsers++
		}
	}
	for _, payer := range payers {
		if payer.FirstPaid < query.Start || payer.FirstPaid > query.End {
			continue
		}
		if day, ok := byDate[opsDayKey(payer.FirstPaid, offset)]; ok {
			day.NewPayers++
		}
	}

	// quota_data holds hourly buckets, so a user can appear several times a day.
	var calls []struct {
		CreatedAt int64
		UserId    int
	}
	err = opsQuotaData(scope, query.Start, query.End).
		Select("created_at, user_id").
		Where("user_id > 0").
		Group("created_at, user_id").
		Scan(&calls).Error
	if err != nil {
		return err
	}
	activeByDate := make(map[string]map[int]struct{})
	for _, call := range calls {
		date := opsDayKey(call.CreatedAt, offset)
		if activeByDate[date] == nil {
			activeByDate[date] = make(map[int]struct{})
		}
		activeByDate[date][call.UserId] = struct{}{}
	}
	for date, active := range activeByDate {
		if day, ok := byDate[date]; ok {
			day.ActiveUsers = int64(len(active))
		}
	}

	var tasks []struct {
		CreatedAt int64
		Status    string
		Total     int64
	}
	err = scope.excludeUsers(DB.Model(&Task{}), "user_id").
		Select("created_at, status, count(*) as total").
		Where("created_at >= ? AND created_at <= ? AND status IN ?", query.Start, query.End, []string{TaskStatusSuccess, TaskStatusFailure}).
		Group("created_at, status").
		Scan(&tasks).Error
	if err != nil {
		return err
	}
	for _, task := range tasks {
		day, ok := byDate[opsDayKey(task.CreatedAt, offset)]
		if !ok {
			continue
		}
		if task.Status == TaskStatusSuccess {
			day.TaskSuccess += task.Total
		} else {
			day.TaskFailure += task.Total
		}
	}
	return nil
}

func opsLoadModels(scope opsScope, query OpsDashboardQuery, result *OpsDashboard, refunds []opsRefundLog) error {
	err := opsQuotaData(scope, query.Start, query.End).
		Select("model_name, coalesce(sum(count), 0) as count, coalesce(sum(quota), 0) as quota").
		Group("model_name").
		Scan(&result.Models).Error
	if err != nil {
		return err
	}
	refundedByModel := make(map[string]int64)
	for _, refund := range refunds {
		refundedByModel[refund.ModelName] += refund.Quota
	}
	for i := range result.Models {
		model := &result.Models[i]
		model.Quota = opsNetUsage(model.Quota, refundedByModel[model.ModelName])
	}
	slices.SortStableFunc(result.Models, func(a, b OpsModelUsage) int {
		return cmp.Or(cmp.Compare(b.Quota, a.Quota), cmp.Compare(a.ModelName, b.ModelName))
	})

	var perf []struct {
		ModelName    string
		Requests     int64
		Successes    int64
		TotalLatency int64
		TtftSum      int64
		TtftCount    int64
	}
	err = DB.Model(&PerfMetric{}).
		Select("model_name, coalesce(sum(request_count), 0) as requests, coalesce(sum(success_count), 0) as successes, coalesce(sum(total_latency_ms), 0) as total_latency, coalesce(sum(ttft_sum_ms), 0) as ttft_sum, coalesce(sum(ttft_count), 0) as ttft_count").
		Where("bucket_ts >= ? AND bucket_ts <= ?", query.Start, query.End).
		Group("model_name").
		Scan(&perf).Error
	if err != nil {
		return err
	}
	result.Perf = make([]OpsModelPerf, 0, len(perf))
	for _, row := range perf {
		if row.Requests <= 0 {
			continue
		}
		item := OpsModelPerf{
			ModelName:    row.ModelName,
			Requests:     row.Requests,
			Successes:    row.Successes,
			AvgLatencyMs: row.TotalLatency / row.Requests,
		}
		if row.TtftCount > 0 {
			item.AvgTtftMs = row.TtftSum / row.TtftCount
		}
		result.Perf = append(result.Perf, item)
	}
	return nil
}

func opsLoadTasks(scope opsScope, query OpsDashboardQuery, result *OpsDashboard) error {
	tasks := func() *gorm.DB {
		return scope.excludeUsers(
			DB.Model(&Task{}).Where("created_at >= ? AND created_at <= ?", query.Start, query.End),
			"user_id",
		)
	}
	var counts []struct {
		Status string
		Total  int64
	}
	err := tasks().Select("status, count(*) as total").Group("status").Scan(&counts).Error
	if err != nil {
		return err
	}
	for _, row := range counts {
		switch row.Status {
		case TaskStatusSuccess:
			result.Tasks.Success += row.Total
		case TaskStatusFailure:
			result.Tasks.Failure += row.Total
		case TaskStatusInProgress:
			result.Tasks.InProgress += row.Total
		case string(TaskStatusNotStart), TaskStatusSubmitted, TaskStatusQueued:
			result.Tasks.Queued += row.Total
		}
	}

	var live []struct {
		Status string
		Total  int64
	}
	err = scope.excludeUsers(DB.Model(&Task{}), "user_id").
		Select("status, count(*) as total").
		Where("status IN ?", []string{TaskStatusInProgress, string(TaskStatusNotStart), TaskStatusSubmitted, TaskStatusQueued}).
		Group("status").
		Scan(&live).Error
	if err != nil {
		return err
	}
	for _, row := range live {
		if row.Status == TaskStatusInProgress {
			result.Live.TasksInProgress += row.Total
		} else {
			result.Live.TasksQueued += row.Total
		}
	}

	result.Tasks.Reasons = make([]OpsFailReason, 0, opsFailReasonLimit)
	err = tasks().
		Select("fail_reason as reason, count(*) as count").
		Where("status = ? AND fail_reason <> ''", TaskStatusFailure).
		Group("fail_reason").
		Order("count DESC").
		Limit(opsFailReasonLimit).
		Scan(&result.Tasks.Reasons).Error
	if err != nil {
		return err
	}
	for i := range result.Tasks.Reasons {
		reason := result.Tasks.Reasons[i].Reason
		if utf8.RuneCountInString(reason) > opsFailReasonMaxRunes {
			result.Tasks.Reasons[i].Reason = string([]rune(reason)[:opsFailReasonMaxRunes]) + "..."
		}
	}
	return nil
}

func opsLoadUpstream(scope opsScope, query OpsDashboardQuery, result *OpsDashboard, refunds []opsRefundLog) error {
	var usage []struct {
		ChannelId int
		Quota     int64
		Count     int64
	}
	err := opsQuotaData(scope, query.Start, query.End).
		Select("channel_id, coalesce(sum(quota), 0) as quota, coalesce(sum(count), 0) as count").
		Where("channel_id > 0").
		Group("channel_id").
		Scan(&usage).Error
	if err != nil {
		return err
	}
	var channels []struct {
		Id                 int
		Name               string
		Status             int
		Balance            float64
		BalanceUpdatedTime int64
	}
	err = DB.Model(&Channel{}).Select("id, name, status, balance, balance_updated_time").Scan(&channels).Error
	if err != nil {
		return err
	}
	byId := make(map[int]*OpsUpstream, len(channels))
	for _, channel := range channels {
		if channel.Status != common.ChannelStatusEnabled {
			continue
		}
		byId[channel.Id] = &OpsUpstream{
			ChannelId:          channel.Id,
			Name:               channel.Name,
			Balance:            channel.Balance,
			BalanceUpdatedTime: channel.BalanceUpdatedTime,
		}
		// A balance that was never fetched says nothing about the upstream.
		if channel.BalanceUpdatedTime > 0 && channel.Balance < opsLowChannelBalanceUSD {
			result.Alerts.LowBalanceChannels++
		}
	}
	upstream := func(channelId int) *OpsUpstream {
		row, ok := byId[channelId]
		if ok {
			return row
		}
		row = &OpsUpstream{ChannelId: channelId, Name: "#" + strconv.Itoa(channelId)}
		for _, channel := range channels {
			if channel.Id == channelId {
				row.Name = channel.Name
				row.Balance = channel.Balance
				row.BalanceUpdatedTime = channel.BalanceUpdatedTime
			}
		}
		byId[channelId] = row
		return row
	}
	refundedByChannel := make(map[int]int64)
	for _, refund := range refunds {
		refundedByChannel[refund.ChannelId] += refund.Quota
	}
	for _, row := range usage {
		target := upstream(row.ChannelId)
		target.Quota = opsNetUsage(row.Quota, refundedByChannel[row.ChannelId])
		target.Count = row.Count
	}

	// quota_data is flushed in batches while logs are written per call, so
	// the latest calls would reach the supplier's charges before the revenue.
	// Each source can only miss charges (late batches, or consume logging
	// turned off), so revenue is the larger of the two.
	var billed []struct {
		ChannelId int
		Type      int
		Quota     int64
	}
	billedQuery := LOG_DB.Table("logs").
		Select("channel_id, type, coalesce(sum(quota), 0) as quota").
		Where("type IN ? AND created_at >= ? AND created_at <= ? AND channel_id > 0", []int{LogTypeConsume, LogTypeRefund}, query.Start, query.End).
		Group("channel_id, type")
	if err = scope.excludeUsers(billedQuery, "user_id").Scan(&billed).Error; err != nil {
		return err
	}
	revenueByChannel := make(map[int]int64)
	for _, row := range billed {
		if row.Type == LogTypeRefund {
			revenueByChannel[row.ChannelId] -= row.Quota
		} else {
			revenueByChannel[row.ChannelId] += row.Quota
		}
	}
	for channelId, revenue := range revenueByChannel {
		target := upstream(channelId)
		target.Quota = max(target.Quota, revenue)
	}

	var recent []struct {
		ChannelId int
		Quota     int64
	}
	err = opsQuotaData(scope, query.Now-opsRunwayWindowSeconds, query.Now).
		Select("channel_id, coalesce(sum(quota), 0) as quota").
		Where("channel_id > 0").
		Group("channel_id").
		Scan(&recent).Error
	if err != nil {
		return err
	}
	for _, row := range recent {
		if target, ok := byId[row.ChannelId]; ok {
			target.RecentQuota = row.Quota
		}
	}

	var taskCounts []struct {
		ChannelId int
		Status    string
		Total     int64
	}
	taskQuery := scope.excludeUsers(
		DB.Model(&Task{}).Where("created_at >= ? AND created_at <= ? AND channel_id > 0 AND status IN ?", query.Start, query.End, []string{TaskStatusSuccess, TaskStatusFailure}),
		"user_id",
	)
	err = taskQuery.Select("channel_id, status, count(*) as total").Group("channel_id, status").Scan(&taskCounts).Error
	if err != nil {
		return err
	}
	for _, row := range taskCounts {
		target := upstream(row.ChannelId)
		if row.Status == TaskStatusSuccess {
			target.TaskSuccess = row.Total
		} else {
			target.TaskFailure = row.Total
		}
	}

	result.Upstream = make([]OpsUpstream, 0, len(byId))
	for _, row := range byId {
		result.Upstream = append(result.Upstream, *row)
	}
	slices.SortFunc(result.Upstream, func(a, b OpsUpstream) int {
		if a.Quota != b.Quota {
			return int(min(max(b.Quota-a.Quota, -1), 1))
		}
		return a.ChannelId - b.ChannelId
	})
	return nil
}

type opsTopUserRow struct {
	UserId     int
	Quota      int64
	LastUsedAt int64
}

func opsLoadTopUsers(scope opsScope, query OpsDashboardQuery, result *OpsDashboard, refunds []opsRefundLog) error {
	var rows []opsTopUserRow
	err := opsQuotaData(scope, query.Start, query.End).
		Select("user_id, coalesce(sum(quota), 0) as quota, max(created_at) as last_used_at").
		Where("user_id > 0").
		Group("user_id").
		Scan(&rows).Error
	if err != nil {
		return err
	}
	// Refunds can reorder users, so the ranking happens on net usage.
	refundedByUser := make(map[int]int64)
	for _, refund := range refunds {
		refundedByUser[refund.UserId] += refund.Quota
	}
	for i := range rows {
		rows[i].Quota = opsNetUsage(rows[i].Quota, refundedByUser[rows[i].UserId])
	}
	rows = slices.DeleteFunc(rows, func(row opsTopUserRow) bool { return row.Quota == 0 })
	slices.SortFunc(rows, func(a, b opsTopUserRow) int {
		return cmp.Or(cmp.Compare(b.Quota, a.Quota), cmp.Compare(a.UserId, b.UserId))
	})
	rows = rows[:min(len(rows), opsTopUserLimit)]
	result.TopUsers = make([]OpsTopUser, 0, len(rows))
	if len(rows) == 0 {
		return nil
	}
	ids := make([]int, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.UserId)
	}
	var users []struct {
		Id       int
		Username string
		Quota    int64
	}
	err = DB.Model(&User{}).Unscoped().Select("id, username, quota").Where("id IN ?", ids).Scan(&users).Error
	if err != nil {
		return err
	}
	for _, row := range rows {
		item := OpsTopUser{UserId: row.UserId, Quota: row.Quota, LastUsedAt: row.LastUsedAt}
		for _, user := range users {
			if user.Id == row.UserId {
				item.Username = user.Username
				item.Balance = user.Quota
			}
		}
		result.TopUsers = append(result.TopUsers, item)
	}
	return nil
}

// opsFirstActivity is when the earliest order or usage happened, so an
// all-time trend starts there instead of at the epoch. It is end when there
// is none.
func opsFirstActivity(end int64) (int64, error) {
	var firstOrder, firstUsage int64
	err := DB.Model(&TopUp{}).Where("create_time > 0").Select("coalesce(min(create_time), 0)").Scan(&firstOrder).Error
	if err != nil {
		return 0, err
	}
	err = DB.Table("quota_data").Where("created_at > 0").Select("coalesce(min(created_at), 0)").Scan(&firstUsage).Error
	if err != nil {
		return 0, err
	}
	first := end
	for _, candidate := range []int64{firstOrder, firstUsage} {
		if candidate > 0 {
			first = min(first, candidate)
		}
	}
	return first, nil
}

// GetOpsDashboard builds the administrator's business overview. Wallet figures
// are in quota units, so the page shows them in the site's display currency.
func GetOpsDashboard(query OpsDashboardQuery) (*OpsDashboard, error) {
	scope := opsScope{}
	if query.ExcludeInternal {
		err := DB.Model(&User{}).Unscoped().Where("role >= ?", common.RoleAdminUser).Pluck("id", &scope.internalIds).Error
		if err != nil {
			return nil, err
		}
	}
	result := &OpsDashboard{}

	allPayments, err := opsLoadPayments(scope)
	if err != nil {
		return nil, err
	}
	payments := opsPaymentsOn(allPayments, query.Channel)
	payerIndex := make(map[int]int)
	var payers []opsPayerRow
	for _, payment := range payments {
		index, ok := payerIndex[payment.UserId]
		if !ok {
			index = len(payers)
			payerIndex[payment.UserId] = index
			payers = append(payers, opsPayerRow{UserId: payment.UserId, FirstPaid: payment.Time})
		}
		payers[index].Orders++
	}

	if query.AllTime {
		query.Start = 0
	}
	if result.Current, err = opsPeriodStats(scope, query, query.Start, query.End, payments, payers); err != nil {
		return nil, err
	}
	if !query.AllTime {
		length := query.End - query.Start + 1
		if result.Previous, err = opsPeriodStats(scope, query, query.Start-length, query.Start-1, payments, payers); err != nil {
			return nil, err
		}
	}
	if err = opsLoadUsersAndWallet(scope, query, result, allPayments, payers); err != nil {
		return nil, err
	}
	periodOrders, err := opsOrdersInRange(scope, query.Start, query.End)
	if err != nil {
		return nil, err
	}
	if err = opsLoadChannels(scope, query, result, periodOrders); err != nil {
		return nil, err
	}
	refunds, err := opsRefundLogs(scope, query.Start, query.End)
	if err != nil {
		return nil, err
	}
	trendQuery := query
	if query.AllTime {
		if trendQuery.Start, err = opsFirstActivity(query.End); err != nil {
			return nil, err
		}
		trendQuery.Start = max(trendQuery.Start, query.End-opsTrendMaxDays*24*60*60+1)
	}
	if err = opsLoadTrend(scope, trendQuery, result, refunds, payers); err != nil {
		return nil, err
	}
	if err = opsLoadModels(scope, query, result, refunds); err != nil {
		return nil, err
	}
	if err = opsLoadTasks(scope, query, result); err != nil {
		return nil, err
	}
	if err = opsLoadUpstream(scope, query, result, refunds); err != nil {
		return nil, err
	}
	if err = opsLoadTaskCosts(scope, query, result); err != nil {
		return nil, err
	}
	if err = opsLoadSupplyCosts(scope, query, result); err != nil {
		return nil, err
	}
	if err = opsLoadTopUsers(scope, query, result, refunds); err != nil {
		return nil, err
	}
	if err = opsLoadUserSources(query, result, allPayments); err != nil {
		return nil, err
	}
	opsLoadTopupTiers(query, result, allPayments)
	if err = opsLoadModelDurations(scope, query, result); err != nil {
		return nil, err
	}

	err = DB.Model(&TopUp{}).Where("status = ?", common.TopUpStatusDisputed).Count(&result.Alerts.DisputedOrders).Error
	if err != nil {
		return nil, err
	}
	err = DB.Model(&USDTReceipt{}).
		Where("status IN ?", []string{USDTReceiptStatusUnmatched, USDTReceiptStatusCreditFailed}).
		Count(&result.Alerts.USDTExceptions).Error
	if err != nil {
		return nil, err
	}
	return result, nil
}
