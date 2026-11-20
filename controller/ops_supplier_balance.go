package controller

import (
	"context"
	"errors"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// opsSupplierChannel is one enabled channel that bills a supplier account.
type opsSupplierChannel struct {
	Id   int    `json:"id"`
	Name string `json:"name"`
}

// opsSupplierBalance is the wallet of one supplier in use: every enabled
// channel whose base URL is on the supplier's host shares it.
type opsSupplierBalance struct {
	Host     string               `json:"host"`
	Channels []opsSupplierChannel `json:"channels"`
	// Source is how the balance is read: "monitor" (a saved upstream balance
	// alert monitor), "new_api" (a new-api supplier's /api/user/self with the
	// supplier token) or "" when neither is set up.
	Source string `json:"source"`
	// Amount and Currency are the balance as the supplier holds it.
	Amount   *float64 `json:"amount,omitempty"`
	Currency string   `json:"currency,omitempty"`
	// BalanceUSD is Amount in the site's internal dollars, so the page shows
	// it in the admin's display currency like every other figure.
	BalanceUSD *float64 `json:"balance_usd,omitempty"`
	Error      string   `json:"error,omitempty"`
}

// supplierCurrencyOf reads a balance alert monitor's unit as a currency.
// Monitors are set up in yuan unless their unit names dollars.
func supplierCurrencyOf(unit string) string {
	unit = strings.ToUpper(strings.TrimSpace(unit))
	if strings.Contains(unit, "USD") || strings.Contains(unit, "$") || strings.Contains(unit, "美元") {
		return "USD"
	}
	return "CNY"
}

// readNewAPISupplierBalance reads a new-api supplier's account balance with
// the supplier token and returns it in yuan when the supplier shows yuan or
// sets an exchange rate, otherwise in dollars.
func readNewAPISupplierBalance(ctx context.Context, baseURL, token string) (float64, string, error) {
	currency, err := fetchUpstreamCurrency(ctx, baseURL)
	if err != nil {
		return 0, "", err
	}
	var user struct {
		Quota int64 `json:"quota"`
	}
	if err := getSupplierDashboard(ctx, baseURL, "/api/user/self", token, &user); err != nil {
		return 0, "", err
	}
	quotaPerUnit := currency.QuotaPerUnit
	if quotaPerUnit <= 0 {
		quotaPerUnit = 500000
	}
	usd := float64(user.Quota) / quotaPerUnit
	if currency.Rate > 0 {
		return usd * currency.Rate, "CNY", nil
	}
	return usd, "USD", nil
}

// GetOpsSupplierBalances reads, live, the wallet balance of every supplier
// that has an enabled channel.
func GetOpsSupplierBalances(c *gin.Context) {
	var channels []*model.Channel
	err := model.DB.Select("id", "name", "base_url", "status").
		Where("status = ?", common.ChannelStatusEnabled).
		Order("id").
		Find(&channels).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	monitors := make(map[int]system_setting.BalanceAlertMonitor)
	for _, monitor := range system_setting.GetBalanceAlertSettings().Monitors {
		monitors[monitor.ChannelId] = monitor
	}
	tokens := readOnboardingOption[map[string]string](onboardingPricingTokenOption)

	type supplierReader struct {
		monitor *system_setting.BalanceAlertMonitor
		baseURL string
		token   string
	}
	suppliers := make([]*opsSupplierBalance, 0)
	readers := make(map[string]*supplierReader)
	byHost := make(map[string]*opsSupplierBalance)
	for _, channel := range channels {
		parsed, err := url.Parse(channel.GetBaseURL())
		if err != nil || parsed.Hostname() == "" || !strings.HasPrefix(parsed.Scheme, "http") {
			continue
		}
		host := strings.ToLower(parsed.Hostname())
		supplier, ok := byHost[host]
		if !ok {
			supplier = &opsSupplierBalance{Host: host, Channels: []opsSupplierChannel{}}
			byHost[host] = supplier
			suppliers = append(suppliers, supplier)
			readers[host] = &supplierReader{}
		}
		supplier.Channels = append(supplier.Channels, opsSupplierChannel{Id: channel.Id, Name: channel.Name})
		// A saved monitor wins: its path and field were checked by the admin.
		reader := readers[host]
		if monitor, ok := monitors[channel.Id]; ok && reader.monitor == nil {
			reader.monitor = &monitor
			supplier.Source = "monitor"
			continue
		}
		if token := strings.TrimSpace(tokens[strconv.Itoa(channel.Id)]); token != "" && reader.monitor == nil && reader.token == "" {
			reader.baseURL = parsed.Scheme + "://" + parsed.Host
			reader.token = token
			supplier.Source = "new_api"
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 40*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	for _, supplier := range suppliers {
		reader := readers[supplier.Host]
		if supplier.Source == "" {
			continue
		}
		wg.Go(func() {
			var amount float64
			var currency string
			var err error
			if reader.monitor != nil {
				_, amount, err = fetchUpstreamBalance(ctx, *reader.monitor)
				currency = supplierCurrencyOf(reader.monitor.Unit)
			} else {
				amount, currency, err = readNewAPISupplierBalance(ctx, reader.baseURL, reader.token)
			}
			if err != nil {
				if errors.Is(err, context.DeadlineExceeded) {
					err = errors.New("the supplier did not answer in time")
				}
				supplier.Error = err.Error()
				return
			}
			balanceUSD := amount
			if currency == "CNY" {
				rate := operation_setting.USDExchangeRate
				if rate <= 0 {
					supplier.Error = "the site has no USD exchange rate to convert yuan"
					return
				}
				balanceUSD = amount / rate
			}
			supplier.Amount = &amount
			supplier.Currency = currency
			supplier.BalanceUSD = &balanceUSD
		})
	}
	wg.Wait()

	// Readable suppliers first, then by host, so the cards keep their order.
	slices.SortStableFunc(suppliers, func(a, b *opsSupplierBalance) int {
		if (a.Source == "") != (b.Source == "") {
			if a.Source == "" {
				return 1
			}
			return -1
		}
		return strings.Compare(a.Host, b.Host)
	})
	common.ApiSuccess(c, gin.H{"suppliers": suppliers, "checked_at": time.Now().Unix()})
}
