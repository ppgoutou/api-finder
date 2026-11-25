package controller

import (
	"errors"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNextBalanceAlertSequence walks one channel through a low balance that
// repeats, recovers, and a run of failed checks, asserting exactly which
// checks send a message.
func TestNextBalanceAlertSequence(t *testing.T) {
	start := time.Date(2026, 11, 19, 8, 0, 0, 0, time.UTC)
	repeat := 6 * time.Hour
	threshold := 100.0
	checkErr := errors.New("timeout")

	steps := []struct {
		name    string
		at      time.Duration
		balance float64
		err     error
		want    balanceAlertEvent
	}{
		{name: "healthy balance sends nothing", at: 0, balance: 500, want: balanceAlertNone},
		{name: "first low reading alerts", at: 10 * time.Minute, balance: 80, want: balanceAlertLow},
		{name: "still low inside repeat window stays quiet", at: 20 * time.Minute, balance: 60, want: balanceAlertNone},
		{name: "one failed check stays quiet", at: 30 * time.Minute, err: checkErr, want: balanceAlertNone},
		{name: "still low after repeat window alerts again", at: 10*time.Minute + repeat, balance: 50, want: balanceAlertLow},
		{name: "back above threshold sends recovery", at: 7 * time.Hour, balance: 300, want: balanceAlertRecovered},
		{name: "recovered balance sends nothing more", at: 8 * time.Hour, balance: 300, want: balanceAlertNone},
		{name: "first failure after recovery stays quiet", at: 9 * time.Hour, err: checkErr, want: balanceAlertNone},
		{name: "second failure in a row stays quiet", at: 10 * time.Hour, err: checkErr, want: balanceAlertNone},
		{name: "third failure in a row alerts once", at: 11 * time.Hour, err: checkErr, want: balanceAlertFailed},
		{name: "further failures stay quiet", at: 12 * time.Hour, err: checkErr, want: balanceAlertNone},
		{name: "balance exactly at threshold is not low", at: 13 * time.Hour, balance: 100, want: balanceAlertNone},
	}

	state := &balanceAlertState{}
	for _, step := range steps {
		got := nextBalanceAlert(state, step.balance, step.err, balanceAlertPolicy{Threshold: threshold, Repeat: repeat}, start.Add(step.at))
		assert.Equal(t, step.want, got, step.name)
	}
}

// TestNextBalanceAlertWithReport checks that routine reports go out on every
// healthy check but a low balance still follows only the repeat window.
func TestNextBalanceAlertWithReport(t *testing.T) {
	start := time.Date(2026, 11, 19, 8, 0, 0, 0, time.UTC)
	repeat := 30 * time.Minute
	threshold := 200.0

	steps := []struct {
		name    string
		at      time.Duration
		balance float64
		err     error
		want    balanceAlertEvent
	}{
		{name: "healthy check sends a report", at: 0, balance: 450, want: balanceAlertReport},
		{name: "next healthy check sends another report", at: 10 * time.Minute, balance: 440, want: balanceAlertReport},
		{name: "failed check sends no report", at: 20 * time.Minute, err: errors.New("502"), want: balanceAlertNone},
		{name: "dropping below threshold sends the low alert", at: 30 * time.Minute, balance: 190, want: balanceAlertLow},
		{name: "low inside the repeat window sends nothing, not a report", at: 40 * time.Minute, balance: 180, want: balanceAlertNone},
		{name: "low after the repeat window alerts again", at: 60 * time.Minute, balance: 170, want: balanceAlertLow},
		{name: "recovery sends the recovered message instead of a report", at: 70 * time.Minute, balance: 300, want: balanceAlertRecovered},
		{name: "healthy again sends reports", at: 80 * time.Minute, balance: 300, want: balanceAlertReport},
	}

	state := &balanceAlertState{}
	for _, step := range steps {
		got := nextBalanceAlert(state, step.balance, step.err, balanceAlertPolicy{Threshold: threshold, Repeat: repeat, Report: true}, start.Add(step.at))
		assert.Equal(t, step.want, got, step.name)
	}
}

// TestNextBalanceAlertReportEvery checks routine reports spaced 3 hours apart
// while checks run every 10 minutes and low reminders repeat every 30.
func TestNextBalanceAlertReportEvery(t *testing.T) {
	start := time.Date(2026, 11, 19, 8, 0, 0, 0, time.UTC)
	policy := balanceAlertPolicy{Threshold: 200, Repeat: 30 * time.Minute, Report: true, ReportEvery: 3 * time.Hour}

	steps := []struct {
		name    string
		at      time.Duration
		balance float64
		want    balanceAlertEvent
	}{
		{name: "first healthy check reports", at: 0, balance: 450, want: balanceAlertReport},
		{name: "healthy check 10 minutes later stays quiet", at: 10 * time.Minute, balance: 440, want: balanceAlertNone},
		{name: "healthy check before 3 hours stays quiet", at: 170 * time.Minute, balance: 400, want: balanceAlertNone},
		{name: "healthy check at 3 hours reports", at: 180 * time.Minute, balance: 390, want: balanceAlertReport},
		{name: "low balance alerts at once", at: 190 * time.Minute, balance: 150, want: balanceAlertLow},
		{name: "low 20 minutes later stays quiet", at: 210 * time.Minute, balance: 140, want: balanceAlertNone},
		{name: "low 30 minutes after the alert reminds again", at: 220 * time.Minute, balance: 130, want: balanceAlertLow},
		{name: "recovery sends the recovered message", at: 230 * time.Minute, balance: 500, want: balanceAlertRecovered},
		{name: "healthy check before the next 3 hours stays quiet", at: 240 * time.Minute, balance: 500, want: balanceAlertNone},
		{name: "healthy check 3 hours after the last report reports", at: 360 * time.Minute, balance: 500, want: balanceAlertReport},
	}

	state := &balanceAlertState{}
	for _, step := range steps {
		got := nextBalanceAlert(state, step.balance, nil, policy, start.Add(step.at))
		assert.Equal(t, step.want, got, step.name)
	}
}

func TestBalanceAlertRepeatInterval(t *testing.T) {
	tests := []struct {
		name     string
		settings system_setting.BalanceAlertSettings
		want     time.Duration
	}{
		{name: "minutes win when set", settings: system_setting.BalanceAlertSettings{RepeatMinutes: 30, RepeatHours: 6}, want: 30 * time.Minute},
		{name: "old hours setting is used while minutes are unset", settings: system_setting.BalanceAlertSettings{RepeatHours: 1}, want: time.Hour},
		{name: "nothing set falls back to the default", settings: system_setting.BalanceAlertSettings{}, want: 6 * time.Hour},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.want, tt.settings.RepeatInterval(), tt.name)
	}
}

func TestValidateFeishuWebhookURL(t *testing.T) {
	tests := []struct {
		url   string
		valid bool
	}{
		{url: "https://open.feishu.cn/open-apis/bot/v2/hook/abc", valid: true},
		{url: "https://open.larksuite.com/open-apis/bot/v2/hook/abc", valid: true},
		{url: "http://open.feishu.cn/open-apis/bot/v2/hook/abc", valid: false},
		{url: "https://open.feishu.cn.evil.com/open-apis/bot/v2/hook/abc", valid: false},
		{url: "https://127.0.0.1/open-apis/bot/v2/hook/abc", valid: false},
		{url: "https://open.feishu.cn/other/path", valid: false},
	}
	for _, tt := range tests {
		err := service.ValidateFeishuWebhookURL(tt.url)
		assert.Equal(t, tt.valid, err == nil, tt.url)
	}
}

func TestBalanceAlertMonitorConvert(t *testing.T) {
	tests := []struct {
		name    string
		divisor float64
		raw     float64
		want    float64
	}{
		{name: "credits at 10 per yuan become yuan", divisor: 10, raw: 4553.9, want: 455.39},
		{name: "unset divisor keeps the upstream number", divisor: 0, raw: 4553.9, want: 4553.9},
		{name: "negative divisor keeps the upstream number", divisor: -2, raw: 80, want: 80},
	}
	for _, tt := range tests {
		got := system_setting.BalanceAlertMonitor{Divisor: tt.divisor}.Convert(tt.raw)
		assert.InDelta(t, tt.want, got, 1e-9, tt.name)
	}
}

func TestBalanceAlertMessages(t *testing.T) {
	require.NoError(t, i18n.Init())
	balance := 375.73
	result := balanceCheckResult{ChannelId: 11, ChannelName: "YH", Balance: &balance, Threshold: 200, Unit: "元"}

	low := balanceAlertMessage(balanceAlertLow, result, balanceRunway{}, nil)
	assert.Contains(t, low, "上游余额不足")
	assert.Contains(t, low, "当前余额：375.73 元")
	assert.Contains(t, low, "提醒阈值：200.00 元")

	for _, tt := range []struct {
		runway balanceRunway
		want   string
	}{
		{runway: balanceRunway{Known: true, Hours: 38.46}, want: "预计使用时长：约 38.5 小时"},
		{runway: balanceRunway{Known: true, Idle: true}, want: "预计使用时长：近 24 小时无消耗"},
		{runway: balanceRunway{}, want: "预计使用时长：数据积累中"},
	} {
		report := balanceAlertMessage(balanceAlertReport, result, tt.runway, nil)
		assert.Contains(t, report, "当前余额：375.73 元")
		assert.Contains(t, report, tt.want)
		assert.NotContains(t, report, "提醒阈值")
	}
}

func TestEstimateBalanceRunway(t *testing.T) {
	const hour = int64(3600)
	tests := []struct {
		name     string
		readings []balanceReading
		want     balanceRunway
	}{
		{name: "no history yet", readings: []balanceReading{{Upstream: 100}}, want: balanceRunway{}},
		{name: "less than an hour of history", readings: []balanceReading{{Upstream: 100}, {Upstream: 90, Time: hour - 1}}, want: balanceRunway{}},
		{name: "steady spending", readings: []balanceReading{{Upstream: 140}, {Upstream: 120, Time: hour}, {Upstream: 100, Time: 2 * hour}}, want: balanceRunway{Known: true, Hours: 5}},
		{name: "a top-up interval is left out", readings: []balanceReading{{Upstream: 40}, {Upstream: 20, Time: hour}, {Upstream: 520, Time: 2 * hour}, {Upstream: 500, Time: 3 * hour}}, want: balanceRunway{Known: true, Hours: 25}},
		{name: "nothing spent", readings: []balanceReading{{Upstream: 100}, {Upstream: 100, Time: 2 * hour}}, want: balanceRunway{Known: true, Idle: true}},
		{name: "overdrawn balance has no time left", readings: []balanceReading{{Upstream: 10}, {Upstream: -10, Time: hour}}, want: balanceRunway{Known: true}},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.want, estimateBalanceRunway(tt.readings), tt.name)
	}
}
