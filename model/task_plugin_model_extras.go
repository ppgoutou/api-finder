package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// TaskPluginModelExtrasOption keeps, per plugin key, the models the host
// adapted a plugin to from its supplier's pricing. A plugin reads the entries
// as utils.modelExtras while its module evaluates.
const TaskPluginModelExtrasOption = "TaskPluginModelExtras"

// TaskPluginModelExtra is the last adaptation attempt for one model. Entry is
// the plugin's own model-table entry returned by its deriveModel hook; a
// failed or waiting attempt keeps only Error.
type TaskPluginModelExtra struct {
	Entry     any    `json:"entry,omitempty"`
	BasedOn   string `json:"based_on,omitempty"`
	Error     string `json:"error,omitempty"`
	UpdatedAt int64  `json:"updated_at"`
}

func GetTaskPluginModelExtras() map[string]map[string]TaskPluginModelExtra {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[TaskPluginModelExtrasOption]
	common.OptionMapRWMutex.RUnlock()
	extras := map[string]map[string]TaskPluginModelExtra{}
	if strings.TrimSpace(raw) != "" {
		_ = common.UnmarshalJsonStr(raw, &extras)
	}
	return extras
}

// TaskPluginModelEntries returns the adapted entries of one plugin, the value
// handed to it as utils.modelExtras.
func TaskPluginModelEntries(extras map[string]map[string]TaskPluginModelExtra, pluginKey string) map[string]any {
	entries := map[string]any{}
	for name, extra := range extras[pluginKey] {
		if extra.Entry != nil {
			entries[name] = extra.Entry
		}
	}
	return entries
}
