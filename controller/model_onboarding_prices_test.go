package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"

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
		scale   string
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
		{
			name:   "scaled expression keeps its shape",
			fields: map[string]any{"billing_mode": "tiered_expr", "billing_expr": expr},
			scale:  "0.5",
			want:   model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": "tier(\"base\", p * 1 + c * 4)"},
		},
		{
			name:   "scaled fixed price",
			fields: map[string]any{"quota_type": float64(1), "model_price": 0.25},
			scale:  "0.5",
			want:   model.PricingValues{"ModelPrice": 0.125},
		},
		{
			name:   "scaled ratios keep relative ratios",
			fields: map[string]any{"quota_type": float64(0), "model_ratio": 1.5, "completion_ratio": float64(4), "cache_ratio": 0.1},
			scale:  "0.5",
			want:   model.PricingValues{"ModelRatio": 0.75, "CompletionRatio": float64(4), "CacheRatio": 0.1},
		},
		{
			name:    "expression without a price literal is not guessed",
			fields:  map[string]any{"billing_mode": "tiered_expr", "billing_expr": "tier(\"base\", p)"},
			scale:   "0.5",
			wantErr: upstreamPriceUnconvertible,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			scale := decimal.NewFromInt(1)
			if test.scale != "" {
				scale = decimal.RequireFromString(test.scale)
			}
			got, err := upstreamModelPricing(test.fields, scale)
			if test.wantErr != "" {
				require.EqualError(t, err, test.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, test.want, got)
		})
	}
}

func TestUpstreamCurrencyPriceScale(t *testing.T) {
	previous := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 8
	t.Cleanup(func() { operation_setting.USDExchangeRate = previous })
	tests := []struct {
		name     string
		currency *upstreamCurrency
		want     string
		wantErr  string
	}{
		{name: "not read yet", currency: nil, wantErr: upstreamPriceCurrencyUnknown},
		{name: "CNY at rate 1 means yuan", currency: &upstreamCurrency{DisplayType: "CNY", Rate: 1}, want: "0.125"},
		{name: "CNY at the local rate means dollars", currency: &upstreamCurrency{DisplayType: "CNY", Rate: 8}, want: "1"},
		{name: "CNY without a rate", currency: &upstreamCurrency{DisplayType: "CNY"}, wantErr: upstreamPriceCurrencyUnsupported},
		{name: "USD", currency: &upstreamCurrency{DisplayType: "USD", Rate: 7.3}, want: "1"},
		{name: "old new-api without display type", currency: &upstreamCurrency{}, want: "1"},
		{name: "custom currency", currency: &upstreamCurrency{DisplayType: "CUSTOM", Rate: 1}, wantErr: upstreamPriceCurrencyUnsupported},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := test.currency.priceScale()
			if test.wantErr != "" {
				require.EqualError(t, err, test.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, test.want, got.String())
		})
	}
}

// A supplier displaying CNY at rate 1 writes yuan in its expressions; the
// check must not charge them as dollars.
func TestUpstreamPriceCheckConvertsSupplierCurrency(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	service.InitHttpClient()
	previous := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 8
	t.Cleanup(func() { operation_setting.USDExchangeRate = previous })
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_display_type":"CNY","usd_exchange_rate":1}}`))
			return
		case "/api/token/search":
			assert.Equal(t, "key-1", r.URL.Query().Get("token"))
			_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"group":""}]}}`))
			return
		case "/api/user/self":
			_, _ = w.Write([]byte(`{"success":true,"data":{"group":"vip"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"group_ratio":{"default":1,"vip":0.5},"data":[
			{"model_name":"cny-expr","quota_type":0,"model_ratio":37.5,"billing_mode":"tiered_expr","billing_expr":"tier(\"base\", p * 0.8 + c * 1.6)"},
			{"model_name":"cny-fixed","quota_type":1,"model_price":4}
		]}`))
	}))
	t.Cleanup(upstream.Close)
	baseURL := upstream.URL
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1, Type: 1, Key: "key-1", Status: common.ChannelStatusEnabled, Name: "cny-supplier",
		Group: "default", Models: "cny-expr,cny-fixed", BaseURL: &baseURL,
	}).Error)
	require.NoError(t, writeOnboardingOption(onboardingPricingTokenOption, map[string]string{"1": "supplier-token"}))
	pricing := func(name string) model.PricingValues {
		t.Helper()
		snapshot, err := model.GetModelPricingSnapshot([]string{name})
		require.NoError(t, err)
		return snapshot.Entries[0].Configured
	}

	result, err := checkUpstreamPrices(context.Background())
	require.NoError(t, err)

	assert.ElementsMatch(t, []string{"cny-expr", "cny-fixed"}, result.Applied)
	assert.Equal(t, model.PricingValues{
		"billing_setting.billing_mode": "tiered_expr",
		"billing_setting.billing_expr": "tier(\"base\", p * 0.05 + c * 0.1)",
	}, pricing("cny-expr"), "0.8 yuan is 0.1 dollars at rate 8, and the key's group pays half")
	assert.Equal(t, model.PricingValues{"ModelPrice": 0.25}, pricing("cny-fixed"))

	snapshots := readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption)
	snapshot := snapshots["1"]
	assert.Equal(t, "tier(\"base\", p * 0.8 + c * 1.6)", snapshot.Latest["cny-expr"]["billing_expr"], "snapshots keep the supplier's own text")
	assert.Equal(t, &upstreamKeyGroup{Name: "vip", Ratio: 0.5}, snapshot.LatestKeyGroup)
	withoutGroup := snapshot
	withoutGroup.LatestKeyGroup = nil
	groupless := upstreamModelPrices(upstreamPriceChannelRows([]*model.Channel{{Id: 1, Name: "cny-supplier", Models: "cny-expr", BaseURL: &baseURL}}),
		map[string]upstreamPriceSnapshot{"1": withoutGroup})
	assert.Equal(t, upstreamPriceKeyGroupUnknown, groupless["cny-expr"].Error, "a snapshot without the key's group offers no price to apply")
	snapshot.LatestCurrency = nil
	snapshots["1"] = snapshot
	prices := upstreamModelPrices(upstreamPriceChannelRows([]*model.Channel{{Id: 1, Name: "cny-supplier", Models: "cny-expr", BaseURL: &baseURL}}), snapshots)
	assert.Equal(t, upstreamPriceCurrencyUnknown, prices["cny-expr"].Error, "a snapshot without a currency offers no price to apply")
	assert.Nil(t, prices["cny-expr"].Pricing)
}

func TestUpstreamPriceCheckRepricesModelsWhenTheKeyGroupRatioChanges(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	service.InitHttpClient()
	keyGroup, groupRatio := "doubao", `{"doubao":0.5}`
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_display_type":"USD","usd_exchange_rate":7.3}}`))
		case "/api/token/search":
			_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"group":"` + keyGroup + `"}]}}`))
		default:
			_, _ = w.Write([]byte(`{"success":true,"group_ratio":` + groupRatio + `,"data":[
				{"model_name":"video","quota_type":1,"model_price":2},
				{"model_name":"unserved","quota_type":1,"model_price":3}
			]}`))
		}
	}))
	t.Cleanup(upstream.Close)
	baseURL := upstream.URL
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1, Type: 1, Key: "key-1", Status: common.ChannelStatusEnabled, Name: "supplier",
		Group: "default", Models: "video", BaseURL: &baseURL,
	}).Error)
	require.NoError(t, writeOnboardingOption(onboardingPricingTokenOption, map[string]string{"1": "supplier-token"}))
	check := func() upstreamPriceSnapshot {
		t.Helper()
		_, err := checkUpstreamPrices(context.Background())
		require.NoError(t, err)
		return readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption)["1"]
	}
	pricing := func() model.PricingValues {
		t.Helper()
		snapshot, err := model.GetModelPricingSnapshot([]string{"video"})
		require.NoError(t, err)
		return snapshot.Entries[0].Configured
	}

	snapshot := check()
	require.Equal(t, model.PricingValues{"ModelPrice": 1.0}, pricing())
	assert.Empty(t, snapshotChanges(upstreamPriceChannel{ID: 1}, snapshot))
	assert.NotContains(t, snapshot.Latest["unserved"], upstreamKeyGroupRatioField, "only models the channel offers carry the key's ratio")

	keyGroup, groupRatio = "doubaoDefault", `{"doubaoDefault":0.75}`
	snapshot = check()

	assert.Equal(t, model.PricingValues{"ModelPrice": 1.0}, pricing(), "a ratio change never rewrites a charged price")
	changes := snapshotChanges(upstreamPriceChannel{ID: 1}, snapshot)
	require.Len(t, changes, 2)
	assert.Equal(t, upstreamPriceChange{ChannelID: 1, ModelName: "video", Kind: "changed", Fields: []upstreamPriceField{
		{Field: upstreamKeyGroupRatioField, Previous: 0.5, Current: 0.75},
	}}, changes[0])
	assert.Equal(t, "group_ratio", changes[1].Kind)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"model_name":"video"}`))
	ApplyOnboardingUpstreamPrice(c)
	require.Contains(t, recorder.Body.String(), `"success":true`)

	assert.Equal(t, model.PricingValues{"ModelPrice": 1.5}, pricing(), "applying charges the new ratio")
	snapshot = readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption)["1"]
	assert.Len(t, snapshotChanges(upstreamPriceChannel{ID: 1}, snapshot), 1, "only the supplier-level group row is left")
}

func TestStampKeyGroupRatioBackfillsBaselinesFromTheGroupList(t *testing.T) {
	snapshot := func(baselineGroup map[string]any) upstreamPriceSnapshot {
		return upstreamPriceSnapshot{
			Baseline:       map[string]map[string]any{"video": {"model_price": 2.0}},
			BaselineGroup:  baselineGroup,
			Latest:         map[string]map[string]any{"video": {"model_price": 2.0}},
			LatestKeyGroup: &upstreamKeyGroup{Name: "doubao", Ratio: 0.73},
		}
	}

	sameGroup := snapshot(map[string]any{"doubao": 0.73})
	sameGroup.stampKeyGroupRatio([]string{"video"})
	assert.Empty(t, diffUpstreamPrices(sameGroup.Baseline, sameGroup.Latest), "an unchanged key group is not a price change")

	renamed := snapshot(map[string]any{"legacy": 0.7})
	renamed.stampKeyGroupRatio([]string{"video"})
	assert.Equal(t, []upstreamPriceChange{{ModelName: "video", Kind: "changed", Fields: []upstreamPriceField{
		{Field: upstreamKeyGroupRatioField, Previous: nil, Current: 0.73},
	}}}, diffUpstreamPrices(renamed.Baseline, renamed.Latest), "a group missing from the baseline list shows the model for review")
}

func TestUpstreamPriceCheckPricesNewModelsAndTracksSupplierChanges(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	service.InitHttpClient()
	expr := "tier(\"base\", p * 2 + c * 8)"
	supplierPrice := "0.3"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/status" {
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_display_type":"USD","usd_exchange_rate":7.3}}`))
			return
		}
		if r.URL.Path == "/api/token/search" {
			_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"group":"default"}]}}`))
			return
		}
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
		if r.URL.Path == "/api/status" {
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_display_type":"USD"}}`))
			return
		}
		if r.URL.Path == "/api/token/search" {
			_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"group":"default"}]}}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"group_ratio":{"default":1},"data":[
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

const tokenVideoPluginSource = `
export const meta = {
	apiVersion: 1,
	key: "token-video",
	name: "Token video",
	version: "1.0.0",
	author: {name: "Test"},
	models: ["video"],
	fetchMode: "per_task",
	usageSchema: {
		tokens: {type: "number", unit: "token", description: "Billing token unit price"},
		video_input: {enum: ["none", "video"], description: "Reference video"},
	},
	usageExamples: [{label: "480p · 10s", facts: {tokens: 100000, video_input: "none"}}],
};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`

func TestOnboardingPriceMarkupChargesAFixedAmountAfterTheGroupRatio(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	require.NoError(t, model.DB.AutoMigrate(&model.TaskPlugin{}))
	require.NoError(t, model.SaveTaskPlugin(&model.TaskPlugin{Key: "token-video", APIVersion: 1, Version: "1.0.0", Source: tokenVideoPluginSource, SourceHash: "token-video-1", Enabled: true}))
	require.NoError(t, model.ActivateTaskPlugin("token-video", "1.0.0"))
	require.NoError(t, syncTaskPluginsOnce())
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister("token-video") })
	previousRatios := ratio_setting.GroupRatio2JSONString()
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatios)) })
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1.2}`))
	const supplier = `u("video_input") == "none" ? tier("480p·none", u("tokens") * 28 / 1000000) : tier("480p·video", u("tokens") * 16 / 1000000)`
	require.NoError(t, model.UpdateModelPricing([]model.ModelPricingChange{{
		ModelName: "video", ExpectedVersion: model.ModelPricingVersion(model.PricingValues{}),
		Pricing: model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": supplier},
	}}))
	expression := func() string {
		t.Helper()
		snapshot, err := model.GetModelPricingSnapshot([]string{"video"})
		require.NoError(t, err)
		return snapshot.Entries[0].Configured["billing_setting.billing_expr"].(string)
	}
	// customerCost is what a 10-second order costs a default-group customer:
	// the expression's dollars times the group ratio.
	customerCost := func(expr string, videoInput string) float64 {
		t.Helper()
		cost, _, err := billingexpr.RunExprWithRequest(expr, billingexpr.TokenParams{}, billingexpr.RequestInput{Usage: map[string]any{"tokens": 100000.0, "video_input": videoInput}})
		require.NoError(t, err)
		return cost * ratio_setting.PublicPriceFactor()
	}
	postMarkup := func(body string) (bool, map[string]any) {
		t.Helper()
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPut, "/", strings.NewReader(body))
		SetOnboardingPriceMarkup(context)
		var response struct {
			Success bool           `json:"success"`
			Message string         `json:"message"`
			Data    map[string]any `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		return response.Success, response.Data
	}
	setMarkup := func(body string) map[string]any {
		t.Helper()
		ok, data := postMarkup(body)
		require.True(t, ok)
		return data
	}

	// 10 seconds of 480p·video cost $1.6 × 1.2 = $1.92 at the ratio price.
	ok, _ := postMarkup(`{"model_name":"video","tiers":{"480p·video":{"field":"tokens","per_second":-0.192,"tokens_per_second":10000}}}`)
	assert.False(t, ok, "a discount down to a free tier is rejected")

	report := setMarkup(`{"model_name":"video","tiers":{"480p·none":{"field":"tokens","per_second":0.1,"tokens_per_second":10000},"480p·video":{"field":"tokens","per_second":-0.05,"tokens_per_second":10000}}}`)

	assert.InDelta(t, 2.8*1.2+1, customerCost(expression(), "none"), 1e-6, "10 seconds at $0.1/s on top of the ratio price")
	assert.InDelta(t, 1.6*1.2-0.5, customerCost(expression(), "video"), 1e-6, "10 seconds at $0.05/s off the ratio price")

	setMarkup(`{"model_name":"video","tiers":{"480p·none":{"field":"tokens","per_second":0.1,"tokens_per_second":10000}}}`)

	assert.InDelta(t, 1.6*1.2, customerCost(expression(), "video"), 1e-6, "a tier without a markup keeps the ratio price")
	assert.Equal(t, 1.2, report["price_factor"])
	assert.Equal(t, supplier, report["markups"].(map[string]any)["video"].(map[string]any)["base_expr"])

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1.5}`))
	assert.Empty(t, recomposeOnboardingMarkups())

	assert.InDelta(t, 2.8*1.5+1, customerCost(expression(), "none"), 1e-6, "a new ratio keeps the fixed markup")

	const newSupplier = `u("video_input") == "none" ? tier("480p·none", u("tokens") * 30 / 1000000) : tier("480p·video", u("tokens") * 18 / 1000000)`
	pricing, markup, err := markedUpPricing("video", model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": newSupplier})
	require.NoError(t, err)
	require.NotNil(t, markup)
	assert.Equal(t, newSupplier, markup.BaseExpr)
	assert.InDelta(t, 3.0*1.5+1, customerCost(pricing["billing_setting.billing_expr"].(string), "none"), 1e-6, "a new supplier price keeps the markup")

	_, _, err = markedUpPricing("video", model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("720p", u("tokens") * 30 / 1000000)`})
	assert.Error(t, err, "a supplier price without the marked-up tier is not applied silently")

	setMarkup(`{"model_name":"video","tiers":{}}`)

	assert.Equal(t, supplier, expression(), "clearing the markup restores the supplier expression")
	assert.NotContains(t, readOnboardingOption[map[string]onboardingMarkup](onboardingMarkupOption), "video")
}

func TestOnboardingPriceMarkupAddsAFixedAmountPerImage(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	previousRatios := ratio_setting.GroupRatio2JSONString()
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatios)) })
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1.25}`))
	require.NoError(t, model.UpdateModelPricing([]model.ModelPricingChange{{
		ModelName: "image", ExpectedVersion: model.ModelPricingVersion(model.PricingValues{}),
		Pricing: model.PricingValues{"ModelPrice": 0.3},
	}}))
	modelPrice := func() float64 {
		t.Helper()
		snapshot, err := model.GetModelPricingSnapshot([]string{"image"})
		require.NoError(t, err)
		return snapshot.Entries[0].Configured["ModelPrice"].(float64)
	}
	postMarkup := func(body string) bool {
		t.Helper()
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodPut, "/", strings.NewReader(body))
		SetOnboardingPriceMarkup(context)
		var response struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		return response.Success
	}
	customerCost := func() float64 { return modelPrice() * ratio_setting.PublicPriceFactor() }

	// One image costs $0.3 × 1.25 = $0.375 at the ratio price.
	assert.False(t, postMarkup(`{"model_name":"image","per_request":-0.375}`), "a discount down to a free image is rejected")
	assert.False(t, postMarkup(`{"model_name":"image","tiers":{"x":{"field":"n","per_second":1}}}`), "a fixed price takes no tier markup")
	assert.InDelta(t, 0.3, modelPrice(), 1e-9, "a rejected markup leaves the price alone")

	require.True(t, postMarkup(`{"model_name":"image","per_request":0.05}`))
	assert.InDelta(t, 0.375+0.05, customerCost(), 1e-9, "$0.05 per image on top of the ratio price")

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1.5}`))
	assert.Empty(t, recomposeOnboardingMarkups())
	assert.InDelta(t, 0.45+0.05, customerCost(), 1e-9, "a new ratio keeps the fixed markup")

	pricing, markup, err := markedUpPricing("image", model.PricingValues{"ModelPrice": 0.4})
	require.NoError(t, err)
	require.NotNil(t, markup)
	assert.Equal(t, 0.4, markup.BasePrice)
	assert.InDelta(t, 0.4*1.5+0.05, pricing["ModelPrice"].(float64)*1.5, 1e-9, "a new supplier price keeps the markup")
	_, _, err = markedUpPricing("image", model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("base", 1)`})
	assert.Error(t, err, "a supplier expression does not silently drop a fixed markup")

	require.True(t, postMarkup(`{"model_name":"image","per_request":0}`))
	assert.InDelta(t, 0.3, modelPrice(), 1e-9, "clearing the markup restores the supplier price")
	assert.NotContains(t, readOnboardingOption[map[string]onboardingMarkup](onboardingMarkupOption), "image")
}

func TestApplySupplierCostsReadsWhatTheSupplierCharged(t *testing.T) {
	modelManagementDB(t, "sqlite", "")
	service.InitHttpClient()
	previous := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 8
	t.Cleanup(func() { operation_setting.USDExchangeRate = previous })
	opsSupplierCostCache.Lock()
	opsSupplierCostCache.entries = map[string]opsSupplierCostEntry{}
	opsSupplierCostCache.Unlock()

	const start, end = int64(1_000_000), int64(1_000_000 + 86_399)
	// The supplier serves two rows a page, whatever size is asked for.
	consume := []int{400000, 400000, 800000}
	logRequests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_display_type":"CNY","usd_exchange_rate":1,"quota_per_unit":500000}}`))
		case "/api/token/search":
			if query.Get("token") == "shared-key" {
				_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"name":"a"},{"name":"b"}]}}`))
				return
			}
			assert.Equal(t, "key-1", query.Get("token"))
			_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"name":"wave"}]}}`))
		case "/api/log/self":
			logRequests++
			assert.Equal(t, "wave", query.Get("token_name"), "only the channel key's charges count")
			assert.Equal(t, strconv.FormatInt(start, 10), query.Get("start_timestamp"))
			assert.Equal(t, strconv.FormatInt(end, 10), query.Get("end_timestamp"))
			rows, total := []int{400000}, 1
			if query.Get("type") == strconv.Itoa(model.LogTypeConsume) {
				page, _ := strconv.Atoi(query.Get("p"))
				rows, total = consume[min((page-1)*2, len(consume)):min(page*2, len(consume))], len(consume)
			}
			items := make([]map[string]int, 0, len(rows))
			for _, quota := range rows {
				items = append(items, map[string]int{"quota": quota})
			}
			body, _ := common.Marshal(map[string]any{"success": true, "data": map[string]any{"items": items, "total": total}})
			_, _ = w.Write(body)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(upstream.Close)
	baseURL := upstream.URL
	for _, channel := range []model.Channel{
		{Id: 1, Type: 1, Key: "sk-key-1", Status: common.ChannelStatusEnabled, Name: "wave", BaseURL: &baseURL},
		{Id: 2, Type: 1, Key: "key-2", Status: common.ChannelStatusEnabled, Name: "untracked", BaseURL: &baseURL},
		{Id: 3, Type: 1, Key: "shared-key", Status: common.ChannelStatusEnabled, Name: "ambiguous", BaseURL: &baseURL},
	} {
		require.NoError(t, model.DB.Create(&channel).Error)
	}
	// Channel 4 was deleted after its token was set.
	require.NoError(t, writeOnboardingOption(onboardingPricingTokenOption, map[string]string{"1": "supplier-token", "3": "supplier-token", "4": "supplier-token"}))

	upstreamRows := []model.OpsUpstream{{ChannelId: 1}, {ChannelId: 2}, {ChannelId: 3}, {ChannelId: 4}}
	applySupplierCosts(context.Background(), upstreamRows, start, end, end)

	// 1,600,000 charged less 400,000 refunded, in yuan at rate 1, is
	// 1,200,000 / 8 in local dollars.
	assert.Equal(t, model.OpsUpstream{ChannelId: 1, CostQuota: 150000, CostStatus: opsCostStatusOK}, upstreamRows[0])
	assert.Equal(t, model.OpsUpstream{ChannelId: 2, CostStatus: opsCostStatusNoToken}, upstreamRows[1])
	assert.Equal(t, opsCostStatusError, upstreamRows[2].CostStatus)
	assert.Equal(t, "the channel key matches 2 supplier tokens", upstreamRows[2].CostError)
	assert.Equal(t, model.OpsUpstream{ChannelId: 4, CostStatus: opsCostStatusNoToken}, upstreamRows[3])
	assert.Equal(t, 3, logRequests, "two consume pages and one refund page")

	again := []model.OpsUpstream{{ChannelId: 1}}
	applySupplierCosts(context.Background(), again, start, end, end+10)
	assert.Equal(t, int64(150000), again[0].CostQuota)
	assert.Equal(t, 3, logRequests, "a repeated period is served from the cache")
}
