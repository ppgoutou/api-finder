package model

import (
	"encoding/json"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
)

// opsTaskChargeReaders read what a supplier charged for one task from the
// upstream response its task plugin keeps in Task.Data. They cover suppliers
// whose own logs the dashboard cannot read, keyed by task platform. Each
// returns the charge in CNY and whether the snapshot carried one.
var opsTaskChargeReaders = map[string]func(data []byte) (decimal.Decimal, bool){
	"fenglang": fenglangTaskCharge,
}

// fenglangTaskCharge reads the `charge` of a fenglang.cloud task, which the
// site states in credits at ten credits to one yuan. The site answers
// { success, task } and the charge is either { amount, at } or a bare number.
func fenglangTaskCharge(data []byte) (decimal.Decimal, bool) {
	var snapshot struct {
		Task struct {
			Charge json.RawMessage `json:"charge"`
		} `json:"task"`
	}
	if len(data) == 0 || common.Unmarshal(data, &snapshot) != nil || common.GetJsonType(snapshot.Task.Charge) == "null" {
		return decimal.Zero, false
	}
	var credits float64
	var charge struct {
		Amount *float64 `json:"amount"`
	}
	switch {
	case common.Unmarshal(snapshot.Task.Charge, &credits) == nil:
	case common.Unmarshal(snapshot.Task.Charge, &charge) == nil && charge.Amount != nil:
		credits = *charge.Amount
	default:
		return decimal.Zero, false
	}
	if credits < 0 {
		return decimal.Zero, false
	}
	return decimal.NewFromFloat(credits).Div(decimal.NewFromInt(10)), true
}

// opsTaskCost is what the successful tasks of one channel cost at the
// supplier, from the charges their snapshots carry.
type opsTaskCost struct {
	cny decimal.Decimal
	// chargedQuota and missingQuota are what users paid for the tasks with
	// and without a readable charge.
	chargedQuota int64
	missingQuota int64
	charged      int64
	missing      int64
}

// opsLoadTaskCosts fills the cost of upstream channels whose supplier charges
// can only be read from task snapshots. Failed tasks are refunded by the
// supplier and cost nothing. Tasks without a readable charge are priced at
// the channel's own ratio of supplier charge to user charge.
func opsLoadTaskCosts(scope opsScope, query OpsDashboardQuery, result *OpsDashboard) error {
	platforms := make([]string, 0, len(opsTaskChargeReaders))
	for platform := range opsTaskChargeReaders {
		platforms = append(platforms, platform)
	}
	var tasks []struct {
		ChannelId int
		Platform  string
		Quota     int64
		Data      []byte
	}
	err := scope.excludeUsers(DB.Model(&Task{}), "user_id").
		Select("channel_id, platform, quota, data").
		Where("created_at >= ? AND created_at <= ? AND status = ? AND channel_id > 0 AND platform IN ?",
			query.Start, query.End, TaskStatusSuccess, platforms).
		Scan(&tasks).Error
	if err != nil {
		return err
	}
	costs := make(map[int]*opsTaskCost)
	for _, task := range tasks {
		cost, ok := costs[task.ChannelId]
		if !ok {
			cost = &opsTaskCost{}
			costs[task.ChannelId] = cost
		}
		cny, found := opsTaskChargeReaders[task.Platform](task.Data)
		if !found {
			cost.missing++
			cost.missingQuota += task.Quota
			continue
		}
		cost.charged++
		cost.chargedQuota += task.Quota
		cost.cny = cost.cny.Add(cny)
	}
	if operation_setting.USDExchangeRate <= 0 {
		return nil
	}
	quotaPerCNY := decimal.NewFromFloat(common.QuotaPerUnit).Div(decimal.NewFromFloat(operation_setting.USDExchangeRate))
	for i := range result.Upstream {
		row := &result.Upstream[i]
		cost, ok := costs[row.ChannelId]
		if !ok || cost.charged == 0 {
			continue
		}
		quota := cost.cny.Mul(quotaPerCNY)
		if cost.missing > 0 && cost.chargedQuota > 0 {
			ratio := quota.Div(decimal.NewFromInt(cost.chargedQuota))
			quota = quota.Add(ratio.Mul(decimal.NewFromInt(cost.missingQuota)))
		}
		row.TaskCostQuota = quota.Round(0).IntPart()
		row.TaskCostCharged = cost.charged
		row.TaskCostEstimated = cost.missing
	}
	return nil
}
