package controller

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// USDTPayRequest is a wallet top-up paid with USDT.
type USDTPayRequest struct {
	Amount int64 `json:"amount"`
}

// rejectUSDTTopUp answers when the amount cannot be topped up by this user. It
// reports the group so the caller can price the amount.
func rejectUSDTTopUp(c *gin.Context, amount int64) (string, bool) {
	if !service.CanStartUSDTTopUp() {
		paymentError(c, common.NewMessage("Unsupported payment channel"))
		return "", true
	}
	if err := service.ValidateUSDTTopUpAmount(amount); err != nil {
		paymentError(c, err)
		return "", true
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to get the user group"))
		return "", true
	}
	quote := service.QuoteUSDTTopUp(amount, group)
	if rejectInvalidCreditedQuota(c, id, quote.CreditUSD.Mul(decimal.NewFromFloat(common.QuotaPerUnit))) {
		return "", true
	}
	return group, false
}

// RequestUSDTAmount prices a top-up amount in USDT.
func RequestUSDTAmount(c *gin.Context) {
	var req USDTPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		paymentError(c, common.NewMessage("Invalid parameters"))
		return
	}
	group, rejected := rejectUSDTTopUp(c, req.Amount)
	if rejected {
		return
	}
	quote := service.QuoteUSDTTopUp(req.Amount, group)
	if !quote.ExpectedAmount.IsPositive() {
		paymentError(c, common.NewMessage("Payment amount is too low"))
		return
	}
	response := gin.H{"message": "success", "data": quote.ExpectedAmount.StringFixed(6)}
	// The gateway keeps one order per payer, so paying now opens this one.
	active, err := model.GetActiveUSDTOrder(c.GetInt("id"), time.Now().Unix())
	if err != nil {
		logger.LogError(c.Request.Context(), common.LogText("USDT failed to look up active order user_id=%d error=%q", c.GetInt("id"), err.Error()))
	} else if active != nil {
		response["active_order"] = gin.H{"expires_at": active.ExpiresAt}
	}
	c.JSON(http.StatusOK, response)
}

// RequestUSDTPay opens a USDT checkout for the amount.
func RequestUSDTPay(c *gin.Context) {
	var req USDTPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		paymentError(c, common.NewMessage("Invalid parameters"))
		return
	}
	group, rejected := rejectUSDTTopUp(c, req.Amount)
	if rejected {
		return
	}
	id := c.GetInt("id")
	result, err := service.StartUSDTTopUp(c.Request.Context(), id, req.Amount, group, paymentReturnPath("/wallet"))
	if err != nil {
		var message *common.Message
		if errors.As(err, &message) {
			paymentError(c, err)
			return
		}
		logger.LogError(c.Request.Context(), common.LogText("USDT failed to start top-up user_id=%d amount=%d error=%q", id, req.Amount, err.Error()))
		paymentError(c, common.NewMessage("Failed to start payment"))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"pay_link": result.PayLink,
			"reused":   result.Reused,
		},
	})
}

// USDTWebhook receives the gateway's signed events. Anything but 2xx makes the
// gateway deliver the event again.
func USDTWebhook(c *gin.Context) {
	ctx := c.Request.Context()
	if !service.IsUSDTTopUpEnabled() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	err = service.HandleUSDTWebhook(ctx, c.GetHeader("X-Webhook-Timestamp"), c.GetHeader("X-Webhook-Signature"), body)
	if errors.Is(err, service.ErrUSDTWebhookUnauthorized) {
		logger.LogWarn(ctx, common.LogText("USDT webhook rejected reason=invalid_signature client_ip=%s", c.ClientIP()))
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if err != nil {
		logger.LogError(ctx, common.LogText("USDT webhook failed event_id=%q error=%q", c.GetHeader("X-Webhook-Id"), err.Error()))
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	c.Status(http.StatusNoContent)
}

// GetUSDTExceptionReceipts lists transfers that need an administrator.
func GetUSDTExceptionReceipts(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	receipts, total, err := model.GetUSDTExceptionReceipts(pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(receipts)
	common.ApiSuccess(c, pageInfo)
}

// ResolveUSDTExceptionRequest carries the administrator's handling note.
type ResolveUSDTExceptionRequest struct {
	Note string `json:"note"`
}

// ResolveUSDTException marks a transfer as handled by hand.
func ResolveUSDTException(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	var req ResolveUSDTExceptionRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Note) > 255 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	err = model.ResolveUSDTReceipt(id, req.Note)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiErrorT(c, "Record not found")
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
