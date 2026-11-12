package controller

import (
	"errors"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	pricingCategoriesOptionKey      = "PricingCategories"
	pricingCategoriesMax            = 50
	pricingCategoryModelsMax        = 200
	pricingCategoryNameMaxRunes     = 40
	pricingCategoryDescMaxRunes     = 3000
	pricingCategoryIDMaxLength      = 64
	pricingCategoryModelNameMaxSize = 255
	pricingCategoryOfficialMaxSize  = 8192
	officialPriceRowsMax            = 32
	officialPriceOptionMaxLength    = 32
	officialPriceAmountMax          = 1_000_000
)

// pricingModelBadges are the highlight labels an administrator can put on a
// model card.
var pricingModelBadges = []string{"recommended", "hot", "new"}

// pricingCategory groups models on the public pricing page. The option stores
// them in display order, each model listed in the order it is shown, and the
// badges shown on the cards of its models. OfficialPrice is the display-only
// official price table its models show when they have no official price of
// their own; OfficialPriceExpr is the expression form saved before the table.
type pricingCategory struct {
	ID                string                    `json:"id"`
	Name              string                    `json:"name"`
	Description       string                    `json:"description"`
	Models            []string                  `json:"models"`
	Badges            map[string][]string       `json:"badges,omitempty"`
	OfficialPriceExpr string                    `json:"official_price_expr,omitempty"`
	OfficialPrice     *model.OfficialPriceTable `json:"official_price,omitempty"`
}

var errInvalidPricingCategories = errors.New("invalid pricing categories")

// pricingCategoryConflictError names a model listed by two categories.
type pricingCategoryConflictError struct {
	Model string
}

func (e *pricingCategoryConflictError) Error() string {
	return "model " + e.Model + " belongs to more than one pricing category"
}

// pricingCategoryOfficialPriceError names a model the official price of its
// category cannot be evaluated for.
type pricingCategoryOfficialPriceError struct {
	Model string
	Err   error
}

func (e *pricingCategoryOfficialPriceError) Error() string {
	return "model " + e.Model + ": category official price: " + e.Err.Error()
}

// validatePricingCategories checks the PricingCategories option before it is
// saved: bounded text and counts, unique ids, every model in at most one
// category, and badges only from the known set on models of their category.
func validatePricingCategories(value string) error {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	var categories []pricingCategory
	if err := common.UnmarshalJsonStr(value, &categories); err != nil {
		return errInvalidPricingCategories
	}
	if len(categories) > pricingCategoriesMax {
		return errInvalidPricingCategories
	}
	ids := make(map[string]struct{}, len(categories))
	owners := make(map[string]struct{})
	for _, category := range categories {
		id := strings.TrimSpace(category.ID)
		name := strings.TrimSpace(category.Name)
		if id == "" || len(id) > pricingCategoryIDMaxLength || id != category.ID {
			return errInvalidPricingCategories
		}
		if name == "" || utf8.RuneCountInString(name) > pricingCategoryNameMaxRunes {
			return errInvalidPricingCategories
		}
		if utf8.RuneCountInString(category.Description) > pricingCategoryDescMaxRunes {
			return errInvalidPricingCategories
		}
		if len(category.OfficialPriceExpr) > pricingCategoryOfficialMaxSize || category.OfficialPriceExpr != strings.TrimSpace(category.OfficialPriceExpr) {
			return errInvalidPricingCategories
		}
		if category.OfficialPrice != nil && !validOfficialPriceTable(category.OfficialPrice) {
			return errInvalidPricingCategories
		}
		if _, seen := ids[id]; seen {
			return errInvalidPricingCategories
		}
		ids[id] = struct{}{}
		if len(category.Models) > pricingCategoryModelsMax {
			return errInvalidPricingCategories
		}
		for _, modelName := range category.Models {
			if strings.TrimSpace(modelName) == "" || modelName != strings.TrimSpace(modelName) || len(modelName) > pricingCategoryModelNameMaxSize {
				return errInvalidPricingCategories
			}
			if _, taken := owners[modelName]; taken {
				return &pricingCategoryConflictError{Model: modelName}
			}
			owners[modelName] = struct{}{}
		}
		for modelName, badges := range category.Badges {
			if !slices.Contains(category.Models, modelName) || len(badges) > len(pricingModelBadges) {
				return errInvalidPricingCategories
			}
			for i, badge := range badges {
				if !slices.Contains(pricingModelBadges, badge) || slices.Contains(badges[:i], badge) {
					return errInvalidPricingCategories
				}
			}
		}
	}
	return nil
}

func validOfficialPriceAmount(amount *float64, required bool) bool {
	if amount == nil {
		return !required
	}
	return *amount >= 0 && *amount <= officialPriceAmountMax
}

// validOfficialPriceTable accepts a video table of distinct options with a
// positive per-second price each, or a token price with input and output.
func validOfficialPriceTable(table *model.OfficialPriceTable) bool {
	switch table.Kind {
	case "video":
		if len(table.Rows) == 0 || len(table.Rows) > officialPriceRowsMax {
			return false
		}
		if table.Input != nil || table.Output != nil || table.CacheRead != nil || table.CacheWrite != nil {
			return false
		}
		seen := make(map[string]struct{}, len(table.Rows))
		for _, row := range table.Rows {
			option := strings.TrimSpace(row.Option)
			if option == "" || option != row.Option || len(option) > officialPriceOptionMaxLength {
				return false
			}
			if _, duplicate := seen[option]; duplicate {
				return false
			}
			seen[option] = struct{}{}
			second := row.Second
			if second <= 0 || !validOfficialPriceAmount(&second, true) || !validOfficialPriceAmount(row.ReferenceSecond, false) ||
				!validOfficialPriceAmount(row.SecondCNY, false) || !validOfficialPriceAmount(row.ReferenceSecondCNY, false) {
				return false
			}
		}
		return true
	case "token":
		if len(table.Rows) > 0 {
			return false
		}
		if !validOfficialPriceAmount(table.Input, true) || !validOfficialPriceAmount(table.Output, true) ||
			!validOfficialPriceAmount(table.CacheRead, false) || !validOfficialPriceAmount(table.CacheWrite, false) {
			return false
		}
		return *table.Input > 0 || *table.Output > 0
	default:
		return false
	}
}

// validatePricingCategoryOfficialPrices checks each category's official price
// against the models it is shown on. A model keeps the price it already showed
// under the previous value, so a plugin that later drops the model cannot lock
// the categories against saving.
func validatePricingCategoryOfficialPrices(previous, value string) error {
	shown := make(map[string]string)
	for _, category := range parsePricingCategories(previous) {
		for _, modelName := range category.Models {
			shown[modelName] = category.OfficialPriceExpr
		}
	}
	for _, category := range parsePricingCategories(value) {
		if category.OfficialPriceExpr == "" {
			continue
		}
		for _, modelName := range category.Models {
			if shown[modelName] == category.OfficialPriceExpr {
				continue
			}
			if err := model.ValidateOfficialPriceExpr(modelName, category.OfficialPriceExpr); err != nil {
				return &pricingCategoryOfficialPriceError{Model: modelName, Err: err}
			}
		}
	}
	return nil
}

// parsePricingCategories reads a stored PricingCategories value; an empty or
// malformed value means no categories.
func parsePricingCategories(value string) []pricingCategory {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	var categories []pricingCategory
	if err := common.UnmarshalJsonStr(value, &categories); err != nil {
		common.SysError(common.LogText("invalid %s option: %v", pricingCategoriesOptionKey, err))
		return nil
	}
	return categories
}

func savedPricingCategories() []pricingCategory {
	common.OptionMapRWMutex.RLock()
	value := common.OptionMap[pricingCategoriesOptionKey]
	common.OptionMapRWMutex.RUnlock()
	return parsePricingCategories(value)
}

// inheritCategoryOfficialPrices gives each model without an official price of
// its own the official price of its category. The slice must be the caller's
// copy, never the shared pricing cache.
func inheritCategoryOfficialPrices(pricing []model.Pricing, categories []pricingCategory) {
	owners := make(map[string]*pricingCategory)
	for i := range categories {
		if categories[i].OfficialPrice == nil && categories[i].OfficialPriceExpr == "" {
			continue
		}
		for _, modelName := range categories[i].Models {
			owners[modelName] = &categories[i]
		}
	}
	for i := range pricing {
		if strings.TrimSpace(pricing[i].OfficialPriceExpr) != "" {
			continue
		}
		category, ok := owners[pricing[i].ModelName]
		if !ok {
			continue
		}
		if category.OfficialPrice != nil {
			pricing[i].OfficialPrice = category.OfficialPrice
			continue
		}
		pricing[i].OfficialPriceExpr = category.OfficialPriceExpr
	}
}

// publicPricingCategories returns the saved categories limited to the models
// the caller can see, so a category never reveals a model outside the
// caller's groups. Categories left without visible models are still returned;
// the page hides empty sections. The official price reaches the page through
// the models that inherit it.
func publicPricingCategories(pricing []model.Pricing, categories []pricingCategory) []pricingCategory {
	result := []pricingCategory{}
	visible := make(map[string]struct{}, len(pricing))
	for _, item := range pricing {
		visible[item.ModelName] = struct{}{}
	}
	for _, category := range categories {
		models := make([]string, 0, len(category.Models))
		for _, modelName := range category.Models {
			if _, ok := visible[modelName]; ok {
				models = append(models, modelName)
			}
		}
		category.Models = models
		category.OfficialPriceExpr = ""
		category.OfficialPrice = nil
		for modelName := range category.Badges {
			if _, ok := visible[modelName]; !ok {
				delete(category.Badges, modelName)
			}
		}
		result = append(result, category)
	}
	return result
}
