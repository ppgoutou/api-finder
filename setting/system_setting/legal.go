package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type LegalSettings struct {
	UserAgreement string `json:"user_agreement"`
	PrivacyPolicy string `json:"privacy_policy"`
	RefundPolicy  string `json:"refund_policy"`
	// StorePrompts keeps the prompt and settings of tasks submitted on the
	// creation page. It sits with the legal texts because it must only be on
	// while the privacy policy says so.
	StorePrompts bool `json:"store_prompts"`
}

var defaultLegalSettings = LegalSettings{
	UserAgreement: "",
	PrivacyPolicy: "",
	RefundPolicy:  "",
}

func init() {
	config.GlobalConfig.Register("legal", &defaultLegalSettings)
}

func GetLegalSettings() *LegalSettings {
	return &defaultLegalSettings
}
