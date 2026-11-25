package model

import (
	"slices"

	"github.com/QuantumNous/new-api/common"
)

// opsTaskStatusChunk bounds the task ids of one status lookup.
const opsTaskStatusChunk = 500

type opsSupplyLogOther struct {
	TaskId    string `json:"task_id"`
	AdminInfo struct {
		GrossMargin *struct {
			RevenueQuota int64 `json:"revenue_quota"`
			SupplyQuota  int64 `json:"supply_quota"`
		} `json:"gross_margin"`
	} `json:"admin_info"`
}

type opsSupplyEntry struct {
	channelId int
	revenue   int64
	supply    int64
}

// costFor is the supply cost of a channel's revenue: what the logs recorded, plus
// an estimate at the same ratio for the revenue they do not cover.
func (entry opsSupplyEntry) costFor(revenue int64) (cost int64, estimated int64) {
	if uncovered := revenue - entry.revenue; uncovered > 0 && entry.revenue > 0 {
		estimated = int64(common.QuotaRound(float64(uncovered) * float64(entry.supply) / float64(entry.revenue)))
	}
	return entry.supply + estimated, estimated
}

// GetSupplyCost returns the supply price, in quota, of everything the channels
// were billed for in a period, administrators' calls included. It is not known
// when nothing was billed, or when a channel's billing logs carry no supply
// price.
func GetSupplyCost(channelIds []int, start, end int64) (cost int64, known bool, err error) {
	revenue, err := opsBilledRevenue(opsScope{}, start, end)
	if err != nil {
		return 0, false, err
	}
	covered, err := opsSupplyByChannel(opsScope{}, start, end)
	if err != nil {
		return 0, false, err
	}
	for _, channelId := range channelIds {
		total, ok := covered[channelId]
		if !ok || total.revenue <= 0 {
			if revenue[channelId] > 0 {
				return 0, false, nil
			}
			continue
		}
		channelCost, _ := total.costFor(revenue[channelId])
		cost += channelCost
		known = true
	}
	return cost, known, nil
}

// opsSupplyByChannel adds up, by channel, the revenue and supply price that
// billing logs record for admins since gross margins were introduced. A task
// writes one log when it is submitted and another, for its whole settled
// charge, when it settles, so only its latest log counts; a failed task is
// refunded by the supplier and costs nothing.
func opsSupplyByChannel(scope opsScope, start, end int64) (map[int]*opsSupplyEntry, error) {
	var logs []struct {
		ChannelId int
		Type      int
		Other     string
	}
	err := scope.excludeUsers(LOG_DB.Table("logs"), "user_id").
		Select("channel_id, type, other").
		Where("type IN ? AND created_at >= ? AND created_at <= ? AND channel_id > 0 AND other LIKE ?",
			[]int{LogTypeConsume, LogTypeRefund}, start, end, "%gross_margin%").
		Order("id").
		Scan(&logs).Error
	if err != nil {
		return nil, err
	}

	var entries []opsSupplyEntry
	latestByTask := make(map[string]opsSupplyEntry)
	for _, log := range logs {
		var other opsSupplyLogOther
		if common.UnmarshalJsonStr(log.Other, &other) != nil || other.AdminInfo.GrossMargin == nil {
			continue
		}
		margin := other.AdminInfo.GrossMargin
		entry := opsSupplyEntry{channelId: log.ChannelId, revenue: margin.RevenueQuota, supply: margin.SupplyQuota}
		if other.TaskId != "" {
			latestByTask[other.TaskId] = entry
			continue
		}
		// A relay refund returns part of a charge whose own log carries
		// the whole supply price; it does not stand for a cost of its own.
		if log.Type == LogTypeConsume {
			entries = append(entries, entry)
		}
	}

	taskIds := make([]string, 0, len(latestByTask))
	for taskId := range latestByTask {
		taskIds = append(taskIds, taskId)
	}
	slices.Sort(taskIds)
	failed := make(map[string]bool)
	for chunk := range slices.Chunk(taskIds, opsTaskStatusChunk) {
		var ids []string
		err = DB.Model(&Task{}).Where("task_id IN ? AND status = ?", chunk, TaskStatusFailure).Pluck("task_id", &ids).Error
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			failed[id] = true
		}
	}
	for _, taskId := range taskIds {
		if !failed[taskId] {
			entries = append(entries, latestByTask[taskId])
		}
	}

	covered := make(map[int]*opsSupplyEntry)
	for _, entry := range entries {
		total, ok := covered[entry.channelId]
		if !ok {
			total = &opsSupplyEntry{channelId: entry.channelId}
			covered[entry.channelId] = total
		}
		total.revenue += max(entry.revenue, 0)
		total.supply += max(entry.supply, 0)
	}
	return covered, nil
}

// opsLoadSupplyCosts fills what each upstream channel cost at the supply
// price. Revenue that no billing log covers, from before the logs carried a
// supply price, is priced at the channel's own ratio.
func opsLoadSupplyCosts(scope opsScope, query OpsDashboardQuery, result *OpsDashboard) error {
	covered, err := opsSupplyByChannel(scope, query.Start, query.End)
	if err != nil {
		return err
	}
	for i := range result.Upstream {
		row := &result.Upstream[i]
		total, ok := covered[row.ChannelId]
		if !ok || total.revenue <= 0 {
			continue
		}
		row.SupplyCoveredQuota = total.revenue
		row.SupplyCostQuota, row.SupplyEstimatedQuota = total.costFor(row.Quota)
	}
	return nil
}
