package model

import (
	"cmp"
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
)

// OpsDashboardQuery selects one reporting period. Start and End are inclusive.
type OpsDashboardQuery struct {
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
}

// OpsOtherCredit breaks down wallet credits that did not come from an order.
type OpsOtherCredit struct {
	RedemptionQuota int64 `json:"redemption_quota"`
	RebateQuota     int64 `json:"rebate_quota"`
	CheckinQuota    int64 `json:"checkin_quota"`
}

func (credit OpsOtherCredit) total() int64 {
	return credit.RedemptionQuota + credit.RebateQuota + credit.CheckinQuota
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
	RefundOrders   int64  `json:"refund_orders"`
	DisputedOrders int64  `json:"disputed_orders"`
}

// OpsTrendDay carries one local calendar day of the top-up and usage chart.
type OpsTrendDay struct {
	Date      string           `json:"date"`
	Topups    map[string]int64 `json:"topups"`
	UsedQuota int64            `json:"used_quota"`
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
	ChannelId          int     `json:"channel_id"`
	Name               string  `json:"name"`
	Quota              int64   `json:"quota"`
	Count              int64   `json:"count"`
	Balance            float64 `json:"balance"`
	BalanceUpdatedTime int64   `json:"balance_updated_time"`
	TaskSuccess        int64   `json:"task_success"`
	TaskFailure        int64   `json:"task_failure"`
}

type OpsTopUser struct {
	UserId     int    `json:"user_id"`
	Username   string `json:"username"`
	Quota      int64  `json:"quota"`
	Balance    int64  `json:"balance"`
	LastUsedAt int64  `json:"last_used_at"`
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
	redemptions := scope.excludeUsers(
		DB.Model(&Redemption{}).Unscoped().Where("status = ?", common.RedemptionCodeStatusUsed),
		"used_user_id",
	)
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

func opsPeriodStats(scope opsScope, query OpsDashboardQuery, start int64, end int64, payers []opsPayerRow) (OpsPeriodStats, error) {
	var stats OpsPeriodStats
	orders, err := opsOrdersInRange(scope, start, end)
	if err != nil {
		return stats, err
	}
	opsApplyOrderAggregates(&stats, orders, query.Channel)

	paid := opsOrders(scope).Where("status = ? AND complete_time >= ? AND complete_time <= ?", common.TopUpStatusSuccess, start, end)
	err = opsChannelFilter(query.Channel).apply(paid).Distinct("user_id").Count(&stats.Payers).Error
	if err != nil {
		return stats, err
	}
	for _, payer := range payers {
		if payer.FirstPaid >= start && payer.FirstPaid <= end {
			stats.NewPayers++
		}
	}

	users := DB.Model(&User{}).Where("created_at >= ? AND created_at <= ?", start, end)
	if query.ExcludeInternal {
		users = users.Where("role < ?", common.RoleAdminUser)
	}
	if err = users.Count(&stats.NewUsers).Error; err != nil {
		return stats, err
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
	return stats, nil
}

func opsLoadUsersAndWallet(scope opsScope, query OpsDashboardQuery, result *OpsDashboard, payers []opsPayerRow) error {
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
	paidUsers := opsOrders(scope).Where("status = ?", common.TopUpStatusSuccess).Select("user_id")
	recentUsers := DB.Table("quota_data").Where("created_at >= ?", dormantSince).Select("user_id")
	err := users().Where("quota > 0 AND id IN (?) AND id NOT IN (?)", paidUsers, recentUsers).Count(&result.Users.Dormant).Error
	if err != nil {
		return err
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
func opsLoadTrend(scope opsScope, query OpsDashboardQuery, result *OpsDashboard, refunds []opsRefundLog) error {
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

	var payers []opsPayerRow
	allPaid := opsOrders(scope).Where("status = ?", common.TopUpStatusSuccess)
	err := opsChannelFilter(query.Channel).apply(allPaid).
		Select("user_id, count(*) as orders, min(complete_time) as first_paid").
		Group("user_id").
		Scan(&payers).Error
	if err != nil {
		return nil, err
	}

	if result.Current, err = opsPeriodStats(scope, query, query.Start, query.End, payers); err != nil {
		return nil, err
	}
	length := query.End - query.Start + 1
	if result.Previous, err = opsPeriodStats(scope, query, query.Start-length, query.Start-1, payers); err != nil {
		return nil, err
	}
	if err = opsLoadUsersAndWallet(scope, query, result, payers); err != nil {
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
	if err = opsLoadTrend(scope, query, result, refunds); err != nil {
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
	if err = opsLoadTopUsers(scope, query, result, refunds); err != nil {
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
