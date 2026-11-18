package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

func GetPerfMetricsSummary(c *gin.Context) {
	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil {
			hours = parsed
		}
	}

	recentModels := c.QueryArray("recent_model")
	if len(recentModels) > perfmetrics.MaxRecentModels {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	listed, all := perfMetricsListedModels(c)
	if !all {
		recentModels = lo.Filter(recentModels, func(name string, _ int) bool {
			_, ok := listed[name]
			return ok
		})
	}
	activeGroups := append(lo.Keys(ratio_setting.GetGroupRatioCopy()), "auto")
	result, err := perfmetrics.QuerySummaryAll(hours, activeGroups, recentModels...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !all {
		result.Models = lo.Filter(result.Models, func(item perfmetrics.ModelSummary, _ int) bool {
			_, ok := listed[item.ModelName]
			return ok
		})
		for name := range result.RecentSuccessSeries {
			if _, ok := listed[name]; !ok {
				delete(result.RecentSuccessSeries, name)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// perfMetricsListedModels is the set of models the pricing page lists for the
// viewer. Metrics of other models would name unlisted and supplier-side model
// names, so only administrators (all = true) read them.
func perfMetricsListedModels(c *gin.Context) (listed map[string]struct{}, all bool) {
	if c.GetInt("role") >= common.RoleAdminUser {
		return nil, true
	}
	group := ""
	if id := c.GetInt("id"); id > 0 {
		if user, err := model.GetUserCache(id); err == nil {
			group = user.Group
		}
	}
	pricing := filterPricingByUsableGroups(model.GetPricing(), service.GetUserUsableGroups(group))
	listed = make(map[string]struct{}, len(pricing))
	for _, item := range pricing {
		listed[item.ModelName] = struct{}{}
	}
	return listed, false
}

func GetPerfMetrics(c *gin.Context) {
	modelName := c.Query("model")
	if modelName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "model is required",
		})
		return
	}

	if listed, all := perfMetricsListedModels(c); !all {
		if _, ok := listed[modelName]; !ok {
			common.ApiErrorStatus(c, http.StatusNotFound, common.NewMessage("Model not found"))
			return
		}
	}

	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil {
			hours = parsed
		}
	}

	result, err := perfmetrics.Query(perfmetrics.QueryParams{
		Model:         modelName,
		Group:         c.Query("group"),
		Hours:         hours,
		AllowedGroups: append(lo.Keys(ratio_setting.GetGroupRatioCopy()), "auto"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
