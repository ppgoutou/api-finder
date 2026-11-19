package controller

import (
	"errors"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
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
		got := nextBalanceAlert(state, step.balance, step.err, threshold, repeat, start.Add(step.at))
		assert.Equal(t, step.want, got, step.name)
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
