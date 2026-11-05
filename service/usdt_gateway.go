package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
)

const (
	usdtGatewayTimeout       = 15 * time.Second
	usdtGatewayMaxResponse   = 4 << 20
	usdtSignatureToleranceS  = 300
	usdtGatewayErrPayerLock  = "PAYER_LOCKED"
	usdtGatewayIntentsPath   = "/api/v1/payment-intents"
	usdtGatewayReceiptsPath  = "/api/v1/reconciliation/receipts"
	usdtGatewayNetwork       = "tron"
	usdtGatewayAsset         = "USDT"
	usdtGatewayReceiptsLimit = 100
)

// usdtGatewayHTTPClient does not follow redirects: every API answer is direct,
// and a redirect means something like an access login page is in the way.
var usdtGatewayHTTPClient = &http.Client{
	Timeout: usdtGatewayTimeout,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

// usdtGatewayError is an answer from the gateway other than success.
type usdtGatewayError struct {
	Status  int
	Code    string
	Message string
}

func (e *usdtGatewayError) Error() string {
	return fmt.Sprintf("usdt gateway returned status %d code %q: %s", e.Status, e.Code, e.Message)
}

type usdtGatewayReceipt struct {
	TxHash         string `json:"tx_hash"`
	LogIndex       int    `json:"log_index"`
	FromAddress    string `json:"from_address"`
	ToAddress      string `json:"to_address"`
	Amount         string `json:"amount"`
	RawAmount      string `json:"raw_amount"`
	BlockTimestamp string `json:"block_timestamp"`
	Kind           string `json:"kind"`
}

type usdtGatewayIntent struct {
	Id              string               `json:"id"`
	ExternalOrderId string               `json:"external_order_id"`
	PayerRef        string               `json:"payer_ref"`
	Status          string               `json:"status"`
	Network         string               `json:"network"`
	Environment     string               `json:"environment"`
	Asset           string               `json:"asset"`
	ContractAddress string               `json:"contract_address"`
	DepositAddress  string               `json:"deposit_address"`
	ReceivedTotal   string               `json:"received_total"`
	Receipts        []usdtGatewayReceipt `json:"receipts"`
	ExpiresAt       string               `json:"expires_at"`
	CheckoutUrl     string               `json:"checkout_url"`
}

type usdtCreateIntentRequest struct {
	ExternalOrderId string  `json:"external_order_id"`
	PayerRef        string  `json:"payer_ref"`
	ExpectedAmount  string  `json:"expected_amount"`
	ExpiresIn       int     `json:"expires_in"`
	ReturnUrl       *string `json:"return_url,omitempty"`
}

type usdtGatewayEvent struct {
	Id       string         `json:"id"`
	Type     string         `json:"type"`
	Sequence int64          `json:"sequence"`
	Data     map[string]any `json:"data"`
}

type usdtReceiptFeedPage struct {
	Data []usdtGatewayEvent `json:"data"`
	Meta struct {
		Environment string `json:"environment"`
		NextCursor  string `json:"next_cursor"`
		HasMore     bool   `json:"has_more"`
	} `json:"meta"`
}

// signUSDTRequest builds X-Signature over the gateway's five-line canonical
// request: method, path and query, body hash, timestamp, nonce.
func signUSDTRequest(secret string, method string, pathAndQuery string, body []byte, timestamp string, nonce string) string {
	bodyHash := sha256.Sum256(body)
	canonical := strings.Join([]string{method, pathAndQuery, hex.EncodeToString(bodyHash[:]), timestamp, nonce}, "\n")
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// verifyUSDTWebhookSignature checks X-Webhook-Signature in constant time and
// rejects timestamps outside the window, which limits replaying a captured call.
func verifyUSDTWebhookSignature(secret string, timestamp string, body []byte, signature string, now time.Time) bool {
	sent, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	age := now.Unix() - sent
	if age > usdtSignatureToleranceS || age < -usdtSignatureToleranceS {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	return hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(signature))
}

// callUSDTGateway sends one signed request and decodes a 2xx answer into out.
func callUSDTGateway(ctx context.Context, method string, pathAndQuery string, idempotencyKey string, body []byte, out any) error {
	base := strings.TrimRight(strings.TrimSpace(setting.USDTGatewayAddress), "/")
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, base+pathAndQuery, reader)
	if err != nil {
		return err
	}
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return err
	}
	nonce := hex.EncodeToString(nonceBytes)
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)

	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Client-Id", strings.TrimSpace(setting.USDTClientId))
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Nonce", nonce)
	req.Header.Set("X-Signature", signUSDTRequest(strings.TrimSpace(setting.USDTApiSecret), method, pathAndQuery, body, timestamp, nonce))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}

	resp, err := usdtGatewayHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, usdtGatewayMaxResponse))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		gatewayErr := &usdtGatewayError{Status: resp.StatusCode}
		var parsed struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if common.Unmarshal(respBody, &parsed) == nil {
			gatewayErr.Code = parsed.Error.Code
			gatewayErr.Message = parsed.Error.Message
		}
		return gatewayErr
	}
	if out == nil {
		return nil
	}
	return common.Unmarshal(respBody, out)
}

func isUSDTGatewayStatus(err error, status int) bool {
	var gatewayErr *usdtGatewayError
	return errors.As(err, &gatewayErr) && gatewayErr.Status == status
}

func getUSDTIntentByExternalOrder(ctx context.Context, tradeNo string) (*usdtGatewayIntent, error) {
	intent := &usdtGatewayIntent{}
	path := usdtGatewayIntentsPath + "/by-external-order/" + url.PathEscape(tradeNo)
	if err := callUSDTGateway(ctx, http.MethodGet, path, "", nil, intent); err != nil {
		return nil, err
	}
	return intent, nil
}

func getUSDTIntentById(ctx context.Context, intentId string) (*usdtGatewayIntent, error) {
	intent := &usdtGatewayIntent{}
	path := usdtGatewayIntentsPath + "/" + url.PathEscape(intentId)
	if err := callUSDTGateway(ctx, http.MethodGet, path, "", nil, intent); err != nil {
		return nil, err
	}
	return intent, nil
}

// createUSDTIntent follows the gateway's retry contract: when the answer is
// unknown, look the order up first and only then repeat the same body with the
// same idempotency key. A definite refusal is returned as it is.
func createUSDTIntent(ctx context.Context, request *usdtCreateIntentRequest) (*usdtGatewayIntent, error) {
	body, err := common.Marshal(request)
	if err != nil {
		return nil, err
	}
	idempotencyKey := "create-" + request.ExternalOrderId

	intent := &usdtGatewayIntent{}
	err = callUSDTGateway(ctx, http.MethodPost, usdtGatewayIntentsPath, idempotencyKey, body, intent)
	if err == nil {
		return intent, nil
	}
	if isDefiniteUSDTRefusal(err) {
		return nil, err
	}

	found, lookupErr := getUSDTIntentByExternalOrder(ctx, request.ExternalOrderId)
	if lookupErr == nil {
		return found, nil
	}
	if !isUSDTGatewayStatus(lookupErr, http.StatusNotFound) {
		return nil, err
	}
	intent = &usdtGatewayIntent{}
	if err := callUSDTGateway(ctx, http.MethodPost, usdtGatewayIntentsPath, idempotencyKey, body, intent); err != nil {
		return nil, err
	}
	return intent, nil
}

// isDefiniteUSDTRefusal reports a client error that says the intent was not
// created. Rate limiting and server errors leave the outcome open.
func isDefiniteUSDTRefusal(err error) bool {
	var gatewayErr *usdtGatewayError
	if !errors.As(err, &gatewayErr) {
		return false
	}
	return gatewayErr.Status >= 400 && gatewayErr.Status < 500 && gatewayErr.Status != http.StatusTooManyRequests
}
