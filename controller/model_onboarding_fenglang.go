package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// fenglangPluginKey is the task plugin of channels on fenglang.cloud (妖火).
// That site is not a new-api: it lists yuan prices on its own /pricing and
// the account discount on /me, both readable with the channel's own API key.
const fenglangPluginKey = "fenglang"

// fenglangKeyGroup names the account discount in a fenglang snapshot. The
// site has no groups; its discount plays the part of the key's group ratio.
const fenglangKeyGroup = "discount"

type fenglangPricing struct {
	Pricing struct {
		UsdToCny      float64                       `json:"usdToCny"`
		UpstreamToCny float64                       `json:"upstreamToCny"`
		Markup        float64                       `json:"markup"`
		Video         map[string]map[string]float64 `json:"video"`
		Image         struct {
			Base map[string]map[string]float64 `json:"base"`
		} `json:"image"`
	} `json:"pricing"`
	Models struct {
		Video []string `json:"video"`
		Image []string `json:"image"`
	} `json:"models"`
}

// fetchFenglangPricing reads fenglang's price list and account discount and
// turns them into supplier rows shaped like new-api /api/pricing rows: one
// per-resolution expression per orderable model, in yuan before the
// discount. A model is keyed by the channel model that names it (fenglang
// "seedance-2.0" is served as "seedance-2.0-YH"), or by its own name when
// the channel does not serve it.
func fetchFenglangPricing(ctx context.Context, baseURL, key string, served []string) (map[string]map[string]any, map[string]any, *upstreamCurrency, *upstreamKeyGroup, error) {
	var prices fenglangPricing
	if err := getFenglang(ctx, baseURL, "/pricing", key, &prices); err != nil {
		return nil, nil, nil, nil, err
	}
	var account struct {
		User struct {
			Discount float64 `json:"discount"`
		} `json:"user"`
	}
	if err := getFenglang(ctx, baseURL, "/me", key, &account); err != nil {
		return nil, nil, nil, nil, err
	}
	discount := account.User.Discount
	if discount <= 0 || discount > 1 {
		return nil, nil, nil, nil, fmt.Errorf("fenglang reports an account discount of %v", discount)
	}
	// Listed prices are yuan only while these conversions are all 1; any
	// other value has unknown meaning and would misprice every model.
	for _, factor := range []float64{prices.Pricing.UsdToCny, prices.Pricing.UpstreamToCny, prices.Pricing.Markup} {
		if factor != 1 {
			return nil, nil, nil, nil, errors.New("fenglang lists prices with a conversion factor other than 1")
		}
	}

	models := make(map[string]map[string]any)
	add := func(upstream string, tiers map[string]float64, quantity string) {
		if len(tiers) == 0 {
			return
		}
		row := map[string]any{
			"billing_mode": billing_setting.BillingModeTieredExpr,
			"billing_expr": fenglangTierExpression(tiers, quantity),
		}
		names := make([]string, 0, 1)
		for _, name := range served {
			if fenglangServedModel(name, prices.Models.Video, prices.Models.Image) == upstream {
				names = append(names, strings.TrimSpace(name))
			}
		}
		if len(names) == 0 {
			names = append(names, upstream)
		}
		for _, name := range names {
			models[name] = maps.Clone(row)
		}
	}
	for _, name := range prices.Models.Video {
		add(name, prices.Pricing.Video[name], "seconds")
	}
	for _, name := range prices.Models.Image {
		add(name, prices.Pricing.Image.Base[name], "image_count")
	}
	group := map[string]any{fenglangKeyGroup: discount}
	currency := &upstreamCurrency{DisplayType: operation_setting.QuotaDisplayTypeCNY, Rate: 1}
	return models, group, currency, &upstreamKeyGroup{Name: fenglangKeyGroup, Ratio: discount}, nil
}

// fenglangServedModel finds the fenglang model a channel model sells: the
// longest fenglang name that is the whole channel name or its prefix before
// a dash, so "seedance-2.5-stable-YH" is "seedance-2.5-stable", not
// "seedance-2.5". Empty when none matches.
func fenglangServedModel(name string, lists ...[]string) string {
	name = strings.TrimSpace(name)
	match := ""
	for _, list := range lists {
		for _, upstream := range list {
			if (name == upstream || strings.HasPrefix(name, upstream+"-")) && len(upstream) > len(match) {
				match = upstream
			}
		}
	}
	return match
}

// fenglangTierExpression prices one model by output resolution, lowest
// first. The highest tier is the fallback branch. A single tier has no
// condition: the plugin reports no resolution for such image models.
func fenglangTierExpression(tiers map[string]float64, quantity string) string {
	names := make([]string, 0, len(tiers))
	for name := range tiers {
		names = append(names, name)
	}
	slices.SortFunc(names, func(left, right string) int {
		if order := fenglangTierPixels(left) - fenglangTierPixels(right); order != 0 {
			return int(order)
		}
		return strings.Compare(left, right)
	})
	var expression strings.Builder
	for i, name := range names {
		leaf := fmt.Sprintf("tier(%s, u(%q) * %s)", strconv.Quote(name), quantity, strconv.FormatFloat(tiers[name], 'f', -1, 64))
		if i == len(names)-1 {
			expression.WriteString(leaf)
			break
		}
		fmt.Fprintf(&expression, "u(\"resolution\") == %s ? %s : ", strconv.Quote(name), leaf)
	}
	return expression.String()
}

// fenglangTierPixels orders resolution names such as 480p, 720P, 1.5K and
// 4k by their size. Unknown names sort first.
func fenglangTierPixels(name string) float64 {
	lower := strings.ToLower(strings.TrimSpace(name))
	scale := 1.0
	if number, ok := strings.CutSuffix(lower, "k"); ok {
		lower, scale = number, 1000
	} else {
		lower = strings.TrimSuffix(lower, "p")
	}
	value, err := strconv.ParseFloat(lower, 64)
	if err != nil {
		return 0
	}
	return value * scale
}

// getFenglang reads one fenglang open API route. Its answers carry their
// fields beside `success` rather than under `data`.
func getFenglang(ctx context.Context, baseURL, path, key string, out any) error {
	ctx, cancel := context.WithTimeout(ctx, onboardingPriceFetchTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+key)
	response, err := service.GetHttpClient().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, onboardingPriceMaxResponseBytes))
	if err != nil {
		return err
	}
	var status struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	_ = common.Unmarshal(body, &status)
	if response.StatusCode != http.StatusOK || !status.Success {
		return fmt.Errorf("fenglang %s returned HTTP %d: %s", path, response.StatusCode, status.Message)
	}
	return common.Unmarshal(body, out)
}
