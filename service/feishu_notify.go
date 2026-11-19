package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// feishuWebhookHosts are the only hosts a Feishu / Lark custom bot webhook
// lives on; anything else is refused so the setting cannot be used to make
// the server call arbitrary URLs.
var feishuWebhookHosts = []string{"open.feishu.cn", "open.larksuite.com"}

// ValidateFeishuWebhookURL accepts only https bot webhook URLs on the
// Feishu / Lark open platform hosts.
func ValidateFeishuWebhookURL(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("invalid Feishu webhook URL: %w", err)
	}
	if parsed.Scheme != "https" || !strings.HasPrefix(parsed.Path, "/open-apis/bot/") {
		return fmt.Errorf("Feishu webhook URL must look like https://open.feishu.cn/open-apis/bot/v2/hook/...")
	}
	for _, host := range feishuWebhookHosts {
		if strings.EqualFold(parsed.Hostname(), host) {
			return nil
		}
	}
	return fmt.Errorf("Feishu webhook host must be open.feishu.cn or open.larksuite.com")
}

// feishuSign is the custom bot signature: base64(HMAC-SHA256 keyed by
// "timestamp\nsecret" over an empty message).
func feishuSign(timestamp int64, secret string) string {
	mac := hmac.New(sha256.New, []byte(strconv.FormatInt(timestamp, 10)+"\n"+secret))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// SendFeishuText posts a plain text message to a Feishu / Lark custom bot.
// secret is the bot's signature secret; leave it empty when the bot has no
// signature check.
func SendFeishuText(webhookURL string, secret string, text string) error {
	if err := ValidateFeishuWebhookURL(webhookURL); err != nil {
		return err
	}
	payload := map[string]any{
		"msg_type": "text",
		"content":  map[string]string{"text": text},
	}
	if secret != "" {
		timestamp := time.Now().Unix()
		payload["timestamp"] = strconv.FormatInt(timestamp, 10)
		payload["sign"] = feishuSign(timestamp, secret)
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(strings.TrimSpace(webhookURL), "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to send Feishu message: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Feishu returned HTTP %d", resp.StatusCode)
	}
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	if err := common.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("invalid Feishu response: %w", err)
	}
	if result.Code != 0 {
		return fmt.Errorf("Feishu rejected the message: %d %s", result.Code, result.Msg)
	}
	return nil
}
