package service

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func TestBuildTaskPluginViewRewritesOnlyStructuredTaskIDFields(t *testing.T) {
	const (
		privateTaskID = "upstream-task-123"
		publicTaskID  = "task_public_123"
		resultURL     = "https://cdn.example.com/results/upstream-task-123/video.mp4"
	)

	taskData, err := common.Marshal(map[string]any{
		"task_id": privateTaskID,
		"id":      privateTaskID,
		"taskId":  privateTaskID,
		"url":     resultURL,
		"message": "completed upstream-task-123",
		"nested": []any{
			map[string]any{
				"task_id": privateTaskID,
				"url":     resultURL,
			},
			privateTaskID,
		},
		privateTaskID: "opaque map key",
	})
	require.NoError(t, err)
	task := &model.Task{
		TaskID: publicTaskID,
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: privateTaskID,
		},
		Data: taskData,
	}

	view, err := BuildTaskPluginView(task)
	require.NoError(t, err)

	data, ok := view.Data.(map[string]any)
	require.True(t, ok)
	assert.Equal(t, publicTaskID, data["task_id"])
	assert.Equal(t, publicTaskID, data["id"])
	assert.Equal(t, publicTaskID, data["taskId"])
	assert.Equal(t, resultURL, data["url"])
	assert.Equal(t, "completed upstream-task-123", data["message"])
	assert.Equal(t, "opaque map key", data[privateTaskID])

	nested, ok := data["nested"].([]any)
	require.True(t, ok)
	nestedData, ok := nested[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, publicTaskID, nestedData["task_id"])
	assert.Equal(t, resultURL, nestedData["url"])
	assert.Equal(t, privateTaskID, nested[1])

}

func TestBuildTaskPluginViewOmitsPrivatePollState(t *testing.T) {
	task := &model.Task{
		TaskID: "task_public_view",
		Data:   []byte(`{"ok":true}`),
		PrivateData: model.TaskPrivateData{
			PluginState:  []byte(`{"req_key":"secret"}`),
			PollFailures: 7,
		},
	}

	view, err := BuildTaskPluginView(task)
	require.NoError(t, err)
	encoded, err := common.Marshal(view)
	require.NoError(t, err)
	var payload map[string]any
	require.NoError(t, common.Unmarshal(encoded, &payload))
	assert.NotContains(t, payload, "plugin_state")
	assert.NotContains(t, payload, "poll_failures")
	assert.NotContains(t, payload, "private_data")
}

func TestBuildTaskPluginViewEncodesKeysInMapOrder(t *testing.T) {
	task := &model.Task{
		TaskID:     "task_public_order",
		Platform:   "fixture",
		Status:     model.TaskStatusSuccess,
		Progress:   "100%",
		FailReason: "none",
		CreatedAt:  1700000000,
		UpdatedAt:  1700000100,
		FinishTime: 1700000200,
		Data:       []byte(`{"b":1,"a":{"10":true,"2":false}}`),
	}

	view, err := BuildTaskPluginView(task)
	require.NoError(t, err)
	encoded, err := common.Marshal(view)
	require.NoError(t, err)
	var payload map[string]any
	require.NoError(t, common.Unmarshal(encoded, &payload))
	require.Len(t, payload, 9)
	reencoded, err := common.Marshal(payload)
	require.NoError(t, err)
	assert.Equal(t, string(reencoded), string(encoded))
}

func TestBuildClientTaskPluginViewServesTheResultThroughThisSite(t *testing.T) {
	const upstreamURL = "https://supplier.example/results/video.mp4"
	taskData, err := common.Marshal(map[string]any{
		"content": map[string]any{"video_url": upstreamURL, "last_frame_url": "https://supplier.example/frame.png"},
	})
	require.NoError(t, err)
	task := &model.Task{
		TaskID:      "task_public",
		Status:      model.TaskStatusSuccess,
		Data:        taskData,
		PrivateData: model.TaskPrivateData{ResultURL: upstreamURL},
	}
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	view, err := BuildClientTaskPluginView(c, task)
	require.NoError(t, err)

	content := view.Data.(map[string]any)["content"].(map[string]any)
	assert.True(t, strings.HasSuffix(content["video_url"].(string), "/v1/videos/task_public/content"), content["video_url"])
	assert.Equal(t, "https://supplier.example/frame.png", content["last_frame_url"])
}

func TestShouldCopyUpstreamHeaderKeepsOnlyWhatClientsNeed(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	for _, name := range []string{"Content-Type", "content-encoding", "Retry-After", "X-Codex-Turn-State"} {
		assert.True(t, ShouldCopyUpstreamHeader(c, name, []string{"v"}), name)
	}
	for _, name := range []string{"Set-Cookie", "Server", "X-Request-Id", "X-Ratelimit-Remaining-Requests", "Openai-Organization", "Via", "Content-Length"} {
		assert.False(t, ShouldCopyUpstreamHeader(c, name, []string{"v"}), name)
	}
	assert.False(t, ShouldCopyUpstreamHeader(c, common.RequestIdKey, []string{"upstream-1"}))
	assert.Equal(t, "upstream-1", c.GetString(common.UpstreamRequestIdKey))
}
