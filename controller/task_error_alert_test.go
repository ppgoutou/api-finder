package controller

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/pkg/usererror"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPlanTaskErrorAlerts walks a run of scans through critical, upstream and
// customer errors and asserts exactly which messages each scan sends.
func TestPlanTaskErrorAlerts(t *testing.T) {
	start := time.Date(2026, 11, 20, 8, 0, 0, 0, time.UTC)
	policy := taskErrorAlertPolicy{MergeWindow: 10 * time.Minute, Summary: true, SummaryEvery: time.Hour}
	state := newTaskErrorAlertState(start)
	next := 0
	event := func(code string, channel int, user int) taskErrorEvent {
		next++
		return taskErrorEvent{
			Key: "e" + string(rune('a'+next)), Result: usererror.Result{Code: code},
			ChannelId: channel, UserId: user, Username: "u", Model: "seedance",
		}
	}

	// Scan 1: two empty-wallet errors on channel 7 become one urgent message
	// with its count; the first upstream 5xx is sent; a customer error is only counted.
	wallet := event(usererror.CodeServiceCannotProcess, 7, 1)
	scan1 := []taskErrorEvent{wallet, event(usererror.CodeServiceCannotProcess, 7, 2), event(usererror.CodeServiceUnavailable, 7, 1), event(usererror.CodeModerationInput, 7, 3)}
	plan := planTaskErrorAlerts(state, scan1, policy, start)
	require.Len(t, plan.Messages, 2)
	assert.Equal(t, usererror.SeverityCritical, plan.Messages[0].Severity)
	assert.Equal(t, 2, plan.Messages[0].Count)
	assert.Equal(t, usererror.SeverityUpstream, plan.Messages[1].Severity)
	assert.False(t, plan.Messages[1].Merged)
	assert.Nil(t, plan.Summary)

	// Scan 2: the same rows read again by the overlap are not sent twice;
	// repeats of the 5xx inside the window are held.
	scan2 := append(scan1, event(usererror.CodeConnectionFailed, 7, 1), event(usererror.CodeServiceBusy, 7, 4))
	plan = planTaskErrorAlerts(state, scan2, policy, start.Add(time.Minute))
	assert.Empty(t, plan.Messages)

	// Same kind on another channel is its own alert.
	plan = planTaskErrorAlerts(state, []taskErrorEvent{event(usererror.CodeServiceUnavailable, 8, 1)}, policy, start.Add(2*time.Minute))
	require.Len(t, plan.Messages, 1)
	assert.Equal(t, 8, plan.Messages[0].Event.ChannelId)

	// After the window: channel 7 sends one merged message for the two held
	// repeats; channel 8 had none and sends nothing.
	plan = planTaskErrorAlerts(state, nil, policy, start.Add(13*time.Minute))
	require.Len(t, plan.Messages, 1)
	assert.True(t, plan.Messages[0].Merged)
	assert.Equal(t, 2, plan.Messages[0].Count)
	assert.Equal(t, 7, plan.Messages[0].Event.ChannelId)

	// Cancelled requests are ignored; customer errors reach the hourly summary.
	plan = planTaskErrorAlerts(state, []taskErrorEvent{event(usererror.CodeRequestCancelled, 7, 1), event(usererror.CodeBalanceInsufficient, 0, 3)}, policy, start.Add(time.Hour))
	assert.Empty(t, plan.Messages)
	require.NotNil(t, plan.Summary)
	assert.Equal(t, 2, plan.Summary.Total)
	assert.Equal(t, 1, plan.Summary.ByKind[usererror.AlertCategoryModeration])
	assert.Equal(t, 1, plan.Summary.ByKind[usererror.AlertCategoryBalance])
	assert.Equal(t, 2, plan.Summary.ByUser["u (#3)"])

	// An empty hour sends no summary.
	plan = planTaskErrorAlerts(state, nil, policy, start.Add(2*time.Hour))
	assert.Nil(t, plan.Summary)
}

func TestTaskErrorSummaryText(t *testing.T) {
	require.NoError(t, i18n.Init())
	text := taskErrorSummaryText(&taskErrorUserSummary{
		Minutes: 60, Total: 3,
		ByKind:  map[string]int{usererror.AlertCategoryModeration: 2, usererror.AlertCategoryBalance: 1},
		ByUser:  map[string]int{"a (#1)": 2, "b (#2)": 1},
		ByModel: map[string]int{"seedance": 3},
	})
	assert.Contains(t, text, "过去 60 分钟共 3 次")
	assert.Contains(t, text, "· 用户余额不足：1\n· 内容审核：2")
	assert.Contains(t, text, "a (#1) ×2、b (#2) ×1")
}
