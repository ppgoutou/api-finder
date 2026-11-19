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

// opsLoadSupplyCosts adds up what each upstream channel cost at the supply
// price, which every billing log records for admins since gross margins were
// introduced. A task writes one log when it is submitted and another, for
// its whole settled charge, when it settles, so only its latest log counts;
// a failed task is refunded by the supplier and costs nothing. Revenue that
// no such log covers, from before the logs carried a supply price, is priced
// at the channel's own ratio.
func opsLoadSupplyCosts(scope opsScope, query OpsDashboardQuery, result *OpsDashboard) error {
	var logs []struct {
		ChannelId int
		Type      int
		Other     string
	}
	err := scope.excludeUsers(LOG_DB.Table("logs"), "user_id").
		Select("channel_id, type, other").
		Where("type IN ? AND created_at >= ? AND created_at <= ? AND channel_id > 0 AND other LIKE ?",
			[]int{LogTypeConsume, LogTypeRefund}, query.Start, query.End, "%gross_margin%").
		Order("id").
		Scan(&logs).Error
	if err != nil {
		return err
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
			return err
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
	for i := range result.Upstream {
		row := &result.Upstream[i]
		total, ok := covered[row.ChannelId]
		if !ok || total.revenue <= 0 {
			continue
		}
		row.SupplyCoveredQuota = total.revenue
		row.SupplyCostQuota = total.supply
		if uncovered := row.Quota - total.revenue; uncovered > 0 {
			row.SupplyEstimatedQuota = int64(common.QuotaRound(float64(uncovered) * float64(total.supply) / float64(total.revenue)))
			row.SupplyCostQuota += row.SupplyEstimatedQuota
		}
	}
	return nil
}
