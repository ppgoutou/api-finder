package setting

import "strings"

// USDT top-up settings for the TRC-20 payment gateway. The Nile testnet and
// mainnet are separate gateway deployments with their own credentials, so
// USDTEnvironment and USDTContractAddress are checked against every answer:
// a testnet transfer must never buy real quota.
var (
	USDTEnabled = false
	// USDTPaused keeps USDT visible in the wallet but refuses new orders. Open
	// orders still settle.
	USDTPaused          = false
	USDTGatewayAddress  = ""
	USDTClientId        = ""
	USDTApiSecret       = ""
	USDTWebhookSecret   = ""
	USDTEnvironment     = ""
	USDTContractAddress = ""
	// USDTReconcileCursor is the gateway's position in the receipt feed.
	USDTReconcileCursor = ""
)

// IsUSDTConfigured reports whether every setting the gateway needs is filled.
func IsUSDTConfigured() bool {
	return USDTEnabled &&
		strings.TrimSpace(USDTGatewayAddress) != "" &&
		strings.TrimSpace(USDTClientId) != "" &&
		strings.TrimSpace(USDTApiSecret) != "" &&
		strings.TrimSpace(USDTWebhookSecret) != "" &&
		strings.TrimSpace(USDTEnvironment) != "" &&
		strings.TrimSpace(USDTContractAddress) != ""
}
