package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/usererror"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

// ApplyUserFacingTaskError replaces a task error's text with its customer-facing
// form. Callers record the raw text first; taskErr.Error keeps it for the logs.
func ApplyUserFacingTaskError(c *gin.Context, taskErr *dto.TaskError) {
	if taskErr == nil || taskErr.MessageKey != "" {
		return
	}
	result := usererror.Classify(usererror.Input{
		Raw:        taskErr.Message,
		StatusCode: taskErr.StatusCode,
		ErrorCode:  taskErr.Code,
		Model:      c.GetString("original_model"),
	})
	taskErr.Code = result.Code
	taskErr.Message = result.Translate(i18n.StatedLang(c))
	taskErr.MessageKey = result.Key()
	taskErr.MessageParams = result.Params
}

// ApplyKnownUserFacingTaskError does the same for a detail written by a plugin
// hook, which stays as written unless it states a known error.
func ApplyKnownUserFacingTaskError(c *gin.Context, taskErr *dto.TaskError) {
	result, known := usererror.ClassifyKnown(usererror.Input{Raw: taskErr.Message, Model: c.GetString("original_model")})
	if !known {
		return
	}
	taskErr.Code = result.Code
	taskErr.Message = result.Translate(i18n.StatedLang(c))
	taskErr.MessageKey = result.Key()
	taskErr.MessageParams = result.Params
}

// UserFacingFailReason returns a failed task's reason as its owner may read it.
func UserFacingFailReason(c *gin.Context, reason string) string {
	result := usererror.ClassifyFailReason(reason)
	if result.Code == "" {
		return ""
	}
	return result.Translate(i18n.StatedLang(c))
}

// BuildClientTaskPluginView is BuildTaskPluginView for a view that a plugin
// renders into a client response, so its fail reason must not be the raw text.
func BuildClientTaskPluginView(c *gin.Context, task *model.Task) (dto.TaskView, error) {
	view, err := BuildTaskPluginView(task)
	if err != nil {
		return view, err
	}
	view.FailReason = UserFacingFailReason(c, view.FailReason)
	return view, nil
}

// UserFacingError is the customer-facing form of a relay error. It is nil for
// errors the gateway wrote itself, which are already translated and safe.
type UserFacingError struct {
	code    string
	message string
	key     string
	params  map[string]any
}

// UserFacingRelayError classifies an error that came from upstream.
func UserFacingRelayError(c *gin.Context, err *types.NewAPIError) *UserFacingError {
	if err == nil {
		return nil
	}
	local := err.GetErrorType() == types.ErrorTypeNewAPIError
	if local && !types.IsChannelError(err) && err.GetErrorCode() != types.ErrorCodeDoRequestFailed {
		return nil
	}
	result := usererror.Classify(usererror.Input{
		Raw:        err.Error(),
		StatusCode: err.StatusCode,
		ErrorCode:  string(err.GetErrorCode()),
		ErrorType:  string(err.GetErrorType()),
		Model:      c.GetString("original_model"),
	})
	return &UserFacingError{
		code:    result.Code,
		message: common.MessageWithRequestId(result.Translate(i18n.StatedLang(c)), c.GetString(common.RequestIdKey)),
		key:     result.Key(),
		params:  result.Params,
	}
}

// ApplyToOpenAI returns the error with the customer-facing text in place.
func (u *UserFacingError) ApplyToOpenAI(openAIError types.OpenAIError) types.OpenAIError {
	if u == nil {
		return openAIError
	}
	openAIError.Message = u.message
	openAIError.Code = u.code
	openAIError.Param = ""
	openAIError.Metadata = nil
	return openAIError
}

// ApplyToClaude returns the error with the customer-facing text in place.
func (u *UserFacingError) ApplyToClaude(claudeError types.ClaudeError) types.ClaudeError {
	if u == nil {
		return claudeError
	}
	claudeError.Message = u.message
	return claudeError
}

// OpenAIErrorBody adds the keys the web console translates to the OpenAI shape.
func (u *UserFacingError) OpenAIErrorBody(openAIError types.OpenAIError) any {
	if u == nil {
		return openAIError
	}
	applied := u.ApplyToOpenAI(openAIError)
	return gin.H{
		"message":        applied.Message,
		"type":           applied.Type,
		"param":          applied.Param,
		"code":           applied.Code,
		"message_key":    u.key,
		"message_params": u.params,
	}
}
