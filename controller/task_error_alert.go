package controller

import (
	"context"
	"fmt"
	"slices"
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
	// taskErrorAlertOverlap rescans this much before the last scan, so a row
	// committed late is still seen; seen keys stop it being sent twice.
	taskErrorAlertOverlap   = 5 * time.Minute
	taskErrorAlertScanLimit = 2000
	taskErrorAlertRawLimit  = 300
	taskErrorAlertTopLimit  = 5

	taskErrorSourceTask    = "task"
	taskErrorSourceRequest = "request"
)

// taskErrorEvent is one failed task or failed request, classified.
type taskErrorEvent struct {
	Key       string
	Source    string
	At        int64
	Result    usererror.Result
	ChannelId int
	Model     string
	UserId    int
	Username  string
	RefId     string
	Raw       string
}

// upstreamAlertWindow holds back repeats of one upstream error after its
// first message, until the merge window ends.
type upstreamAlertWindow struct {
	Start time.Time
	Held  int
	Last  taskErrorEvent
}

// taskErrorAlertState is what the alert remembers between scans.
type taskErrorAlertState struct {
	Cursor       int64
	Seen         map[string]int64
	Windows      map[string]*upstreamAlertWindow
	SummaryStart time.Time
	UserTotal    int
	UserByKind   map[string]int
	UserByUser   map[string]int
	UserByModel  map[string]int
}

func newTaskErrorAlertState(now time.Time) *taskErrorAlertState {
	state := &taskErrorAlertState{
		Cursor:       now.Unix(),
		Seen:         map[string]int64{},
		Windows:      map[string]*upstreamAlertWindow{},
		SummaryStart: now,
	}
	state.resetUserSummary(now)
	return state
}

func (s *taskErrorAlertState) resetUserSummary(now time.Time) {
	s.SummaryStart = now
	s.UserTotal = 0
	s.UserByKind = map[string]int{}
	s.UserByUser = map[string]int{}
	s.UserByModel = map[string]int{}
}

// taskErrorAlertMessage is one Feishu message the scan calls for.
type taskErrorAlertMessage struct {
	Severity usererror.Severity
	Event    taskErrorEvent
	// Count is how many errors the message stands for; above 1 it is a
	// merged message.
	Count int
	// Merged marks a follow-up for errors held back in a merge window.
	Merged bool
}

// taskErrorAlertPlan is what one scan decided to send.
type taskErrorAlertPlan struct {
	Messages []taskErrorAlertMessage
	// Summary is set when the customer error summary is due and not empty.
	Summary *taskErrorUserSummary
}

type taskErrorUserSummary struct {
	Minutes int
	Total   int
	ByKind  map[string]int
	ByUser  map[string]int
	ByModel map[string]int
}

// taskErrorAlertPolicy is what one scan is judged against.
type taskErrorAlertPolicy struct {
	MergeWindow  time.Duration
	Summary      bool
	SummaryEvery time.Duration
}

// planTaskErrorAlerts advances state with the events of one scan and returns
// what to send. Critical errors go out in this scan, one message per kind and
// channel with its count. Other upstream errors send their first occurrence
// now and hold repeats until the merge window ends. Customer errors are only
// counted, for the summary.
func planTaskErrorAlerts(state *taskErrorAlertState, events []taskErrorEvent, policy taskErrorAlertPolicy, now time.Time) taskErrorAlertPlan {
	plan := taskErrorAlertPlan{}
	criticalIndex := map[string]int{}
	for _, event := range events {
		if _, done := state.Seen[event.Key]; done {
			continue
		}
		state.Seen[event.Key] = event.At
		severity := event.Result.AlertSeverity()
		windowKey := strconv.Itoa(event.ChannelId) + "|" + event.Result.AlertCategory()
		switch severity {
		case usererror.SeverityCritical:
			if index, ok := criticalIndex[windowKey]; ok {
				plan.Messages[index].Count++
				continue
			}
			criticalIndex[windowKey] = len(plan.Messages)
			plan.Messages = append(plan.Messages, taskErrorAlertMessage{Severity: severity, Event: event, Count: 1})
		case usererror.SeverityUpstream:
			window, ok := state.Windows[windowKey]
			if ok && now.Sub(window.Start) < policy.MergeWindow {
				window.Held++
				window.Last = event
				continue
			}
			state.Windows[windowKey] = &upstreamAlertWindow{Start: now}
			plan.Messages = append(plan.Messages, taskErrorAlertMessage{Severity: severity, Event: event, Count: 1})
		case usererror.SeverityUser:
			if !policy.Summary {
				continue
			}
			state.UserTotal++
			state.UserByKind[event.Result.AlertCategory()]++
			state.UserByUser[fmt.Sprintf("%s (#%d)", event.Username, event.UserId)]++
			if event.Model != "" {
				state.UserByModel[event.Model]++
			}
		}
	}

	windowKeys := make([]string, 0, len(state.Windows))
	for key := range state.Windows {
		windowKeys = append(windowKeys, key)
	}
	slices.Sort(windowKeys)
	for _, key := range windowKeys {
		window := state.Windows[key]
		if now.Sub(window.Start) < policy.MergeWindow {
			continue
		}
		if window.Held == 0 {
			delete(state.Windows, key)
			continue
		}
		plan.Messages = append(plan.Messages, taskErrorAlertMessage{
			Severity: usererror.SeverityUpstream, Event: window.Last, Count: window.Held, Merged: true,
		})
		// A burst that goes on sends one merged message per window.
		state.Windows[key] = &upstreamAlertWindow{Start: now}
	}

	if policy.Summary && now.Sub(state.SummaryStart) >= policy.SummaryEvery {
		if state.UserTotal > 0 {
			plan.Summary = &taskErrorUserSummary{
				Minutes: int(now.Sub(state.SummaryStart).Round(time.Minute) / time.Minute),
				Total:   state.UserTotal,
				ByKind:  state.UserByKind,
				ByUser:  state.UserByUser,
				ByModel: state.UserByModel,
			}
		}
		state.resetUserSummary(now)
	}
	return plan
}

func truncateAlertText(text string, limit int) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "…"
}

// loadTaskErrorEvents reads the failed tasks and error logs since sinceUnix.
func loadTaskErrorEvents(sinceUnix int64) ([]taskErrorEvent, error) {
	events := make([]taskErrorEvent, 0)
	usernames := map[int]string{}
	for _, task := range model.GetFailedTasksFinishedSince(sinceUnix, taskErrorAlertScanLimit) {
		username, ok := usernames[task.UserId]
		if !ok {
			username, _ = model.GetUsernameById(task.UserId, false)
			usernames[task.UserId] = username
		}
		events = append(events, taskErrorEvent{
			Key:       "task:" + strconv.FormatInt(task.ID, 10),
			Source:    taskErrorSourceTask,
			At:        task.FinishTime,
			Result:    usererror.ClassifyFailReason(task.FailReason),
			ChannelId: task.ChannelId,
			Model:     task.Properties.OriginModelName,
			UserId:    task.UserId,
			Username:  username,
			RefId:     task.TaskID,
			Raw:       task.FailReason,
		})
	}

	logs, err := model.GetErrorLogsSince(sinceUnix, taskErrorAlertScanLimit)
	if err != nil {
		return events, err
	}
	for _, log := range logs {
		values := map[string]any{}
		if log.Other != "" {
			_ = common.UnmarshalJsonStr(log.Other, &values)
		}
		status, _ := values["status_code"].(float64)
		errorCode, _ := values["error_code"].(string)
		errorType, _ := values["error_type"].(string)
		events = append(events, taskErrorEvent{
			// ClickHouse logs have no stable id, so the key also names the request.
			Key:    fmt.Sprintf("log:%d:%s:%d:%d", log.Id, log.RequestId, log.CreatedAt, log.UserId),
			Source: taskErrorSourceRequest,
			At:     log.CreatedAt,
			Result: usererror.Classify(usererror.Input{
				Raw:        log.Content,
				StatusCode: int(status),
				ErrorCode:  errorCode,
				ErrorType:  errorType,
				Model:      log.ModelName,
			}),
			ChannelId: log.ChannelId,
			Model:     log.ModelName,
			UserId:    log.UserId,
			Username:  log.Username,
			RefId:     log.RequestId,
			Raw:       log.Content,
		})
	}
	slices.SortStableFunc(events, func(a, b taskErrorEvent) int { return int(a.At - b.At) })
	return events, nil
}

func taskErrorAlertText(message taskErrorAlertMessage, mergeMinutes int) string {
	event := message.Event
	channel := "-"
	if event.ChannelId > 0 {
		channel = "#" + strconv.Itoa(event.ChannelId)
		if found, err := model.CacheGetChannel(event.ChannelId); err == nil && found != nil {
			channel = fmt.Sprintf("%s (#%d)", found.Name, event.ChannelId)
		}
	}
	args := map[string]any{
		"System":   common.SystemName,
		"Level":    i18n.Translate(balanceAlertLanguage, "task_error_alert.level."+string(message.Severity), nil),
		"Category": i18n.Translate(balanceAlertLanguage, "task_error_alert.category."+event.Result.AlertCategory(), nil),
		"Source":   i18n.Translate(balanceAlertLanguage, "task_error_alert.source."+event.Source, nil),
		"Channel":  channel,
		"Model":    event.Model,
		"User":     fmt.Sprintf("%s (#%d)", event.Username, event.UserId),
		"Ref":      event.RefId,
		"Code":     event.Result.Code,
		"Error":    truncateAlertText(event.Raw, taskErrorAlertRawLimit),
		"Count":    message.Count,
		"Minutes":  mergeMinutes,
	}
	if message.Merged {
		return i18n.Translate(balanceAlertLanguage, i18n.MsgTaskErrorAlertMerged, args)
	}
	text := i18n.Translate(balanceAlertLanguage, i18n.MsgTaskErrorAlertSingle, args)
	if message.Count > 1 {
		text += "\n" + i18n.Translate(balanceAlertLanguage, i18n.MsgTaskErrorAlertBatchCount, args)
	}
	return text
}

// topAlertCounts lists the largest counts as "name ×n", largest first.
func topAlertCounts(counts map[string]int, limit int) string {
	names := make([]string, 0, len(counts))
	for name := range counts {
		names = append(names, name)
	}
	slices.SortFunc(names, func(a, b string) int {
		if counts[a] != counts[b] {
			return counts[b] - counts[a]
		}
		return strings.Compare(a, b)
	})
	parts := make([]string, 0, limit)
	for _, name := range names[:min(limit, len(names))] {
		parts = append(parts, fmt.Sprintf("%s ×%d", name, counts[name]))
	}
	return strings.Join(parts, "、")
}

func taskErrorSummaryText(summary *taskErrorUserSummary) string {
	var lines strings.Builder
	for _, category := range usererror.AlertCategories {
		count := summary.ByKind[category]
		if count == 0 {
			continue
		}
		label := i18n.Translate(balanceAlertLanguage, "task_error_alert.category."+category, nil)
		lines.WriteString(fmt.Sprintf("\n· %s：%d", label, count))
	}
	return i18n.Translate(balanceAlertLanguage, i18n.MsgTaskErrorAlertSummary, map[string]any{
		"System":  common.SystemName,
		"Minutes": summary.Minutes,
		"Total":   summary.Total,
		"Lines":   lines.String(),
		"Users":   topAlertCounts(summary.ByUser, taskErrorAlertTopLimit),
		"Models":  topAlertCounts(summary.ByModel, taskErrorAlertTopLimit),
	})
}

var (
	taskErrorAlertMu     sync.Mutex
	activeTaskErrorAlert *taskErrorAlertState
)

// runTaskErrorAlertScan reads new failures, decides what to send and sends it.
func runTaskErrorAlertScan(ctx context.Context) (taskErrorAlertSummary, error) {
	alertSettings := system_setting.GetTaskErrorAlertSettings()
	bot := system_setting.GetBalanceAlertSettings()
	now := time.Now()

	taskErrorAlertMu.Lock()
	defer taskErrorAlertMu.Unlock()
	if activeTaskErrorAlert == nil {
		// Start from now: earlier failures were never alerted and need no
		// burst of old messages after a restart.
		activeTaskErrorAlert = newTaskErrorAlertState(now)
	}
	state := activeTaskErrorAlert
	since := state.Cursor - int64(taskErrorAlertOverlap/time.Second)
	events, err := loadTaskErrorEvents(since)
	if err != nil {
		return taskErrorAlertSummary{}, err
	}
	state.Cursor = now.Unix()
	for key, at := range state.Seen {
		if at < since {
			delete(state.Seen, key)
		}
	}

	plan := planTaskErrorAlerts(state, events, taskErrorAlertPolicy{
		MergeWindow:  alertSettings.MergeWindow(),
		Summary:      alertSettings.UserSummaryEnabled,
		SummaryEvery: alertSettings.SummaryInterval(),
	}, now)

	summary := taskErrorAlertSummary{Scanned: len(events)}
	mergeMinutes := int(alertSettings.MergeWindow() / time.Minute)
	for _, message := range plan.Messages {
		if ctx.Err() != nil {
			break
		}
		if err := service.SendFeishuText(bot.FeishuWebhookURL, bot.FeishuSignSecret, taskErrorAlertText(message, mergeMinutes)); err != nil {
			common.SysLog(common.LogText("failed to send task error alert: %s", err.Error()))
			continue
		}
		summary.Sent++
	}
	if plan.Summary != nil {
		if err := service.SendFeishuText(bot.FeishuWebhookURL, bot.FeishuSignSecret, taskErrorSummaryText(plan.Summary)); err != nil {
			common.SysLog(common.LogText("failed to send task error summary: %s", err.Error()))
		} else {
			summary.Sent++
		}
	}
	return summary, nil
}

// taskErrorAlertHandler scans failures every minute while the alert is on
// and the balance alert's Feishu bot is set up.
type taskErrorAlertHandler struct{}

func (taskErrorAlertHandler) Type() string { return model.SystemTaskTypeTaskErrorAlert }

func (taskErrorAlertHandler) Enabled() bool {
	return system_setting.GetTaskErrorAlertSettings().Enabled &&
		strings.TrimSpace(system_setting.GetBalanceAlertSettings().FeishuWebhookURL) != ""
}

func (taskErrorAlertHandler) Interval() time.Duration { return time.Minute }

func (taskErrorAlertHandler) NewPayload() any { return nil }

type taskErrorAlertSummary struct {
	Scanned int `json:"scanned"`
	Sent    int `json:"sent"`
}

func (taskErrorAlertHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary, err := runTaskErrorAlertScan(ctx)
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, summary, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}
