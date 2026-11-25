package controller

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/usererror"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

const (
	taskStatsFailedLimit = 5000
	taskStatsReasonLimit = 80
	taskStatsTopReasons  = 3
)

// taskHourlyStats is one hour of async tasks: how many were submitted, how
// many finished and how, and what the failures were.
type taskHourlyStats struct {
	Start     time.Time
	End       time.Time
	Submitted int64
	Succeeded int64
	Failed    int64
	// Ours counts failures caused upstream or on our side, Customer those the
	// customer caused; cancelled tasks are in neither.
	Ours       int
	Customer   int
	ByCategory map[string]int
	ByModel    map[string]int
	ByChannel  map[int]int
	ByReason   map[string]int
}

// collectTaskHourlyStats groups the failed tasks of one hour by kind, model,
// channel and reason, next to the status counts.
func collectTaskHourlyStats(start, end time.Time, submitted int64, counts []model.TaskStatusCount, failed []*model.Task) taskHourlyStats {
	stats := taskHourlyStats{
		Start: start, End: end, Submitted: submitted,
		ByCategory: map[string]int{}, ByModel: map[string]int{}, ByChannel: map[int]int{}, ByReason: map[string]int{},
	}
	for _, count := range counts {
		switch count.Status {
		case model.TaskStatusSuccess:
			stats.Succeeded += count.Count
		case model.TaskStatusFailure:
			stats.Failed += count.Count
		}
	}
	for _, task := range failed {
		if task.FinishTime < start.Unix() || task.FinishTime >= end.Unix() {
			continue
		}
		result := task.UserFailure()
		stats.ByCategory[result.AlertCategory()]++
		switch result.AlertSeverity() {
		case usererror.SeverityCritical, usererror.SeverityUpstream:
			stats.Ours++
		case usererror.SeverityUser:
			stats.Customer++
		}
		if task.Properties.OriginModelName != "" {
			stats.ByModel[task.Properties.OriginModelName]++
		}
		if task.ChannelId > 0 {
			stats.ByChannel[task.ChannelId]++
		}
		if reason := truncateAlertText(task.FailReason, taskStatsReasonLimit); reason != "" {
			stats.ByReason[reason]++
		}
	}
	return stats
}

func taskHourlyStatsText(stats taskHourlyStats) string {
	finished := stats.Succeeded + stats.Failed
	rate := "-"
	if finished > 0 {
		rate = fmt.Sprintf("%.1f%%", float64(stats.Succeeded)*100/float64(finished))
	}
	text := i18n.Translate(balanceAlertLanguage, i18n.MsgTaskStatsReport, map[string]any{
		"System":    common.SystemName,
		"Period":    stats.Start.Format("01-02 15:04") + "–" + stats.End.Format("15:04"),
		"Submitted": stats.Submitted,
		"Finished":  finished,
		"Succeeded": stats.Succeeded,
		"Failed":    stats.Failed,
		"Rate":      rate,
	})
	if stats.Failed == 0 {
		return text
	}

	var lines strings.Builder
	for _, category := range usererror.AlertCategories {
		if count := stats.ByCategory[category]; count > 0 {
			label := i18n.Translate(balanceAlertLanguage, "task_error_alert.category."+category, nil)
			lines.WriteString(fmt.Sprintf("\n· %s：%d", label, count))
		}
	}
	byChannel := make(map[string]int, len(stats.ByChannel))
	for id, count := range stats.ByChannel {
		name := "#" + strconv.Itoa(id)
		if found, err := model.CacheGetChannel(id); err == nil && found != nil {
			name = fmt.Sprintf("%s (#%d)", found.Name, id)
		}
		byChannel[name] = count
	}
	var reasons strings.Builder
	for _, reason := range rankAlertCounts(stats.ByReason, taskStatsTopReasons) {
		reasons.WriteString("\n· " + reason)
	}
	return text + "\n" + i18n.Translate(balanceAlertLanguage, i18n.MsgTaskStatsFailures, map[string]any{
		"Ours":     stats.Ours,
		"Customer": stats.Customer,
		"Lines":    lines.String(),
		"Models":   topAlertCounts(stats.ByModel, taskErrorAlertTopLimit),
		"Channels": topAlertCounts(byChannel, taskErrorAlertTopLimit),
		"Reasons":  reasons.String(),
	})
}

var (
	taskStatsMu          sync.Mutex
	taskStatsReportedEnd time.Time
)

// runTaskHourlyStats sends the report of the last full hour once that hour
// is over. After a restart it waits for the next hour, so no hour is sent twice.
func runTaskHourlyStats(ctx context.Context) (taskStatsSummary, error) {
	end := time.Now().Truncate(time.Hour)
	taskStatsMu.Lock()
	defer taskStatsMu.Unlock()
	if taskStatsReportedEnd.IsZero() {
		taskStatsReportedEnd = end
	}
	if !end.After(taskStatsReportedEnd) {
		return taskStatsSummary{}, nil
	}
	start := end.Add(-time.Hour)

	counts, err := model.CountTasksFinishedBetween(start.Unix(), end.Unix())
	if err != nil {
		return taskStatsSummary{}, err
	}
	submitted, err := model.CountTasksCreatedBetween(start.Unix(), end.Unix())
	if err != nil {
		return taskStatsSummary{}, err
	}
	failed := model.GetFailedTasksFinishedSince(start.Unix(), taskStatsFailedLimit)
	stats := collectTaskHourlyStats(start, end, submitted, counts, failed)
	taskStatsReportedEnd = end

	summary := taskStatsSummary{Submitted: stats.Submitted, Succeeded: stats.Succeeded, Failed: stats.Failed}
	if stats.Submitted == 0 && stats.Succeeded+stats.Failed == 0 {
		return summary, nil
	}
	if ctx.Err() != nil {
		return summary, ctx.Err()
	}
	bot := system_setting.GetBalanceAlertSettings()
	if err := service.SendFeishuText(bot.FeishuWebhookURL, bot.FeishuSignSecret, taskHourlyStatsText(stats)); err != nil {
		return summary, err
	}
	summary.Sent = true
	return summary, nil
}

// taskStatsHandler checks every minute and sends the hourly task report to
// the balance alert's Feishu bot at the top of each hour.
type taskStatsHandler struct{}

func (taskStatsHandler) Type() string { return model.SystemTaskTypeTaskStats }

func (taskStatsHandler) Enabled() bool {
	return system_setting.GetTaskErrorAlertSettings().HourlyStatsEnabled &&
		strings.TrimSpace(system_setting.GetBalanceAlertSettings().FeishuWebhookURL) != ""
}

func (taskStatsHandler) Interval() time.Duration { return time.Minute }

func (taskStatsHandler) NewPayload() any { return nil }

type taskStatsSummary struct {
	Submitted int64 `json:"submitted"`
	Succeeded int64 `json:"succeeded"`
	Failed    int64 `json:"failed"`
	Sent      bool  `json:"sent"`
}

func (taskStatsHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary, err := runTaskHourlyStats(ctx)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, summary, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}
