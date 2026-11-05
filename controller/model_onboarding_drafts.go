package controller

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"maps"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const (
	onboardingDescriptionLLMOption = "OnboardingDescriptionLLM"
	onboardingDraftsPerRun         = 5
	onboardingLLMTimeout           = 90 * time.Second

	draftErrorLLMFailed   = "The language model request failed"
	draftErrorLLMUnusable = "The language model reply was not usable"
	draftErrorLLMPrice    = "The polished description mentioned a price and was not used"
)

// onboardingDraftLocales are the description languages, in the order the
// model card editor lists them.
var onboardingDraftLocales = []string{"zh", "zh-TW", "en", "ja", "fr", "ru", "vi"}

// Prices stay private: a polished description that names an amount of money
// is dropped.
var draftPricePattern = regexp.MustCompile(`(?i)[¥￥$€]|\d\s*(元|美元|美金|usd|cny|rmb|cents?)`)

// onboardingDescriptionLLM is an OpenAI-compatible chat endpoint that writes
// draft descriptions. The key is never returned.
type onboardingDescriptionLLM struct {
	BaseURL string `json:"base_url"`
	Model   string `json:"model"`
	APIKey  string `json:"api_key"`
}

func (llm onboardingDescriptionLLM) configured() bool {
	return llm.BaseURL != "" && llm.Model != "" && llm.APIKey != ""
}

func GetOnboardingDescriptionLLM(c *gin.Context) {
	llm := readOnboardingOption[onboardingDescriptionLLM](onboardingDescriptionLLMOption)
	common.ApiSuccess(c, gin.H{"base_url": llm.BaseURL, "model": llm.Model, "has_key": llm.APIKey != ""})
}

// SetOnboardingDescriptionLLM saves the endpoint. An omitted api_key keeps
// the stored one; an empty one clears it.
func SetOnboardingDescriptionLLM(c *gin.Context) {
	var request struct {
		BaseURL string  `json:"base_url"`
		Model   string  `json:"model"`
		APIKey  *string `json:"api_key"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	baseURL := strings.TrimRight(strings.TrimSpace(request.BaseURL), "/")
	if baseURL != "" && !strings.HasPrefix(baseURL, "https://") && !strings.HasPrefix(baseURL, "http://") {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	llm := readOnboardingOption[onboardingDescriptionLLM](onboardingDescriptionLLMOption)
	llm.BaseURL, llm.Model = baseURL, strings.TrimSpace(request.Model)
	if request.APIKey != nil {
		llm.APIKey = strings.TrimSpace(*request.APIKey)
	}
	if err := writeOnboardingOption(onboardingDescriptionLLMOption, llm); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "model.onboarding.description_llm", map[string]any{"base_url": llm.BaseURL, "model": llm.Model, "has_key": llm.APIKey != ""})
	common.ApiSuccess(c, gin.H{"base_url": llm.BaseURL, "model": llm.Model, "has_key": llm.APIKey != ""})
}

// ListOnboardingDescriptionLLMModels lists the models the endpoint offers so
// one can be picked. An empty api_key uses the stored one.
func ListOnboardingDescriptionLLMModels(c *gin.Context) {
	var request struct {
		BaseURL string `json:"base_url"`
		APIKey  string `json:"api_key"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	baseURL := strings.TrimRight(strings.TrimSpace(request.BaseURL), "/")
	if !strings.HasPrefix(baseURL, "https://") && !strings.HasPrefix(baseURL, "http://") {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	apiKey := strings.TrimSpace(request.APIKey)
	if apiKey == "" {
		apiKey = readOnboardingOption[onboardingDescriptionLLM](onboardingDescriptionLLMOption).APIKey
	}
	if apiKey == "" {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Enter an API key first"))
		return
	}
	if !strings.HasSuffix(baseURL, "/v1") {
		baseURL += "/v1"
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	upstream, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/models", nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	upstream.Header.Set("Authorization", "Bearer "+apiKey)
	response, err := service.GetHttpClient().Do(upstream)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if response.StatusCode != http.StatusOK {
		common.ApiError(c, fmt.Errorf("model list returned HTTP %d", response.StatusCode))
		return
	}
	var list struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := common.Unmarshal(raw, &list); err != nil {
		common.ApiError(c, err)
		return
	}
	models := make([]string, 0, len(list.Data))
	for _, item := range list.Data {
		if item.ID != "" && !slices.Contains(models, item.ID) {
			models = append(models, item.ID)
		}
	}
	slices.Sort(models)
	common.ApiSuccess(c, models)
}

// DraftOnboardingModel prepares the metadata draft of one model again.
func DraftOnboardingModel(c *gin.Context) {
	var request struct {
		ModelName string `json:"model_name"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || strings.TrimSpace(request.ModelName) == "" {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}
	var metadata []model.Model
	if err := model.DB.Find(&metadata).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	name := strings.TrimSpace(request.ModelName)
	draft := buildOnboardingDraft(c.Request.Context(), name, metadata)
	drafts := model.GetOnboardingDrafts()
	drafts[name] = draft
	if err := writeOnboardingOption(model.OnboardingDraftsOption, drafts); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, draft)
}

// prepareOnboardingDrafts drafts metadata for pending models that have none
// and no draft yet, a few per run since each may call the language model.
func prepareOnboardingDrafts(ctx context.Context) []string {
	drafted := []string{}
	overview, err := model.GetOnboardingOverview()
	if err != nil {
		common.SysError(common.LogText("failed to prepare onboarding drafts: %s", err.Error()))
		return drafted
	}
	var metadata []model.Model
	if err := model.DB.Find(&metadata).Error; err != nil {
		common.SysError(common.LogText("failed to prepare onboarding drafts: %s", err.Error()))
		return drafted
	}
	drafts := model.GetOnboardingDrafts()
	for _, item := range overview.Items {
		if len(drafted) >= onboardingDraftsPerRun {
			break
		}
		if item.Ignored || len(item.PendingChannels) == 0 || item.MetadataID > 0 || item.MetadataRule != "" || item.Draft != nil {
			continue
		}
		drafts[item.ModelName] = buildOnboardingDraft(ctx, item.ModelName, metadata)
		drafted = append(drafted, item.ModelName)
	}
	if len(drafted) == 0 {
		return drafted
	}
	if err := writeOnboardingOption(model.OnboardingDraftsOption, drafts); err != nil {
		common.SysError(common.LogText("failed to save onboarding drafts: %s", err.Error()))
		return []string{}
	}
	return drafted
}

// onboardingModelFacts is what the plugin serving a model declares about it.
type onboardingModelFacts struct {
	Billing     string   `json:"billing,omitempty"`
	Resolutions []string `json:"resolutions,omitempty"`
	MinDuration int      `json:"min_duration,omitempty"`
	MaxDuration int      `json:"max_duration,omitempty"`
	Durations   []int    `json:"durations,omitempty"`
	Ratios      []string `json:"ratios,omitempty"`
}

func onboardingFacts(name string) onboardingModelFacts {
	facts := onboardingModelFacts{}
	plugin, ok := jsplugin.DefaultRegistry.Generation().GetByModel(name)
	if !ok {
		return facts
	}
	if limits, ok := plugin.Meta.LimitsForModel(name); ok {
		facts.MinDuration, facts.MaxDuration = limits.MinDuration, limits.MaxDuration
		facts.Durations, facts.Ratios = limits.Durations, limits.Ratios
	}
	schema, _ := plugin.Meta.UsageForModel(name)
	for _, key := range slices.Sorted(maps.Keys(schema)) {
		field := schema[key]
		if key == "resolution" {
			facts.Resolutions = field.Enum
		}
		switch field.Unit {
		case "second":
			facts.Billing = "second"
		case "count":
			facts.Billing = "count"
		case "token":
			facts.Billing = "token"
		}
	}
	return facts
}

func buildOnboardingDraft(ctx context.Context, name string, metadata []model.Model) model.OnboardingDraft {
	draft := model.OnboardingDraft{GeneratedAt: common.GetTimestamp()}
	var sibling *model.Model
	for i := range metadata {
		record := &metadata[i]
		if record.ModelName == name || record.NameRule != model.NameRuleExact {
			continue
		}
		if sharedPrefix(record.ModelName, name) > sharedPrefix(siblingName(sibling), name) {
			sibling = record
		}
	}
	if sibling != nil && sharedPrefix(sibling.ModelName, name) < 4 {
		sibling = nil
	}
	if sibling != nil {
		draft.Icon, draft.Tags, draft.VendorID, draft.BasedOn = sibling.Icon, sibling.Tags, sibling.VendorID, sibling.ModelName
	}
	facts := onboardingFacts(name)
	draft.Description = templateDraftDescription(facts)

	llm := readOnboardingOption[onboardingDescriptionLLM](onboardingDescriptionLLMOption)
	if !llm.configured() {
		return draft
	}
	supplierDescription := ""
	for _, snapshot := range readOnboardingOption[map[string]upstreamPriceSnapshot](onboardingPriceSnapshotOption) {
		if text := snapshot.LatestDescriptions[name]; text != "" {
			supplierDescription = text
			break
		}
	}
	similar := ""
	if sibling != nil {
		similar = sibling.Description
	}
	polished, err := polishDraftDescription(ctx, llm, name, facts, similar, supplierDescription)
	switch {
	case err != nil:
		common.SysError(common.LogText("failed to polish the description of model %s: %s", name, err.Error()))
		draft.Error = draftErrorLLMFailed
	case !hasEveryDraftLocale(polished):
		draft.Error = draftErrorLLMUnusable
	case draftPricePattern.MatchString(polished):
		draft.Error = draftErrorLLMPrice
	default:
		draft.Description, draft.Polished = polished, true
	}
	return draft
}

func siblingName(record *model.Model) string {
	if record == nil {
		return ""
	}
	return record.ModelName
}

func sharedPrefix(left, right string) int {
	a, b := strings.ToLower(left), strings.ToLower(right)
	length := 0
	for length < len(a) && length < len(b) && a[length] == b[length] {
		length++
	}
	return length
}

// templateDraftDescription states the plugin's limits in Chinese and English,
// the fallback when no language model polishes the description.
func templateDraftDescription(facts onboardingModelFacts) string {
	var zh, en []string
	if len(facts.Resolutions) > 0 {
		zh = append(zh, "支持 "+strings.Join(facts.Resolutions, " / "))
		en = append(en, "Supports "+strings.Join(facts.Resolutions, " / "))
	}
	if facts.MaxDuration > 0 {
		zh = append(zh, fmt.Sprintf("每段 %d–%d 秒", facts.MinDuration, facts.MaxDuration))
		en = append(en, fmt.Sprintf("%d–%d s per clip", facts.MinDuration, facts.MaxDuration))
	}
	if len(facts.Ratios) > 0 {
		zh = append(zh, "画幅 "+strings.Join(facts.Ratios, " / "))
		en = append(en, "aspect ratios "+strings.Join(facts.Ratios, " / "))
	}
	billingZH := map[string]string{"second": "按秒计费", "count": "按条计费", "token": "按 Token 计费"}[facts.Billing]
	billingEN := map[string]string{"second": "Billed per second", "count": "Billed per video", "token": "Billed per token"}[facts.Billing]
	zhText, enText := strings.Join(zh, "，"), strings.Join(en, ", ")
	if zhText != "" {
		zhText += "。"
		enText += "."
	}
	if billingZH != "" {
		zhText = strings.TrimSpace(zhText + billingZH + "。")
		enText = strings.TrimSpace(enText + " " + billingEN + ".")
	}
	if zhText == "" {
		return ""
	}
	return "<!-- lang:zh -->\n" + zhText + "\n\n<!-- lang:en -->\n" + enText
}

func hasEveryDraftLocale(description string) bool {
	for _, locale := range onboardingDraftLocales {
		marker := "<!-- lang:" + locale + " -->"
		index := strings.Index(description, marker)
		if index < 0 {
			return false
		}
		rest := description[index+len(marker):]
		if next := strings.Index(rest, "<!-- lang:"); next >= 0 {
			rest = rest[:next]
		}
		if strings.TrimSpace(rest) == "" {
			return false
		}
	}
	return true
}

const draftSystemPrompt = `You write the descriptions of video and image generation models sold through an API gateway.
Write one short paragraph (one to three sentences) for each language: zh (Simplified Chinese), zh-TW (Traditional Chinese), en, ja, fr, ru, vi.
Use only what the facts support: output resolutions, clip length, aspect ratios, inputs, and whether it is billed per second, per video or per token.
Never mention prices, amounts of money, currencies, discounts, suppliers, gateways or URLs. No markdown, no headings, no trailing summaries.
Reply with exactly this layout and nothing else:
<!-- lang:zh -->
...
<!-- lang:zh-TW -->
...
<!-- lang:en -->
...
<!-- lang:ja -->
...
<!-- lang:fr -->
...
<!-- lang:ru -->
...
<!-- lang:vi -->
...`

func polishDraftDescription(ctx context.Context, llm onboardingDescriptionLLM, name string, facts onboardingModelFacts, similar, supplier string) (string, error) {
	material, err := common.Marshal(map[string]any{
		"model":                      name,
		"facts":                      facts,
		"similar_model_description":  similar,
		"supplier_description_draft": supplier,
	})
	if err != nil {
		return "", err
	}
	body, err := common.Marshal(map[string]any{
		"model":       llm.Model,
		"temperature": 0.3,
		"messages": []map[string]string{
			{"role": "system", "content": draftSystemPrompt},
			{"role": "user", "content": string(material)},
		},
	})
	if err != nil {
		return "", err
	}
	endpoint := llm.BaseURL
	if !strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/v1"
	}
	ctx, cancel := context.WithTimeout(ctx, onboardingLLMTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+llm.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := service.GetHttpClient().Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("chat completion returned HTTP %d", response.StatusCode)
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := common.Unmarshal(raw, &completion); err != nil {
		return "", err
	}
	if len(completion.Choices) == 0 {
		return "", fmt.Errorf("chat completion has no choices")
	}
	return strings.TrimSpace(completion.Choices[0].Message.Content), nil
}
