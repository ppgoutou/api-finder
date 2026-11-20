package system_setting

import (
	"time"

	"github.com/QuantumNous/new-api/setting/config"
)

// TaskErrorAlertSettings sends failed requests and tasks to the Feishu bot of
// the upstream balance alert. Errors caused upstream or on our side are sent
// as they happen, with repeats of the same channel and kind merged for
// MergeMinutes; errors caused by the customer are counted and sent as one
// summary every SummaryMinutes.
type TaskErrorAlertSettings struct {
	Enabled bool `json:"enabled"`
	// MergeMinutes is how long repeats of one upstream error are held back
	// and then sent as one message with their count.
	MergeMinutes int `json:"merge_minutes"`
	// UserSummaryEnabled turns on the summary of customer-caused errors.
	UserSummaryEnabled bool `json:"user_summary_enabled"`
	SummaryMinutes     int  `json:"summary_minutes"`
	// HourlyStatsEnabled sends, at the top of every hour, how many tasks the
	// past hour had, their success rate and what the failures were. It does
	// not need Enabled.
	HourlyStatsEnabled bool `json:"hourly_stats_enabled"`
}

const (
	DefaultTaskErrorAlertMergeMinutes   = 10
	DefaultTaskErrorAlertSummaryMinutes = 60
)

var taskErrorAlertSettings = TaskErrorAlertSettings{
	MergeMinutes:       DefaultTaskErrorAlertMergeMinutes,
	UserSummaryEnabled: true,
	SummaryMinutes:     DefaultTaskErrorAlertSummaryMinutes,
	HourlyStatsEnabled: true,
}

func init() {
	config.GlobalConfig.Register("task_error_alert_setting", &taskErrorAlertSettings)
}

// MergeWindow is how long repeats of one upstream error are merged.
func (s *TaskErrorAlertSettings) MergeWindow() time.Duration {
	minutes := s.MergeMinutes
	if minutes <= 0 {
		minutes = DefaultTaskErrorAlertMergeMinutes
	}
	return time.Duration(minutes) * time.Minute
}

// SummaryInterval is how often the customer error summary is sent.
func (s *TaskErrorAlertSettings) SummaryInterval() time.Duration {
	minutes := s.SummaryMinutes
	if minutes <= 0 {
		minutes = DefaultTaskErrorAlertSummaryMinutes
	}
	return time.Duration(minutes) * time.Minute
}

func GetTaskErrorAlertSettings() *TaskErrorAlertSettings {
	return &taskErrorAlertSettings
}
