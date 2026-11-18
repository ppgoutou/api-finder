package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// OnboardingMarkupOption keeps each marked-up model's supplier price and the
// fixed amounts added on top of the group-ratio price.
const OnboardingMarkupOption = "OnboardingPriceMarkup"

// OnboardingSupplyPrice is the supplier price an onboarding markup raised:
// the supplier expression, or the supplier fixed price in USD per request.
type OnboardingSupplyPrice struct {
	BaseExpr  string  `json:"base_expr,omitempty"`
	BasePrice float64 `json:"base_price,omitempty"`
}

// GetOnboardingSupplyPrice returns the supplier price of a model whose
// charged price carries an onboarding markup. A model without a markup is
// charged its supplier price as configured.
func GetOnboardingSupplyPrice(modelName string) (OnboardingSupplyPrice, bool) {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[OnboardingMarkupOption]
	common.OptionMapRWMutex.RUnlock()
	if strings.TrimSpace(raw) == "" {
		return OnboardingSupplyPrice{}, false
	}
	var markups map[string]OnboardingSupplyPrice
	if err := common.UnmarshalJsonStr(raw, &markups); err != nil {
		return OnboardingSupplyPrice{}, false
	}
	price, ok := markups[modelName]
	return price, ok
}
