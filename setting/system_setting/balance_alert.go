package system_setting

import (
	"time"

	"github.com/QuantumNous/new-api/setting/config"
)

// BalanceAlertMonitor watches the account balance of one upstream channel.
// The balance is read with GET <channel base URL><Path>, authorized with the
// channel key as a Bearer token, and taken from the JSON response at Field
// (gjson path syntax, e.g. "balance" or "data.balance").
type BalanceAlertMonitor struct {
	ChannelId int     `json:"channel_id"`
	Path      string  `json:"path"`
	Field     string  `json:"field"`
	Threshold float64 `json:"threshold"`
	// Divisor converts the upstream number into the unit the threshold and
	// messages use, e.g. 10 for an upstream that reports 10 credits per yuan.
	// 0 or less means 1.
	Divisor float64 `json:"divisor"`
	// Unit is only shown in alert messages, e.g. "CNY".
	Unit string `json:"unit"`
}

// Convert turns the balance read from upstream into the monitor's unit.
func (m BalanceAlertMonitor) Convert(raw float64) float64 {
	if m.Divisor <= 0 {
		return raw
	}
	return raw / m.Divisor
}

// BalanceAlertSettings sends a Feishu (Lark) bot message when a watched
// upstream balance falls below its threshold, repeats it every RepeatMinutes
// while it stays low, and sends one more message when it recovers. With
// ReportEnabled, a check that needs no alert also sends the balance, at most
// once per ReportMinutes.
//
// The sign secret ends in "_secret" so the option API never returns it.
type BalanceAlertSettings struct {
	Enabled         bool `json:"enabled"`
	IntervalMinutes int  `json:"interval_minutes"`
	// RepeatHours is the old repeat setting, used only while RepeatMinutes
	// is unset.
	RepeatHours   int  `json:"repeat_hours"`
	RepeatMinutes int  `json:"repeat_minutes"`
	ReportEnabled bool `json:"report_enabled"`
	// ReportMinutes spaces routine reports; 0 sends one on every check.
	ReportMinutes    int    `json:"report_minutes"`
	FeishuWebhookURL string `json:"feishu_webhook_url"`
	FeishuSignSecret string `json:"feishu_sign_secret"`
	// PaymentNoticeEnabled sends a message for every payment received. It
	// does not need Enabled.
	PaymentNoticeEnabled bool                  `json:"payment_notice_enabled"`
	Monitors             []BalanceAlertMonitor `json:"monitors"`
}

const (
	DefaultBalanceAlertIntervalMinutes = 10
	DefaultBalanceAlertRepeatHours     = 6
)

var balanceAlertSettings = BalanceAlertSettings{
	IntervalMinutes: DefaultBalanceAlertIntervalMinutes,
	RepeatHours:     DefaultBalanceAlertRepeatHours,
	Monitors:        []BalanceAlertMonitor{},

	PaymentNoticeEnabled: true,
}

func init() {
	config.GlobalConfig.Register("balance_alert_setting", &balanceAlertSettings)
}

// RepeatInterval is how long a low balance waits before it is reported again.
func (s *BalanceAlertSettings) RepeatInterval() time.Duration {
	if s.RepeatMinutes > 0 {
		return time.Duration(s.RepeatMinutes) * time.Minute
	}
	hours := s.RepeatHours
	if hours <= 0 {
		hours = DefaultBalanceAlertRepeatHours
	}
	return time.Duration(hours) * time.Hour
}

func GetBalanceAlertSettings() *BalanceAlertSettings {
	return &balanceAlertSettings
}
