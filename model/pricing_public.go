package model

import (
	"slices"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/shopspring/decimal"
)

var (
	publicPricingLock   sync.Mutex
	publicPricing       []Pricing
	publicPricingSource *Pricing
	publicPricingFactor float64
)

// GetPublicPricing returns the pricing list for viewers who may not read base
// prices. Prices are multiplied by ratio_setting.PublicPriceFactor, and callers
// publish group ratios through ratio_setting.PublicGroupRatio, so every selling
// price is unchanged while the base price cannot be derived. Billing never reads
// this list.
func GetPublicPricing() []Pricing {
	source := GetPricing()
	if len(source) == 0 {
		return source
	}
	factor := ratio_setting.PublicPriceFactor()

	publicPricingLock.Lock()
	defer publicPricingLock.Unlock()
	if publicPricingSource != &source[0] || publicPricingFactor != factor {
		publicPricing = buildPublicPricing(source, factor)
		publicPricingSource = &source[0]
		publicPricingFactor = factor
	}
	return publicPricing
}

func buildPublicPricing(source []Pricing, factor float64) []Pricing {
	scale := decimal.NewFromFloat(factor)
	published := slices.Clone(source)
	for i := range published {
		item := &published[i]
		item.ModelPrice = scale.Mul(decimal.NewFromFloat(item.ModelPrice)).InexactFloat64()
		item.ModelRatio = scale.Mul(decimal.NewFromFloat(item.ModelRatio)).InexactFloat64()
		item.BillingExpr = publicBillingExpr(item.ModelName, item.BillingExpr, scale)
		item.BillingPluginVariants = slices.Clone(item.BillingPluginVariants)
		for j := range item.BillingPluginVariants {
			variant := &item.BillingPluginVariants[j]
			variant.BillingExpr = publicBillingExpr(item.ModelName, variant.BillingExpr, scale)
		}
	}
	return published
}

// publicBillingExpr withholds an expression it cannot scale: the original would
// publish the base price, so the model shows no price until the expression is
// rewritten.
func publicBillingExpr(modelName, expression string, scale decimal.Decimal) string {
	if expression == "" {
		return ""
	}
	scaled, err := billingexpr.ScalePrices(expression, scale)
	if err != nil {
		common.SysError(common.LogText("withheld public price of model %s: %s", modelName, err.Error()))
		return ""
	}
	return scaled
}
