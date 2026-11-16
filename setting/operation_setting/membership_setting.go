package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// MembershipSetting moves users from the base group to the VIP group once
// their paid top-ups reach either threshold. Thresholds are in USD of
// credited quota; a threshold of 0 disables that rule.
type MembershipSetting struct {
	Enabled             bool    `json:"enabled"`
	BaseGroup           string  `json:"base_group"`
	VipGroup            string  `json:"vip_group"`
	TotalTopUpUSD       float64 `json:"total_topup_usd"`
	SingleTopUpUSD      float64 `json:"single_topup_usd"`
	DowngradeOnReversal bool    `json:"downgrade_on_reversal"`
	// VipSupportTelegram is the Telegram handle (without @) shown to VIP
	// users for round-the-clock support; empty falls back to the site's
	// regular support account.
	VipSupportTelegram string `json:"vip_support_telegram"`
}

var membershipSetting = MembershipSetting{
	Enabled:             true,
	BaseGroup:           "default",
	VipGroup:            "vip",
	TotalTopUpUSD:       1000,
	SingleTopUpUSD:      500,
	DowngradeOnReversal: true,
}

func init() {
	config.GlobalConfig.Register("membership_setting", &membershipSetting)
}

func GetMembershipSetting() *MembershipSetting {
	return &membershipSetting
}
