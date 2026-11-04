package controller

import (
	"errors"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

const (
	promoPopupOptionKey = "PromoPopup"
	promoPopupMaxCards  = 5
	promoPopupMaxTiers  = 3
	promoPopupMaxDeals  = 4
	// A stored limit of 0 means the setting is absent, which shows once a day.
	promoPopupMaxDailyLimit = 20
)

var errInvalidPromoPopup = errors.New("invalid promo popup settings")

type promoPopupTier struct {
	Pay   string `json:"pay"`
	Bonus string `json:"bonus"`
}

type promoPopupDeal struct {
	ModelName     string `json:"model_name"`
	SalePrice     string `json:"sale_price"`
	OriginalPrice string `json:"original_price"`
	Unit          string `json:"unit"`
	AutoPrice     bool   `json:"auto_price"`
	PriceOption   string `json:"price_option"`
	Icon          string `json:"icon"`
}

type promoPopupCard struct {
	Kind          string           `json:"kind"`
	Title         string           `json:"title"`
	TitleZh       string           `json:"title_zh"`
	Description   string           `json:"description"`
	DescriptionZh string           `json:"description_zh"`
	EndsAt        string           `json:"ends_at"`
	Href          string           `json:"href"`
	ModelName     string           `json:"model_name"`
	SalePrice     string           `json:"sale_price"`
	OriginalPrice string           `json:"original_price"`
	Unit          string           `json:"unit"`
	AutoPrice     bool             `json:"auto_price"`
	PriceOption   string           `json:"price_option"`
	Icon          string           `json:"icon"`
	Tiers         []promoPopupTier `json:"tiers"`
	Deals         []promoPopupDeal `json:"deals"`
}

type promoPopupSettings struct {
	Enabled    bool             `json:"enabled"`
	DailyLimit int              `json:"daily_limit"`
	Cards      []promoPopupCard `json:"cards"`
}

// GetPromoPopup returns the home page promotion popup settings (a JSON string,
// empty when no popup is configured).
func GetPromoPopup(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	value := common.OptionMap[promoPopupOptionKey]
	common.OptionMapRWMutex.RUnlock()
	serveRevalidatedJSON(c, value)
}

func promoPopupTextFits(limit int, values ...string) bool {
	for _, value := range values {
		if utf8.RuneCountInString(value) > limit {
			return false
		}
	}
	return true
}

// promoPopupHrefAllowed accepts a same-site path or an https link, so a saved
// card can never carry a script URL or a scheme-relative redirect.
func promoPopupHrefAllowed(href string) bool {
	if href == "" {
		return true
	}
	if strings.HasPrefix(href, "/") {
		return !strings.HasPrefix(href, "//") && !strings.Contains(href, "\\")
	}
	parsed, err := url.Parse(href)
	return err == nil && parsed.Scheme == "https" && parsed.Host != ""
}

func promoPopupCardAllowed(card promoPopupCard) bool {
	if card.Kind != "model" && card.Kind != "recharge" && card.Kind != "list" {
		return false
	}
	if card.EndsAt != "" {
		if _, err := time.Parse(time.DateOnly, card.EndsAt); err != nil {
			return false
		}
	}
	if len(card.Tiers) > promoPopupMaxTiers || len(card.Deals) > promoPopupMaxDeals {
		return false
	}
	if !promoPopupTextFits(60, card.Title, card.TitleZh, card.ModelName, card.PriceOption) ||
		!promoPopupTextFits(160, card.Description, card.DescriptionZh) ||
		!promoPopupTextFits(16, card.SalePrice, card.OriginalPrice) ||
		!promoPopupTextFits(16, card.Unit) ||
		!promoPopupTextFits(100, card.Icon) ||
		!promoPopupTextFits(500, card.Href) ||
		!promoPopupHrefAllowed(card.Href) {
		return false
	}
	for _, tier := range card.Tiers {
		if !promoPopupTextFits(16, tier.Pay, tier.Bonus) {
			return false
		}
	}
	for _, deal := range card.Deals {
		if !promoPopupTextFits(60, deal.ModelName, deal.PriceOption) ||
			!promoPopupTextFits(16, deal.SalePrice, deal.OriginalPrice) ||
			!promoPopupTextFits(16, deal.Unit) ||
			!promoPopupTextFits(100, deal.Icon) {
			return false
		}
	}
	return true
}

// validatePromoPopup checks the PromoPopup option before it is saved: a bounded
// daily limit, known card kinds, bounded text and lists, real end dates and safe links.
func validatePromoPopup(value string) error {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	var settings promoPopupSettings
	if err := common.UnmarshalJsonStr(value, &settings); err != nil {
		return errInvalidPromoPopup
	}
	if settings.DailyLimit < 0 || settings.DailyLimit > promoPopupMaxDailyLimit {
		return errInvalidPromoPopup
	}
	if len(settings.Cards) > promoPopupMaxCards {
		return errInvalidPromoPopup
	}
	for _, card := range settings.Cards {
		if !promoPopupCardAllowed(card) {
			return errInvalidPromoPopup
		}
	}
	return nil
}
