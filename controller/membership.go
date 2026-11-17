package controller

import (
	"net/http"
	"slices"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// GetMembership describes the VIP program to anyone, and to a signed-in user
// also their tier and how far their paid top-ups are from the thresholds.
// The VIP support contact is only sent to VIP users.
func GetMembership(c *gin.Context) {
	setting := operation_setting.GetMembershipSetting()
	pairs := model.MembershipGroupPairs()
	var user *model.User
	if userId := c.GetInt("id"); userId > 0 {
		var err error
		if user, err = model.GetUserById(userId, false); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	userGroup := ""
	if user != nil {
		userGroup = user.Group
	}
	// The viewer's own pair describes their tier; everyone else sees the main
	// pair.
	pairIndex := slices.IndexFunc(pairs, func(pair operation_setting.MembershipGroupPair) bool {
		return pair.Base == userGroup || pair.Vip == userGroup
	})
	pair := operation_setting.MembershipGroupPair{Base: setting.BaseGroup, Vip: setting.VipGroup}
	if pairIndex >= 0 {
		pair = pairs[pairIndex]
	} else if len(pairs) > 0 {
		pair = pairs[0]
	}
	// Ratios share /api/pricing's scale for this viewer, so the pricing page
	// can multiply its own prices by them.
	pairData := make([]gin.H, 0, len(pairs))
	for _, p := range pairs {
		pairData = append(pairData, gin.H{
			"base_group": p.Base,
			"vip_group":  p.Vip,
			"base_ratio": membershipPricingGroupRatio(c, userGroup, p.Base),
			"vip_ratio":  membershipPricingGroupRatio(c, userGroup, p.Vip),
		})
	}
	enabled := len(pairs) > 0
	vipDisplayRatio := 0.0
	if enabled {
		vipDisplayRatio = membershipPricingGroupRatio(c, userGroup, pair.Vip)
	}
	data := gin.H{
		"enabled":                 enabled,
		"total_threshold_quota":   model.MembershipThresholdQuota(setting.TotalTopUpUSD),
		"single_threshold_quota":  model.MembershipThresholdQuota(setting.SingleTopUpUSD),
		"vip_price_rate":          vipPriceRate(pair),
		"base_group":              pair.Base,
		"vip_group":               pair.Vip,
		"vip_display_group_ratio": vipDisplayRatio,
		"vip_pairs":               pairData,
		"signed_in":               false,
	}
	if user != nil {
		total, single, err := model.PaidTopUpQuota(user.Id)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		isVip := pairIndex >= 0 && pairs[pairIndex].Vip == userGroup
		data["signed_in"] = true
		data["is_vip"] = isVip
		data["paid_total_quota"] = total
		data["paid_single_quota"] = single
		if isVip {
			data["vip_support_telegram"] = setting.VipSupportTelegram
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": data})
}

// membershipPricingGroupRatio is a group ratio as /api/pricing shows it to
// this viewer: their group's special ratio when one is set, published unless
// the viewer is an administrator who reads base prices; 0 when the group has
// no ratio.
func membershipPricingGroupRatio(c *gin.Context, userGroup string, group string) float64 {
	if !ratio_setting.ContainsGroupRatio(group) {
		return 0
	}
	ratio := ratio_setting.GetGroupRatio(group)
	if userGroup != "" {
		if special, ok := ratio_setting.GetGroupGroupRatio(userGroup, group); ok {
			ratio = special
		}
	}
	if c.GetInt("role") >= common.RoleAdminUser {
		return ratio
	}
	return ratio_setting.PublicGroupRatio(ratio)
}

// vipPriceRate is the VIP price as a share of the standard price, or 1 when
// the VIP group is not cheaper.
func vipPriceRate(pair operation_setting.MembershipGroupPair) float64 {
	if !ratio_setting.ContainsGroupRatio(pair.Vip) || !ratio_setting.ContainsGroupRatio(pair.Base) {
		return 1
	}
	base := ratio_setting.GetGroupRatio(pair.Base)
	vip := ratio_setting.GetGroupRatio(pair.Vip)
	if base <= 0 || vip <= 0 || vip >= base {
		return 1
	}
	return vip / base
}
