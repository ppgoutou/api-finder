package controller

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
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
	// upstream is the balance in the upstream's own unit, before Divisor.
	upstream float64
}

// balanceReading is one balance kept in the check's task result, in the
// upstream's own unit so a changed divisor does not look like spending.
type balanceReading struct {
	ChannelId int     `json:"channel_id"`
	Upstream  float64 `json:"upstream"`
	Time      int64   `json:"time"`
}

const (
	// balanceRunwayWindow is how much spending history the remaining hours
	// are estimated from.
	balanceRunwayWindow = 24 * time.Hour
	// balanceRunwayMinSeconds of readings are needed before estimating from
	// them. Spending follows the time of day, so a few quiet or busy hours
	// say nothing about the rest of the day.
	balanceRunwayMinSeconds = 18 * 3600
)

// balanceRunway is how long a balance lasts at its recent spending rate.
type balanceRunway struct {
	// Known is false until there is enough history to estimate from.
	Known bool
	// Idle means nothing was spent, so the balance has no end in sight.
	Idle  bool
	Hours float64
}

// estimateBalanceRunway divides the last reading by the average spending
// between one channel's readings, oldest first. An interval in which the
// balance rose holds a top-up that hides what was spent, so it is left out.
func estimateBalanceRunway(readings []balanceReading) balanceRunway {
	var spent float64
	var seconds int64
	for i := 1; i < len(readings); i++ {
		drop := readings[i-1].Upstream - readings[i].Upstream
		if drop < 0 {
			continue
		}
		spent += drop
		seconds += readings[i].Time - readings[i-1].Time
	}
	if seconds < balanceRunwayMinSeconds {
		return balanceRunway{}
	}
	if spent <= 0 {
		return balanceRunway{Known: true, Idle: true}
	}
	balance := max(readings[len(readings)-1].Upstream, 0)
	return balanceRunway{Known: true, Hours: balance / spent * float64(seconds) / 3600}
}

// billedBalanceRunway divides a wallet's balance by the supply price of
// everything billed, over the window, on the channels that draw on it: every
// channel on the monitored channel's host. Unlike balance readings it covers
// the whole window at once and neither top-ups nor refunds blur it. The
// estimate is unknown when the billing logs do not tell what was spent.
func billedBalanceRunway(result balanceCheckResult, balance float64, now time.Time) (balanceRunway, error) {
	var channels []*model.Channel
	if err := model.DB.Select("id", "type", "base_url").Find(&channels).Error; err != nil {
		return balanceRunway{}, err
	}
	hosts := make(map[int]string, len(channels))
	for _, channel := range channels {
		if parsed, err := url.Parse(channel.GetBaseURL()); err == nil {
			hosts[channel.Id] = strings.ToLower(parsed.Hostname())
		}
	}
	host := hosts[result.ChannelId]
	if host == "" {
		return balanceRunway{}, nil
	}
	var channelIds []int
	for channelId, channelHost := range hosts {
		if channelHost == host {
			channelIds = append(channelIds, channelId)
		}
	}
	cost, known, err := model.GetSupplyCost(channelIds, now.Add(-balanceRunwayWindow).Unix(), now.Unix())
	if err != nil || !known || cost <= 0 || common.QuotaPerUnit <= 0 {
		return balanceRunway{}, err
	}
	spent := float64(cost) / common.QuotaPerUnit
	if supplierCurrencyOf(result.Unit) == "CNY" {
		spent *= operation_setting.USDExchangeRate
	}
	if spent <= 0 {
		return balanceRunway{}, nil
	}
	return balanceRunway{Known: true, Hours: max(balance, 0) / spent * balanceRunwayWindow.Hours()}, nil
}

// loadBalanceReadings returns the readings of past checks since a time,
// oldest first, by channel. Task results survive restarts and are shared by
// every node.
func loadBalanceReadings(since time.Time) (map[int][]balanceReading, error) {
	results, err := model.GetSystemTaskResultsSince(model.SystemTaskTypeBalanceAlert, since.Unix())
	if err != nil {
		return nil, err
	}
	readings := map[int][]balanceReading{}
	for _, result := range results {
		var summary balanceAlertSummary
		if err := common.UnmarshalJsonStr(result, &summary); err != nil {
			continue
		}
		for _, reading := range summary.Readings {
			if reading.Time >= since.Unix() {
				readings[reading.ChannelId] = append(readings[reading.ChannelId], reading)
			}
		}
	}
	return readings, nil
}

// balanceAlertState remembers, per channel, what has already been sent so a
// low balance is reported once per repeat window and a recovery once.
type balanceAlertState struct {
	Low            bool
	LastAlertAt    time.Time
	LastReportAt   time.Time
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
	// balanceAlertReport is the routine balance message sent on a check
	// that needs no alert, when routine reports are on.
	balanceAlertReport balanceAlertEvent = "report"
)

// balanceAlertLanguage is the language of the Feishu messages; they go to the
// site operator's group, which reads Simplified Chinese.
const balanceAlertLanguage = "zh-CN"

var (
	balanceAlertStatesMu sync.Mutex
	balanceAlertStates   = map[int]*balanceAlertState{}
)

// nextBalanceAlert advances state with one check result and returns the
// message to send, if any. checkErr != nil means the balance could not be
// read; balance is ignored then. With Report on, a successful check that is
// not below the threshold sends a routine report once per ReportEvery (every
// check when it is 0); a low balance only follows
// the repeat window.
// balanceAlertPolicy is what one monitor's check is judged against.
type balanceAlertPolicy struct {
	Threshold   float64
	Repeat      time.Duration
	Report      bool
	ReportEvery time.Duration
}

func nextBalanceAlert(state *balanceAlertState, balance float64, checkErr error, policy balanceAlertPolicy, now time.Time) balanceAlertEvent {
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

	if balance < policy.Threshold {
		if state.Low && now.Sub(state.LastAlertAt) < policy.Repeat {
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
	if policy.Report && (state.LastReportAt.IsZero() || now.Sub(state.LastReportAt) >= policy.ReportEvery) {
		state.LastReportAt = now
		return balanceAlertReport
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
	result.upstream = balance
	balance = monitor.Convert(balance)
	shown := math.Round(balance*100) / 100
	result.Balance = &shown
	return result, balance, nil
}

func formatBalanceAmount(value float64) string {
	return fmt.Sprintf("%.2f", value)
}

func balanceAlertMessage(event balanceAlertEvent, result balanceCheckResult, runway balanceRunway, checkErr error) string {
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
		return i18n.Translate(balanceAlertLanguage, i18n.MsgBalanceAlertLow, args)
	case balanceAlertRecovered:
		return i18n.Translate(balanceAlertLanguage, i18n.MsgBalanceAlertRecovered, args)
	case balanceAlertReport:
		switch {
		case !runway.Known:
			args["Runway"] = i18n.Translate(balanceAlertLanguage, i18n.MsgBalanceAlertRunwayUnknown, nil)
		case runway.Idle:
			args["Runway"] = i18n.Translate(balanceAlertLanguage, i18n.MsgBalanceAlertRunwayIdle, nil)
		default:
			args["Runway"] = i18n.Translate(balanceAlertLanguage, i18n.MsgBalanceAlertRunwayHours, map[string]any{"Hours": fmt.Sprintf("%.1f", runway.Hours)})
		}
		return i18n.Translate(balanceAlertLanguage, i18n.MsgBalanceAlertReport, args)
	default:
		if checkErr != nil {
			args["Error"] = checkErr.Error()
		}
		return i18n.Translate(balanceAlertLanguage, i18n.MsgBalanceAlertCheckFailed, args)
	}
}

// runBalanceAlertCheck checks every monitor and sends the Feishu messages
// their results call for.
func runBalanceAlertCheck(ctx context.Context) balanceAlertSummary {
	settings := system_setting.GetBalanceAlertSettings()
	repeat := settings.RepeatInterval()

	summary := balanceAlertSummary{Readings: []balanceReading{}}
	history, err := loadBalanceReadings(time.Now().Add(-balanceRunwayWindow))
	if err != nil {
		common.SysLog(common.LogText("failed to load upstream balance history: %s", err.Error()))
		history = map[int][]balanceReading{}
	}
	for _, monitor := range settings.Monitors {
		if ctx.Err() != nil {
			break
		}
		result, balance, checkErr := fetchUpstreamBalance(ctx, monitor)
		now := time.Now()
		summary.Checked++
		if checkErr != nil {
			summary.Failed++
		} else {
			reading := balanceReading{ChannelId: monitor.ChannelId, Upstream: result.upstream, Time: now.Unix()}
			summary.Readings = append(summary.Readings, reading)
			history[monitor.ChannelId] = append(history[monitor.ChannelId], reading)
		}

		balanceAlertStatesMu.Lock()
		state, ok := balanceAlertStates[monitor.ChannelId]
		if !ok {
			state = &balanceAlertState{}
			balanceAlertStates[monitor.ChannelId] = state
		}
		event := nextBalanceAlert(state, balance, checkErr, balanceAlertPolicy{
			Threshold:   monitor.Threshold,
			Repeat:      repeat,
			Report:      settings.ReportEnabled,
			ReportEvery: time.Duration(max(settings.ReportMinutes, 0)) * time.Minute,
		}, now)
		balanceAlertStatesMu.Unlock()
		if event == balanceAlertNone {
			continue
		}
		var runway balanceRunway
		if event == balanceAlertReport {
			runway, err = billedBalanceRunway(result, balance, now)
			if err != nil {
				common.SysLog(common.LogText("failed to load upstream spending for channel %d: %s", monitor.ChannelId, err.Error()))
			}
			if !runway.Known {
				runway = estimateBalanceRunway(history[monitor.ChannelId])
			}
		}
		text := balanceAlertMessage(event, result, runway, checkErr)
		if err := service.SendFeishuText(settings.FeishuWebhookURL, settings.FeishuSignSecret, text); err != nil {
			common.SysLog(common.LogText("failed to send balance alert for channel %d: %s", monitor.ChannelId, err.Error()))
		}
	}
	return summary
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
	Checked  int              `json:"checked"`
	Failed   int              `json:"failed"`
	Readings []balanceReading `json:"readings"`
}

func (balanceAlertHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary := runBalanceAlertCheck(ctx)
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
	text := i18n.Translate(balanceAlertLanguage, i18n.MsgBalanceAlertTest, map[string]any{"System": common.SystemName})
	if err := service.SendFeishuText(settings.FeishuWebhookURL, settings.FeishuSignSecret, text); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
