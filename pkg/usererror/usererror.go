// Package usererror turns raw gateway and upstream errors into the messages
// customers see. It classifies at read time, so logs and tasks stored before it
// existed show the same text, and the stored raw error stays for administrators.
package usererror

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
)

// Codes returned to clients. Each has an English source text in messages, a
// "user_error.<code>" entry in i18n/locales and a key in the web locale files.
const (
	CodeBalanceInsufficient       = "balance_insufficient"
	CodeBalanceInsufficientDetail = "balance_insufficient_detail"
	CodePromptRequired            = "prompt_required"
	CodeModelRequired             = "model_required"
	CodeRefImageRequired          = "ref_image_required"
	CodeRatioRequired             = "ratio_required"
	CodeInvalidDuration           = "invalid_duration"
	CodeInvalidResolution         = "invalid_resolution"
	CodeInvalidFormat             = "invalid_format"
	CodeRequestTooLarge           = "request_too_large"
	CodeMaterialUnreachable       = "material_unreachable"
	CodeMaterialDownloadTimeout   = "material_download_timeout"
	CodeMaterialPublicURL         = "material_public_url"
	CodeMaterialFrameRate         = "material_frame_rate"
	CodeMaterialPixels            = "material_pixels"
	CodeMaterialRequirements      = "material_requirements"
	CodeModerationRealPerson      = "moderation_real_person"
	CodeModerationCopyright       = "moderation_copyright"
	CodeModerationOutput          = "moderation_output"
	CodeModerationPrompt          = "moderation_prompt"
	CodeViolationFee              = "violation_fee"
	CodeNoReferenceVideo          = "no_reference_video"
	CodeLineNoDuration            = "line_no_duration"
	CodeNoLineForSpec             = "no_line_spec"
	CodeModelUnavailable          = "model_unavailable"
	CodeModelNotPriced            = "model_not_priced"
	CodeServiceCannotProcess      = "service_cannot_process"
	CodeServiceBusy               = "service_busy"
	CodeServiceUnavailable        = "service_unavailable"
	CodeUpstreamAuth              = "upstream_auth"
	CodeSubmitTimeout             = "submit_timeout"
	CodeTaskTimeout               = "task_timeout"
	CodeTaskTimeoutLegacy         = "task_timeout_legacy"
	CodeGenerationMaybeContent    = "generation_maybe_content"
	CodeGenerationFailed          = "generation_failed"
	CodeTaskCancelledByAdmin      = "task_cancelled_admin"
	CodeTaskResultUnavailable     = "task_result_unavailable"
	CodeRequestCancelled          = "request_cancelled"
	CodeBadResponse               = "bad_response"
	CodeConnectionFailed          = "connection_failed"
	CodeInternalError             = "internal_error"
	CodeSettlementError           = "settlement_error"
	CodeFallback                  = "fallback"
)

// messages holds the English source texts, which are also the web locale keys.
var messages = map[string]string{
	CodeBalanceInsufficient:       "Your balance is too low. Please top up and try again.",
	CodeBalanceInsufficientDetail: "Your balance is too low: {{remaining}} available, {{required}} needed for this request. Please top up and try again.",
	CodePromptRequired:            "Please enter a prompt.",
	CodeModelRequired:             "Please select a model.",
	CodeRefImageRequired:          "This model needs at least 1 reference image. Please upload one and submit again.",
	CodeRatioRequired:             "Please select a video aspect ratio.",
	CodeInvalidDuration:           "This model does not support this duration. Please choose another one as shown on the page.",
	CodeInvalidResolution:         "This model does not support this resolution or size. Please choose another one.",
	CodeInvalidFormat:             "The request format is invalid. Please check it and submit again.",
	CodeRequestTooLarge:           "The request is too large. Please reduce or compress your assets and try again.",
	CodeMaterialUnreachable:       "An asset could not be accessed. Please check that the link works, or upload it again and retry.",
	CodeMaterialDownloadTimeout:   "Downloading an asset timed out. Please upload it on this site and try again.",
	CodeMaterialPublicURL:         "Assets must use a publicly accessible http(s) link, or be uploaded on this site.",
	CodeMaterialFrameRate:         "Video assets must be 24-60 FPS. Please adjust and upload again.",
	CodeMaterialPixels:            "An asset's resolution is too low or too high. Please adjust it and upload again.",
	CodeMaterialRequirements:      "An asset does not meet the requirements: images must be wider than 300 pixels, and reference audio or video must be 2-15 seconds each and at most 15 seconds in total. Any charge has been refunded. Please adjust and submit again.",
	CodeModerationRealPerson:      "An asset may contain a real person's face or private information and did not pass the content review, so generation did not start. Any charge has been refunded. Please use another asset or edit the prompt, then submit again.",
	CodeModerationCopyright:       "An asset may be subject to copyright restrictions and did not pass review. Please use another asset and try again.",
	CodeModerationOutput:          "The generated content did not pass review. Your charge has been refunded. Please change the prompt or assets and try again.",
	CodeModerationPrompt:          "The prompt did not pass review. Please change it and try again.",
	CodeViolationFee:              "The content violates the usage rules, and a violation fee was charged under those rules. Contact support if you have questions.",
	CodeNoReferenceVideo:          "This model does not support reference videos right now. Please remove the reference video or use another model. You were not charged.",
	CodeLineNoDuration:            "This model does not support this duration right now. Please choose another duration or model. You were not charged.",
	CodeNoLineForSpec:             "This model cannot generate this combination of resolution, duration and assets right now. Please adjust it and retry, or use another model. You were not charged.",
	CodeModelUnavailable:          "Model {{model}} is temporarily unavailable. Please try again later or use another model. You were not charged.",
	CodeModelNotPriced:            "Model {{model}} is not open yet. Please use another model or contact support.",
	CodeServiceCannotProcess:      "The service cannot process this request right now. You were not charged and your balance is unaffected. Please try again later.",
	CodeServiceBusy:               "The service is busy and this request did not go through. Please try again later.",
	CodeServiceUnavailable:        "The service is temporarily unavailable. You were not charged. Please try again later or use another model.",
	CodeUpstreamAuth:              "The service is temporarily unavailable. You were not charged. We are working on it, please try again later.",
	CodeSubmitTimeout:             "Task submission timed out before generation started. Your charge has been refunded. Please submit again.",
	CodeTaskTimeout:               "The task timed out before finishing. Your charge has been refunded. Please submit again.",
	CodeTaskTimeoutLegacy:         "The task timed out before finishing, and this charge was not refunded. Contact support if you have questions.",
	CodeGenerationMaybeContent:    "Video generation failed, possibly because of the prompt or assets. Your charge has been refunded. Please adjust and submit again.",
	CodeGenerationFailed:          "Video generation failed. Your charge has been refunded. Please submit again later. If it keeps failing, send the request ID to support.",
	CodeTaskCancelledByAdmin:      "This task was cancelled. Your charge has been refunded. Contact support if you have questions.",
	CodeTaskResultUnavailable:     "The task result could not be retrieved, so the task has ended. Your charge has been refunded. Please submit again.",
	CodeRequestCancelled:          "The request was cancelled.",
	CodeBadResponse:               "The service returned an abnormal response. You were not charged. Please try again later.",
	CodeConnectionFailed:          "The service could not be reached. You were not charged. Please try again later.",
	CodeInternalError:             "A system error occurred. You were not charged. Please try again later. If it keeps happening, send the request ID to support.",
	CodeSettlementError:           "A system error occurred. Please send the request ID to support, and we will check the charge and task status.",
	CodeFallback:                  "The service is temporarily unusual and this request did not succeed. Please try again later. If it keeps happening, send the request ID to support.",
}

// Result is the customer-facing form of one error.
type Result struct {
	Code   string
	Params map[string]any
}

// Key returns the English source text, which is the web locale key.
func (r Result) Key() string {
	return messages[r.Code]
}

// Message returns the structured form the web console renders in its language.
func (r Result) Message() *common.Message {
	return common.NewMessage(r.Key(), r.Params)
}

// Translate renders the message for API clients, who have no web locale files.
func (r Result) Translate(lang string) string {
	return i18n.Translate(lang, "user_error."+r.Code, r.Params)
}

// Input describes one error. ErrorType is empty on the task submission path.
type Input struct {
	Raw        string
	StatusCode int
	ErrorCode  string
	ErrorType  string
	Model      string
}

type rule struct {
	code     string
	patterns []string
}

// Local task codes that identify the error regardless of its text.
var codeRules = map[string]string{
	"do_request_failed":              CodeConnectionFailed,
	"build_request_failed":           CodeConnectionFailed,
	"task_insert_failed":             CodeInternalError,
	"task_submit_failed":             CodeInternalError,
	"task_billing_settlement_failed": CodeSettlementError,
	"request_cancelled":              CodeRequestCancelled,
	"invalid_json":                   CodeInvalidFormat,
	"invalid_multipart_form":         CodeInvalidFormat,
	"missing_model":                  CodeModelRequired,
	"invalid_seconds":                CodeInvalidDuration,
	"invalid_size":                   CodeInvalidResolution,
	"model_price_error":              CodeModelNotPriced,
	"read_response_body_failed":      CodeBadResponse,
	"plugin_submit_response_failed":  CodeBadResponse,
	"plugin_submit_response_invalid": CodeBadResponse,
	"get_channel_failed":             CodeModelUnavailable,
	"prompt_blocked":                 CodeModerationPrompt,
	"sensitive_words_detected":       CodeModerationPrompt,
	"channel:invalid_key":            CodeUpstreamAuth,
	"channel:no_available_key":       CodeUpstreamAuth,
}

// Patterns are lower case and checked in order; the first match wins. Specific
// supplier codes come before the generic text they can be nested in.
var textRules = []rule{
	{CodeServiceCannotProcess, []string{"insufficient_balance", "insufficient_credits", "平台积分不足"}},
	{CodeViolationFee, []string{"violation_fee"}},
	{CodeNoReferenceVideo, []string{"line_no_refvideo"}},
	{CodeLineNoDuration, []string{"line_no_seconds"}},
	{CodeNoLineForSpec, []string{"no_line_for_request"}},
	{CodeModelUnavailable, []string{"model_not_found", "no available channel", "无可用渠道", "無可用管道", "可用渠道不存在"}},
	{CodeModerationRealPerson, []string{"privacyinformation", "real person", "真人人脸", "隐私信息"}},
	{CodeModerationCopyright, []string{"copyright"}},
	{CodeModerationOutput, []string{"审核判定", "敏感画面"}},
	{CodeModerationPrompt, []string{"prompt_blocked", "sensitive_words_detected", "datainspectionfailed"}},
	{CodeMaterialDownloadTimeout, []string{"外部素材下载超时"}},
	{CodeMaterialUnreachable, []string{"material_unreachable", "上传素材无法访问", "参考素材下载失败"}},
	{CodeMaterialPublicURL, []string{"public http(s) url", "media_url_required", "公网 http", "仅接受 http(s)"}},
	{CodeMaterialFrameRate, []string{"frame rate must"}},
	{CodeMaterialPixels, []string{"pixel count must"}},
	{CodeMaterialRequirements, []string{"请检查上传素材", "inner_generation__classification"}},
	{CodePromptRequired, []string{"prompt is required", "missing `prompt`", "prompt 不能为空"}},
	{CodeModelRequired, []string{"model field is required", "model_name_required"}},
	{CodeRefImageRequired, []string{"at least one reference image"}},
	{CodeRatioRequired, []string{"ratio 不能为空"}},
	{CodeInvalidDuration, []string{"seconds must", "duration must", "invalid video duration", "seconds and duration"}},
	{CodeInvalidResolution, []string{"resolution must", "ratio must", "unsupported video size", "unsupported video resolution", "does not match resolution", "is not offered", "invalid video ratio"}},
	{CodeInvalidFormat, []string{"json body required", "json object required", "unsupported model"}},
	{CodeRequestTooLarge, []string{"request body too large"}},
	{CodeModelNotPriced, []string{"price not configured", "pricing is not configured", "has not been priced", "价格尚未", "价格未配置"}},
	{CodeServiceBusy, []string{"overloaded", "saturated", "负载已饱和"}},
	{CodeUpstreamAuth, []string{"invalid auth"}},
	{CodeRequestCancelled, []string{"context canceled"}},
	{CodeConnectionFailed, []string{"dial tcp", "connection refused", "context deadline exceeded", "connection reset", "no such host"}},
	{CodeBadResponse, []string{"upstream returned an empty response", "task_id is empty", "task adaptor returned an empty response"}},
	{CodeInternalError, []string{"failed to persist task", "task submission returned no result"}},
	{CodeSettlementError, []string{"failed to settle task billing"}},
	{CodeServiceUnavailable, []string{"video_request_failed", "暂时不可用", "error code: 502", "error code: 503", "error code: 504"}},
}

// Task failures are stored without params, because fail reasons are rendered
// as plain locale keys. Generation failed is the default here, not the fallback.
var failReasonRules = []rule{
	{CodeSubmitTimeout, []string{"视频任务提交超时", "提交10分钟", "请求超时"}},
	{CodeTaskTimeoutLegacy, []string{"not refunded"}},
	{CodeTaskTimeout, []string{"task timed out"}},
	{CodeTaskCancelledByAdmin, []string{"按管理员要求驳回"}},
	{CodeTaskResultUnavailable, []string{"upstream task not found", "failed to query the upstream task status"}},
	{CodeGenerationMaybeContent, []string{"请检查提示词和素材"}},
	{CodeModerationRealPerson, []string{"privacyinformation", "real person", "真人人脸", "隐私信息"}},
	{CodeModerationCopyright, []string{"copyright"}},
	{CodeModerationOutput, []string{"审核判定", "敏感画面"}},
	{CodeMaterialDownloadTimeout, []string{"外部素材下载超时"}},
	{CodeMaterialUnreachable, []string{"material_unreachable", "上传素材无法访问", "参考素材下载失败"}},
	{CodeMaterialFrameRate, []string{"frame rate must"}},
	{CodeMaterialPixels, []string{"pixel count must"}},
	{CodeMaterialRequirements, []string{"请检查上传素材", "inner_generation__classification"}},
}

var (
	statusPrefix = regexp.MustCompile(`^status_code=\d+,\s*`)
	amountRegexp = regexp.MustCompile(`[¥￥$＄€]\s?[\d,]+(?:\.\d+)?`)
)

func matchRules(rules []rule, text string) string {
	for _, candidate := range rules {
		for _, pattern := range candidate.patterns {
			if strings.Contains(text, pattern) {
				return candidate.code
			}
		}
	}
	return ""
}

func isQuotaRefusal(input Input, text string) bool {
	if input.ErrorCode == "insufficient_user_quota" || strings.Contains(text, "insufficient_user_quota") {
		return true
	}
	for _, pattern := range []string{"not enough quota", "预扣费额度失败", "預扣費額度失敗", "用户额度不足", "insufficient quota"} {
		if strings.Contains(text, pattern) {
			return true
		}
	}
	return false
}

// isOurUpstreamWallet tells our own wallet at the supplier from the customer's
// balance. The supplier runs the same gateway and words its refusal the same
// way, but its answer arrives as a JSON body or, on synchronous relays, as an
// OpenAI error. A customer's refusal is plain text; task submission logs record
// it with the generic bad_response_status_code.
func isOurUpstreamWallet(input Input, text string) bool {
	if strings.Contains(text, "{") {
		return true
	}
	return input.ErrorType == "openai_error" && input.ErrorCode != "bad_response_status_code"
}

func customerBalanceResult(raw string) Result {
	amounts := amountRegexp.FindAllString(raw, 2)
	if len(amounts) < 2 {
		return Result{Code: CodeBalanceInsufficient}
	}
	return Result{Code: CodeBalanceInsufficientDetail, Params: map[string]any{"remaining": amounts[0], "required": amounts[1]}}
}

func withModel(code string, modelName string) Result {
	if code != CodeModelUnavailable && code != CodeModelNotPriced {
		return Result{Code: code}
	}
	if modelName != "" {
		return Result{Code: code, Params: map[string]any{"model": modelName}}
	}
	if code == CodeModelUnavailable {
		return Result{Code: CodeServiceUnavailable}
	}
	return Result{Code: CodeFallback}
}

func resultFromStatus(status int) Result {
	switch {
	case status == http.StatusUnauthorized:
		return Result{Code: CodeUpstreamAuth}
	case status == http.StatusPaymentRequired:
		return Result{Code: CodeServiceCannotProcess}
	case status == http.StatusRequestEntityTooLarge:
		return Result{Code: CodeRequestTooLarge}
	case status == http.StatusTooManyRequests:
		return Result{Code: CodeServiceBusy}
	case status >= http.StatusInternalServerError:
		return Result{Code: CodeServiceUnavailable}
	}
	return Result{Code: CodeFallback}
}

// Classify maps an error to its customer-facing form. Anything it does not
// recognize becomes the fallback, so unknown upstream text never reaches users.
func Classify(input Input) Result {
	text := strings.ToLower(statusPrefix.ReplaceAllString(input.Raw, ""))
	if isQuotaRefusal(input, text) {
		if isOurUpstreamWallet(input, text) {
			return Result{Code: CodeServiceCannotProcess}
		}
		return customerBalanceResult(input.Raw)
	}
	if code := matchRules(textRules, text); code != "" {
		return withModel(code, input.Model)
	}
	if code, ok := codeRules[input.ErrorCode]; ok {
		return withModel(code, input.Model)
	}
	if strings.HasPrefix(input.ErrorCode, "invalid_request") || input.ErrorCode == "plugin_request_invalid" {
		return Result{Code: CodeInvalidFormat}
	}
	return resultFromStatus(input.StatusCode)
}

// ClassifyKnown is Classify for text the gateway or a plugin wrote itself, which
// is safe to show: it only replaces what it recognizes by content.
func ClassifyKnown(input Input) (Result, bool) {
	code := matchRules(textRules, strings.ToLower(input.Raw))
	if code == "" {
		return Result{}, false
	}
	return withModel(code, input.Model), true
}

// ClassifyFailReason maps a failed task's stored reason to its customer-facing
// form. It returns no params, and an empty reason stays empty.
func ClassifyFailReason(reason string) Result {
	if strings.TrimSpace(reason) == "" {
		return Result{}
	}
	if code := matchRules(failReasonRules, strings.ToLower(reason)); code != "" {
		return Result{Code: code}
	}
	return Result{Code: CodeGenerationFailed}
}
