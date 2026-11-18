package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type membershipResponse struct {
	Success bool           `json:"success"`
	Data    map[string]any `json:"data"`
}

func TestGetMembership(t *testing.T) {
	previousDB := model.DB
	previousRedis := common.RedisEnabled
	previousSetting := *operation_setting.GetMembershipSetting()
	previousRatio := ratio_setting.GroupRatio2JSONString()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.Redemption{}))
	model.DB = db
	common.RedisEnabled = false
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":0.85,"overseas":1.2,"vip-overseas":1.1}`))
	*operation_setting.GetMembershipSetting() = operation_setting.MembershipSetting{
		Enabled: true, BaseGroup: "default", VipGroup: "vip",
		ExtraGroupPairs: map[string]string{"overseas": "vip-overseas"},
		TotalTopUpUSD:   1000, SingleTopUpUSD: 500, VipSupportTelegram: "vip_desk",
		StandardConcurrency: 10, VipConcurrency: 100,
	}
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
		*operation_setting.GetMembershipSetting() = previousSetting
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatio))
	})

	require.NoError(t, db.Create(&model.User{Id: 1, Username: "standard", AffCode: "m1", Group: "default", Status: common.UserStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.User{Id: 2, Username: "vip", AffCode: "m2", Group: "vip", Status: common.UserStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.User{Id: 3, Username: "overseas", AffCode: "m3", Group: "overseas", Status: common.UserStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.User{Id: 4, Username: "overseas_vip", AffCode: "m4", Group: "vip-overseas", Status: common.UserStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.TopUp{UserId: 1, TradeNo: "m-a", Status: common.TopUpStatusSuccess, CreditedQuota: int(300 * common.QuotaPerUnit)}).Error)
	require.NoError(t, db.Create(&model.TopUp{UserId: 1, TradeNo: "m-b", Status: common.TopUpStatusSuccess, CreditedQuota: int(100 * common.QuotaPerUnit)}).Error)

	call := func(userId int, role int) map[string]any {
		gin.SetMode(gin.TestMode)
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(http.MethodGet, "/api/membership", nil)
		if userId > 0 {
			c.Set("id", userId)
			c.Set("role", role)
		}
		GetMembership(c)
		require.Equal(t, http.StatusOK, recorder.Code)
		var response membershipResponse
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.True(t, response.Success)
		return response.Data
	}

	visitor := call(0, 0)
	assert.Equal(t, true, visitor["enabled"])
	assert.Equal(t, false, visitor["signed_in"])
	assert.InDelta(t, 0.85, visitor["vip_price_rate"], 1e-9)
	assert.InDelta(t, 1000*common.QuotaPerUnit, visitor["total_threshold_quota"], 0.5)
	assert.NotContains(t, visitor, "paid_total_quota")
	assert.Equal(t, "vip", visitor["vip_group"])
	assert.InDelta(t, ratio_setting.PublicGroupRatio(0.85), visitor["vip_display_group_ratio"], 1e-9)
	// The concurrency each tier is told about reaches visitors too.
	assert.InDelta(t, 10, visitor["standard_concurrency"], 0)
	assert.InDelta(t, 100, visitor["vip_concurrency"], 0)

	standard := call(1, common.RoleCommonUser)
	assert.Equal(t, false, standard["is_vip"])
	assert.InDelta(t, 400*common.QuotaPerUnit, standard["paid_total_quota"], 0.5)
	assert.InDelta(t, 300*common.QuotaPerUnit, standard["paid_single_quota"], 0.5)
	assert.NotContains(t, standard, "vip_support_telegram")

	vip := call(2, common.RoleCommonUser)
	assert.Equal(t, true, vip["is_vip"])
	assert.Equal(t, "vip_desk", vip["vip_support_telegram"])

	// Every pair is listed with ratios on the published scale.
	pairs, ok := visitor["vip_pairs"].([]any)
	require.True(t, ok)
	require.Len(t, pairs, 2)
	overseasPair := pairs[1].(map[string]any)
	assert.Equal(t, "overseas", overseasPair["base_group"])
	assert.Equal(t, "vip-overseas", overseasPair["vip_group"])
	assert.InDelta(t, ratio_setting.PublicGroupRatio(1.2), overseasPair["base_ratio"], 1e-9)
	assert.InDelta(t, ratio_setting.PublicGroupRatio(1.1), overseasPair["vip_ratio"], 1e-9)

	// Overseas users are described by their own pair.
	overseas := call(3, common.RoleCommonUser)
	assert.Equal(t, "overseas", overseas["base_group"])
	assert.Equal(t, "vip-overseas", overseas["vip_group"])
	assert.InDelta(t, 1.1/1.2, overseas["vip_price_rate"], 1e-9)
	assert.Equal(t, false, overseas["is_vip"])

	overseasVip := call(4, common.RoleCommonUser)
	assert.Equal(t, true, overseasVip["is_vip"])
	assert.Equal(t, "vip_desk", overseasVip["vip_support_telegram"])

	// Administrators read base prices, so their ratios stay raw.
	admin := call(1, common.RoleAdminUser)
	assert.InDelta(t, 0.85, admin["vip_display_group_ratio"], 1e-9)
}
