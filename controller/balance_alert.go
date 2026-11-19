package controller

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

const (
	maxBalanceAlertResponseBytes = 64 << 10
	maxBalanceAlertRawPreview    = 2000
	// balanceAlertFailureLimit consecutive failed checks send one
	// "check failed" message, so a broken key or path does not stay silent
	// while a single network blip does not page anyone.
	balanceAlertFailureLimit = 3
)

// balanceCheckResult is one monitor's outcome, returned by the admin
// "check now" action so the path and field can be verified before saving.
type balanceCheckResult struct {
	ChannelId   int      `json:"channel_id"`
	ChannelName string   `json:"channel_name"`
	Balance     *float64 `json:"balance,omitempty"`
	Threshold   float64  `json:"threshold"`
	Unit        string   `json:"unit"`
	Raw         string   `json:"raw,omitempty"`
	Error       string   `json:"error,omitempty"`
}

// balanceAlertState remembers, per channel, what has already been sent so a
// low balance is reported once per repeat window and a recovery once.
type balanceAlertState struct {
	Low            bool
	LastAlertAt    time.Time
	Failures       int
	FailureAlerted bool
}

// balanceAlertEvent is the message a check result calls for.
type balanceAlertEvent string

const (
	balanceAlertNone      balanceAlertEvent = ""
	balanceAlertLow       balanceAlertEvent = "low"
	balanceAlertRecovered balanceAlertEvent = "recovered"
	balanceAlertFailed    balanceAlertEvent = "failed"
)

var (
	balanceAlertStatesMu sync.Mutex
	balanceAlertStates   = map[int]*balanceAlertState{}
)

// nextBalanceAlert advances state with one check result and returns the
// message to send, if any. checkErr != nil means the balance could not be
// read; balance is ignored then.
func nextBalanceAlert(state *balanceAlertState, balance float64, checkErr error, threshold float64, repeat time.Duration, now time.Time) balanceAlertEvent {
	if checkErr != nil {
		state.Failures++
		if state.Failures >= balanceAlertFailureLimit && !state.FailureAlerted {
			state.FailureAlerted = true
			return balanceAlertFailed
		}
		return balanceAlertNone
	}
	state.Failures = 0
	state.FailureAlerted = false

	if balance < threshold {
		if state.Low && now.Sub(state.LastAlertAt) < repeat {
			return balanceAlertNone
		}
		state.Low = true
		state.LastAlertAt = now
		return balanceAlertLow
	}
	if state.Low {
		state.Low = false
		return balanceAlertRecovered
	}
	return balanceAlertNone
}

// fetchUpstreamBalance reads one monitor's balance with the channel's own
// key, base URL and proxy.
func fetchUpstreamBalance(ctx context.Context, monitor system_setting.BalanceAlertMonitor) (balanceCheckResult, float64, error) {
	result := balanceCheckResult{ChannelId: monitor.ChannelId, Threshold: monitor.Threshold, Unit: monitor.Unit}
	channel, err := model.GetChannelById(monitor.ChannelId, true)
	if err != nil {
		return result, 0, fmt.Errorf("channel #%d not found", monitor.ChannelId)
	}
	result.ChannelName = channel.Name

	keys := channel.GetKeys()
	if len(keys) == 0 || strings.TrimSpace(keys[0]) == "" {
		return result, 0, fmt.Errorf("channel has no key")
	}
	key := strings.TrimSpace(keys[0])
	field := strings.TrimSpace(monitor.Field)
	if field == "" {
		return result, 0, fmt.Errorf("balance field is empty")
	}
	requestURL := strings.TrimRight(channel.GetBaseURL(), "/") + "/" + strings.TrimLeft(strings.TrimSpace(monitor.Path), "/")

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return result, 0, fmt.Errorf("invalid balance URL: %s", requestURL)
	}
	request.Header.Set("Authorization", "Bearer "+key)
	request.Header.Set("Accept", "application/json")
	setting := channel.GetSetting()
	client, err := service.GetHttpClientWithProxySettings(setting.Proxy, setting)
	if err != nil {
		return result, 0, err
	}
	response, err := client.Do(request)
	if err != nil {
		return result, 0, fmt.Errorf("request failed: %s", strings.ReplaceAll(err.Error(), key, "***"))
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBalanceAlertResponseBytes))
	if err != nil {
		return result, 0, fmt.Errorf("failed to read response: %w", err)
	}
	raw := strings.ReplaceAll(string(body), key, "***")
	if len(raw) > maxBalanceAlertRawPreview {
		raw = raw[:maxBalanceAlertRawPreview] + "…"
	}
	result.Raw = raw
	if response.StatusCode != http.StatusOK {
		return result, 0, fmt.Errorf("upstream returned HTTP %d", response.StatusCode)
	}
	value := gjson.GetBytes(body, field)
	if !value.Exists() {
		return result, 0, fmt.Errorf("field %q not found in response", field)
	}
	balance := value.Float()
	if value.Type == gjson.String {
		balance, err = strconv.ParseFloat(strings.TrimSpace(value.Str), 64)
	}
	if (value.Type != gjson.Number && value.Type != gjson.String) || err != nil || math.IsNaN(balance) || math.IsInf(balance, 0) {
		return result, 0, fmt.Errorf("field %q is not a number", field)
	}
	result.Balance = &balance
	return result, balance, nil
}

func formatBalanceAmount(value float64) string {
	return fmt.Sprintf("%.2f", value)
}

func balanceAlertMessage(event balanceAlertEvent, result balanceCheckResult, checkErr error) string {
	args := map[string]any{
		"System":    common.SystemName,
		"Name":      result.ChannelName,
		"Id":        result.ChannelId,
		"Threshold": formatBalanceAmount(result.Threshold),
		"Unit":      result.Unit,
		"Count":     balanceAlertFailureLimit,
	}
	if result.Balance != nil {
		args["Balance"] = formatBalanceAmount(*result.Balance)
	}
	switch event {
	case balanceAlertLow:
		return i18n.Translate("", i18n.MsgBalanceAlertLow, args)
	case balanceAlertRecovered:
		return i18n.Translate("", i18n.MsgBalanceAlertRecovered, args)
	default:
		if checkErr != nil {
			args["Error"] = checkErr.Error()
		}
		return i18n.Translate("", i18n.MsgBalanceAlertCheckFailed, args)
	}
}

// runBalanceAlertCheck checks every monitor and sends the Feishu messages
// their results call for.
func runBalanceAlertCheck(ctx context.Context) []balanceCheckResult {
	settings := system_setting.GetBalanceAlertSettings()
	repeatHours := settings.RepeatHours
	if repeatHours <= 0 {
		repeatHours = system_setting.DefaultBalanceAlertRepeatHours
	}
	repeat := time.Duration(repeatHours) * time.Hour

	results := make([]balanceCheckResult, 0, len(settings.Monitors))
	for _, monitor := range settings.Monitors {
		if ctx.Err() != nil {
			break
		}
		result, balance, checkErr := fetchUpstreamBalance(ctx, monitor)
		if checkErr != nil {
			result.Error = checkErr.Error()
		}
		results = append(results, result)

		balanceAlertStatesMu.Lock()
		state, ok := balanceAlertStates[monitor.ChannelId]
		if !ok {
			state = &balanceAlertState{}
			balanceAlertStates[monitor.ChannelId] = state
		}
		event := nextBalanceAlert(state, balance, checkErr, monitor.Threshold, repeat, time.Now())
		balanceAlertStatesMu.Unlock()
		if event == balanceAlertNone {
			continue
		}
		text := balanceAlertMessage(event, result, checkErr)
		if err := service.SendFeishuText(settings.FeishuWebhookURL, settings.FeishuSignSecret, text); err != nil {
			common.SysLog(common.LogText("failed to send balance alert for channel %d: %s", monitor.ChannelId, err.Error()))
		}
	}
	return results
}

// balanceAlertHandler runs the upstream balance check on a schedule while
// the alert is enabled, has a Feishu webhook and watches some channel.
type balanceAlertHandler struct{}

func (balanceAlertHandler) Type() string { return model.SystemTaskTypeBalanceAlert }

func (balanceAlertHandler) Enabled() bool {
	settings := system_setting.GetBalanceAlertSettings()
	return settings.Enabled && strings.TrimSpace(settings.FeishuWebhookURL) != "" && len(settings.Monitors) > 0
}

func (balanceAlertHandler) Interval() time.Duration {
	minutes := system_setting.GetBalanceAlertSettings().IntervalMinutes
	if minutes < 1 {
		minutes = system_setting.DefaultBalanceAlertIntervalMinutes
	}
	return time.Duration(minutes) * time.Minute
}

func (balanceAlertHandler) NewPayload() any { return nil }

type balanceAlertSummary struct {
	Checked int `json:"checked"`
	Failed  int `json:"failed"`
}

func (balanceAlertHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary := balanceAlertSummary{}
	for _, result := range runBalanceAlertCheck(ctx) {
		summary.Checked++
		if result.Error != "" {
			summary.Failed++
		}
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// CheckBalanceAlerts reads every saved monitor's balance now, without
// sending any message, so the admin can confirm the path and field.
func CheckBalanceAlerts(c *gin.Context) {
	settings := system_setting.GetBalanceAlertSettings()
	results := make([]balanceCheckResult, 0, len(settings.Monitors))
	for _, monitor := range settings.Monitors {
		result, _, err := fetchUpstreamBalance(c.Request.Context(), monitor)
		if err != nil {
			result.Error = err.Error()
		}
		results = append(results, result)
	}
	common.ApiSuccess(c, results)
}

// TestBalanceAlertFeishu sends a test message with the saved Feishu bot.
func TestBalanceAlertFeishu(c *gin.Context) {
	settings := system_setting.GetBalanceAlertSettings()
	if strings.TrimSpace(settings.FeishuWebhookURL) == "" {
		common.ApiErrorT(c, "Save the Feishu webhook URL first")
		return
	}
	text := i18n.Translate("", i18n.MsgBalanceAlertTest, map[string]any{"System": common.SystemName})
	if err := service.SendFeishuText(settings.FeishuWebhookURL, settings.FeishuSignSecret, text); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
