package setting

// StripeEnabled stops new Stripe payments when off; webhooks keep running so
// sessions already paid, refunds and disputes still settle.
var StripeEnabled = true
var StripeApiSecret = ""
var StripeWebhookSecret = ""
var StripePriceId = ""
var StripeUnitPrice = 8.0
var StripeMinTopUp = 1
var StripePromotionCodesEnabled = false
