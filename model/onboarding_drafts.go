package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// OnboardingDraftsOption keeps the metadata drafts the onboarding workbench
// prepared for pending models, keyed by model name.
const OnboardingDraftsOption = "OnboardingMetadataDrafts"

// OnboardingDraft is the description, icon, tags and vendor suggested for a
// model that has no metadata yet. The admin reviews it before it is saved.
type OnboardingDraft struct {
	Description string `json:"description"`
	Icon        string `json:"icon,omitempty"`
	Tags        string `json:"tags,omitempty"`
	VendorID    int    `json:"vendor_id,omitempty"`
	// BasedOn is the model whose icon, tags and vendor were copied.
	BasedOn string `json:"based_on,omitempty"`
	// Polished reports that a language model wrote the description.
	Polished bool `json:"polished"`
	// Error explains why the description was not polished.
	Error       string `json:"error,omitempty"`
	GeneratedAt int64  `json:"generated_at"`
}

func GetOnboardingDrafts() map[string]OnboardingDraft {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[OnboardingDraftsOption]
	common.OptionMapRWMutex.RUnlock()
	drafts := map[string]OnboardingDraft{}
	if strings.TrimSpace(raw) != "" {
		_ = common.UnmarshalJsonStr(raw, &drafts)
	}
	return drafts
}
