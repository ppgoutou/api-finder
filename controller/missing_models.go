package controller

import (
	"net/http"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetMissingModels returns the list of model names that are referenced by channels
// but do not have corresponding records in the models meta table.
// This helps administrators quickly discover models that need configuration.
func GetMissingModels(c *gin.Context) {
	missing, err := model.GetMissingModels()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    missing,
	})
}

// GetModelOnboarding lists pending upstream and configured models with their
// metadata links for the model onboarding workbench.
func GetModelOnboarding(c *gin.Context) {
	overview, err := model.GetOnboardingOverview()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

// SetModelOnboardingIgnored sets models aside or restores them. It only moves
// them on the workbench: channels, prices and metadata stay as they are.
func SetModelOnboardingIgnored(c *gin.Context) {
	var request struct {
		ModelNames []string `json:"model_names"`
		Ignored    bool     `json:"ignored"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || len(request.ModelNames) == 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	ignored := model.GetOnboardingIgnoredModels()
	for _, name := range request.ModelNames {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		ignored = slices.DeleteFunc(ignored, func(existing string) bool { return existing == name })
		if request.Ignored {
			ignored = append(ignored, name)
		}
	}
	slices.Sort(ignored)
	if err := writeOnboardingOption(model.OnboardingIgnoredModelsOption, ignored); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.onboarding.ignore", map[string]any{"models": request.ModelNames, "ignored": request.Ignored})
	common.ApiSuccess(c, nil)
}
