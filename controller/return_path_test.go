package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
)

func TestPaymentReturnPathUsesDefaultDashboardRoutes(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://dashboard.example.com/"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })

	assert.Equal(
		t,
		"https://dashboard.example.com/wallet?pay=success",
		paymentReturnPath("/wallet?pay=success"),
	)
	assert.Equal(
		t,
		"https://dashboard.example.com/usage-logs",
		paymentReturnPath("/usage-logs"),
	)
}

func TestStripeReturnURLsLeadBackToThePageThePaymentStartedOn(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://dashboard.example.com"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })

	cases := []struct {
		name        string
		req         StripePayRequest
		wantSuccess string
		wantCancel  string
	}{
		{"wallet by default", StripePayRequest{}, "https://dashboard.example.com/wallet?topup=success", "https://dashboard.example.com/wallet?topup=cancelled"},
		{"creation page", StripePayRequest{ReturnPage: "studio"}, "https://dashboard.example.com/video-studio?topup=success", "https://dashboard.example.com/video-studio?topup=cancelled"},
		{"unknown page falls back to the wallet", StripePayRequest{ReturnPage: "https://evil.example"}, "https://dashboard.example.com/wallet?topup=success", "https://dashboard.example.com/wallet?topup=cancelled"},
		{"custom addresses win", StripePayRequest{ReturnPage: "studio", SuccessURL: "https://shop.example/ok", CancelURL: "https://shop.example/no"}, "https://shop.example/ok", "https://shop.example/no"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			success, cancel := stripeReturnURLs(&tc.req)
			assert.Equal(t, tc.wantSuccess, success)
			assert.Equal(t, tc.wantCancel, cancel)
		})
	}
}
