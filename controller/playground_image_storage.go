package controller

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const (
	// playgroundImageMaxBytes bounds one generated image fetched for storage.
	playgroundImageMaxBytes = 30 << 20
	// playgroundImageStoreTimeout bounds copying all images of one response.
	playgroundImageStoreTimeout = 90 * time.Second
)

// playgroundImageWriter holds back the image response so its image links can
// be swapped for this site's own copies before the client sees them.
type playgroundImageWriter struct {
	gin.ResponseWriter
	status int
	body   bytes.Buffer
}

func (w *playgroundImageWriter) WriteHeader(code int) { w.status = code }
func (w *playgroundImageWriter) WriteHeaderNow()      {}
func (w *playgroundImageWriter) Flush()               {}
func (w *playgroundImageWriter) Status() int          { return w.status }
func (w *playgroundImageWriter) Size() int            { return w.body.Len() }
func (w *playgroundImageWriter) Written() bool        { return w.body.Len() > 0 }

func (w *playgroundImageWriter) Write(b []byte) (int, error) {
	return w.body.Write(b)
}

func (w *playgroundImageWriter) WriteString(s string) (int, error) {
	return w.body.WriteString(s)
}

// StorePlaygroundImages copies the images a web console request generated
// into media storage, as finished videos are, so they stay available after
// the supplier's links expire. Each stored image's URL is replaced by its copy
// and marked with media_expires_at, the same expiry users see for videos. An image that cannot be copied keeps its original entry.
// Billing has already settled on the upstream response by then; only the
// body the client receives changes.
func StorePlaygroundImages(c *gin.Context) {
	if !service.GetTaskArtifactStore().Enabled() {
		c.Next()
		return
	}
	original := c.Writer
	writer := &playgroundImageWriter{ResponseWriter: original, status: http.StatusOK}
	c.Writer = writer
	// Restored on a panic too, so the recovery handler reaches the client.
	defer func() { c.Writer = original }()
	c.Next()
	c.Writer = original

	body := writer.body.Bytes()
	if writer.status == http.StatusOK {
		body = storePlaygroundImageResponse(c.Request.Context(), body)
	}
	original.Header().Del("Content-Length")
	original.WriteHeader(writer.status)
	_, _ = original.Write(body)
}

// storePlaygroundImageResponse returns the response body with each image it
// could copy pointing at the copy; the body is returned as is when it is not
// an image list.
func storePlaygroundImageResponse(ctx context.Context, body []byte) []byte {
	var response map[string]any
	if err := common.Unmarshal(body, &response); err != nil {
		return body
	}
	items, ok := response["data"].([]any)
	if !ok || len(items) == 0 {
		return body
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), playgroundImageStoreTimeout)
	defer cancel()

	var wg sync.WaitGroup
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		wg.Go(func() {
			storedURL, err := storePlaygroundImage(ctx, item)
			if err != nil {
				common.SysError(common.LogText("playground image copy failed: %s", err.Error()))
				return
			}
			if storedURL == "" {
				return
			}
			item["url"] = storedURL
			delete(item, "b64_json")
			item["media_expires_at"] = service.MediaRetentionExpiry(time.Now().Unix())
		})
	}
	wg.Wait()

	rewritten, err := common.Marshal(response)
	if err != nil {
		return body
	}
	return rewritten
}

// storePlaygroundImage copies one image entry, given as a link or inline
// base64, and returns the copy's URL.
func storePlaygroundImage(ctx context.Context, item map[string]any) (string, error) {
	var content []byte
	if encoded, _ := item["b64_json"].(string); encoded != "" {
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return "", err
		}
		content = decoded
	} else if link, _ := item["url"].(string); strings.HasPrefix(link, "http://") || strings.HasPrefix(link, "https://") {
		downloaded, err := downloadPlaygroundImage(ctx, link)
		if err != nil {
			return "", err
		}
		content = downloaded
	} else {
		return "", nil
	}
	if len(content) > playgroundImageMaxBytes {
		return "", errors.New("image is larger than the copy limit")
	}
	return service.StoreGeneratedImage(ctx, content, http.DetectContentType(content))
}

// downloadPlaygroundImage fetches a supplier's image link. The link comes from
// an upstream response, so it goes through the SSRF-protected client.
func downloadPlaygroundImage(ctx context.Context, link string) ([]byte, error) {
	if err := service.ValidateSSRFProtectedFetchURL(link); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return nil, err
	}
	response, err := service.GetSSRFProtectedHTTPClient().Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("image download returned status %d", response.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(response.Body, playgroundImageMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(content) > playgroundImageMaxBytes {
		return nil, errors.New("image is larger than the copy limit")
	}
	return content, nil
}
