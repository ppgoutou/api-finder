package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// Option keys. The token key ends in "Token" so GET /api/option masks it.
const (
	onboardingPricingTokenOption    = "OnboardingUpstreamPricingToken"
	onboardingPriceSnapshotOption   = "OnboardingUpstreamPriceSnapshot"
	onboardingPriceFetchTimeout     = 20 * time.Second
	onboardingPriceMaxResponseBytes = 16 << 20
	onboardingGroupRatioModel       = ""
)

// upstreamPriceFields are the per-model fields of a new-api /api/pricing row
// that change what the supplier charges.
var upstreamPriceFields = []string{
	"quota_type", "model_ratio", "model_price", "completion_ratio",
	"cache_ratio", "create_cache_ratio", "image_ratio", "audio_ratio",
	"audio_completion_ratio", "billing_mode", "billing_expr", "billing_plugin_variants",
}

type upstreamPriceSnapshot struct {
	BaselineTime  int64                     `json:"baseline_time"`
	Baseline      map[string]map[string]any `json:"baseline"`
	BaselineGroup map[string]any            `json:"baseline_group_ratio"`
	LatestTime    int64                     `json:"latest_time"`
	Latest        map[string]map[string]any `json:"latest"`
	LatestGroup   map[string]any            `json:"latest_group_ratio"`
	// LatestDescriptions keeps the supplier's model descriptions as material
	// for onboarding drafts; they never take part in price comparisons.
	LatestDescriptions map[string]string `json:"latest_descriptions,omitempty"`
}

type upstreamPriceField struct {
	Field    string `json:"field"`
	Previous any    `json:"previous"`
	Current  any    `json:"current"`
}

// upstreamPriceChange is one difference between the acknowledged baseline and
// the latest fetch. An empty ModelName means the supplier's group ratios.
type upstreamPriceChange struct {
	ChannelID   int                  `json:"channel_id"`
	ChannelName string               `json:"channel_name"`
	ModelName   string               `json:"model_name"`
	Kind        string               `json:"kind"`
	Fields      []upstreamPriceField `json:"fields"`
}

type upstreamPriceChannel struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	BaseURL      string `json:"base_url"`
	HasToken     bool   `json:"has_token"`
	BaselineTime int64  `json:"baseline_time"`
	LatestTime   int64  `json:"latest_time"`
	Status       string `json:"status,omitempty"`
	Error        string `json:"error,omitempty"`
	models       []string
	// pendingModels are the supplier's models the channel does not serve yet.
	pendingModels []string
}

// upstreamModelPrice is the supplier's latest price for one served model,
// already turned into the local pricing draft that charges the same.
type upstreamModelPrice struct {
	ChannelID   int                 `json:"channel_id"`
	ChannelName string              `json:"channel_name"`
	Pricing     model.PricingValues `json:"pricing,omitempty"`
	Error       string              `json:"error,omitempty"`
	InSync      bool                `json:"in_sync"`
	// pending marks a model no channel serves yet. Its price is shown for
	// review but never applied by a scheduled check.
	pending bool
}

// Supplier rows that cannot become a local draft. They are frontend locale keys.
const (
	upstreamPriceVariantsDiffer = "The supplier prices this model differently per plugin"
	upstreamPriceUnusable       = "The supplier price list has no usable price for this model"
)

// upstreamRatioFields maps supplier per-token ratio fields to local options.
var upstreamRatioFields = map[string]string{
	"model_ratio": "ModelRatio", "completion_ratio": "CompletionRatio",
	"cache_ratio": "CacheRatio", "create_cache_ratio": "CreateCacheRatio",
	"image_ratio": "ImageRatio", "audio_ratio": "AudioRatio",
	"audio_completion_ratio": "AudioCompletionRatio",
}

func readOnboardingOption[T any](key string) T {
	var value T
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[key]
	common.OptionMapRWMutex.RUnlock()
	if strings.TrimSpace(raw) != "" {
		_ = common.UnmarshalJsonStr(raw, &value)
	}
	return value
}

func writeOnboardingOption(key string, value any) error {
	encoded, err := common.Marshal(value)
	if err != nil {
		return err
	}
	return model.UpdateOption(key, string(encoded))
}

// diffUpstreamPrices compares two model→fields maps and reports added,
// removed and changed models in name order.
func diffUpstreamPrices(baseline, latest map[string]map[string]any) []upstreamPriceChange {
	names := make([]string, 0, len(baseline)+len(latest))
	for name := range baseline {
		names = append(names, name)
	}
	for name := range latest {
		if _, ok := baseline[name]; !ok {
			names = append(names, name)
		}
	}
	slices.Sort(names)
	changes := make([]upstreamPriceChange, 0)
	for _, name := range names {
		before, hadBefore := baseline[name]
		after, hasAfter := latest[name]
		change := upstreamPriceChange{ModelName: name, Fields: []upstreamPriceField{}}
		switch {
		case !hadBefore:
			change.Kind = "added"
		case !hasAfter:
			change.Kind = "removed"
		default:
			change.Kind = "changed"
		}
		fields := upstreamPriceFields
		if name == onboardingGroupRatioModel {
			fields = sortedKeys(before, after)
		}
		for _, field := range fields {
			if reflect.DeepEqual(before[field], after[field]) {
				continue
			}
			change.Fields = append(change.Fields, upstreamPriceField{Field: field, Previous: before[field], Current: after[field]})
		}
		if change.Kind == "changed" && len(change.Fields) == 0 {
			continue
		}
		changes = append(changes, change)
	}
	return changes
}

func sortedKeys(maps ...map[string]any) []string {
	keys := make([]string, 0)
	for _, values := range maps {
		for key := range values {
			if !slices.Contains(keys, key) {
				keys = append(keys, key)
			}
		}
	}
	slices.Sort(keys)
	return keys
}

// parseUpstreamPricing keeps only the price fields of each row. Values go
// through JSON so stored snapshots and fresh fetches compare equal.
func parseUpstreamPricing(body []byte) (map[string]map[string]any, map[string]any, map[string]string, error) {
	var response struct {
		Success    bool             `json:"success"`
		Message    string           `json:"message"`
		Data       []map[string]any `json:"data"`
		GroupRatio map[string]any   `json:"group_ratio"`
	}
	if err := common.Unmarshal(body, &response); err != nil {
		return nil, nil, nil, fmt.Errorf("invalid pricing response: %w", err)
	}
	if !response.Success {
		return nil, nil, nil, fmt.Errorf("pricing request failed: %s", response.Message)
	}
	models := make(map[string]map[string]any, len(response.Data))
	descriptions := make(map[string]string)
	for _, row := range response.Data {
		name, _ := row["model_name"].(string)
		if name = strings.TrimSpace(name); name == "" {
			continue
		}
		fields := make(map[string]any)
		for _, field := range upstreamPriceFields {
			value, ok := row[field]
			if !ok || value == nil || value == "" {
				continue
			}
			if field == "billing_plugin_variants" {
				value = pluginVariantPrices(value)
			}
			fields[field] = value
		}
		models[name] = fields
		if description, _ := row["description"].(string); strings.TrimSpace(description) != "" {
			descriptions[name] = strings.TrimSpace(description)
		}
	}
	if response.GroupRatio == nil {
		response.GroupRatio = map[string]any{}
	}
	return models, response.GroupRatio, descriptions, nil
}

// upstreamModelPricing turns one supplier /api/pricing row into the local
// pricing draft that charges the same: its expression, fixed price or ratios.
func upstreamModelPricing(fields map[string]any) (model.PricingValues, error) {
	expression, _ := fields["billing_expr"].(string)
	if fields["billing_mode"] != billing_setting.BillingModeTieredExpr || strings.TrimSpace(expression) == "" {
		expression = ""
		variants, _ := fields["billing_plugin_variants"].(map[string]any)
		for _, value := range variants {
			variant, _ := value.(map[string]any)
			variantExpr, _ := variant["billing_expr"].(string)
			if variant["billing_mode"] != billing_setting.BillingModeTieredExpr || strings.TrimSpace(variantExpr) == "" {
				continue
			}
			if expression != "" && expression != variantExpr {
				return nil, errors.New(upstreamPriceVariantsDiffer)
			}
			expression = variantExpr
		}
	}
	if expression != "" {
		return model.PricingValues{
			"billing_setting.billing_mode": billing_setting.BillingModeTieredExpr,
			"billing_setting.billing_expr": expression,
		}, nil
	}
	quotaType, _ := fields["quota_type"].(float64)
	if quotaType == 1 {
		price, ok := fields["model_price"].(float64)
		if !ok {
			return nil, errors.New(upstreamPriceUnusable)
		}
		return model.PricingValues{"ModelPrice": price}, nil
	}
	if _, ok := fields["model_ratio"].(float64); !ok {
		return nil, errors.New(upstreamPriceUnusable)
	}
	pricing := model.PricingValues{}
	for field, option := range upstreamRatioFields {
		if value, ok := fields[field].(float64); ok {
			pricing[option] = value
		}
	}
	return pricing, nil
}

// chargedModelPricing drops the display-only official price from a stored
// model configuration, leaving what users are charged.
func chargedModelPricing(configured model.PricingValues) model.PricingValues {
	charged := maps.Clone(configured)
	delete(charged, billing_setting.OfficialPriceExprOption)
	return charged
}

// upstreamModelPrices maps each model a watched channel serves or is offered
// to its latest supplier price, taken from the lowest-id channel that lists it.
// A channel serving the model wins over one that only has it pending.
func upstreamModelPrices(rows []upstreamPriceChannel, snapshots map[string]upstreamPriceSnapshot) map[string]upstreamModelPrice {
	prices := make(map[string]upstreamModelPrice)
	for _, pending := range []bool{false, true} {
		for _, row := range rows {
			latest := snapshots[strconv.Itoa(row.ID)].Latest
			names := row.models
			if pending {
				names = row.pendingModels
			}
			for _, name := range names {
				name = strings.TrimSpace(name)
				fields, ok := latest[name]
				if _, seen := prices[name]; seen || !ok {
					continue
				}
				price := upstreamModelPrice{ChannelID: row.ID, ChannelName: row.Name, pending: pending}
				pricing, err := upstreamModelPricing(fields)
				if err != nil {
					price.Error = err.Error()
				} else {
					price.Pricing = pricing
				}
				prices[name] = price
			}
		}
	}
	return prices
}

// applyUpstreamModelPrice replaces a model's charged price with the supplier
// draft. The official price stays.
func applyUpstreamModelPrice(name string, entry model.ModelPricingEntry, pricing model.PricingValues) error {
	return model.UpdateModelPricing([]model.ModelPricingChange{{ModelName: name, ExpectedVersion: entry.Version, Pricing: pricing}})
}

// acceptUpstreamBaseline marks the latest supplier rows of the given models as
// handled on every channel, so applied prices stop showing as changes.
func acceptUpstreamBaseline(snapshots map[string]upstreamPriceSnapshot, names []string) {
	for key, snapshot := range snapshots {
		if snapshot.LatestTime == 0 {
			continue
		}
		if snapshot.Baseline == nil {
			snapshot.Baseline = map[string]map[string]any{}
		}
		for _, name := range names {
			if latest, ok := snapshot.Latest[name]; ok {
				snapshot.Baseline[name] = latest
			}
		}
		snapshots[key] = snapshot
	}
}

// pluginVariantPrices reduces plugin variants to plugin key → expression, so
// schema or example edits upstream do not read as price changes.
func pluginVariantPrices(value any) any {
	variants, ok := value.([]any)
	if !ok {
		return value
	}
	prices := make(map[string]any, len(variants))
	for _, variant := range variants {
		entry, ok := variant.(map[string]any)
		if !ok {
			continue
		}
		key, _ := entry["plugin_key"].(string)
		prices[key] = map[string]any{"billing_mode": entry["billing_mode"], "billing_expr": entry["billing_expr"]}
	}
	return prices
}

func fetchUpstreamPricing(ctx context.Context, baseURL, token string) (map[string]map[string]any, map[string]any, map[string]string, error) {
	ctx, cancel := context.WithTimeout(ctx, onboardingPriceFetchTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/api/pricing", nil)
	if err != nil {
		return nil, nil, nil, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := service.GetHttpClient().Do(request)
	if err != nil {
		return nil, nil, nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, nil, nil, fmt.Errorf("pricing request returned HTTP %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, onboardingPriceMaxResponseBytes))
	if err != nil {
		return nil, nil, nil, err
	}
	return parseUpstreamPricing(body)
}

func upstreamPriceChannels() ([]*model.Channel, error) {
	var channels []*model.Channel
	err := model.DB.Select("id", "name", "type", "base_url", "status", "models", "settings").
		Where("status = ?", common.ChannelStatusEnabled).
		Order("id").
		Find(&channels).Error
	if err != nil {
		return nil, err
	}
	return slices.DeleteFunc(channels, func(channel *model.Channel) bool {
		return !strings.HasPrefix(channel.GetBaseURL(), "http")
	}), nil
}

func upstreamPriceChannelRows(channels []*model.Channel) []upstreamPriceChannel {
	tokens := readOnboardingOption[map[string]string](onboardingPricingTokenOption)
	snapshots := readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption)
	rows := make([]upstreamPriceChannel, 0, len(channels))
	for _, channel := range channels {
		key := strconv.Itoa(channel.Id)
		snapshot := snapshots[key]
		// Parsed here instead of GetOtherSettings, which rewrites malformed
		// settings with Save and would clobber the unselected columns.
		var settings dto.ChannelOtherSettings
		if channel.OtherSettings != "" {
			_ = common.UnmarshalJsonStr(channel.OtherSettings, &settings)
		}
		rows = append(rows, upstreamPriceChannel{
			ID:            channel.Id,
			Name:          channel.Name,
			BaseURL:       channel.GetBaseURL(),
			HasToken:      strings.TrimSpace(tokens[key]) != "",
			BaselineTime:  snapshot.BaselineTime,
			LatestTime:    snapshot.LatestTime,
			models:        channel.GetModels(),
			pendingModels: settings.UpstreamModelUpdateLastDetectedModels,
		})
	}
	return rows
}

func snapshotChanges(channel upstreamPriceChannel, snapshot upstreamPriceSnapshot) []upstreamPriceChange {
	if snapshot.LatestTime == 0 {
		return nil
	}
	changes := diffUpstreamPrices(snapshot.Baseline, snapshot.Latest)
	group := diffUpstreamPrices(
		map[string]map[string]any{onboardingGroupRatioModel: snapshot.BaselineGroup},
		map[string]map[string]any{onboardingGroupRatioModel: snapshot.LatestGroup},
	)
	for _, change := range group {
		change.Kind = "group_ratio"
		changes = append(changes, change)
	}
	for i := range changes {
		changes[i].ChannelID = channel.ID
		changes[i].ChannelName = channel.Name
	}
	return changes
}

func upstreamPriceReport(rows []upstreamPriceChannel) (gin.H, error) {
	snapshots := readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption)
	changes := make([]upstreamPriceChange, 0)
	for _, row := range rows {
		changes = append(changes, snapshotChanges(row, snapshots[strconv.Itoa(row.ID)])...)
	}
	// A local price is often a rewritten form of the supplier's expression, so
	// it is never compared with the supplier's text. A priced model is in sync
	// while the supplier's price is still the one last handled.
	changed := make(map[string]bool)
	for _, change := range changes {
		if change.Kind != "group_ratio" {
			changed[change.ModelName] = true
		}
	}
	prices := upstreamModelPrices(rows, snapshots)
	if len(prices) > 0 {
		local, err := model.GetModelPricingSnapshot(slices.Collect(maps.Keys(prices)))
		if err != nil {
			return nil, err
		}
		for _, entry := range local.Entries {
			price := prices[entry.ModelName]
			price.InSync = len(chargedModelPricing(entry.Configured)) > 0 && !changed[entry.ModelName]
			prices[entry.ModelName] = price
		}
	}
	return gin.H{
		"channels": rows, "changes": changes, "models": prices,
		"markups":      readOnboardingOption[map[string]onboardingMarkup](onboardingMarkupOption),
		"price_factor": ratio_setting.PublicPriceFactor(),
	}, nil
}

func respondUpstreamPriceReport(c *gin.Context, rows []upstreamPriceChannel) {
	report, err := upstreamPriceReport(rows)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, report)
}

// GetOnboardingUpstreamPrices returns the last check's changes without fetching.
func GetOnboardingUpstreamPrices(c *gin.Context) {
	channels, err := upstreamPriceChannels()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	respondUpstreamPriceReport(c, upstreamPriceChannelRows(channels))
}

// SetOnboardingUpstreamPricingToken stores or clears the supplier dashboard
// token used to read one channel's upstream /api/pricing. It is never returned.
func SetOnboardingUpstreamPricingToken(c *gin.Context) {
	var request struct {
		ChannelID int    `json:"channel_id"`
		Token     string `json:"token"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || request.ChannelID <= 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	tokens := readOnboardingOption[map[string]string](onboardingPricingTokenOption)
	if tokens == nil {
		tokens = map[string]string{}
	}
	key := strconv.Itoa(request.ChannelID)
	if token := strings.TrimSpace(request.Token); token != "" {
		tokens[key] = token
	} else {
		delete(tokens, key)
	}
	if err := writeOnboardingOption(onboardingPricingTokenOption, tokens); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.onboarding.pricing_token", map[string]any{"channel_id": request.ChannelID, "set": strings.TrimSpace(request.Token) != ""})
	common.ApiSuccess(c, nil)
}

// CheckOnboardingUpstreamPrices runs one upstream price check and reports
// what differs from the acknowledged baseline.
func CheckOnboardingUpstreamPrices(c *gin.Context) {
	result, err := checkUpstreamPrices(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	respondUpstreamPriceReport(c, result.Rows)
}

// StartOnboardingUpstreamSync queues one run that detects every channel's
// new and delisted models, checks supplier prices and adapts task plugins.
// An active run is returned instead of queueing a second one; the caller
// follows either through the system task API.
func StartOnboardingUpstreamSync(c *gin.Context) {
	task, created, err := service.EnqueueSystemTask(model.SystemTaskTypeUpstreamPrice, upstreamPriceCheckPayload{Detect: true})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if created {
		recordManageAudit(c, "model.onboarding.upstream_sync", map[string]any{"task_id": task.TaskID})
	}
	common.ApiSuccess(c, gin.H{"task_id": task.TaskID, "status": task.Status, "created": created})
}

// upstreamPriceCheckResult is one supplier price check: the channel rows,
// the served models it priced and the pending models it adapted plugins to.
type upstreamPriceCheckResult struct {
	Rows    []upstreamPriceChannel
	Applied []string
	Adapted []string
	// Waiting counts pending models whose plugin could not be adapted yet.
	Waiting int
}

// checkUpstreamPrices fetches every tokened channel's upstream pricing and
// keeps it as the latest snapshot. A channel's first fetch becomes its
// baseline. Served models without a charged price get the supplier's price;
// their names are returned.
func checkUpstreamPrices(ctx context.Context) (upstreamPriceCheckResult, error) {
	channels, err := upstreamPriceChannels()
	if err != nil {
		return upstreamPriceCheckResult{}, err
	}
	rows := upstreamPriceChannelRows(channels)
	tokens := readOnboardingOption[map[string]string](onboardingPricingTokenOption)
	type fetched struct {
		models       map[string]map[string]any
		group        map[string]any
		descriptions map[string]string
		err          error
	}
	results := make([]fetched, len(rows))
	var wg sync.WaitGroup
	for i, row := range rows {
		token := strings.TrimSpace(tokens[strconv.Itoa(row.ID)])
		if token == "" {
			continue
		}
		wg.Go(func() {
			models, group, descriptions, err := fetchUpstreamPricing(ctx, row.BaseURL, token)
			results[i] = fetched{models: models, group: group, descriptions: descriptions, err: err}
		})
	}
	wg.Wait()

	snapshots := readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption)
	if snapshots == nil {
		snapshots = map[string]upstreamPriceSnapshot{}
	}
	now := common.GetTimestamp()
	for i := range rows {
		if !rows[i].HasToken {
			continue
		}
		if results[i].err != nil {
			rows[i].Status = "error"
			rows[i].Error = results[i].err.Error()
			continue
		}
		key := strconv.Itoa(rows[i].ID)
		snapshot := snapshots[key]
		snapshot.Latest, snapshot.LatestGroup, snapshot.LatestTime = results[i].models, results[i].group, now
		snapshot.LatestDescriptions = results[i].descriptions
		if snapshot.BaselineTime == 0 {
			snapshot.Baseline, snapshot.BaselineGroup, snapshot.BaselineTime = results[i].models, results[i].group, now
			rows[i].Status = "baseline"
		} else {
			rows[i].Status = "ok"
		}
		rows[i].BaselineTime, rows[i].LatestTime = snapshot.BaselineTime, snapshot.LatestTime
		snapshots[key] = snapshot
	}
	// Adapted first, so a model the plugin now declares is priced by this check.
	adapted, waiting := adaptPluginsToSupplierModels(ctx, snapshots)
	applied := make([]string, 0)
	prices := upstreamModelPrices(rows, snapshots)
	if len(prices) > 0 {
		local, err := model.GetModelPricingSnapshot(slices.Collect(maps.Keys(prices)))
		if err != nil {
			return upstreamPriceCheckResult{}, err
		}
		for _, entry := range local.Entries {
			price := prices[entry.ModelName]
			pricing := price.Pricing
			if pricing == nil || price.pending || len(chargedModelPricing(entry.Configured)) > 0 {
				continue
			}
			pricing, markup, err := markedUpPricing(entry.ModelName, pricing)
			if err == nil {
				err = applyUpstreamModelPrice(entry.ModelName, entry, pricing)
			}
			if err == nil && markup != nil {
				err = saveOnboardingMarkup(entry.ModelName, markup)
			}
			if err != nil {
				common.SysError(common.LogText("failed to apply upstream price to model %s: %s", entry.ModelName, err.Error()))
				continue
			}
			applied = append(applied, entry.ModelName)
		}
		acceptUpstreamBaseline(snapshots, applied)
	}
	if err := writeOnboardingOption(onboardingPriceSnapshotOption, snapshots); err != nil {
		return upstreamPriceCheckResult{}, err
	}
	return upstreamPriceCheckResult{Rows: rows, Applied: applied, Adapted: adapted, Waiting: waiting}, nil
}

// hasUpstreamPricingToken reports whether any channel has a supplier token,
// which is what the scheduled price check needs to do anything.
func hasUpstreamPricingToken() bool {
	for _, token := range readOnboardingOption[map[string]string](onboardingPricingTokenOption) {
		if strings.TrimSpace(token) != "" {
			return true
		}
	}
	return false
}

// ApplyOnboardingUpstreamPrice sets one model's charged price to its latest
// supplier price and accepts that supplier row as handled.
func ApplyOnboardingUpstreamPrice(c *gin.Context) {
	var request struct {
		ModelName string `json:"model_name"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || strings.TrimSpace(request.ModelName) == "" {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	name := strings.TrimSpace(request.ModelName)
	channels, err := upstreamPriceChannels()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	rows := upstreamPriceChannelRows(channels)
	snapshots := readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption)
	price, ok := upstreamModelPrices(rows, snapshots)[name]
	if !ok || price.Pricing == nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("No usable upstream price for this model. Check upstream prices first."))
		return
	}
	local, err := model.GetModelPricingSnapshot([]string{name})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pricing, markup, err := markedUpPricing(name, price.Pricing)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage(err.Error()))
		return
	}
	if err := applyUpstreamModelPrice(name, local.Entries[0], pricing); err != nil {
		common.ApiError(c, err)
		return
	}
	if markup != nil {
		if err := saveOnboardingMarkup(name, markup); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	acceptUpstreamBaseline(snapshots, []string{name})
	if err := writeOnboardingOption(onboardingPriceSnapshotOption, snapshots); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.pricing.update", map[string]any{"models": []string{name}, "source": "upstream", "channel_id": price.ChannelID})
	respondUpstreamPriceReport(c, rows)
}

// AcknowledgeOnboardingUpstreamPrices moves the latest upstream values into
// the baseline for the given models (all models when none are given), so
// handled changes stop showing. Channel 0 takes the given models on every
// channel.
func AcknowledgeOnboardingUpstreamPrices(c *gin.Context) {
	var request struct {
		ChannelID  int      `json:"channel_id"`
		ModelNames []string `json:"model_names"`
		GroupRatio bool     `json:"group_ratio"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || request.ChannelID < 0 || (request.ChannelID == 0 && len(request.ModelNames) == 0) {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	snapshots := readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption)
	if request.ChannelID == 0 {
		acceptUpstreamBaseline(snapshots, request.ModelNames)
	} else {
		key := strconv.Itoa(request.ChannelID)
		snapshot, ok := snapshots[key]
		if !ok || snapshot.LatestTime == 0 {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
			return
		}
		if len(request.ModelNames) == 0 && !request.GroupRatio {
			snapshot.Baseline, snapshot.BaselineGroup = snapshot.Latest, snapshot.LatestGroup
		} else {
			if snapshot.Baseline == nil {
				snapshot.Baseline = map[string]map[string]any{}
			}
			for _, name := range request.ModelNames {
				if latest, exists := snapshot.Latest[name]; exists {
					snapshot.Baseline[name] = latest
				} else {
					delete(snapshot.Baseline, name)
				}
			}
			if request.GroupRatio {
				snapshot.BaselineGroup = snapshot.LatestGroup
			}
		}
		snapshots[key] = snapshot
	}
	if err := writeOnboardingOption(onboardingPriceSnapshotOption, snapshots); err != nil {
		common.ApiError(c, err)
		return
	}
	channels, err := upstreamPriceChannels()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	respondUpstreamPriceReport(c, upstreamPriceChannelRows(channels))
}
