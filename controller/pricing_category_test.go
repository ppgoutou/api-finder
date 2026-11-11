package controller

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidatePricingCategories(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		valid    bool
		conflict string
	}{
		{name: "empty value clears the categories", value: "", valid: true},
		{name: "empty list", value: `[]`, valid: true},
		{name: "categories with distinct models", value: `[{"id":"sd20","name":"Seedance 2.0","description":"多条线路","models":["sd-2.0-线路1","seedance-2.0"]},{"id":"sd25","name":"Seedance 2.5","models":["seedance-2.5"]}]`, valid: true},
		{name: "category without models", value: `[{"id":"sd20","name":"Seedance 2.0","models":[]}]`, valid: true},
		{name: "model in two categories", value: `[{"id":"a","name":"A","models":["seedance-2.0"]},{"id":"b","name":"B","models":["seedance-2.0"]}]`, conflict: "seedance-2.0"},
		{name: "model listed twice in one category", value: `[{"id":"a","name":"A","models":["seedance-2.0","seedance-2.0"]}]`, conflict: "seedance-2.0"},
		{name: "duplicate ids", value: `[{"id":"a","name":"A","models":[]},{"id":"a","name":"B","models":[]}]`},
		{name: "blank name", value: `[{"id":"a","name":"  ","models":[]}]`},
		{name: "missing id", value: `[{"name":"A","models":[]}]`},
		{name: "padded model name", value: `[{"id":"a","name":"A","models":[" seedance-2.0"]}]`},
		{name: "name over 40 characters", value: `[{"id":"a","name":"` + strings.Repeat("类", 41) + `","models":[]}]`},
		{name: "not a list", value: `{"id":"a"}`},
		{name: "badges on own models", value: `[{"id":"a","name":"A","models":["seedance-2.0","sd-2.0"],"badges":{"seedance-2.0":["hot","recommended"],"sd-2.0":[]}}]`, valid: true},
		{name: "unknown badge", value: `[{"id":"a","name":"A","models":["seedance-2.0"],"badges":{"seedance-2.0":["free"]}}]`},
		{name: "repeated badge", value: `[{"id":"a","name":"A","models":["seedance-2.0"],"badges":{"seedance-2.0":["hot","hot"]}}]`},
		{name: "badge on a model outside the category", value: `[{"id":"a","name":"A","models":["seedance-2.0"],"badges":{"seedance-2.5":["hot"]}}]`},
		{name: "category official price", value: `[{"id":"a","name":"A","models":["gpt-x"],"official_price_expr":"tier(\"base\", p * 2 + c * 8)"}]`, valid: true},
		{name: "video official price table", value: `[{"id":"a","name":"A","models":["sd"],"official_price":{"kind":"video","rows":[{"option":"480p","second":0.5},{"option":"720p","second":1,"reference_second":1.2}]}}]`, valid: true},
		{name: "token official price table", value: `[{"id":"a","name":"A","models":["gpt-x"],"official_price":{"kind":"token","input":2,"output":8,"cache_read":0.5}}]`, valid: true},
		{name: "video row without a per-second price", value: `[{"id":"a","name":"A","models":["sd"],"official_price":{"kind":"video","rows":[{"option":"480p","second":0}]}}]`},
		{name: "video rows with a repeated option", value: `[{"id":"a","name":"A","models":["sd"],"official_price":{"kind":"video","rows":[{"option":"480p","second":1},{"option":"480p","second":2}]}}]`},
		{name: "negative reference price", value: `[{"id":"a","name":"A","models":["sd"],"official_price":{"kind":"video","rows":[{"option":"480p","second":1,"reference_second":-1}]}}]`},
		{name: "token price without output", value: `[{"id":"a","name":"A","models":["gpt-x"],"official_price":{"kind":"token","input":2}}]`},
		{name: "token price of zero", value: `[{"id":"a","name":"A","models":["gpt-x"],"official_price":{"kind":"token","input":0,"output":0}}]`},
		{name: "unknown official price kind", value: `[{"id":"a","name":"A","models":["gpt-x"],"official_price":{"kind":"request"}}]`},
		{name: "padded official price", value: `[{"id":"a","name":"A","models":["gpt-x"],"official_price_expr":" tier(\"base\", p * 2)"}]`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePricingCategories(tt.value)
			if tt.valid {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			var conflict *pricingCategoryConflictError
			if tt.conflict != "" {
				require.ErrorAs(t, err, &conflict)
				assert.Equal(t, tt.conflict, conflict.Model)
				return
			}
			assert.NotErrorAs(t, err, &conflict)
		})
	}
}

func TestPublicPricingCategoriesKeepsOnlyVisibleModels(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{
		pricingCategoriesOptionKey: `[{"id":"sd20","name":"Seedance 2.0","models":["seedance-2.0","hidden-model","sd-2.0-线路1"],"badges":{"seedance-2.0":["hot"],"hidden-model":["new"]}},{"id":"empty","name":"Empty","models":["hidden-model"]}]`,
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})

	categories := publicPricingCategories([]model.Pricing{{ModelName: "sd-2.0-线路1"}, {ModelName: "seedance-2.0"}}, savedPricingCategories())

	require.Len(t, categories, 2)
	assert.Equal(t, []string{"seedance-2.0", "sd-2.0-线路1"}, categories[0].Models)
	assert.Equal(t, map[string][]string{"seedance-2.0": {"hot"}}, categories[0].Badges)
	assert.Empty(t, categories[1].Models)
}

func TestInheritCategoryOfficialPricesKeepsModelOwnPrice(t *testing.T) {
	categories := []pricingCategory{
		{ID: "a", Name: "A", Models: []string{"own", "inherits"}, OfficialPriceExpr: `tier("base", p * 2 + c * 8)`},
		{ID: "b", Name: "B", Models: []string{"no-category-price"}},
	}
	pricing := []model.Pricing{
		{ModelName: "own", OfficialPriceExpr: `tier("base", p * 1 + c * 4)`},
		{ModelName: "inherits"},
		{ModelName: "no-category-price"},
		{ModelName: "uncategorized"},
	}

	inheritCategoryOfficialPrices(pricing, categories)
	public := publicPricingCategories(pricing, categories)

	assert.Equal(t, `tier("base", p * 1 + c * 4)`, pricing[0].OfficialPriceExpr)
	assert.Equal(t, `tier("base", p * 2 + c * 8)`, pricing[1].OfficialPriceExpr)
	assert.Empty(t, pricing[2].OfficialPriceExpr)
	assert.Empty(t, pricing[3].OfficialPriceExpr)
	assert.Empty(t, public[0].OfficialPriceExpr, "the category list does not repeat the inherited price")
}

func TestValidatePricingCategoryOfficialPrices(t *testing.T) {
	const valid = `tier("base", p * 2 + c * 8)`
	const broken = `tier("base", p * )`
	category := func(expression string, models ...string) string {
		value, err := common.Marshal([]pricingCategory{{ID: "a", Name: "A", Models: models, OfficialPriceExpr: expression}})
		require.NoError(t, err)
		return string(value)
	}
	tests := []struct {
		name     string
		previous string
		value    string
		model    string
	}{
		{name: "price that evaluates for every model", value: category(valid, "token-a", "token-b")},
		{name: "category without a price", value: category("", "token-a")},
		{name: "price that does not evaluate", value: category(broken, "token-a"), model: "token-a"},
		{name: "unchanged price stays saveable", previous: category(broken, "token-a"), value: category(broken, "token-a")},
		{name: "model joining a category is checked", previous: category(broken, "token-a"), value: category(broken, "token-a", "token-b"), model: "token-b"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePricingCategoryOfficialPrices(tt.previous, tt.value)
			if tt.model == "" {
				assert.NoError(t, err)
				return
			}
			var officialPrice *pricingCategoryOfficialPriceError
			require.ErrorAs(t, err, &officialPrice)
			assert.Equal(t, tt.model, officialPrice.Model)
		})
	}
}

func TestInheritCategoryOfficialPriceTable(t *testing.T) {
	table := &model.OfficialPriceTable{Kind: "video", Rows: []model.OfficialPriceVideoRow{{Option: "720p", Second: 1}}}
	categories := []pricingCategory{
		{ID: "sd", Name: "Seedance", Models: []string{"line-a", "line-b"}, OfficialPrice: table},
	}
	pricing := []model.Pricing{
		{ModelName: "line-a"},
		{ModelName: "line-b", OfficialPriceExpr: `tier("720p", u("seconds") * 2)`},
	}

	inheritCategoryOfficialPrices(pricing, categories)
	public := publicPricingCategories(pricing, categories)

	assert.Same(t, table, pricing[0].OfficialPrice)
	assert.Nil(t, pricing[1].OfficialPrice, "a model's own official price takes precedence")
	assert.Nil(t, public[0].OfficialPrice, "the category list does not repeat the inherited table")
}
