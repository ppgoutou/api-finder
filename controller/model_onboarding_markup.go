package controller

import (
	"errors"
	"fmt"
	"maps"
	"math"
	"net/http"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

// onboardingMarkupOption keeps each marked-up model's supplier expression and
// the fixed amounts added on top of the group-ratio price.
const onboardingMarkupOption = "OnboardingPriceMarkup"

// maxMarkupPerSecond bounds one tier's markup or discount in USD per second
// of video.
const maxMarkupPerSecond = 1000

// tierMarkup is a fixed amount a customer pays per second of video on top of
// the group-ratio price of one tier. A negative amount is a discount; the
// tier's unit price must stay above 0.
type tierMarkup struct {
	Field     string  `json:"field"`
	PerSecond float64 `json:"per_second"`
	// TokensPerSecond converts the amount for a token-priced tier; it is zero
	// when the tier is priced per second.
	TokensPerSecond float64 `json:"tokens_per_second,omitempty"`
}

type onboardingMarkup struct {
	// BaseExpr is the supplier expression the markup is added to.
	BaseExpr string                `json:"base_expr"`
	Tiers    map[string]tierMarkup `json:"tiers"`
}

// markupPriceFactor is the group ratio customers pay, so a markup lands on
// their bill unchanged after the ratio multiplies the expression.
func markupPriceFactor() decimal.Decimal {
	return decimal.NewFromFloat(ratio_setting.PublicPriceFactor())
}

func validateTierMarkup(name string, markup tierMarkup) error {
	if strings.TrimSpace(markup.Field) == "" {
		return fmt.Errorf("tier %q: usage field is required", name)
	}
	if math.IsNaN(markup.PerSecond) || markup.PerSecond == 0 || math.Abs(markup.PerSecond) > maxMarkupPerSecond {
		return fmt.Errorf("tier %q: markup must not be 0 and at most %d per second either way", name, maxMarkupPerSecond)
	}
	if math.IsNaN(markup.TokensPerSecond) || math.IsInf(markup.TokensPerSecond, 0) || markup.TokensPerSecond < 0 {
		return fmt.Errorf("tier %q: tokens per second must be finite and not negative", name)
	}
	return nil
}

// composeMarkupExpr adds each tier's markup, divided by the price factor, to
// the supplier expression. A token tier's per-second amount becomes a price
// per 1M tokens through its tokens per second.
func composeMarkupExpr(markup onboardingMarkup, factor decimal.Decimal) (string, error) {
	if !factor.IsPositive() {
		return "", errors.New("the default group ratio must be above 0 to add a markup")
	}
	adds := make(map[string]billingexpr.UnitPriceAdd, len(markup.Tiers))
	for name, tier := range markup.Tiers {
		if err := validateTierMarkup(name, tier); err != nil {
			return "", err
		}
		delta := decimal.NewFromFloat(tier.PerSecond)
		if tier.TokensPerSecond > 0 {
			delta = delta.Mul(decimal.NewFromInt(1_000_000)).Div(decimal.NewFromFloat(tier.TokensPerSecond))
		}
		adds[name] = billingexpr.UnitPriceAdd{
			Field:      tier.Field,
			Delta:      delta.DivRound(factor, 10),
			PerMillion: tier.TokensPerSecond > 0,
		}
	}
	return billingexpr.AddTierUnitPrices(markup.BaseExpr, adds)
}

// markedUpPricing applies a model's stored markup to a supplier pricing draft.
// It returns the draft unchanged for a model without a markup, and the
// markup with its new base otherwise.
func markedUpPricing(name string, pricing model.PricingValues) (model.PricingValues, *onboardingMarkup, error) {
	markup, ok := readOnboardingOption[map[string]onboardingMarkup](onboardingMarkupOption)[name]
	if !ok {
		return pricing, nil, nil
	}
	expression, _ := pricing["billing_setting.billing_expr"].(string)
	if strings.TrimSpace(expression) == "" {
		return nil, nil, errors.New("this model has a markup, but the supplier price is not an expression; clear the markup first")
	}
	markup.BaseExpr = expression
	composed, err := composeMarkupExpr(markup, markupPriceFactor())
	if err != nil {
		return nil, nil, fmt.Errorf("cannot add the markup to the supplier price: %w", err)
	}
	marked := maps.Clone(pricing)
	marked["billing_setting.billing_expr"] = composed
	return marked, &markup, nil
}

func saveOnboardingMarkup(name string, markup *onboardingMarkup) error {
	markups := readOnboardingOption[map[string]onboardingMarkup](onboardingMarkupOption)
	if markups == nil {
		markups = map[string]onboardingMarkup{}
	}
	if markup == nil || len(markup.Tiers) == 0 {
		delete(markups, name)
	} else {
		markups[name] = *markup
	}
	return writeOnboardingOption(onboardingMarkupOption, markups)
}

// setModelExpression replaces the charged expression of one model, keeping
// the rest of its charged pricing.
func setModelExpression(entry model.ModelPricingEntry, expression string) error {
	pricing := chargedModelPricing(entry.Configured)
	pricing["billing_setting.billing_mode"] = billing_setting.BillingModeTieredExpr
	pricing["billing_setting.billing_expr"] = expression
	return model.UpdateModelPricing([]model.ModelPricingChange{{ModelName: entry.ModelName, ExpectedVersion: entry.Version, Pricing: pricing}})
}

// SetOnboardingPriceMarkup sets or clears the per-second markups of one model
// and rewrites its charged expression from the supplier expression.
func SetOnboardingPriceMarkup(c *gin.Context) {
	var request struct {
		ModelName string                `json:"model_name"`
		Tiers     map[string]tierMarkup `json:"tiers"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || strings.TrimSpace(request.ModelName) == "" {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	name := strings.TrimSpace(request.ModelName)
	local, err := model.GetModelPricingSnapshot([]string{name})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	entry := local.Entries[0]
	markup, marked := readOnboardingOption[map[string]onboardingMarkup](onboardingMarkupOption)[name]
	if !marked {
		expression, _ := entry.Configured["billing_setting.billing_expr"].(string)
		if entry.Configured["billing_setting.billing_mode"] != billing_setting.BillingModeTieredExpr || strings.TrimSpace(expression) == "" {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Only expression prices can take a markup. Confirm the upstream price first."))
			return
		}
		markup.BaseExpr = expression
	}
	markup.Tiers = request.Tiers
	expression := markup.BaseExpr
	if len(markup.Tiers) > 0 {
		expression, err = composeMarkupExpr(markup, markupPriceFactor())
		if err != nil {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage(err.Error()))
			return
		}
	}
	if err := setModelExpression(entry, expression); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := saveOnboardingMarkup(name, &markup); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.pricing.update", map[string]any{"models": []string{name}, "source": "markup"})
	channels, err := upstreamPriceChannels()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	respondUpstreamPriceReport(c, upstreamPriceChannelRows(channels))
}

// recomposeOnboardingMarkups rewrites every marked-up model's expression for
// the current group ratio, so customers keep paying the same fixed markup. It
// returns the models it could not update.
func recomposeOnboardingMarkups() []string {
	markups := readOnboardingOption[map[string]onboardingMarkup](onboardingMarkupOption)
	if len(markups) == 0 {
		return nil
	}
	names := slices.Sorted(maps.Keys(markups))
	local, err := model.GetModelPricingSnapshot(names)
	if err != nil {
		common.SysError(common.LogText("failed to read prices of marked-up models: %s", err.Error()))
		return names
	}
	factor := markupPriceFactor()
	failed := make([]string, 0)
	for _, entry := range local.Entries {
		expression, err := composeMarkupExpr(markups[entry.ModelName], factor)
		if err == nil && entry.Configured["billing_setting.billing_expr"] == expression {
			continue
		}
		if err == nil {
			err = setModelExpression(entry, expression)
		}
		if err != nil {
			common.SysError(common.LogText("failed to update the markup of model %s: %s", entry.ModelName, err.Error()))
			failed = append(failed, entry.ModelName)
		}
	}
	return failed
}
