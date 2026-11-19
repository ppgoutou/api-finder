package system_setting

import (
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
	// Unit is only shown in alert messages, e.g. "CNY".
	Unit string `json:"unit"`
}

// BalanceAlertSettings sends a Feishu (Lark) bot message when a watched
// upstream balance falls below its threshold, repeats it every RepeatHours
// while it stays low, and sends one more message when it recovers.
//
// The sign secret ends in "_secret" so the option API never returns it.
type BalanceAlertSettings struct {
	Enabled          bool                  `json:"enabled"`
	IntervalMinutes  int                   `json:"interval_minutes"`
	RepeatHours      int                   `json:"repeat_hours"`
	FeishuWebhookURL string                `json:"feishu_webhook_url"`
	FeishuSignSecret string                `json:"feishu_sign_secret"`
	Monitors         []BalanceAlertMonitor `json:"monitors"`
}

const (
	DefaultBalanceAlertIntervalMinutes = 10
	DefaultBalanceAlertRepeatHours     = 6
)

var balanceAlertSettings = BalanceAlertSettings{
	IntervalMinutes: DefaultBalanceAlertIntervalMinutes,
	RepeatHours:     DefaultBalanceAlertRepeatHours,
	Monitors:        []BalanceAlertMonitor{},
}

func init() {
	config.GlobalConfig.Register("balance_alert_setting", &balanceAlertSettings)
}

func GetBalanceAlertSettings() *BalanceAlertSettings {
	return &balanceAlertSettings
}
