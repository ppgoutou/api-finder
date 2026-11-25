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
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
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
// and marked with media_expires_at, the expiry users see for images, and with
// the thumbnail_url of a small version. An image that cannot be copied keeps its original entry.
// The copy of a task plugin's image is recorded on its task as well, so the
// owner's works list serves it from any browser. Billing has already settled on
// the upstream response by then; only the body the client receives changes.
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
		task, _ := common.GetContextKeyType[*model.Task](c, constant.ContextKeyPlaygroundImageTask)
		body = storePlaygroundImageResponse(c.Request.Context(), body, task)
	}
	original.Header().Del("Content-Length")
	original.WriteHeader(writer.status)
	_, _ = original.Write(body)
}

// storePlaygroundImageResponse returns the response body with each image it
// could copy pointing at the copy; the body is returned as is when it is not
// an image list. task is the task that drew the images, or nil.
func storePlaygroundImageResponse(ctx context.Context, body []byte, task *model.Task) []byte {
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

	copies := make([]service.StoredMediaObject, len(items))
	var wg sync.WaitGroup
	for i, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		wg.Go(func() {
			stored, content, err := storePlaygroundImage(ctx, item)
			if err != nil {
				common.SysError(common.LogText("playground image copy failed: %s", err.Error()))
				return
			}
			if stored.URL == "" {
				return
			}
			item["url"] = stored.URL
			stored.ThumbnailKey, err = service.StoreImageThumbnail(ctx, content, stored.ObjectKey, []string{stored.Target})
			if err != nil {
				common.SysError(common.LogText("thumbnail of %s failed: %s", stored.ObjectKey, err.Error()))
			} else {
				item["thumbnail_url"] = service.MediaObjectPublicURL(stored.Target, stored.ThumbnailKey)
			}
			copies[i] = stored
			delete(item, "b64_json")
			item["media_expires_at"] = service.MediaRetentionExpiry(time.Now().Unix(), stored.MimeType)
		})
	}
	wg.Wait()
	if len(copies) == 1 && copies[0].URL != "" {
		recordTaskImageCopy(task, copies[0])
	}

	rewritten, err := common.Marshal(response)
	if err != nil {
		return body
	}
	return rewritten
}

// storeTaskPluginImages points each image link of a task plugin's image
// response at a copy in media storage, so API clients get this site's links
// rather than the supplier's, which expire. A link that cannot be copied stays
// as it is.
func storeTaskPluginImages(ctx context.Context, data []any) {
	if !service.GetTaskArtifactStore().Enabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), playgroundImageStoreTimeout)
	defer cancel()

	var wg sync.WaitGroup
	for _, raw := range data {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		link, _ := item["url"].(string)
		wg.Go(func() {
			stored, _, err := storePlaygroundImage(ctx, map[string]any{"url": link})
			if err != nil {
				common.SysError(common.LogText("playground image copy failed: %s", common.MaskSensitiveInfo(err.Error())))
				return
			}
			if stored.URL != "" {
				item["url"] = stored.URL
			}
		})
	}
	wg.Wait()
}

// recordTaskImageCopy makes the stored copy of a task's only image the one its
// artifact link serves. A task with several images keeps the link of each.
func recordTaskImageCopy(task *model.Task, stored service.StoredMediaObject) {
	artifacts, err := projectTaskArtifacts(task)
	if err != nil || len(artifacts) != 1 || artifacts[0].Type != "image" {
		return
	}
	task.PrivateData.StoredMedia = &model.TaskStoredMedia{
		ArtifactKey:  artifacts[0].Key,
		ObjectKey:    stored.ObjectKey,
		MimeType:     stored.MimeType,
		Size:         stored.Size,
		Targets:      []string{stored.Target},
		StoredAt:     time.Now().Unix(),
		ThumbnailKey: stored.ThumbnailKey,
		SoleImage:    true,
	}
	if err := task.UpdateStoredMedia(); err != nil {
		common.SysError(common.LogText("media copy for task %s could not be saved: %s", task.TaskID, err.Error()))
	}
}

// storePlaygroundImage copies one image entry, given as a link or inline
// base64, and returns the copy with the image's content.
func storePlaygroundImage(ctx context.Context, item map[string]any) (service.StoredMediaObject, []byte, error) {
	var content []byte
	if encoded, _ := item["b64_json"].(string); encoded != "" {
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return service.StoredMediaObject{}, nil, err
		}
		content = decoded
	} else if link, _ := item["url"].(string); strings.HasPrefix(link, "http://") || strings.HasPrefix(link, "https://") {
		downloaded, err := downloadPlaygroundImage(ctx, link)
		if err != nil {
			return service.StoredMediaObject{}, nil, err
		}
		content = downloaded
	} else {
		return service.StoredMediaObject{}, nil, nil
	}
	if len(content) > playgroundImageMaxBytes {
		return service.StoredMediaObject{}, nil, errors.New("image is larger than the copy limit")
	}
	stored, err := service.StoreGeneratedImage(ctx, content, http.DetectContentType(content))
	return stored, content, err
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
