package controller

import (
	"maps"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func filterPricingByUsableGroups(pricing []model.Pricing, usableGroup map[string]string) []model.Pricing {
	if len(pricing) == 0 {
		return pricing
	}
	if len(usableGroup) == 0 {
		return []model.Pricing{}
	}

	filtered := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		if common.StringsContains(item.EnableGroup, "all") {
			filtered = append(filtered, item)
			continue
		}
		for _, group := range item.EnableGroup {
			if _, ok := usableGroup[group]; ok {
				filtered = append(filtered, item)
				break
			}
		}
	}
	return filtered
}

// attachModelGroupRatios gives each listed model the group ratios it has of
// its own for the groups the viewer can use, as the response's group_ratio
// would show them. A group where the viewer's user group has a special ratio
// keeps that ratio, as billing does.
func attachModelGroupRatios(pricing []model.Pricing, usableGroup map[string]string, userGroup string, seesBasePrices bool) {
	for i := range pricing {
		own := ratio_setting.GetModelGroupRatios(pricing[i].ModelName)
		if len(own) == 0 {
			continue
		}
		shown := make(map[string]float64, len(own))
		for group, ratio := range own {
			if _, ok := usableGroup[group]; !ok {
				continue
			}
			if _, special := ratio_setting.GetGroupGroupRatio(userGroup, group); special {
				continue
			}
			if !seesBasePrices {
				ratio = ratio_setting.PublicGroupRatio(ratio)
			}
			shown[group] = ratio
		}
		if len(shown) > 0 {
			pricing[i].ModelGroupRatio = shown
		}
	}
}

// VisitorPricing is the model list the pricing page shows a visitor who is
// not signed in.
func VisitorPricing() []model.Pricing {
	return filterPricingByUsableGroups(model.GetPublicPricing(), service.GetUserUsableGroups(""))
}

func GetPricing(c *gin.Context) {
	// Base prices are the site's supply cost: only administrators read them.
	seesBasePrices := c.GetInt("role") >= common.RoleAdminUser
	var pricing []model.Pricing
	if seesBasePrices {
		pricing = model.GetPricing()
	} else {
		pricing = model.GetPublicPricing()
	}
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	maps.Copy(groupRatio, ratio_setting.GetGroupRatioCopy())
	var group string
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
			for g := range groupRatio {
				ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
				if ok {
					groupRatio[g] = ratio
				}
			}
		}
	}

	usableGroup = service.GetUserUsableGroups(group)
	// The filter copies the cached entries, so inheriting here leaves the
	// shared pricing cache untouched.
	pricing = filterPricingByUsableGroups(pricing, usableGroup)
	categories := savedPricingCategories()
	inheritCategoryOfficialPrices(pricing, categories)
	attachModelGroupRatios(pricing, usableGroup, group, seesBasePrices)
	// check groupRatio contains usableGroup
	for group := range ratio_setting.GetGroupRatioCopy() {
		if _, ok := usableGroup[group]; !ok {
			delete(groupRatio, group)
		}
	}
	if !seesBasePrices {
		for group, ratio := range groupRatio {
			groupRatio[group] = ratio_setting.PublicGroupRatio(ratio)
		}
	}

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"categories":         publicPricingCategories(pricing, categories),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroup(group),
		"pricing_version":    "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccessT(c, "Model ratios reset", nil)
}
