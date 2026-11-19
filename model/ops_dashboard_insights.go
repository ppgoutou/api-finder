package model

import (
	"cmp"
	"math"
	"slices"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	// OpsSourceGoogle users signed up with Google, which the site offers as
	// its OIDC provider; OpsSourceDirect users signed up any other way.
	OpsSourceGoogle = "google"
	OpsSourceDirect = "direct"

	opsInviterLimit       = 10
	opsDurationModelLimit = 8
	// A finished task that took longer than this has a broken timestamp.
	opsMaxTaskSeconds int64 = 24 * 60 * 60
)

// opsTopupTierLimitsUSD are the upper bounds of the top-up amount tiers. The
// last tier has no bound and is reported with MaxUSD 0.
var opsTopupTierLimitsUSD = []float64{5, 10, 20, 50, 100}

// OpsFunnel follows the users registered in the period: how many made a
// call, paid, and paid again, up to now.
type OpsFunnel struct {
	Registered int64 `json:"registered"`
	Active     int64 `json:"active"`
	Paid       int64 `json:"paid"`
	Repeat     int64 `json:"repeat"`
}

// OpsSource is one sign-up method crossed with whether the user was invited,
// for the users registered in the period. Quota is what they have paid by
// order up to now.
type OpsSource struct {
	Method  string `json:"method"`
	Invited bool   `json:"invited"`
	Users   int64  `json:"users"`
	Payers  int64  `json:"payers"`
	Quota   int64  `json:"quota"`
}

// OpsInviter ranks the users whose invitees registered in the period.
type OpsInviter struct {
	UserId   int    `json:"user_id"`
	Username string `json:"username"`
	Invited  int64  `json:"invited"`
	Payers   int64  `json:"payers"`
	Quota    int64  `json:"quota"`
}

// OpsTopupTier counts the orders paid in the period whose amount falls in a
// tier, split by whether it was the user's first paid order.
type OpsTopupTier struct {
	MaxUSD       float64 `json:"max_usd"`
	FirstOrders  int64   `json:"first_orders"`
	RepeatOrders int64   `json:"repeat_orders"`
	FirstQuota   int64   `json:"first_quota"`
	RepeatQuota  int64   `json:"repeat_quota"`
}

// OpsModelDuration is how long the successful tasks of a model took from
// submission to completion.
type OpsModelDuration struct {
	ModelName  string `json:"model_name"`
	Tasks      int64  `json:"tasks"`
	P50Seconds int64  `json:"p50_seconds"`
	P90Seconds int64  `json:"p90_seconds"`
}

type opsUserPayment struct {
	quota  int64
	orders int64
}

// opsPaymentsByUser sums the paid orders of the users the subquery selects,
// over every channel.
func opsPaymentsByUser(scope opsScope, userIds *gorm.DB) (map[int]opsUserPayment, error) {
	var rows []struct {
		UserId          int
		PaymentProvider string
		PaymentMethod   string
		Orders          int64
		Amount          int64
		Money           float64
	}
	err := opsOrders(scope).
		Select("user_id, payment_provider, payment_method, count(*) as orders, coalesce(sum(amount), 0) as amount, coalesce(sum(money), 0) as money").
		Where("status = ? AND user_id IN (?)", common.TopUpStatusSuccess, userIds).
		Group("user_id, payment_provider, payment_method").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	payments := make(map[int]opsUserPayment)
	for _, row := range rows {
		payment := payments[row.UserId]
		payment.quota += opsCreditedQuota(opsOrderChannel(row.PaymentProvider, row.PaymentMethod), row.Amount, row.Money)
		payment.orders += row.Orders
		payments[row.UserId] = payment
	}
	return payments, nil
}

// opsLoadUserSources fills the funnel, the sign-up sources and the inviter
// ranking from the users registered in the period. Payments follow every
// channel, whatever the page filters on.
func opsLoadUserSources(scope opsScope, query OpsDashboardQuery, result *OpsDashboard) error {
	cohort := func() *gorm.DB {
		users := DB.Model(&User{}).Where("created_at >= ? AND created_at <= ?", query.Start, query.End)
		if query.ExcludeInternal {
			users = users.Where("role < ?", common.RoleAdminUser)
		}
		return users
	}
	var users []struct {
		Id        int
		OidcId    string
		InviterId int
	}
	if err := cohort().Select("id, oidc_id, inviter_id").Scan(&users).Error; err != nil {
		return err
	}
	payments, err := opsPaymentsByUser(scope, cohort().Select("id"))
	if err != nil {
		return err
	}
	var activeIds []int
	err = DB.Table("quota_data").Distinct("user_id").Where("user_id IN (?)", cohort().Select("id")).Pluck("user_id", &activeIds).Error
	if err != nil {
		return err
	}
	active := make(map[int]bool, len(activeIds))
	for _, id := range activeIds {
		active[id] = true
	}

	result.Sources = make([]OpsSource, 0, 4)
	for _, method := range []string{OpsSourceGoogle, OpsSourceDirect} {
		for _, invited := range []bool{true, false} {
			result.Sources = append(result.Sources, OpsSource{Method: method, Invited: invited})
		}
	}
	inviters := make(map[int]*OpsInviter)
	for _, user := range users {
		payment := payments[user.Id]
		funnel := &result.Funnel
		funnel.Registered++
		if active[user.Id] {
			funnel.Active++
		}
		if payment.orders > 0 {
			funnel.Paid++
		}
		if payment.orders >= 2 {
			funnel.Repeat++
		}

		index := 0
		if user.OidcId == "" {
			index = 2
		}
		if user.InviterId <= 0 {
			index++
		}
		source := &result.Sources[index]
		source.Users++
		source.Quota += payment.quota
		if payment.orders > 0 {
			source.Payers++
		}

		if user.InviterId <= 0 {
			continue
		}
		inviter, ok := inviters[user.InviterId]
		if !ok {
			inviter = &OpsInviter{UserId: user.InviterId}
			inviters[user.InviterId] = inviter
		}
		inviter.Invited++
		inviter.Quota += payment.quota
		if payment.orders > 0 {
			inviter.Payers++
		}
	}

	result.Inviters = make([]OpsInviter, 0, len(inviters))
	for _, inviter := range inviters {
		result.Inviters = append(result.Inviters, *inviter)
	}
	slices.SortFunc(result.Inviters, func(a, b OpsInviter) int {
		return cmp.Or(cmp.Compare(b.Quota, a.Quota), cmp.Compare(b.Invited, a.Invited), cmp.Compare(a.UserId, b.UserId))
	})
	result.Inviters = result.Inviters[:min(len(result.Inviters), opsInviterLimit)]
	if len(result.Inviters) == 0 {
		return nil
	}
	ids := make([]int, 0, len(result.Inviters))
	for _, inviter := range result.Inviters {
		ids = append(ids, inviter.UserId)
	}
	var names []struct {
		Id       int
		Username string
	}
	if err = DB.Model(&User{}).Unscoped().Select("id, username").Where("id IN ?", ids).Scan(&names).Error; err != nil {
		return err
	}
	for i := range result.Inviters {
		for _, name := range names {
			if name.Id == result.Inviters[i].UserId {
				result.Inviters[i].Username = name.Username
			}
		}
	}
	return nil
}

// opsLoadTopupTiers groups the orders paid in the period by amount. An order
// is a first top-up when it is the user's earliest paid order on any channel.
func opsLoadTopupTiers(scope opsScope, query OpsDashboardQuery, result *OpsDashboard) error {
	result.TopupTiers = make([]OpsTopupTier, 0, len(opsTopupTierLimitsUSD)+1)
	for _, limit := range opsTopupTierLimitsUSD {
		result.TopupTiers = append(result.TopupTiers, OpsTopupTier{MaxUSD: limit})
	}
	result.TopupTiers = append(result.TopupTiers, OpsTopupTier{})

	var orders []struct {
		UserId          int
		PaymentProvider string
		PaymentMethod   string
		Amount          int64
		Money           float64
		CompleteTime    int64
	}
	paid := opsOrders(scope).Where("status = ? AND complete_time >= ? AND complete_time <= ?", common.TopUpStatusSuccess, query.Start, query.End)
	err := opsChannelFilter(query.Channel).apply(paid).
		Select("user_id, payment_provider, payment_method, amount, money, complete_time").
		Scan(&orders).Error
	if err != nil || len(orders) == 0 {
		return err
	}
	var firsts []struct {
		UserId    int
		FirstPaid int64
	}
	err = opsOrders(scope).
		Select("user_id, min(complete_time) as first_paid").
		Where("status = ?", common.TopUpStatusSuccess).
		Group("user_id").
		Scan(&firsts).Error
	if err != nil {
		return err
	}
	firstPaid := make(map[int]int64, len(firsts))
	for _, row := range firsts {
		firstPaid[row.UserId] = row.FirstPaid
	}

	for _, order := range orders {
		quota := opsCreditedQuota(opsOrderChannel(order.PaymentProvider, order.PaymentMethod), order.Amount, order.Money)
		usd := float64(quota) / common.QuotaPerUnit
		tier := &result.TopupTiers[len(result.TopupTiers)-1]
		for i, limit := range opsTopupTierLimitsUSD {
			// Half a cent of slack keeps a $10.00 order in the $10 tier.
			if usd <= limit+0.005 {
				tier = &result.TopupTiers[i]
				break
			}
		}
		if order.CompleteTime == firstPaid[order.UserId] {
			tier.FirstOrders++
			tier.FirstQuota += quota
		} else {
			tier.RepeatOrders++
			tier.RepeatQuota += quota
		}
	}
	return nil
}

// opsPercentile is the nearest-rank percentile of sorted values.
func opsPercentile(sorted []int64, percent float64) int64 {
	rank := int(math.Ceil(percent / 100 * float64(len(sorted))))
	return sorted[min(max(rank-1, 0), len(sorted)-1)]
}

// opsLoadModelDurations measures the successful tasks created in the period,
// for the models with the most of them.
func opsLoadModelDurations(scope opsScope, query OpsDashboardQuery, result *OpsDashboard) error {
	var tasks []struct {
		SubmitTime int64
		FinishTime int64
		Properties Properties
	}
	err := scope.excludeUsers(DB.Model(&Task{}), "user_id").
		Select("submit_time, finish_time, properties").
		Where("created_at >= ? AND created_at <= ? AND status = ? AND submit_time > 0 AND finish_time > submit_time", query.Start, query.End, TaskStatusSuccess).
		Scan(&tasks).Error
	if err != nil {
		return err
	}
	durations := make(map[string][]int64)
	for _, task := range tasks {
		name := cmp.Or(task.Properties.OriginModelName, task.Properties.UpstreamModelName)
		if name == "" {
			continue
		}
		seconds := task.FinishTime - task.SubmitTime
		// Some platforms report times in milliseconds.
		if task.FinishTime > 1e11 {
			seconds /= 1000
		}
		if seconds <= 0 || seconds > opsMaxTaskSeconds {
			continue
		}
		durations[name] = append(durations[name], seconds)
	}

	result.ModelDurations = make([]OpsModelDuration, 0, len(durations))
	for name, values := range durations {
		slices.Sort(values)
		result.ModelDurations = append(result.ModelDurations, OpsModelDuration{
			ModelName:  name,
			Tasks:      int64(len(values)),
			P50Seconds: opsPercentile(values, 50),
			P90Seconds: opsPercentile(values, 90),
		})
	}
	slices.SortFunc(result.ModelDurations, func(a, b OpsModelDuration) int {
		return cmp.Or(cmp.Compare(b.Tasks, a.Tasks), cmp.Compare(a.ModelName, b.ModelName))
	})
	result.ModelDurations = result.ModelDurations[:min(len(result.ModelDurations), opsDurationModelLimit)]
	return nil
}
