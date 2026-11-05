package controller

import (
	"context"
	"errors"
	"maps"
	"slices"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
)

const (
	pluginAdaptErrorNoDerive      = "This plugin cannot adapt to new models by itself"
	pluginAdaptErrorUnpriced      = "The supplier has not priced this model yet"
	pluginAdaptErrorNotDerived    = "The plugin could not work out this model's parameters"
	pluginAdaptErrorEntryRejected = "The plugin rejected the parameters it worked out for this model"
)

// adaptPluginsToSupplierModels lets the task plugin of each Task Plugin
// channel take the supplier models it does not declare, whether the supplier
// newly offers them or the admin already listed them on the channel, so the
// admin does not edit the plugin for them. The plugin's deriveModel hook turns the supplier's
// price expression into its own model-table entry; the host keeps the entry
// and compiles it into the plugin as utils.modelExtras. Entries are derived
// once; a model the plugin already declares is left alone. It returns the
// models adapted by this call and how many pending models still wait.
func adaptPluginsToSupplierModels(ctx context.Context, snapshots map[string]upstreamPriceSnapshot) (adapted []string, waiting int) {
	adapted = []string{}
	overview, err := model.GetOnboardingOverview()
	if err != nil {
		common.SysError(common.LogText("failed to adapt task plugins to supplier models: %s", err.Error()))
		return adapted, 0
	}
	extras := model.GetTaskPluginModelExtras()
	sources := map[string]string{}
	entriesChanged, recordsChanged := false, false
	now := common.GetTimestamp()
	for _, item := range overview.Items {
		if item.Ignored {
			continue
		}
		for _, channel := range slices.Concat(item.PendingChannels, item.Channels) {
			if channel.PluginKey == "" {
				continue
			}
			name := item.ModelName
			previous, recorded := extras[channel.PluginKey][name]
			if previous.Entry != nil {
				continue
			}
			plugin, ok := jsplugin.DefaultRegistry.Get(channel.PluginKey)
			if !ok || plugin.Meta.DeclaresModel(name) {
				continue
			}
			record := model.TaskPluginModelExtra{UpdatedAt: now}
			expression, _ := snapshots[strconv.Itoa(channel.Id)].Latest[name]["billing_expr"].(string)
			switch {
			case !plugin.Engine.HasExport("deriveModel"):
				record.Error = pluginAdaptErrorNoDerive
			case expression == "":
				record.Error = pluginAdaptErrorUnpriced
			default:
				record = derivePluginModel(ctx, plugin, name, expression, extras, sources)
				record.UpdatedAt = now
			}
			if record.Entry == nil {
				waiting++
			} else {
				adapted = append(adapted, name)
			}
			if recorded && record.Entry == nil && record.Error == previous.Error {
				continue
			}
			if extras[channel.PluginKey] == nil {
				extras[channel.PluginKey] = map[string]model.TaskPluginModelExtra{}
			}
			extras[channel.PluginKey][name] = record
			recordsChanged = true
			entriesChanged = entriesChanged || record.Entry != nil
		}
	}
	if !recordsChanged {
		return adapted, waiting
	}
	if err := writeOnboardingOption(model.TaskPluginModelExtrasOption, extras); err != nil {
		common.SysError(common.LogText("failed to save adapted task plugin models: %s", err.Error()))
		return []string{}, waiting + len(adapted)
	}
	if entriesChanged {
		if err := syncTaskPluginsOnceContext(ctx); err != nil {
			common.SysError(err.Error())
		}
	}
	return adapted, waiting
}

// derivePluginModel asks the plugin for its entry of one supplier model and
// keeps it only when the plugin still loads with it.
func derivePluginModel(ctx context.Context, plugin *jsplugin.LoadedPlugin, name, expression string, extras map[string]map[string]model.TaskPluginModelExtra, sources map[string]string) model.TaskPluginModelExtra {
	key := plugin.Meta.Key
	usageKeys := slices.Sorted(maps.Keys(billingexpr.UsedUsageKeys(expression)))
	result, err := plugin.Engine.Call(ctx, "deriveModel", map[string]any{
		"model":    name,
		"declared": plugin.Meta.Models,
		"supplier": map[string]any{"billingExpr": expression, "usageKeys": usageKeys},
	})
	var derived struct {
		Entry   any    `json:"entry"`
		BasedOn string `json:"basedOn"`
	}
	if err == nil && result != nil {
		encoded, encodeErr := common.Marshal(result)
		if encodeErr == nil {
			err = common.Unmarshal(encoded, &derived)
		} else {
			err = encodeErr
		}
	}
	if err != nil {
		common.SysError(common.LogText("task plugin %s could not derive model %s: %s", key, name, err.Error()))
	}
	if err != nil || derived.Entry == nil {
		return model.TaskPluginModelExtra{Error: pluginAdaptErrorNotDerived}
	}

	source, ok := sources[key]
	if !ok {
		source = activeTaskPluginSource(key)
		sources[key] = source
	}
	entries := model.TaskPluginModelEntries(extras, key)
	entries[name] = derived.Entry
	compiled, err := jsplugin.CompilePlugin(source, jsplugin.Options{Key: key, Version: plugin.Meta.Version, ModelExtras: entries})
	if err == nil && !compiled.Meta.DeclaresModel(name) {
		err = errPluginIgnoredEntry
	}
	if err != nil {
		common.SysError(common.LogText("task plugin %s rejected its derived entry for model %s: %s", key, name, err.Error()))
		return model.TaskPluginModelExtra{Error: pluginAdaptErrorEntryRejected}
	}
	return model.TaskPluginModelExtra{Entry: derived.Entry, BasedOn: derived.BasedOn}
}

var errPluginIgnoredEntry = errors.New("the plugin does not declare the model with its derived entry")

func activeTaskPluginSource(key string) string {
	plugins, err := model.ListActiveTaskPlugins()
	if err != nil {
		return ""
	}
	for _, plugin := range plugins {
		if plugin.Key != key {
			continue
		}
		source, err := model.GetTaskPluginSource(plugin.Id)
		if err != nil {
			return ""
		}
		return string(source)
	}
	return ""
}
