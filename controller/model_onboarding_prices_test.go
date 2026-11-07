package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
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

	models, group, descriptions, err := parseUpstreamPricing(body)

	require.NoError(t, err)
	assert.Equal(t, map[string]any{"vip": 1.2}, group)
	assert.Equal(t, map[string]string{"video-a": "ignored"}, descriptions)
	assert.Equal(t, map[string]map[string]any{"video-a": {
		"quota_type":  float64(1),
		"model_price": 0.5,
		"billing_plugin_variants": map[string]any{
			"px": map[string]any{"billing_mode": "tiered_expr", "billing_expr": "seconds * 1"},
		},
	}}, models)
}

func TestParseUpstreamPricingRejectsFailedResponse(t *testing.T) {
	_, _, _, err := parseUpstreamPricing([]byte(`{"success":false,"message":"denied"}`))

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
			{"model_name":"unserved-model","quota_type":1,"model_price":0.9},
			{"model_name":"pending-model","quota_type":1,"model_price":0.7}
		]}`))
	}))
	t.Cleanup(upstream.Close)
	baseURL := upstream.URL
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1, Type: 1, Key: "key-1", Status: common.ChannelStatusEnabled, Name: "supplier",
		Group: "default", Models: "new-model,priced-model", BaseURL: &baseURL,
		OtherSettings: `{"upstream_model_update_last_detected_models":["pending-model"]}`,
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
	pendingPrice := models["pending-model"].(map[string]any)
	assert.Equal(t, map[string]any{"ModelPrice": 0.7}, pendingPrice["pricing"], "a pending model shows its supplier price for review")
	assert.Equal(t, false, pendingPrice["in_sync"])
	assert.Empty(t, pricing("pending-model"), "a check never prices a model no channel serves")
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

	models = call(ApplyOnboardingUpstreamPrice, `{"model_name":"pending-model"}`)

	assert.Equal(t, model.PricingValues{"ModelPrice": 0.7}, pricing("pending-model"), "the admin can confirm a pending model's price")
	assert.Equal(t, true, models["pending-model"].(map[string]any)["in_sync"])
}

func TestSetModelOnboardingIgnoredMovesModelsAside(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1, Type: 1, Key: "key-1", Status: common.ChannelStatusEnabled, Name: "supplier",
		Group: "default", Models: "served-model",
		OtherSettings: `{"upstream_model_update_last_detected_models":["pending-a","pending-b"]}`,
	}).Error)
	set := func(body string) int {
		t.Helper()
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
		SetModelOnboardingIgnored(context)
		return recorder.Code
	}
	ignored := func() []string {
		t.Helper()
		overview, err := model.GetOnboardingOverview()
		require.NoError(t, err)
		names := []string{}
		for _, item := range overview.Items {
			if item.Ignored {
				names = append(names, item.ModelName)
			}
		}
		return names
	}

	assert.Equal(t, http.StatusBadRequest, set(`{"ignored":true}`))

	require.Equal(t, http.StatusOK, set(`{"model_names":["pending-a","pending-b"],"ignored":true}`))
	require.Equal(t, http.StatusOK, set(`{"model_names":["pending-a"],"ignored":true}`))
	assert.Equal(t, []string{"pending-a", "pending-b"}, ignored(), "ignoring twice keeps one entry")

	require.Equal(t, http.StatusOK, set(`{"model_names":["pending-a"],"ignored":false}`))
	assert.Equal(t, []string{"pending-b"}, ignored())
	assert.Equal(t, []string{"pending-a"}, prepareOnboardingDrafts(context.Background()), "only the restored model gets a draft")
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
	usageSchema: {seconds: {type: "number", unit: "second", description: "Video generation unit price"}},
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
			{"model_name":"unpriced-video","quota_type":0,"model_ratio":37.5},
			{"model_name":"listed-video","quota_type":0,"billing_mode":"tiered_expr","billing_expr":"tier(\"720p\", u(\"seconds\") * 0.3)"}
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
		Group: "default", Models: "old-video,listed-video", BaseURL: &baseURL, Setting: &setting,
		OtherSettings: `{"upstream_model_update_last_detected_models":["new-video","unpriced-video"]}`,
	}).Error)
	require.NoError(t, writeOnboardingOption(onboardingPricingTokenOption, map[string]string{"1": "supplier-token"}))
	pending := func() map[string]*model.OnboardingPluginAdaptation {
		t.Helper()
		overview, err := model.GetOnboardingOverview()
		require.NoError(t, err)
		adaptations := map[string]*model.OnboardingPluginAdaptation{}
		for _, item := range overview.Items {
			for _, channel := range slices.Concat(item.PendingChannels, item.Channels) {
				assert.Equal(t, "adapting", channel.PluginKey)
				missing := item.ModelName != "old-video" && (channel.PluginAdaptation == nil || !channel.PluginAdaptation.Adapted)
				assert.Equal(t, missing, channel.PluginMissing, item.ModelName)
				adaptations[item.ModelName] = channel.PluginAdaptation
			}
		}
		return adaptations
	}
	before := pending()
	require.Contains(t, before, "new-video")
	assert.Nil(t, before["new-video"])
	require.Contains(t, before, "listed-video")
	assert.Nil(t, before["listed-video"])

	result, err := checkUpstreamPrices(context.Background())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"new-video", "listed-video"}, result.Adapted)
	assert.Equal(t, 1, result.Waiting)
	// A model already listed on the channel is priced by the same check that
	// adapts the plugin to it.
	assert.Contains(t, result.Applied, "listed-video")
	listed, err := model.GetModelPricingSnapshot([]string{"listed-video"})
	require.NoError(t, err)
	assert.Equal(t, model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("720p", u("seconds") * 0.3)`},
		listed.Entries[0].Configured)

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
	assert.True(t, plugin.Meta.DeclaresModel("listed-video"))
	assert.Equal(t, map[string]any{
		"new-video":    map[string]any{"resolutions": []any{"480p", "720p"}},
		"listed-video": map[string]any{"resolutions": []any{"720p"}},
	}, model.TaskPluginModelEntries(model.GetTaskPluginModelExtras(), "adapting"))

	// A later check keeps the adapted entry instead of deriving it again.
	_, err = checkUpstreamPrices(context.Background())
	require.NoError(t, err)
	plugin, ok = jsplugin.DefaultRegistry.Get("adapting")
	require.True(t, ok)
	assert.True(t, plugin.Meta.DeclaresModel("new-video"))
}

func TestOnboardingDraftCopiesSiblingAndPolishesWithoutPrices(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	service.InitHttpClient()
	_, err := jsplugin.DefaultRegistry.Register(`
export const meta = {
	apiVersion: 1, key: "drafting", name: "Drafting", version: "1.0.0", author: {name: "Test"},
	models: ["E-video-2.5-x"], fetchMode: "per_task",
	usageSchema: {seconds: {type: "number", unit: "second"}, resolution: {enum: ["720p"]}},
	modelLimits: {"E-video-2.5-x": {minDuration: 4, maxDuration: 30, ratios: ["16:9", "9:16"]}},
};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister("drafting") })
	require.NoError(t, model.DB.Create(&model.Model{ModelName: "E-video-2.5", Icon: "Doubao.Color", Tags: "video", VendorID: 3, Description: "older"}).Error)
	var metadata []model.Model
	require.NoError(t, model.DB.Find(&metadata).Error)

	draft := buildOnboardingDraft(context.Background(), "E-video-2.5-x", metadata)

	assert.Equal(t, "E-video-2.5", draft.BasedOn)
	assert.Equal(t, "Doubao.Color", draft.Icon)
	assert.Equal(t, 3, draft.VendorID)
	assert.False(t, draft.Polished)
	assert.Equal(t, "<!-- lang:zh -->\n支持 720p，每段 4–30 秒，画幅 16:9 / 9:16。按秒计费。\n\n<!-- lang:en -->\nSupports 720p, 4–30 s per clip, aspect ratios 16:9 / 9:16. Billed per second.", draft.Description)

	reply := ""
	llmServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/chat/completions", r.URL.Path)
		assert.Equal(t, "Bearer llm-key", r.Header.Get("Authorization"))
		encoded, _ := common.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": reply}}}})
		_, _ = w.Write(encoded)
	}))
	t.Cleanup(llmServer.Close)
	require.NoError(t, writeOnboardingOption(onboardingDescriptionLLMOption, onboardingDescriptionLLM{BaseURL: llmServer.URL, Model: "writer", APIKey: "llm-key"}))
	polished := ""
	for _, locale := range onboardingDraftLocales {
		polished += "<!-- lang:" + locale + " -->\n720p, 4-30 s.\n"
	}
	reply = polished

	draft = buildOnboardingDraft(context.Background(), "E-video-2.5-x", metadata)

	assert.True(t, draft.Polished)
	assert.Equal(t, strings.TrimSpace(polished), draft.Description)

	reply = strings.Replace(polished, "720p, 4-30 s.", "720p, ¥0.97 per second.", 1)
	draft = buildOnboardingDraft(context.Background(), "E-video-2.5-x", metadata)

	assert.False(t, draft.Polished)
	assert.Equal(t, draftErrorLLMPrice, draft.Error)
	assert.Contains(t, draft.Description, "按秒计费")
}

func TestListDescriptionLLMModelsFallsBackToStoredKey(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	service.InitHttpClient()
	llmServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/models", r.URL.Path)
		if r.Header.Get("Authorization") != "Bearer stored-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-4o-mini"},{"id":"claude-x"},{"id":"gpt-4o-mini"},{"id":""}]}`))
	}))
	t.Cleanup(llmServer.Close)
	list := func(body string) map[string]any {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
		ListOnboardingDescriptionLLMModels(c)
		var response map[string]any
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		return response
	}

	assert.Equal(t, false, list(`{"base_url":"` + llmServer.URL + `"}`)["success"])

	require.NoError(t, writeOnboardingOption(onboardingDescriptionLLMOption, onboardingDescriptionLLM{BaseURL: "https://old.example", Model: "writer", APIKey: "stored-key"}))
	response := list(`{"base_url":"` + llmServer.URL + `/"}`)

	assert.Equal(t, true, response["success"])
	assert.Equal(t, []any{"claude-x", "gpt-4o-mini"}, response["data"])
	assert.Equal(t, false, list(`{"base_url":"` + llmServer.URL + `","api_key":"wrong"}`)["success"])
}

func TestFetchSupplierDescriptionPrefersListingChannelAndFlagsPrices(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	service.InitHttpClient()
	gin.SetMode(gin.TestMode)

	supplier := func(description string) *httptest.Server {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/api/pricing", r.URL.Path)
			assert.Equal(t, "Bearer supplier-token", r.Header.Get("Authorization"))
			encoded, _ := common.Marshal(map[string]any{"success": true, "data": []any{
				map[string]any{"model_name": "E-video", "description": description},
			}})
			_, _ = w.Write(encoded)
		}))
		t.Cleanup(server.Close)
		return server
	}
	other := supplier("from the other channel")
	listing := supplier("  720p, 4-30 s  ")
	otherURL, listingURL := other.URL, listing.URL
	require.NoError(t, model.DB.Create(&model.Channel{Id: 1, Name: "other", Key: "k", Status: common.ChannelStatusEnabled, BaseURL: &otherURL, Models: "E-else"}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 2, Name: "listing", Key: "k", Status: common.ChannelStatusEnabled, BaseURL: &listingURL, Models: "E-video"}).Error)

	fetch := func(name string) map[string]any {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"model_name":"`+name+`"}`))
		FetchOnboardingSupplierDescription(ctx)
		var response map[string]any
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		return response
	}

	assert.Equal(t, false, fetch("E-video")["success"], "no token configured")

	require.NoError(t, writeOnboardingOption(onboardingPricingTokenOption, map[string]string{"1": "supplier-token", "2": "supplier-token"}))
	found := fetch("E-video")["data"].(map[string]any)
	assert.Equal(t, "720p, 4-30 s", found["description"])
	assert.Equal(t, "listing", found["channel_name"])
	assert.Equal(t, false, found["prices_removed"])

	assert.Equal(t, "", fetch("E-unknown")["data"].(map[string]any)["description"])

	priced := supplier("720p，每秒 1元；前 5 张免费。")
	pricedURL := priced.URL
	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", 2).Update("base_url", pricedURL).Error)
	found = fetch("E-video")["data"].(map[string]any)
	assert.Equal(t, "720p；前 5 张免费。", found["description"])
	assert.Equal(t, true, found["prices_removed"])

	mixed := supplier("支持 720p，每秒 1元。\nSupports 720p, $1 per second.")
	mixedURL := mixed.URL
	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", 2).Update("base_url", mixedURL).Error)
	assert.Equal(t, "<!-- lang:zh -->\n支持 720p。\n\n<!-- lang:en -->\nSupports 720p.", fetch("E-video")["data"].(map[string]any)["description"])

	onlyPrice := supplier("每秒 1元。")
	onlyPriceURL := onlyPrice.URL
	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id IN ?", []int{1, 2}).Update("base_url", onlyPriceURL).Error)
	assert.Equal(t, "", fetch("E-video")["data"].(map[string]any)["description"])
}

func TestSplitDescriptionLanguages(t *testing.T) {
	cases := []struct{ name, input, expected string }{
		{"chinese then english", "支持 first_image_url。\nAccepts first_image_url.", "<!-- lang:zh -->\n支持 first_image_url。\n\n<!-- lang:en -->\nAccepts first_image_url."},
		{"english then chinese", "Accepts 720p.\n支持 720p。", "<!-- lang:zh -->\n支持 720p。\n\n<!-- lang:en -->\nAccepts 720p."},
		{"several lines and blanks", "支持 720p。\n\n支持 2K。\nAccepts 720p.\n\nAccepts 2K.", "<!-- lang:zh -->\n支持 720p。\n支持 2K。\n\n<!-- lang:en -->\nAccepts 720p.\nAccepts 2K."},
		{"only chinese stays shared", "支持 720p。\n支持 2K。", "支持 720p。\n支持 2K。"},
		{"only english stays shared", "Accepts 720p.\nAccepts 2K.", "Accepts 720p.\nAccepts 2K."},
		{"mixed within one line stays shared", "支持 720p。Accepts 720p.", "支持 720p。Accepts 720p."},
		{"existing blocks stay", "<!-- lang:zh -->\n支持 720p。\n<!-- lang:en -->\nAccepts 720p.", "<!-- lang:zh -->\n支持 720p。\n<!-- lang:en -->\nAccepts 720p."},
		{"empty", "", ""},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, splitDescriptionLanguages(testCase.input))
		})
	}
}

func TestStripDescriptionPrices(t *testing.T) {
	cases := []struct{ name, input, expected string }{
		{"no price stays untouched", "720p, 4-15 s. Ratio 16:9 / 9:16 (adaptive).", "720p, 4-15 s. Ratio 16:9 / 9:16 (adaptive)."},
		{
			"supplier text keeps its rules",
			"按时长和分辨率计费，每秒 720p $1 (¥7)、2K $2 (¥14)；参考视频另计，每秒 720p $1 (¥7)、2K $2 (¥14)，未返回秒数时按 15 秒计；输入图片前 5 张免费，超出每张 $3 (¥21)；参考音频免费。",
			"按时长和分辨率计费；参考视频另计，未返回秒数时按 15 秒计；输入图片前 5 张免费；参考音频免费。",
		},
		{
			"english text keeps its rules",
			"Billed by duration, per second: 720p $1.50 (¥7), 2K $2 (¥14); reference videos are charged on top, per second: 720p $1, and count as 15 seconds; audio is free.",
			"Billed by duration; reference videos are charged on top, and count as 15 seconds; audio is free.",
		},
		{"bracket price leaves its clause", "按秒计费（每秒 ¥1），支持 720p。", "按秒计费，支持 720p。"},
		{"bracket without price stays", "按秒计费 (adaptive)，每秒 ¥1。", "按秒计费 (adaptive)。"},
		{"whole sentence goes", "支持 720p。每秒 ¥1。支持 2K。", "支持 720p。支持 2K。"},
		{"leading clause goes", "每秒 ¥1，支持 720p。", "支持 720p。"},
		{"clause after a sentence end", "支持 720p。每秒 ¥1，支持 2K。", "支持 720p。支持 2K。"},
		{"trailing clause keeps the sentence end", "支持 720p，每秒 ¥1。", "支持 720p。"},
		{"thousands and decimals do not split", "Costs $1,000.50 each, 720p.", "720p."},
		{"amount in words", "每秒 1 元，720p", "720p"},
		{"language blocks keep their markers", "<!-- lang:zh -->\n720p，每秒 ¥1。\n<!-- lang:en -->\n720p, $1 per second.", "<!-- lang:zh -->\n720p。\n<!-- lang:en -->\n720p."},
		{"a line of only prices goes", "720p\n$1 per second.\n2K", "720p\n2K"},
		{"nothing left", "每秒 ¥1。", ""},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, stripDescriptionPrices(testCase.input))
		})
	}
}
