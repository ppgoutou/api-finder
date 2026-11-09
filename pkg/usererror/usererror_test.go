package usererror

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClassifyProductionErrors(t *testing.T) {
	bad := "bad_response_status_code"
	for _, tc := range []struct {
		name  string
		input Input
		want  string
	}{
		{"our wallet at the supplier", Input{Raw: `status_code=403, {"code":"insufficient_user_quota","message":"预扣费额度失败, 用户剩余额度: ＄0.10, 需要预扣费额度: ＄0.50","data":null}`, ErrorCode: bad, ErrorType: "openai_error"}, CodeServiceCannotProcess},
		{"our wallet on a synchronous relay", Input{Raw: "预扣费额度失败, 用户剩余额度: ＄0.1, 需要预扣费额度: ＄0.7", ErrorCode: "insufficient_user_quota", ErrorType: "openai_error"}, CodeServiceCannotProcess},
		{"supplier internal credit", Input{Raw: `{"success":false,"code":"INSUFFICIENT_BALANCE","message":"本次请求暂时无法处理，请联系管理员。"}`, StatusCode: 402}, CodeServiceCannotProcess},
		{"no reference video", Input{Raw: `{"code":"LINE_NO_REFVIDEO","message":"当前线路不支持视频参考。"}`, StatusCode: 400}, CodeNoReferenceVideo},
		{"no duration", Input{Raw: `{"code":"LINE_NO_SECONDS","message":"生成失败，请检查提示词和参考素材重新提交。"}`, StatusCode: 400}, CodeLineNoDuration},
		{"no line for the spec", Input{Raw: `{"code":"NO_LINE_FOR_REQUEST","message":"当前没有线路能接这一单"}`, StatusCode: 400}, CodeNoLineForSpec},
		{"supplier fault naming no channel wins over its generic code", Input{Raw: `{"code":"video_request_failed","message":"No available channel for model seedance-2.5 under group default"}`, StatusCode: 503, Model: "m"}, CodeModelUnavailable},
		{"supplier fault", Input{Raw: `{"error":{"code":"video_request_failed","message":"❌ 本次视频生成未能完成"}}`, StatusCode: 503}, CodeServiceUnavailable},
		{"bare gateway error", Input{Raw: "error code: 502\n", StatusCode: 502}, CodeServiceUnavailable},
		{"supplier overload", Input{Raw: `{"error":{"message":"system cpu overloaded (current: 99.7%, threshold: 90%)"}}`, StatusCode: 503}, CodeServiceBusy},
		{"unreachable asset", Input{Raw: `{"code":"MATERIAL_UNREACHABLE","message":"上传素材无法访问"}`, StatusCode: 400}, CodeMaterialUnreachable},
		{"asset download timeout", Input{Raw: `参考图登记失败（HTTP 400）：外部素材下载超时，请改用本站直传`, StatusCode: 400}, CodeMaterialDownloadTimeout},
		{"asset needs a public URL", Input{Raw: `first_image_url must be a public http(s) URL`, StatusCode: 400}, CodeMaterialPublicURL},
		{"frame rate", Input{Raw: `素材转换失败: Frame rate must be between 23.8 FPS and 60 FPS.`, StatusCode: 400}, CodeMaterialFrameRate},
		{"pixels", Input{Raw: `素材转换失败: Pixel count must be between 407696 and 8295044.`, StatusCode: 400}, CodeMaterialPixels},
		{"real person", Input{Raw: `{"code":"***.PrivacyInformation","message":"input image may contain real person"}`, StatusCode: 400}, CodeModerationRealPerson},
		{"copyright", Input{Raw: `The request failed because the input image may be related to copyright restrictions.`, StatusCode: 400}, CodeModerationCopyright},
		{"reference image", Input{Raw: `at least one reference image is required`, StatusCode: 400}, CodeRefImageRequired},
		{"ratio", Input{Raw: `ratio 不能为空`, StatusCode: 400}, CodeRatioRequired},
		{"prompt", Input{Raw: "it is missing `prompt` parameter", StatusCode: 400}, CodePromptRequired},
		{"local task code", Input{Raw: "failed", ErrorCode: "task_insert_failed", StatusCode: 500}, CodeInternalError},
		{"settlement failure", Input{Raw: "failed", ErrorCode: "task_billing_settlement_failed", StatusCode: 500}, CodeSettlementError},
		{"upstream authentication", Input{Raw: "denied", StatusCode: 401}, CodeUpstreamAuth},
		{"unknown text", Input{Raw: "secret supplier group internal-group did something", StatusCode: 400}, CodeFallback},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, Classify(tc.input).Code)
		})
	}
}

func TestClassifyCustomerBalanceCarriesTheirOwnAmounts(t *testing.T) {
	result := Classify(Input{
		Raw:        "status_code=403, Not enough quota to pre-consume for this request: ¥1.500000 remaining, ¥2.500000 required",
		ErrorCode:  "bad_response_status_code",
		ErrorType:  "openai_error",
		StatusCode: 403,
	})
	assert.Equal(t, CodeBalanceInsufficientDetail, result.Code)
	assert.Equal(t, map[string]any{"remaining": "¥1.500000", "required": "¥2.500000"}, result.Params)

	assert.Equal(t, CodeBalanceInsufficient, Classify(Input{Raw: "x", ErrorCode: "insufficient_user_quota"}).Code)
}

func TestClassifyModelParam(t *testing.T) {
	raw := `{"error":{"code":"model_not_found"}}`
	withName := Classify(Input{Raw: raw, Model: "G-seedance-2.5", StatusCode: 503})
	assert.Equal(t, CodeModelUnavailable, withName.Code)
	assert.Equal(t, "G-seedance-2.5", withName.Params["model"])
	assert.Equal(t, CodeServiceUnavailable, Classify(Input{Raw: raw, StatusCode: 503}).Code)
}

func TestClassifyFailReason(t *testing.T) {
	for reason, want := range map[string]string{
		"":    "",
		"   ": "",
		"视频任务提交超时（线路无响应），任务未开始生成，预扣费用已原路退回，请稍后重试或换线路": CodeSubmitTimeout,
		"提交10分钟仍未取得上游任务号，受理结果未确认，本次任务已失败":             CodeSubmitTimeout,
		"请求超时，请重新提交":     CodeSubmitTimeout,
		"Task timed out": CodeTaskTimeout,
		"Task timed out (a task left by the old system is not refunded; contact the administrator)": CodeTaskTimeoutLegacy,
		"生成失败，请检查提示词和素材后请重新提交。":                                                                     CodeGenerationMaybeContent,
		"生成的视频：审核判定含敏感画面，请修改提示词或更换参考素材后重新提交":                                                        CodeModerationOutput,
		"请检查上传素材和提示词，图片宽度大于300，参考音视频时长必须为2至15秒，总时长不能高于15秒。":                                         CodeMaterialRequirements,
		"视频任务未被受理（请求参数或内容未通过校验），任务未开始生成，预扣费用已原路退回，请检查后重试。上游原因：内容未通过上游安全审核（素材疑似含真人人脸/隐私信息），请修改提示词或素材后重试": CodeModerationRealPerson,
		"按管理员要求驳回：当前未进入生成阶段":                                                CodeTaskCancelledByAdmin,
		"Upstream task not found":                                           CodeTaskResultUnavailable,
		"系统有问题，请联系站长修复":                                                     CodeGenerationFailed,
		"upstream_create_failed: [服务信息已隐藏] service temporarily unavailable": CodeGenerationFailed,
		"Video generation failed":                                           CodeGenerationFailed,
	} {
		assert.Equal(t, want, ClassifyFailReason(reason).Code, reason)
	}
}

// Every code reaches clients through the backend locales and the web console
// through its locale files; a missing entry would show the raw key or English.
func TestEveryCodeIsTranslated(t *testing.T) {
	require.NoError(t, i18n.Init())
	for code := range messages {
		for _, lang := range []string{"en", "zh-CN", "zh-TW"} {
			rendered := Result{Code: code, Params: map[string]any{"model": "m", "remaining": "1", "required": "2"}}.Translate(lang)
			assert.NotContains(t, rendered, "user_error.", "%s in %s", code, lang)
			assert.NotContains(t, rendered, "{{", "%s in %s", code, lang)
		}
	}
	for _, locale := range []string{"en", "zh", "zh-TW", "fr", "ru", "ja", "vi"} {
		content, err := os.ReadFile(filepath.Join("..", "..", "web", "src", "i18n", "locales", locale+".json"))
		require.NoError(t, err)
		var file struct {
			Translation map[string]string `json:"translation"`
		}
		require.NoError(t, json.Unmarshal(content, &file))
		for code, english := range messages {
			translated, ok := file.Translation[english]
			require.True(t, ok, "%s is missing %s", locale, code)
			if locale != "en" {
				assert.NotEqual(t, english, translated, "%s has not translated %s", locale, code)
			}
			assert.Equal(t, strings.Count(english, "{{"), strings.Count(translated, "{{"), "%s %s", locale, code)
		}
	}
}
