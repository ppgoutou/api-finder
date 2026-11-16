package controller

import (
	"net/http"

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
	enabled := setting.Enabled && setting.VipGroup != "" && ratio_setting.ContainsGroupRatio(setting.VipGroup)
	data := gin.H{
		"enabled":                 enabled,
		"total_threshold_quota":   model.MembershipThresholdQuota(setting.TotalTopUpUSD),
		"single_threshold_quota":  model.MembershipThresholdQuota(setting.SingleTopUpUSD),
		"vip_price_rate":          vipPriceRate(setting),
		"vip_group":               setting.VipGroup,
		"vip_display_group_ratio": vipDisplayGroupRatio(setting, enabled),
		"signed_in":               false,
	}
	userId := c.GetInt("id")
	if userId > 0 {
		user, err := model.GetUserById(userId, false)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		total, single, err := model.PaidTopUpQuota(userId)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		isVip := user.Group == setting.VipGroup && setting.VipGroup != ""
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

// vipPriceRate is the VIP price as a share of the standard price, or 1 when
// the VIP group is not cheaper.
func vipPriceRate(setting *operation_setting.MembershipSetting) float64 {
	if !ratio_setting.ContainsGroupRatio(setting.VipGroup) || !ratio_setting.ContainsGroupRatio(setting.BaseGroup) {
		return 1
	}
	base := ratio_setting.GetGroupRatio(setting.BaseGroup)
	vip := ratio_setting.GetGroupRatio(setting.VipGroup)
	if base <= 0 || vip <= 0 || vip >= base {
		return 1
	}
	return vip / base
}

// vipDisplayGroupRatio is the VIP group ratio the pricing page multiplies
// model prices by, scaled like the group ratios /api/pricing publishes; 0
// when the program is off.
func vipDisplayGroupRatio(setting *operation_setting.MembershipSetting, enabled bool) float64 {
	if !enabled {
		return 0
	}
	return ratio_setting.PublicGroupRatio(ratio_setting.GetGroupRatio(setting.VipGroup))
}
