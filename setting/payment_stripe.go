package setting

// StripeEnabled stops new Stripe payments when off; webhooks keep running so
// sessions already paid, refunds and disputes still settle.
var StripeEnabled = true

// StripePaused keeps Stripe visible in the wallet but refuses new payments;
// webhooks keep running like when StripeEnabled is off.
var StripePaused = false
var StripeApiSecret = ""
var StripeWebhookSecret = ""
var StripePriceId = ""
var StripeUnitPrice = 8.0
var StripePromotionCodesEnabled = false
