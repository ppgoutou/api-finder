package service

import (
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

// paymentNoticeLanguage is the language of the message; it goes to the site
// operator's group, which reads Simplified Chinese.
const paymentNoticeLanguage = "zh-CN"

// SendPaymentNotice tells the Feishu group of the upstream balance alert about
// a payment, in the background: a failed message never affects the payment.
func SendPaymentNotice(userId int, quota int) {
	settings := system_setting.GetBalanceAlertSettings()
	webhook, secret := settings.FeishuWebhookURL, settings.FeishuSignSecret
	if !settings.PaymentNoticeEnabled || strings.TrimSpace(webhook) == "" {
		return
	}
	gopool.Go(func() {
		text, err := paymentNoticeText(userId, quota, time.Now())
		if err == nil {
			err = SendFeishuText(webhook, secret, text)
		}
		if err != nil {
			common.SysError(common.LogText("failed to send payment notice for user %d: %s", userId, err.Error()))
		}
	})
}

func paymentNoticeText(userId int, quota int, now time.Time) (string, error) {
	user, err := model.GetUserById(userId, false)
	if err != nil {
		return "", err
	}
	count, total, err := model.PaidTopUpHistory(userId)
	if err != nil {
		return "", err
	}
	// Accounts created before the registration time was stored have none.
	registered := i18n.Translate(paymentNoticeLanguage, i18n.MsgPaymentNoticeUnknown, nil)
	if user.CreatedAt > 0 {
		days := max(now.Unix()-user.CreatedAt, 0) / 86400
		registered = i18n.Translate(paymentNoticeLanguage, i18n.MsgPaymentNoticeDays, map[string]any{"Days": days})
	}
	return i18n.Translate(paymentNoticeLanguage, i18n.MsgPaymentNotice, map[string]any{
		"System": common.SystemName,
		"Name":   user.Username,
		"Amount": logger.FormatQuotaCents(quota),
		"Count":  count,
		"Total":  logger.FormatQuotaCents(int(total)),
		"Days":   registered,
	}), nil
}
