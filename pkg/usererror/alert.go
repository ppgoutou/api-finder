package usererror

// Severity says who caused an error, which decides how urgently the operator
// hears about it.
type Severity string

const (
	// SeverityCritical is our side failing in a way that blocks every request
	// it touches: our wallet at the supplier, our key, billing settlement.
	SeverityCritical Severity = "critical"
	// SeverityUpstream is the supplier or our routing failing a request the
	// customer sent correctly.
	SeverityUpstream Severity = "upstream"
	// SeverityUser is the customer's own request or assets being refused.
	SeverityUser Severity = "user"
	// SeverityIgnore needs no alert: cancelled by the customer or an admin.
	SeverityIgnore Severity = "ignore"
)

// Alert categories group codes into the few lines an operator reads in an
// alert. Each has an "task_error_alert.category.<name>" i18n entry.
const (
	AlertCategoryUpstreamWallet = "upstream_wallet"
	AlertCategoryUpstreamAuth   = "upstream_auth"
	AlertCategorySettlement     = "settlement"
	AlertCategoryInternal       = "internal"
	AlertCategoryNoLine         = "no_line"
	AlertCategoryUnavailable    = "unavailable"
	AlertCategoryTimeout        = "timeout"
	AlertCategoryGeneration     = "generation"
	AlertCategoryBalance        = "balance"
	AlertCategoryParameter      = "parameter"
	AlertCategoryMaterial       = "material"
	AlertCategoryModeration     = "moderation"
	AlertCategoryCancelled      = "cancelled"
)

// AlertCategories lists every category in the order alerts show them.
var AlertCategories = []string{
	AlertCategoryUpstreamWallet, AlertCategoryUpstreamAuth, AlertCategorySettlement, AlertCategoryInternal,
	AlertCategoryNoLine, AlertCategoryUnavailable, AlertCategoryTimeout, AlertCategoryGeneration,
	AlertCategoryBalance, AlertCategoryParameter, AlertCategoryMaterial, AlertCategoryModeration,
	AlertCategoryCancelled,
}

type alertClass struct {
	severity Severity
	category string
}

// alertClasses covers every code in messages; a test keeps them in step.
var alertClasses = map[string]alertClass{
	CodeServiceCannotProcess: {SeverityCritical, AlertCategoryUpstreamWallet},
	CodeUpstreamAuth:         {SeverityCritical, AlertCategoryUpstreamAuth},
	CodeSettlementError:      {SeverityCritical, AlertCategorySettlement},
	CodeInternalError:        {SeverityCritical, AlertCategoryInternal},

	CodeModelUnavailable:       {SeverityUpstream, AlertCategoryNoLine},
	CodeModelNotPriced:         {SeverityUpstream, AlertCategoryNoLine},
	CodeNoLineForSpec:          {SeverityUpstream, AlertCategoryNoLine},
	CodeLineNoDuration:         {SeverityUpstream, AlertCategoryNoLine},
	CodeNoFrames:               {SeverityUpstream, AlertCategoryNoLine},
	CodeNoReferenceVideo:       {SeverityUpstream, AlertCategoryNoLine},
	CodeServiceUnavailable:     {SeverityUpstream, AlertCategoryUnavailable},
	CodeTaskServiceUnavailable: {SeverityUpstream, AlertCategoryUnavailable},
	CodeMaterialProcessing:     {SeverityUpstream, AlertCategoryMaterial},
	CodeServiceBusy:            {SeverityUpstream, AlertCategoryUnavailable},
	CodeConnectionFailed:       {SeverityUpstream, AlertCategoryUnavailable},
	CodeBadResponse:            {SeverityUpstream, AlertCategoryUnavailable},
	CodeSubmitTimeout:          {SeverityUpstream, AlertCategoryTimeout},
	CodeTaskTimeout:            {SeverityUpstream, AlertCategoryTimeout},
	CodeTaskTimeoutLegacy:      {SeverityUpstream, AlertCategoryTimeout},
	CodeTaskResultUnavailable:  {SeverityUpstream, AlertCategoryTimeout},
	CodeGenerationFailed:       {SeverityUpstream, AlertCategoryGeneration},
	CodeFallback:               {SeverityUpstream, AlertCategoryGeneration},

	CodeBalanceInsufficient:       {SeverityUser, AlertCategoryBalance},
	CodeBalanceInsufficientDetail: {SeverityUser, AlertCategoryBalance},
	CodePromptRequired:            {SeverityUser, AlertCategoryParameter},
	CodePromptTooLong:             {SeverityUser, AlertCategoryParameter},
	CodeModelRequired:             {SeverityUser, AlertCategoryParameter},
	CodeRefImageRequired:          {SeverityUser, AlertCategoryParameter},
	CodeRatioRequired:             {SeverityUser, AlertCategoryParameter},
	CodeFramesPaired:              {SeverityUser, AlertCategoryParameter},
	CodeTaskTypeMismatch:          {SeverityUser, AlertCategoryParameter},
	CodeInvalidDuration:           {SeverityUser, AlertCategoryParameter},
	CodeInvalidResolution:         {SeverityUser, AlertCategoryParameter},
	CodeInvalidFormat:             {SeverityUser, AlertCategoryParameter},
	CodeRequestTooLarge:           {SeverityUser, AlertCategoryParameter},
	CodeMaterialUnreachable:       {SeverityUser, AlertCategoryMaterial},
	CodeMaterialDownloadTimeout:   {SeverityUser, AlertCategoryMaterial},
	CodeMaterialPublicURL:         {SeverityUser, AlertCategoryMaterial},
	CodeMaterialFrameRate:         {SeverityUser, AlertCategoryMaterial},
	CodeMaterialDuration:          {SeverityUser, AlertCategoryMaterial},
	CodeMaterialDuration30s:       {SeverityUser, AlertCategoryMaterial},
	CodeMaterialPixels:            {SeverityUser, AlertCategoryMaterial},
	CodeMaterialRequirements:      {SeverityUser, AlertCategoryMaterial},
	CodeModerationRealPerson:      {SeverityUser, AlertCategoryModeration},
	CodeModerationInput:           {SeverityUser, AlertCategoryModeration},
	CodeModerationMusicCopyright:  {SeverityUser, AlertCategoryModeration},
	CodeModerationCopyright:       {SeverityUser, AlertCategoryModeration},
	CodeModerationOutput:          {SeverityUser, AlertCategoryModeration},
	CodeModerationPrompt:          {SeverityUser, AlertCategoryModeration},
	CodeViolationFee:              {SeverityUser, AlertCategoryModeration},
	CodeGenerationMaybeContent:    {SeverityUser, AlertCategoryModeration},

	CodeRequestCancelled:     {SeverityIgnore, AlertCategoryCancelled},
	CodeTaskCancelledByAdmin: {SeverityIgnore, AlertCategoryCancelled},
}

// AlertSeverity says who caused the error. An unknown code counts as upstream,
// so a new failure mode is reported rather than hidden.
func (r Result) AlertSeverity() Severity {
	if class, ok := alertClasses[r.Code]; ok {
		return class.severity
	}
	return SeverityUpstream
}

// AlertCategory is the operator-facing group of the error.
func (r Result) AlertCategory() string {
	if class, ok := alertClasses[r.Code]; ok {
		return class.category
	}
	return AlertCategoryGeneration
}
