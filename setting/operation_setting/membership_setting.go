package operation_setting

import (
	"slices"

	"github.com/QuantumNous/new-api/setting/config"
)

// MembershipSetting moves users from a standard group to its VIP group once
// their paid top-ups reach either threshold. Thresholds are in USD of
// credited quota; a threshold of 0 disables that rule.
type MembershipSetting struct {
	Enabled   bool   `json:"enabled"`
	BaseGroup string `json:"base_group"`
	VipGroup  string `json:"vip_group"`
	// ExtraGroupPairs maps further standard groups to their own VIP groups,
	// such as overseas users to an overseas VIP group.
	ExtraGroupPairs     map[string]string `json:"extra_group_pairs"`
	TotalTopUpUSD       float64           `json:"total_topup_usd"`
	SingleTopUpUSD      float64           `json:"single_topup_usd"`
	DowngradeOnReversal bool              `json:"downgrade_on_reversal"`
	// VipSupportTelegram is the Telegram handle (without @) shown to VIP
	// users for round-the-clock support; empty falls back to the site's
	// regular support account.
	VipSupportTelegram string `json:"vip_support_telegram"`
	// StandardConcurrency and VipConcurrency are the rough numbers of
	// generation tasks each tier can run at once, shown on the VIP pages;
	// 0 hides the row. They describe the request limits, not enforce them.
	StandardConcurrency int `json:"standard_concurrency"`
	VipConcurrency      int `json:"vip_concurrency"`
}

var membershipSetting = MembershipSetting{
	Enabled:             true,
	BaseGroup:           "default",
	VipGroup:            "vip",
	TotalTopUpUSD:       1000,
	SingleTopUpUSD:      500,
	DowngradeOnReversal: true,
	StandardConcurrency: 10,
	VipConcurrency:      100,
}

func init() {
	config.GlobalConfig.Register("membership_setting", &membershipSetting)
}

func GetMembershipSetting() *MembershipSetting {
	return &membershipSetting
}

// MembershipGroupPair is a standard group and the VIP group its users move to.
type MembershipGroupPair struct {
	Base string
	Vip  string
}

// GroupPairs lists the standard-to-VIP group pairs: the main pair first, then
// the extra pairs by standard group name. A pair is skipped when a group is
// empty, both groups are the same, or one of its groups already belongs to an
// earlier pair, so every group maps one way only.
func (s *MembershipSetting) GroupPairs() []MembershipGroupPair {
	pairs := []MembershipGroupPair{{Base: s.BaseGroup, Vip: s.VipGroup}}
	bases := make([]string, 0, len(s.ExtraGroupPairs))
	for base := range s.ExtraGroupPairs {
		bases = append(bases, base)
	}
	slices.Sort(bases)
	for _, base := range bases {
		pairs = append(pairs, MembershipGroupPair{Base: base, Vip: s.ExtraGroupPairs[base]})
	}

	used := make(map[string]bool)
	valid := make([]MembershipGroupPair, 0, len(pairs))
	for _, pair := range pairs {
		if pair.Base == "" || pair.Vip == "" || pair.Base == pair.Vip || used[pair.Base] || used[pair.Vip] {
			continue
		}
		used[pair.Base] = true
		used[pair.Vip] = true
		valid = append(valid, pair)
	}
	return valid
}
