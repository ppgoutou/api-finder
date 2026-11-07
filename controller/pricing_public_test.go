package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type publicPricingResponse struct {
	Data       []model.Pricing    `json:"data"`
	GroupRatio map[string]float64 `json:"group_ratio"`
}

func requestAs(t *testing.T, handler gin.HandlerFunc, userID, role int, response any) string {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest("GET", "/", nil)
	if userID != 0 {
		c.Set("id", userID)
		c.Set("role", role)
	}
	handler(c)
	require.Equal(t, 200, recorder.Code)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), response))
	return recorder.Body.String()
}

func setupPublicPricingFixture(t *testing.T) (commonUserID, adminUserID int) {
	t.Helper()
	previousDB, previousRedis, previousMemoryCache := model.DB, common.RedisEnabled, common.MemoryCacheEnabled
	previousRatios := ratio_setting.GroupRatio2JSONString()
	savedSettings := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		savedSettings[key] = value
		return nil
	}))
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Channel{}, &model.Ability{}, &model.Model{}, &model.Vendor{}))
	model.DB = db
	common.RedisEnabled = false
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
		common.MemoryCacheEnabled = previousMemoryCache
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatios))
		require.NoError(t, config.GlobalConfig.LoadFromDB(savedSettings))
		model.InvalidatePricingCache()
	})

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":2.5,"vip":2}`))
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode": `{"priced-model":"tiered_expr","unscalable-model":"tiered_expr"}`,
		"billing_setting.billing_expr": `{"priced-model":"len <= 1000 ? tier(\"short\", p * 2 + c * 8) : tier(\"long\", p * 4 + c * 16)","unscalable-model":"tier(\"base\", p + c)"}`,
	}))
	require.NoError(t, db.Create(&model.Channel{Id: 1, Name: "fixture", Key: "unused", Status: common.ChannelStatusEnabled}).Error)
	for _, name := range []string{"priced-model", "unscalable-model"} {
		require.NoError(t, db.Create(&model.Ability{Group: "default", Model: name, ChannelId: 1, Enabled: true}).Error)
	}
	commonUser := &model.User{Username: "pricing-user", AffCode: "pricing-user", Password: "unused", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, db.Create(commonUser).Error)
	adminUser := &model.User{Username: "pricing-admin", AffCode: "pricing-admin", Password: "unused", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, db.Create(adminUser).Error)
	model.InvalidatePricingCache()
	return commonUser.Id, adminUser.Id
}

func pricingModelByName(t *testing.T, items []model.Pricing, name string) model.Pricing {
	t.Helper()
	for _, item := range items {
		if item.ModelName == name {
			return item
		}
	}
	require.Failf(t, "model missing", "%s", name)
	return model.Pricing{}
}

func TestPricingHidesBasePricesFromNonAdmins(t *testing.T) {
	commonUserID, adminUserID := setupPublicPricingFixture(t)

	var admin publicPricingResponse
	requestAs(t, GetPricing, adminUserID, common.RoleAdminUser, &admin)
	adminModel := pricingModelByName(t, admin.Data, "priced-model")
	assert.Equal(t, `len <= 1000 ? tier("short", p * 2 + c * 8) : tier("long", p * 4 + c * 16)`, adminModel.BillingExpr)
	assert.Equal(t, 2.5, admin.GroupRatio["default"])
	assert.Equal(t, `tier("base", p + c)`, pricingModelByName(t, admin.Data, "unscalable-model").BillingExpr)

	for _, viewer := range []struct {
		name   string
		userID int
	}{{"visitor", 0}, {"common user", commonUserID}} {
		t.Run(viewer.name, func(t *testing.T) {
			var public publicPricingResponse
			body := requestAs(t, GetPricing, viewer.userID, common.RoleCommonUser, &public)
			publicModel := pricingModelByName(t, public.Data, "priced-model")

			assert.Equal(t, `len <= 1000 ? tier("short", p * 5 + c * 20) : tier("long", p * 10 + c * 40)`, publicModel.BillingExpr)
			assert.Equal(t, 1.0, public.GroupRatio["default"])
			assert.Equal(t, 0.8, public.GroupRatio["vip"])
			assert.InDelta(t, adminModel.ModelRatio*2.5, publicModel.ModelRatio, 1e-9)
			assert.NotContains(t, body, "p * 2 ")
			assert.NotContains(t, body, "2.5")

			// A price that cannot be scaled is withheld, never published raw.
			assert.Empty(t, pricingModelByName(t, public.Data, "unscalable-model").BillingExpr)
			assert.NotContains(t, body, "p + c")

			// Every selling price stays what the administrator's numbers give.
			for _, params := range []billingexpr.TokenParams{{P: 500, C: 100, Len: 500}, {P: 2000, C: 100, Len: 2000}} {
				rawCost, _, err := billingexpr.RunExpr(adminModel.BillingExpr, params)
				require.NoError(t, err)
				publicCost, _, err := billingexpr.RunExpr(publicModel.BillingExpr, params)
				require.NoError(t, err)
				for group := range public.GroupRatio {
					assert.InDelta(t, rawCost*admin.GroupRatio[group], publicCost*public.GroupRatio[group], 1e-6, group)
				}
			}
		})
	}

	// A changed group ratio applies at once, without waiting for the pricing cache.
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":2,"vip":2}`))
	var changed publicPricingResponse
	requestAs(t, GetPricing, 0, 0, &changed)
	assert.Contains(t, pricingModelByName(t, changed.Data, "priced-model").BillingExpr, `p * 4 + c * 16`)
	assert.Equal(t, 1.0, changed.GroupRatio["default"])
}

func TestUserGroupsPublishTheRatioMatchingPublicPrices(t *testing.T) {
	commonUserID, adminUserID := setupPublicPricingFixture(t)

	var response struct {
		Data map[string]struct {
			Ratio float64 `json:"ratio"`
		} `json:"data"`
	}
	requestAs(t, GetUserGroups, commonUserID, common.RoleCommonUser, &response)
	assert.Equal(t, 1.0, response.Data["default"].Ratio)

	requestAs(t, GetUserGroups, adminUserID, common.RoleAdminUser, &response)
	assert.Equal(t, 2.5, response.Data["default"].Ratio)
}
