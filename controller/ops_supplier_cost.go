package controller

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/shopspring/decimal"
)

// Cost states of an upstream channel on the business dashboard.
const (
	opsCostStatusOK      = "ok"
	opsCostStatusNoToken = "no_token"
	opsCostStatusError   = "error"
)

const (
	opsSupplierCostTimeout = 45 * time.Second
	// A supplier may cap how far one log search reaches, so longer periods
	// are read in windows of this size.
	opsSupplierLogWindowSeconds  int64 = 30 * 24 * 60 * 60
	opsSupplierLogPageSize             = 100
	opsSupplierLogMaxPages             = 500
	opsSupplierCostCacheSeconds  int64 = 300
	opsSupplierErrorCacheSeconds int64 = 60
)

type opsSupplierCostEntry struct {
	quota   int64
	err     error
	expires int64
}

var opsSupplierCostCache = struct {
	sync.Mutex
	entries map[string]opsSupplierCostEntry
}{entries: map[string]opsSupplierCostEntry{}}

// applySupplierCosts sets each upstream channel's cost to what its supplier
// charged the channel key in the period, read from the supplier's own logs
// with the onboarding supplier token. Channels without a token have no cost,
// and neither do deleted channels, whose token may outlive them.
func applySupplierCosts(ctx context.Context, upstream []model.OpsUpstream, start, end, now int64) {
	tokens := readOnboardingOption[map[string]string](onboardingPricingTokenOption)
	var existing []int
	if err := model.DB.Model(&model.Channel{}).Pluck("id", &existing).Error; err != nil {
		for i := range upstream {
			upstream[i].CostStatus = opsCostStatusError
			upstream[i].CostError = err.Error()
		}
		return
	}
	ctx, cancel := context.WithTimeout(ctx, opsSupplierCostTimeout)
	defer cancel()
	var wg sync.WaitGroup
	for i := range upstream {
		row := &upstream[i]
		token := strings.TrimSpace(tokens[strconv.Itoa(row.ChannelId)])
		if token == "" || !slices.Contains(existing, row.ChannelId) {
			row.CostStatus = opsCostStatusNoToken
			continue
		}
		wg.Go(func() {
			quota, err := cachedSupplierCharges(ctx, row.ChannelId, token, start, end, now)
			if err != nil {
				row.CostStatus = opsCostStatusError
				row.CostError = err.Error()
				return
			}
			row.CostStatus = opsCostStatusOK
			row.CostQuota = quota
		})
	}
	wg.Wait()
}

// cachedSupplierCharges keeps a supplier's answer for a few minutes, so
// reopening the dashboard does not read every supplier's logs again. A period
// that reaches the present shares one entry per cache interval.
func cachedSupplierCharges(ctx context.Context, channelId int, token string, start, end, now int64) (int64, error) {
	key := fmt.Sprintf("%d|%d|%d", channelId, start, end/opsSupplierCostCacheSeconds)
	opsSupplierCostCache.Lock()
	entry, ok := opsSupplierCostCache.entries[key]
	opsSupplierCostCache.Unlock()
	if ok && entry.expires > now {
		return entry.quota, entry.err
	}
	quota, err := supplierCharges(ctx, channelId, token, start, end)
	ttl := opsSupplierCostCacheSeconds
	if err != nil {
		ttl = opsSupplierErrorCacheSeconds
	}
	opsSupplierCostCache.Lock()
	for cached, old := range opsSupplierCostCache.entries {
		if old.expires <= now {
			delete(opsSupplierCostCache.entries, cached)
		}
	}
	opsSupplierCostCache.entries[key] = opsSupplierCostEntry{quota: quota, err: err, expires: now + ttl}
	opsSupplierCostCache.Unlock()
	return quota, err
}

// supplierCharges is what the supplier charged the channel key between start
// and end, net of its refunds, in local quota. A start of 0 means since the
// channel was created.
func supplierCharges(ctx context.Context, channelId int, token string, start, end int64) (int64, error) {
	channel, err := model.GetChannelById(channelId, true)
	if err != nil {
		return 0, err
	}
	baseURL := channel.GetBaseURL()
	if !strings.HasPrefix(baseURL, "http") {
		return 0, errors.New("the channel has no supplier base URL")
	}
	currency, err := fetchUpstreamCurrency(ctx, baseURL)
	if err != nil {
		return 0, err
	}
	scale, err := currency.priceScale()
	if err != nil {
		return 0, err
	}
	supplierQuotaPerUnit := currency.QuotaPerUnit
	if supplierQuotaPerUnit <= 0 {
		supplierQuotaPerUnit = common.QuotaPerUnit
	}

	keys := channel.GetKeys()
	if len(keys) == 0 {
		return 0, errors.New("the channel has no key to look up on the supplier")
	}
	var tokenPage struct {
		Items []struct {
			Name string `json:"name"`
		} `json:"items"`
	}
	key := strings.TrimPrefix(strings.TrimSpace(keys[0]), "sk-")
	err = getSupplierDashboard(ctx, baseURL, "/api/token/search?p=1&page_size=10&token="+url.QueryEscape(key), token, &tokenPage)
	if err != nil {
		return 0, err
	}
	if len(tokenPage.Items) != 1 {
		return 0, fmt.Errorf("the channel key matches %d supplier tokens", len(tokenPage.Items))
	}
	tokenName := tokenPage.Items[0].Name

	if start <= 0 {
		start = channel.CreatedTime
	}
	var net int64
	for windowStart := start; windowStart <= end; windowStart += opsSupplierLogWindowSeconds {
		windowEnd := min(windowStart+opsSupplierLogWindowSeconds-1, end)
		for _, logType := range []int{model.LogTypeConsume, model.LogTypeRefund} {
			fetched := 0
			for page := 1; ; page++ {
				if page > opsSupplierLogMaxPages {
					return 0, errors.New("the supplier has too many logs in this period")
				}
				var logs struct {
					Items []struct {
						Quota int64 `json:"quota"`
					} `json:"items"`
					Total int `json:"total"`
				}
				path := fmt.Sprintf("/api/log/self?p=%d&page_size=%d&type=%d&token_name=%s&start_timestamp=%d&end_timestamp=%d",
					page, opsSupplierLogPageSize, logType, url.QueryEscape(tokenName), windowStart, windowEnd)
				if err := getSupplierDashboard(ctx, baseURL, path, token, &logs); err != nil {
					return 0, err
				}
				for _, item := range logs.Items {
					if logType == model.LogTypeRefund {
						net -= item.Quota
					} else {
						net += item.Quota
					}
				}
				// The supplier may serve fewer rows per page than asked, so
				// its total decides when the period is read.
				fetched += len(logs.Items)
				if len(logs.Items) == 0 || fetched >= logs.Total {
					break
				}
			}
		}
	}
	local := decimal.NewFromInt(max(net, 0)).
		Mul(scale).
		Mul(decimal.NewFromFloat(common.QuotaPerUnit)).
		Div(decimal.NewFromFloat(supplierQuotaPerUnit))
	return local.Round(0).IntPart(), nil
}
