package model

import (
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

type OnboardingChannel struct {
	Id     int    `json:"id"`
	Name   string `json:"name"`
	Type   int    `json:"type"`
	Group  string `json:"group"`
	Status int    `json:"status"`
	// PluginMissing marks a pending model that the channel's task plugin does
	// not list, so requests for it fail until the plugin is updated.
	PluginMissing bool `json:"plugin_missing,omitempty"`
	// PluginKey is the task plugin a Task Plugin channel is bound to.
	PluginKey string `json:"plugin_key,omitempty"`
	// PluginAdaptation is the host's last attempt to adapt that plugin to the
	// pending model from the supplier's pricing.
	PluginAdaptation *OnboardingPluginAdaptation `json:"plugin_adaptation,omitempty"`
}

type OnboardingPluginAdaptation struct {
	Adapted   bool   `json:"adapted"`
	BasedOn   string `json:"based_on,omitempty"`
	Error     string `json:"error,omitempty"`
	UpdatedAt int64  `json:"updated_at"`
}

// OnboardingModel is one concrete model name that is either offered by an
// upstream (pending add) or already configured on a channel, possibly one
// whose upstream no longer lists it (removed).
type OnboardingModel struct {
	ModelName       string              `json:"model_name"`
	PendingChannels []OnboardingChannel `json:"pending_channels"`
	RemovedChannels []OnboardingChannel `json:"removed_channels"`
	Channels        []OnboardingChannel `json:"channels"`
	MetadataID      int                 `json:"metadata_id"`
	MetadataRule    string              `json:"metadata_rule,omitempty"`
}

type OnboardingOverview struct {
	Items []OnboardingModel `json:"items"`
	Tags  []string          `json:"tags"`
}

// GetOnboardingOverview joins pending upstream additions, channel models and
// metadata records so the admin can finish a new model on one screen.
// Disabled channels are ignored on both sides.
func GetOnboardingOverview() (*OnboardingOverview, error) {
	var channels []Channel
	err := DB.Select("id", "name", "type", commonGroupCol, "status", "models", "setting", "settings").
		Where("status = ?", common.ChannelStatusEnabled).
		Order("id").
		Find(&channels).Error
	if err != nil {
		return nil, err
	}
	var metadata []Model
	if err := DB.Find(&metadata).Error; err != nil {
		return nil, err
	}

	extras := GetTaskPluginModelExtras()
	items := make(map[string]*OnboardingModel)
	item := func(name string) *OnboardingModel {
		if existing, ok := items[name]; ok {
			return existing
		}
		created := &OnboardingModel{ModelName: name, PendingChannels: []OnboardingChannel{}, RemovedChannels: []OnboardingChannel{}, Channels: []OnboardingChannel{}}
		items[name] = created
		return created
	}
	for _, channel := range channels {
		ref := OnboardingChannel{Id: channel.Id, Name: channel.Name, Type: channel.Type, Group: channel.Group, Status: channel.Status}
		configured := normalizeLookupValues(channel.GetModels())
		for _, name := range configured {
			entry := item(name)
			entry.Channels = append(entry.Channels, ref)
		}
		// Parsed here instead of GetOtherSettings, which rewrites malformed
		// settings with Save and would clobber the unselected columns.
		var settings dto.ChannelOtherSettings
		if channel.OtherSettings != "" {
			_ = common.UnmarshalJsonStr(channel.OtherSettings, &settings)
		}
		var plugin *jsplugin.LoadedPlugin
		pluginKey := ""
		if channel.Type == constant.ChannelTypeTaskPlugin {
			pluginKey = channel.GetSetting().TaskPluginKey
			plugin, _ = jsplugin.DefaultRegistry.Get(pluginKey)
		}
		for _, name := range normalizeLookupValues(settings.UpstreamModelUpdateLastDetectedModels) {
			if slices.Contains(configured, name) {
				continue
			}
			pending := ref
			pending.PluginMissing = plugin != nil && !plugin.Meta.DeclaresModel(name)
			pending.PluginKey = pluginKey
			if extra, ok := extras[pluginKey][name]; ok {
				pending.PluginAdaptation = &OnboardingPluginAdaptation{Adapted: extra.Entry != nil, BasedOn: extra.BasedOn, Error: extra.Error, UpdatedAt: extra.UpdatedAt}
			}
			entry := item(name)
			entry.PendingChannels = append(entry.PendingChannels, pending)
		}
		for _, name := range normalizeLookupValues(settings.UpstreamModelUpdateLastRemovedModels) {
			if !slices.Contains(configured, name) {
				continue
			}
			entry := item(name)
			entry.RemovedChannels = append(entry.RemovedChannels, ref)
		}
	}

	names := make([]string, 0, len(items))
	for name := range items {
		names = append(names, name)
	}
	slices.Sort(names)
	resolved := resolveModelMetadata(metadata, names)
	overview := &OnboardingOverview{Items: make([]OnboardingModel, 0, len(names))}
	for _, name := range names {
		entry := items[name]
		if record := resolved[name]; record != nil {
			if record.NameRule == NameRuleExact {
				entry.MetadataID = record.Id
			} else {
				entry.MetadataRule = record.ModelName
			}
		}
		overview.Items = append(overview.Items, *entry)
	}

	tags := make(map[string]bool)
	for _, record := range metadata {
		for tag := range strings.SplitSeq(record.Tags, ",") {
			if tag = strings.TrimSpace(tag); tag != "" {
				tags[tag] = true
			}
		}
	}
	overview.Tags = make([]string, 0, len(tags))
	for tag := range tags {
		overview.Tags = append(overview.Tags, tag)
	}
	slices.Sort(overview.Tags)
	return overview, nil
}
