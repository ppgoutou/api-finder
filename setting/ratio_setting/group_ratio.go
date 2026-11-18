package ratio_setting

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"

	"github.com/shopspring/decimal"
)

var defaultGroupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}

var groupRatioMap = types.NewRWMap[string, float64]()

var defaultGroupGroupRatio = map[string]map[string]float64{
	"vip": {
		"edit_this": 0.9,
	},
}

var groupGroupRatioMap = types.NewRWMap[string, map[string]float64]()

var defaultGroupSpecialUsableGroup = map[string]map[string]string{}

// modelGroupRatioMap holds group ratios that apply to one model only, keyed
// by model name and then group. A model's ratio for a group replaces that
// group's ratio; a user group's special ratio still wins over both.
var modelGroupRatioMap = types.NewRWMap[string, map[string]float64]()

type GroupRatioSetting struct {
	GroupRatio              *types.RWMap[string, float64]            `json:"group_ratio"`
	GroupGroupRatio         *types.RWMap[string, map[string]float64] `json:"group_group_ratio"`
	GroupSpecialUsableGroup *types.RWMap[string, map[string]string]  `json:"group_special_usable_group"`
	ModelGroupRatio         *types.RWMap[string, map[string]float64] `json:"model_group_ratio"`
}

var groupRatioSetting GroupRatioSetting

func init() {
	groupSpecialUsableGroup := types.NewRWMap[string, map[string]string]()
	groupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)

	groupRatioMap.AddAll(defaultGroupRatio)
	groupGroupRatioMap.AddAll(defaultGroupGroupRatio)

	groupRatioSetting = GroupRatioSetting{
		GroupSpecialUsableGroup: groupSpecialUsableGroup,
		GroupRatio:              groupRatioMap,
		GroupGroupRatio:         groupGroupRatioMap,
		ModelGroupRatio:         modelGroupRatioMap,
	}

	config.GlobalConfig.Register("group_ratio_setting", &groupRatioSetting)
}

func GetGroupRatioSetting() *GroupRatioSetting {
	if groupRatioSetting.GroupSpecialUsableGroup == nil {
		groupRatioSetting.GroupSpecialUsableGroup = types.NewRWMap[string, map[string]string]()
		groupRatioSetting.GroupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)
	}
	return &groupRatioSetting
}

func GetGroupRatioCopy() map[string]float64 {
	return groupRatioMap.ReadAll()
}

func ContainsGroupRatio(name string) bool {
	_, ok := groupRatioMap.Get(name)
	return ok
}

func GroupRatio2JSONString() string {
	return groupRatioMap.MarshalJSONString()
}

func UpdateGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupRatioMap, jsonStr)
}

func GetGroupRatio(name string) float64 {
	ratio, ok := groupRatioMap.Get(name)
	if !ok {
		common.SysLog(common.LogText("group ratio not found: %s", name))
		return 1
	}
	return ratio
}

// PublicPriceFactor is the factor moved from group ratios into published model
// prices, so viewers without pricing access see the same selling prices but no
// price from before the group ratio. It is the default group's ratio, or the
// smallest positive ratio when that group is missing or free.
func PublicPriceFactor() float64 {
	if ratio, ok := groupRatioMap.Get("default"); ok && ratio > 0 {
		return ratio
	}
	factor := 0.0
	for _, ratio := range groupRatioMap.ReadAll() {
		if ratio > 0 && (factor == 0 || ratio < factor) {
			factor = ratio
		}
	}
	if factor == 0 {
		return 1
	}
	return factor
}

// PublicGroupRatio converts a group ratio to the one published next to prices
// already multiplied by PublicPriceFactor.
func PublicGroupRatio(ratio float64) float64 {
	published := decimal.NewFromFloat(ratio).Div(decimal.NewFromFloat(PublicPriceFactor()))
	return published.Round(6).InexactFloat64()
}

// ModelGroupRatioOption is the option key of the per-model group ratios.
const ModelGroupRatioOption = "group_ratio_setting.model_group_ratio"

// GetModelGroupRatio returns the ratio a model has for a group of its own,
// if any.
func GetModelGroupRatio(modelName, group string) (float64, bool) {
	ratios, ok := modelGroupRatioMap.Get(modelName)
	if !ok {
		return 0, false
	}
	ratio, ok := ratios[group]
	return ratio, ok
}

// GetModelGroupRatios returns a copy of the group ratios a model has of its
// own, or nil when it has none.
func GetModelGroupRatios(modelName string) map[string]float64 {
	ratios, ok := modelGroupRatioMap.Get(modelName)
	if !ok || len(ratios) == 0 {
		return nil
	}
	copied := make(map[string]float64, len(ratios))
	maps.Copy(copied, ratios)
	return copied
}

// ModelGroupRatioCopy returns every model's own group ratios.
func ModelGroupRatioCopy() map[string]map[string]float64 {
	all := modelGroupRatioMap.ReadAll()
	copied := make(map[string]map[string]float64, len(all))
	for name, ratios := range all {
		inner := make(map[string]float64, len(ratios))
		maps.Copy(inner, ratios)
		copied[name] = inner
	}
	return copied
}

// GetModelOrGroupRatio is the ratio a request for a model in a group pays
// before any user group special ratio: the model's own ratio for the group
// when set, else the group's ratio.
func GetModelOrGroupRatio(modelName, group string) float64 {
	if ratio, ok := GetModelGroupRatio(modelName, group); ok {
		return ratio
	}
	return GetGroupRatio(group)
}

// CheckModelGroupRatio validates per-model group ratios: every ratio is a
// finite number of at least 0 and every group has a group ratio.
func CheckModelGroupRatio(jsonStr string) error {
	parsed := make(map[string]map[string]float64)
	if err := common.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return err
	}
	return ValidateModelGroupRatios(parsed)
}

// ValidateModelGroupRatios is CheckModelGroupRatio for parsed ratios.
func ValidateModelGroupRatios(ratios map[string]map[string]float64) error {
	for modelName, groups := range ratios {
		if strings.TrimSpace(modelName) == "" {
			return errors.New("model name must not be empty")
		}
		for group, ratio := range groups {
			if !ContainsGroupRatio(group) {
				return fmt.Errorf("model %s: group %s has no group ratio", modelName, group)
			}
			if math.IsNaN(ratio) || math.IsInf(ratio, 0) || ratio < 0 || ratio > maxModelGroupRatio {
				return fmt.Errorf("model %s: ratio of group %s must be between 0 and %d", modelName, group, maxModelGroupRatio)
			}
		}
	}
	return nil
}

// maxModelGroupRatio bounds a model's own group ratio, a billing multiplier.
const maxModelGroupRatio = 100

func GetGroupGroupRatio(userGroup, usingGroup string) (float64, bool) {
	gp, ok := groupGroupRatioMap.Get(userGroup)
	if !ok {
		return -1, false
	}
	ratio, ok := gp[usingGroup]
	if !ok {
		return -1, false
	}
	return ratio, true
}

func GroupGroupRatio2JSONString() string {
	return groupGroupRatioMap.MarshalJSONString()
}

func UpdateGroupGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupGroupRatioMap, jsonStr)
}

func CheckGroupRatio(jsonStr string) error {
	checkGroupRatio := make(map[string]float64)
	err := json.Unmarshal([]byte(jsonStr), &checkGroupRatio)
	if err != nil {
		return err
	}
	for name, ratio := range checkGroupRatio {
		if ratio < 0 {
			return errors.New("group ratio must be not less than 0: " + name)
		}
	}
	return nil
}
