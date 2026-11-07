package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/usererror"
)

const logOtherUserContentPartsKey = "user_content_parts"

func parseLogOtherValues(value string) map[string]any {
	values := map[string]any{}
	if value != "" {
		if err := common.UnmarshalJsonStr(value, &values); err != nil {
			return map[string]any{}
		}
	}
	return values
}

func marshalLogOtherValues(log *Log, values map[string]any) {
	encoded, err := common.Marshal(values)
	if err != nil {
		common.SysError(common.LogText("failed to encode log other: %s", err.Error()))
		log.Other = "{}"
		return
	}
	log.Other = string(encoded)
}

func classifyErrorLog(log *Log, values map[string]any) usererror.Result {
	status, _ := values["status_code"].(float64)
	errorCode, _ := values["error_code"].(string)
	errorType, _ := values["error_type"].(string)
	return usererror.Classify(usererror.Input{
		Raw:        log.Content,
		StatusCode: int(status),
		ErrorCode:  errorCode,
		ErrorType:  errorType,
		Model:      log.ModelName,
	})
}

// applyUserErrorView replaces raw error text with what a log's owner may read.
// It runs when logs are read, so logs written earlier are covered too.
func applyUserErrorView(log *Log) {
	switch log.Type {
	case LogTypeError:
		values := parseLogOtherValues(log.Other)
		result := classifyErrorLog(log, values)
		log.Content = result.Message().Error()
		values[logOtherContentPartsKey] = []*common.Message{result.Message()}
		values["error_code"] = result.Code
		delete(values, "error_type")
		marshalLogOtherValues(log, values)
	case LogTypeRefund:
		values := parseLogOtherValues(log.Other)
		reason, _ := values["reason"].(string)
		if strings.TrimSpace(reason) == "" {
			return
		}
		values["reason"] = usererror.ClassifyFailReason(reason).Key()
		marshalLogOtherValues(log, values)
	}
}

// attachUserErrorPreview gives administrators what the owner of an error log
// sees, next to the raw content they keep.
func attachUserErrorPreview(log *Log) {
	if log.Type != LogTypeError {
		return
	}
	values := parseLogOtherValues(log.Other)
	values[logOtherUserContentPartsKey] = []*common.Message{classifyErrorLog(log, values).Message()}
	marshalLogOtherValues(log, values)
}
