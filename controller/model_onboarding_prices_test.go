package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseUpstreamPricingKeepsOnlyPriceFields(t *testing.T) {
	body := []byte(`{"success":true,"group_ratio":{"vip":1.2},"data":[
		{"model_name":"video-a","quota_type":1,"model_price":0.5,"description":"ignored","enable_groups":["vip"],
		 "billing_plugin_variants":[{"plugin_key":"px","plugin_name":"PX","billing_mode":"tiered_expr","billing_expr":"seconds * 1","billing_usage_schema":{}}]},
		{"model_name":"  ","model_ratio":1}
	]}`)

	models, group, err := parseUpstreamPricing(body)

	require.NoError(t, err)
	assert.Equal(t, map[string]any{"vip": 1.2}, group)
	assert.Equal(t, map[string]map[string]any{"video-a": {
		"quota_type":  float64(1),
		"model_price": 0.5,
		"billing_plugin_variants": map[string]any{
			"px": map[string]any{"billing_mode": "tiered_expr", "billing_expr": "seconds * 1"},
		},
	}}, models)
}

func TestParseUpstreamPricingRejectsFailedResponse(t *testing.T) {
	_, _, err := parseUpstreamPricing([]byte(`{"success":false,"message":"denied"}`))

	assert.ErrorContains(t, err, "denied")
}

func TestDiffUpstreamPrices(t *testing.T) {
	baseline := map[string]map[string]any{
		"same":     {"model_ratio": 1.0},
		"repriced": {"model_ratio": 1.0, "completion_ratio": 4.0},
		"dropped":  {"model_price": 0.2},
	}
	latest := map[string]map[string]any{
		"same":     {"model_ratio": 1.0},
		"repriced": {"model_ratio": 1.5, "completion_ratio": 4.0},
		"new":      {"model_price": 0.3},
	}

	changes := diffUpstreamPrices(baseline, latest)

	require.Len(t, changes, 3)
	assert.Equal(t, "dropped", changes[0].ModelName)
	assert.Equal(t, "removed", changes[0].Kind)
	assert.Equal(t, "new", changes[1].ModelName)
	assert.Equal(t, "added", changes[1].Kind)
	assert.Equal(t, upstreamPriceChange{
		ModelName: "repriced",
		Kind:      "changed",
		Fields:    []upstreamPriceField{{Field: "model_ratio", Previous: 1.0, Current: 1.5}},
	}, changes[2])
}

func TestSnapshotChangesReportsGroupRatioChange(t *testing.T) {
	snapshot := upstreamPriceSnapshot{
		BaselineTime:  1,
		Baseline:      map[string]map[string]any{"m": {"model_ratio": 1.0}},
		BaselineGroup: map[string]any{"vip": 1.2},
		LatestTime:    2,
		Latest:        map[string]map[string]any{"m": {"model_ratio": 1.0}},
		LatestGroup:   map[string]any{"vip": 1.0},
	}

	changes := snapshotChanges(upstreamPriceChannel{ID: 3, Name: "PX"}, snapshot)

	require.Len(t, changes, 1)
	assert.Equal(t, "group_ratio", changes[0].Kind)
	assert.Equal(t, 3, changes[0].ChannelID)
	assert.Equal(t, []upstreamPriceField{{Field: "vip", Previous: 1.2, Current: 1.0}}, changes[0].Fields)
}

func TestUpstreamModelPricing(t *testing.T) {
	expr := "tier(\"base\", p * 2 + c * 8)"
	tests := []struct {
		name    string
		fields  map[string]any
		want    model.PricingValues
		wantErr string
	}{
		{
			name:   "model expression",
			fields: map[string]any{"quota_type": float64(0), "model_ratio": float64(1), "billing_mode": "tiered_expr", "billing_expr": expr},
			want:   model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr},
		},
		{
			name: "single plugin expression",
			fields: map[string]any{"quota_type": float64(1), "model_price": 0.5, "billing_plugin_variants": map[string]any{
				"px": map[string]any{"billing_mode": "tiered_expr", "billing_expr": expr},
			}},
			want: model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr},
		},
		{
			name: "plugins disagree",
			fields: map[string]any{"billing_plugin_variants": map[string]any{
				"a": map[string]any{"billing_mode": "tiered_expr", "billing_expr": expr},
				"b": map[string]any{"billing_mode": "tiered_expr", "billing_expr": "tier(\"base\", p)"},
			}},
			wantErr: upstreamPriceVariantsDiffer,
		},
		{
			name:   "fixed price",
			fields: map[string]any{"quota_type": float64(1), "model_price": 0.25},
			want:   model.PricingValues{"ModelPrice": 0.25},
		},
		{
			name:   "ratios",
			fields: map[string]any{"quota_type": float64(0), "model_ratio": 1.5, "completion_ratio": float64(4), "cache_ratio": 0.1},
			want:   model.PricingValues{"ModelRatio": 1.5, "CompletionRatio": float64(4), "CacheRatio": 0.1},
		},
		{
			name:    "no price",
			fields:  map[string]any{"quota_type": float64(1)},
			wantErr: upstreamPriceUnusable,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := upstreamModelPricing(test.fields)
			if test.wantErr != "" {
				require.EqualError(t, err, test.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, test.want, got)
		})
	}
}

func TestUpstreamPriceCheckPricesNewModelsAndTracksSupplierChanges(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	service.InitHttpClient()
	expr := "tier(\"base\", p * 2 + c * 8)"
	supplierPrice := "0.3"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer supplier-token", r.Header.Get("Authorization"))
		_, _ = w.Write([]byte(`{"success":true,"group_ratio":{"default":1},"data":[
			{"model_name":"new-model","quota_type":0,"model_ratio":1,"billing_mode":"tiered_expr","billing_expr":"tier(\"base\", p * 2 + c * 8)"},
			{"model_name":"priced-model","quota_type":1,"model_price":` + supplierPrice + `},
			{"model_name":"unserved-model","quota_type":1,"model_price":0.9}
		]}`))
	}))
	t.Cleanup(upstream.Close)
	baseURL := upstream.URL
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1, Type: 1, Key: "key-1", Status: common.ChannelStatusEnabled, Name: "supplier",
		Group: "default", Models: "new-model,priced-model", BaseURL: &baseURL,
	}).Error)
	require.NoError(t, writeOnboardingOption(onboardingPricingTokenOption, map[string]string{"1": "  "}))
	assert.False(t, upstreamPriceCheckHandler{}.Enabled(), "the scheduled check waits for a supplier token")
	require.NoError(t, writeOnboardingOption(onboardingPricingTokenOption, map[string]string{"1": "supplier-token"}))
	assert.True(t, upstreamPriceCheckHandler{}.Enabled())
	require.NoError(t, model.UpdateModelPricing([]model.ModelPricingChange{{
		ModelName: "priced-model", ExpectedVersion: model.ModelPricingVersion(model.PricingValues{}),
		Pricing: model.PricingValues{"ModelPrice": 0.2},
	}}))
	call := func(handler gin.HandlerFunc, body string) map[string]any {
		t.Helper()
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
		handler(context)
		var response struct {
			Success bool           `json:"success"`
			Message string         `json:"message"`
			Data    map[string]any `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.True(t, response.Success, response.Message)
		return response.Data["models"].(map[string]any)
	}
	pricing := func(name string) model.PricingValues {
		t.Helper()
		snapshot, err := model.GetModelPricingSnapshot([]string{name})
		require.NoError(t, err)
		return snapshot.Entries[0].Configured
	}

	models := call(CheckOnboardingUpstreamPrices, "")

	assert.Equal(t, model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr}, pricing("new-model"))
	assert.Equal(t, model.PricingValues{"ModelPrice": 0.2}, pricing("priced-model"))
	assert.NotContains(t, models, "unserved-model")
	assert.Equal(t, true, models["new-model"].(map[string]any)["in_sync"])
	assert.Equal(t, true, models["priced-model"].(map[string]any)["in_sync"],
		"a local price that differs from the supplier's text is not a supplier change")

	supplierPrice = "0.4"
	models = call(CheckOnboardingUpstreamPrices, "")

	assert.Equal(t, model.PricingValues{"ModelPrice": 0.2}, pricing("priced-model"), "a supplier change never rewrites a charged price")
	assert.Equal(t, false, models["priced-model"].(map[string]any)["in_sync"])

	models = call(AcknowledgeOnboardingUpstreamPrices, `{"model_names":["priced-model"]}`)

	assert.Equal(t, model.PricingValues{"ModelPrice": 0.2}, pricing("priced-model"))
	assert.Equal(t, true, models["priced-model"].(map[string]any)["in_sync"], "handled on every channel")

	supplierPrice = "0.5"
	call(CheckOnboardingUpstreamPrices, "")
	models = call(ApplyOnboardingUpstreamPrice, `{"model_name":"priced-model"}`)

	assert.Equal(t, model.PricingValues{"ModelPrice": 0.5}, pricing("priced-model"))
	assert.Equal(t, true, models["priced-model"].(map[string]any)["in_sync"])
}

const adaptingPluginSource = `
const MODELS = Object.assign({}, utils.modelExtras, {"old-video": {resolutions: ["720p", "1080p"]}});
export const meta = {
	apiVersion: 1,
	key: "adapting",
	name: "Adapting",
	version: "1.0.0",
	author: {name: "Test"},
	models: Object.keys(MODELS),
	fetchMode: "per_task",
};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
export function deriveModel(input) {
	const tiers = [...input.supplier.billingExpr.matchAll(/tier\("([^"]+)"/g)].map((match) => match[1]);
	if (!input.supplier.usageKeys.includes("seconds") || !tiers.length) return null;
	return {entry: {resolutions: tiers}, basedOn: input.declared[0]};
}
`

func TestUpstreamPriceCheckAdaptsTaskPluginToSupplierModels(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	require.NoError(t, model.DB.AutoMigrate(&model.TaskPlugin{}))
	service.InitHttpClient()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"success":true,"group_ratio":{},"data":[
			{"model_name":"old-video","quota_type":0,"billing_mode":"tiered_expr","billing_expr":"tier(\"720p\", u(\"seconds\") * 0.1)"},
			{"model_name":"new-video","quota_type":0,"billing_mode":"tiered_expr","billing_expr":"u(\"resolution\") == \"480p\" ? tier(\"480p\", u(\"seconds\") * 0.1) : tier(\"720p\", u(\"seconds\") * 0.2)"},
			{"model_name":"unpriced-video","quota_type":0,"model_ratio":37.5}
		]}`))
	}))
	t.Cleanup(upstream.Close)
	require.NoError(t, model.SaveTaskPlugin(&model.TaskPlugin{Key: "adapting", APIVersion: 1, Version: "1.0.0", Source: adaptingPluginSource, SourceHash: "adapting-1", Enabled: true}))
	require.NoError(t, model.ActivateTaskPlugin("adapting", "1.0.0"))
	require.NoError(t, syncTaskPluginsOnce())
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister("adapting") })
	baseURL, setting := upstream.URL, `{"task_plugin_key":"adapting"}`
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1, Type: constant.ChannelTypeTaskPlugin, Key: "key-1", Status: common.ChannelStatusEnabled, Name: "supplier",
		Group: "default", Models: "old-video", BaseURL: &baseURL, Setting: &setting,
		OtherSettings: `{"upstream_model_update_last_detected_models":["new-video","unpriced-video"]}`,
	}).Error)
	require.NoError(t, writeOnboardingOption(onboardingPricingTokenOption, map[string]string{"1": "supplier-token"}))
	pending := func() map[string]*model.OnboardingPluginAdaptation {
		t.Helper()
		overview, err := model.GetOnboardingOverview()
		require.NoError(t, err)
		adaptations := map[string]*model.OnboardingPluginAdaptation{}
		for _, item := range overview.Items {
			for _, channel := range item.PendingChannels {
				assert.Equal(t, "adapting", channel.PluginKey)
				assert.Equal(t, channel.PluginAdaptation == nil || !channel.PluginAdaptation.Adapted, channel.PluginMissing, item.ModelName)
				adaptations[item.ModelName] = channel.PluginAdaptation
			}
		}
		return adaptations
	}
	before := pending()
	require.Contains(t, before, "new-video")
	assert.Nil(t, before["new-video"])

	_, _, err := checkUpstreamPrices(context.Background())
	require.NoError(t, err)

	plugin, ok := jsplugin.DefaultRegistry.Get("adapting")
	require.True(t, ok)
	assert.True(t, plugin.Meta.DeclaresModel("new-video"))
	assert.False(t, plugin.Meta.DeclaresModel("unpriced-video"))
	after := pending()
	require.NotNil(t, after["new-video"])
	assert.True(t, after["new-video"].Adapted)
	assert.Equal(t, "old-video", after["new-video"].BasedOn)
	require.NotNil(t, after["unpriced-video"])
	assert.Equal(t, pluginAdaptErrorUnpriced, after["unpriced-video"].Error)
	assert.Equal(t, map[string]any{"new-video": map[string]any{"resolutions": []any{"480p", "720p"}}},
		model.TaskPluginModelEntries(model.GetTaskPluginModelExtras(), "adapting"))

	// A later check keeps the adapted entry instead of deriving it again.
	_, _, err = checkUpstreamPrices(context.Background())
	require.NoError(t, err)
	plugin, ok = jsplugin.DefaultRegistry.Get("adapting")
	require.True(t, ok)
	assert.True(t, plugin.Meta.DeclaresModel("new-video"))
}
