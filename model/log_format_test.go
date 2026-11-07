package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/usererror"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestFormatUserLogsStripsQuotaSaturation verifies the admin-only quota
// saturation marker (nested under other.admin_info) is removed for non-admin
// log views, since formatUserLogs strips the whole admin_info object.
func TestFormatUserLogsStripsQuotaSaturation(t *testing.T) {
	other := common.MapToJsonStr(map[string]any{
		"model_price": 0.004,
		"admin_info": map[string]any{
			"quota_saturation": map[string]any{
				"op":      "QuotaFromDecimal",
				"kind":    "overflow",
				"clamped": common.MaxQuota,
			},
		},
	})
	logs := []*Log{{Other: other}}

	formatUserLogs(logs, 0)

	parsed, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	_, hasAdminInfo := parsed["admin_info"]
	require.False(t, hasAdminInfo, "admin_info (and nested quota_saturation) must be stripped for non-admin views")
	// The base price is supply cost and stays hidden from log owners.
	require.NotContains(t, parsed, "model_price")
}

// TestFormatUserLogsHidesSupplierCost verifies log owners never receive base
// prices, the markup ratio, or upstream identifiers, while admins still do.
func TestFormatUserLogsHidesSupplierCost(t *testing.T) {
	other := common.MapToJsonStr(map[string]any{
		"model_price":         0.5936,
		"model_ratio":         1.5,
		"completion_ratio":    4,
		"group_ratio":         1.05,
		"user_group_ratio":    -1,
		"billing_mode":        "tiered_expr",
		"expr_b64":            "cGFyYW0oInNlY29uZHMiKSAqIDAuNQ==",
		"fixed_price":         7.0,
		"matched_tier":        "720p",
		"usage_facts":         map[string]any{"seconds": 5},
		"is_model_mapped":     true,
		"upstream_model_name": "vendor-model",
		"po":                  []string{"set temperature"},
	})
	newLog := func() *Log {
		return &Log{ChannelId: 3, UpstreamRequestId: "upstream-req", Other: other}
	}

	userLog := newLog()
	formatUserLogs([]*Log{userLog}, 0)
	assert.Zero(t, userLog.ChannelId)
	assert.Empty(t, userLog.UpstreamRequestId)
	parsed, err := common.StrToMap(userLog.Other)
	require.NoError(t, err)
	for _, key := range []string{"model_price", "model_ratio", "completion_ratio", "group_ratio", "user_group_ratio", "expr_b64", "fixed_price", "is_model_mapped", "upstream_model_name", "po"} {
		assert.NotContains(t, parsed, key)
	}
	assert.Equal(t, "tiered_expr", parsed["billing_mode"])
	assert.Equal(t, "720p", parsed["matched_tier"])
	assert.Contains(t, parsed, "usage_facts")

	adminLog := newLog()
	FormatAdminLogs([]*Log{adminLog})
	assert.Equal(t, 3, adminLog.ChannelId)
	assert.Equal(t, "upstream-req", adminLog.UpstreamRequestId)
	assert.Equal(t, other, adminLog.Other)
}

func TestFormatUserLogsHidesSupplierCostContent(t *testing.T) {
	other := NewLogOther()
	content := other.setContent([]*common.Message{
		common.NewMessage("Model price {{model_price}}, group ratio {{group_ratio}}", map[string]any{"model_price": "0.50", "group_ratio": "1.50"}),
		common.NewMessage("Web search {{count}} times", map[string]any{"count": 2}),
	})
	structured := other.JSONString()
	for _, tc := range []struct {
		name, content, other, wantContent string
		wantParts                         []string
	}{
		{"keeps other parts", content, structured, "Web search 2 times", []string{"Web search {{count}} times"}},
		{"only cost parts", "Model ratio 1.50, group ratio 1.50", `{"content_parts":[{"key":"Model ratio {{model_ratio}}, group ratio {{group_ratio}}","params":{"model_ratio":"1.50","group_ratio":"1.50"}}]}`, "", []string{}},
		{"cost nested in another message", "Settled: model ratio 1.50", `{"content_parts":[{"key":"Settled: {{reason}}","params":{"reason":"model ratio 1.50"}}]}`, "", []string{}},
		{"older text only log", "模型价格 0.50，分组倍率 1.50", `{}`, "", nil},
		{"unrelated content stays", "Web search 2 times", `{"content_parts":[{"key":"Web search 2 times"}]}`, "Web search 2 times", []string{"Web search 2 times"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			log := &Log{Type: LogTypeConsume, Content: tc.content, Other: tc.other}
			formatUserLogs([]*Log{log}, 0)
			assert.Equal(t, tc.wantContent, log.Content)
			assert.NotContains(t, log.Other, "1.50")

			parsed, err := common.StrToMap(log.Other)
			require.NoError(t, err)
			if tc.wantParts == nil {
				assert.NotContains(t, parsed, logOtherContentPartsKey)
				return
			}
			parts, ok := parsed[logOtherContentPartsKey].([]any)
			require.True(t, ok)
			keys := []string{}
			for _, part := range parts {
				keys = append(keys, part.(map[string]any)["key"].(string))
			}
			assert.Equal(t, tc.wantParts, keys)
		})
	}

	adminLog := &Log{Type: LogTypeConsume, Content: content, Other: structured}
	FormatAdminLogs([]*Log{adminLog})
	assert.Equal(t, content, adminLog.Content)
	assert.Contains(t, adminLog.Other, "group_ratio")
}

func TestTaskPluginLogVisibilityIsRoleSeparated(t *testing.T) {
	other := common.MapToJsonStr(map[string]any{
		"model_price": 1.25,
		"admin_info": map[string]any{
			"task_plugin": map[string]any{
				"key":     "document-parser",
				"name":    "Document Parser",
				"version": "1.2.3",
			},
		},
		"root_info": map[string]any{
			"upstream_task_id": "upstream-private",
			"task_plugin": map[string]any{
				"generation": 42,
			},
		},
	})

	t.Run("user", func(t *testing.T) {
		logs := []*Log{{Other: other}}
		formatUserLogs(logs, 0)

		parsed, err := common.StrToMap(logs[0].Other)
		require.NoError(t, err)
		assert.NotContains(t, parsed, "admin_info")
		assert.NotContains(t, parsed, "root_info")
		assert.NotContains(t, parsed, "model_price")
	})

	t.Run("admin", func(t *testing.T) {
		logs := []*Log{{Other: other}}
		FormatAdminLogs(logs)

		parsed, err := common.StrToMap(logs[0].Other)
		require.NoError(t, err)
		assert.Contains(t, parsed, "admin_info")
		assert.NotContains(t, parsed, "root_info")
	})

	t.Run("root", func(t *testing.T) {
		logs := []*Log{{Other: other}}
		FormatRootLogs(logs)

		parsed, err := common.StrToMap(logs[0].Other)
		require.NoError(t, err)
		assert.Contains(t, parsed, "admin_info")
		assert.Contains(t, parsed, "root_info")
	})
}

func TestLegacyLogOtherVisibilityIsRoleSeparated(t *testing.T) {
	other := common.MapToJsonStr(map[string]any{
		"request_path":  "/v1/chat/completions",
		"channel_id":    202,
		"channel_name":  "legacy-secret-channel",
		"channel_type":  1,
		"reject_reason": "legacy-policy-rejection",
		"admin_info": map[string]any{
			"existing_admin_field": "preserved",
		},
		"root_info": map[string]any{
			"upstream_request_id": "upstream-private",
		},
		"audit_info": map[string]any{
			"method": "POST",
		},
	})

	t.Run("user", func(t *testing.T) {
		logs := []*Log{{
			Id:          99,
			ChannelId:   77,
			ChannelName: "resolved-secret-channel",
			Other:       other,
		}}

		formatUserLogs(logs, 10)

		assert.Equal(t, 11, logs[0].Id)
		assert.Zero(t, logs[0].ChannelId)
		assert.Empty(t, logs[0].ChannelName)
		parsed, err := common.StrToMap(logs[0].Other)
		require.NoError(t, err)
		assert.Equal(t, "/v1/chat/completions", parsed["request_path"])
		for _, key := range []string{
			"channel_id",
			"channel_name",
			"channel_type",
			"reject_reason",
			"admin_info",
			"root_info",
			"audit_info",
		} {
			assert.NotContains(t, parsed, key)
		}
	})

	t.Run("admin", func(t *testing.T) {
		logs := []*Log{{Other: other}}

		FormatAdminLogs(logs)

		parsed, err := common.StrToMap(logs[0].Other)
		require.NoError(t, err)
		assert.Equal(t, "legacy-secret-channel", parsed["channel_name"])
		assert.NotContains(t, parsed, "reject_reason")
		assert.NotContains(t, parsed, "root_info")
		assert.Contains(t, parsed, "audit_info")
		adminInfo, ok := parsed["admin_info"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "preserved", adminInfo["existing_admin_field"])
		assert.Equal(t, "legacy-policy-rejection", adminInfo["reject_reason"])
	})

	t.Run("root", func(t *testing.T) {
		logs := []*Log{{Other: other}}

		FormatRootLogs(logs)

		parsed, err := common.StrToMap(logs[0].Other)
		require.NoError(t, err)
		assert.Equal(t, "legacy-secret-channel", parsed["channel_name"])
		assert.NotContains(t, parsed, "reject_reason")
		assert.Contains(t, parsed, "root_info")
		assert.Contains(t, parsed, "audit_info")
		adminInfo, ok := parsed["admin_info"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "preserved", adminInfo["existing_admin_field"])
		assert.Equal(t, "legacy-policy-rejection", adminInfo["reject_reason"])
	})
}

func TestLegacyRejectReasonDoesNotOverrideScopedValue(t *testing.T) {
	other := common.MapToJsonStr(map[string]any{
		"reject_reason": "legacy-value",
		"admin_info": map[string]any{
			"reject_reason": "scoped-value",
		},
	})
	logs := []*Log{{Other: other}}

	FormatRootLogs(logs)

	parsed, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	assert.NotContains(t, parsed, "reject_reason")
	adminInfo, ok := parsed["admin_info"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "scoped-value", adminInfo["reject_reason"])
}

func TestLegacyRejectReasonHandlesNullAdminInfo(t *testing.T) {
	logs := []*Log{{Other: `{"reject_reason":"legacy-value","admin_info":null}`}}

	FormatAdminLogs(logs)

	parsed, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	assert.NotContains(t, parsed, "reject_reason")
	adminInfo, ok := parsed["admin_info"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "legacy-value", adminInfo["reject_reason"])
}

func TestLogFormattingPreservesLargeIntegerLexemes(t *testing.T) {
	const other = `{"public_id":9007199254740993,"admin_info":{"admin_id":9007199254740995},"root_info":{"generation":18446744073709551615}}`

	t.Run("user", func(t *testing.T) {
		logs := []*Log{{Other: other}}

		formatUserLogs(logs, 0)

		assert.Contains(t, logs[0].Other, `"public_id":9007199254740993`)
		assert.NotContains(t, logs[0].Other, "admin_id")
		assert.NotContains(t, logs[0].Other, "generation")
	})

	t.Run("admin", func(t *testing.T) {
		logs := []*Log{{Other: other}}

		FormatAdminLogs(logs)

		assert.Contains(t, logs[0].Other, `"public_id":9007199254740993`)
		assert.Contains(t, logs[0].Other, `"admin_id":9007199254740995`)
		assert.NotContains(t, logs[0].Other, "generation")
	})

	t.Run("root", func(t *testing.T) {
		logs := []*Log{{Other: other}}

		FormatRootLogs(logs)

		assert.Equal(t, other, logs[0].Other)
	})

	t.Run("unprivileged", func(t *testing.T) {
		const unprivileged = `{"public_id":9007199254740993,"matched_tier":"720p"}`

		userLogs := []*Log{{Other: unprivileged}}
		formatUserLogs(userLogs, 0)
		assert.Equal(t, unprivileged, userLogs[0].Other)

		adminLogs := []*Log{{Other: unprivileged}}
		FormatAdminLogs(adminLogs)
		assert.Equal(t, unprivileged, adminLogs[0].Other)
	})
}

func TestErrorLogViewsSeparateOwnerAndAdmin(t *testing.T) {
	raw := `status_code=403, {"code":"insufficient_user_quota","message":"预扣费额度失败, 用户剩余额度: ＄0.10, 需要预扣费额度: ＄0.50","data":null}`
	other := `{"status_code":403,"error_code":"bad_response_status_code","error_type":"openai_error","admin_info":{"use_channel":["3"]}}`
	wantKey := usererror.Result{Code: usererror.CodeServiceCannotProcess}.Key()

	owner := &Log{Type: LogTypeError, Content: raw, Other: other, ModelName: "G-seedance-2.0"}
	formatUserLog(owner)
	assert.Equal(t, wantKey, owner.Content)
	assert.NotContains(t, owner.Other, "0.50")
	var ownerOther map[string]any
	require.NoError(t, common.UnmarshalJsonStr(owner.Other, &ownerOther))
	assert.Equal(t, usererror.CodeServiceCannotProcess, ownerOther["error_code"])
	assert.NotContains(t, ownerOther, "error_type")
	assert.NotContains(t, ownerOther, "admin_info")
	assert.Equal(t, wantKey, ownerOther[logOtherContentPartsKey].([]any)[0].(map[string]any)["key"])

	admin := []*Log{{Type: LogTypeError, Content: raw, Other: other, ModelName: "G-seedance-2.0"}}
	FormatAdminLogs(admin)
	assert.Equal(t, raw, admin[0].Content)
	var adminOther map[string]any
	require.NoError(t, common.UnmarshalJsonStr(admin[0].Other, &adminOther))
	assert.Equal(t, "bad_response_status_code", adminOther["error_code"])
	assert.NotContains(t, adminOther, logOtherContentPartsKey)
	assert.Equal(t, wantKey, adminOther[logOtherUserContentPartsKey].([]any)[0].(map[string]any)["key"])
}

func TestRefundLogHidesRawReasonFromOwner(t *testing.T) {
	owner := &Log{Type: LogTypeRefund, Other: `{"task_id":"task_1","reason":"upstream_create_failed: [服务信息已隐藏] please retry"}`}
	formatUserLog(owner)
	var other map[string]any
	require.NoError(t, common.UnmarshalJsonStr(owner.Other, &other))
	assert.Equal(t, usererror.Result{Code: usererror.CodeGenerationFailed}.Key(), other["reason"])
	assert.Equal(t, "task_1", other["task_id"])
}
