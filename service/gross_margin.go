package service

import (
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

// logOtherGrossMarginKey holds, under admin_info, what a log's charge earns
// over the supplier price. Log owners never see admin_info.
const logOtherGrossMarginKey = "gross_margin"

// tieredSupplyRatio is the share of an expression charge before the group
// ratio that pays the supplier. It is 1 for a model charged its supplier
// expression, and the supplier expression over the marked-up one, evaluated
// on the same usage, for a model with an onboarding markup.
func tieredSupplyRatio(snap *billingexpr.BillingSnapshot, params billingexpr.TokenParams, request billingexpr.RequestInput) (float64, bool) {
	if snap == nil {
		return 0, false
	}
	supply, marked := model.GetOnboardingSupplyPrice(snap.ModelName)
	if !marked {
		return 1, true
	}
	if supply.BaseExpr == "" {
		return 0, false
	}
	charged, err := billingexpr.ComputeTieredQuotaWithRequest(snap, params, request)
	if err != nil || charged.ActualQuotaBeforeGroup <= 0 {
		return 0, false
	}
	base := *snap
	base.ExprString = supply.BaseExpr
	base.ExprHash = billingexpr.ExprHashString(supply.BaseExpr)
	baseResult, err := billingexpr.ComputeTieredQuotaWithRequest(&base, params, request)
	if err != nil {
		return 0, false
	}
	return baseResult.ActualQuotaBeforeGroup / charged.ActualQuotaBeforeGroup, true
}

// fixedSupplyRatio is the share of a ratio or fixed-price charge before the
// group ratio that pays the supplier. modelPrice is the charged fixed price,
// or 0 for a ratio-priced model, which onboarding markups never raise.
func fixedSupplyRatio(modelName string, modelPrice float64) (float64, bool) {
	supply, marked := model.GetOnboardingSupplyPrice(modelName)
	if !marked {
		return 1, true
	}
	if supply.BasePrice <= 0 || modelPrice <= 0 {
		return 0, false
	}
	return supply.BasePrice / modelPrice, true
}

// attachGrossMargin records, for admins only, the charge a log stands for and
// the supplier price of it, both in quota. revenue is the whole charge: for a
// task settlement log, the task's settled total rather than the difference.
func attachGrossMargin(other *model.LogOther, revenue int, groupRatio float64, supplyRatio float64) {
	if other == nil || revenue <= 0 || groupRatio <= 0 || supplyRatio < 0 ||
		math.IsNaN(groupRatio) || math.IsInf(groupRatio, 0) || math.IsNaN(supplyRatio) || math.IsInf(supplyRatio, 0) {
		return
	}
	other.SetAdmin(logOtherGrossMarginKey, map[string]any{
		"revenue_quota": revenue,
		"supply_quota":  common.QuotaRound(float64(revenue) / groupRatio * supplyRatio),
	})
}

// attachRelayGrossMargin records the gross margin of a relay consume log that
// charged quota.
func attachRelayGrossMargin(other *model.LogOther, relayInfo *relaycommon.RelayInfo, quota int, tieredResult *billingexpr.TieredResult) {
	if relayInfo == nil {
		return
	}
	if snap := relayInfo.TieredBillingSnapshot; snap != nil && snap.BillingMode == "tiered_expr" {
		if tieredResult == nil || tieredResult.SupplyRatio == nil {
			return
		}
		attachGrossMargin(other, quota, snap.GroupRatio, *tieredResult.SupplyRatio)
		return
	}
	modelPrice := 0.0
	if relayInfo.PriceData.UsePrice {
		modelPrice = relayInfo.PriceData.ModelPrice
	}
	if ratio, ok := fixedSupplyRatio(relayInfo.GetBillingModelName(), modelPrice); ok {
		attachGrossMargin(other, quota, relayInfo.PriceData.GroupRatioInfo.GroupRatio, ratio)
	}
}

// attachTaskGrossMargin records the gross margin of a task billing log whose
// charge for the whole task is revenue.
func attachTaskGrossMargin(other *model.LogOther, modelName string, revenue int, groupRatio float64, modelPrice float64, snap *billingexpr.BillingSnapshot) {
	if snap != nil {
		if ratio, ok := tieredSupplyRatio(snap, billingexpr.TokenParams{}, billingexpr.RequestInput{Usage: snap.UsageFacts}); ok {
			attachGrossMargin(other, revenue, snap.GroupRatio, ratio)
		}
		return
	}
	if ratio, ok := fixedSupplyRatio(modelName, modelPrice); ok {
		attachGrossMargin(other, revenue, groupRatio, ratio)
	}
}
