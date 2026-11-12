package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/gin-gonic/gin"
)

// mediaArtifactStore keeps copies of generated videos in up to two
// S3-compatible buckets (overseas and mainland) and redirects each viewer to
// the copy served closest to them. Objects are public behind unguessable
// names, so the CDN in front of each bucket can cache them.
type mediaArtifactStore struct{}

var mediaStorageHTTPClient = &http.Client{Timeout: 30 * time.Minute}

var mediaStorageExtensions = map[string]string{
	"video/mp4":       ".mp4",
	"video/webm":      ".webm",
	"video/quicktime": ".mov",
}

// MediaStorageExtension returns the object extension for a video content
// type, or "" when the type is not a video this store keeps.
func MediaStorageExtension(mimeType string) string {
	mimeType, _, _ = strings.Cut(strings.ToLower(strings.TrimSpace(mimeType)), ";")
	return mediaStorageExtensions[strings.TrimSpace(mimeType)]
}

func (mediaArtifactStore) Enabled() bool {
	return len(system_setting.GetMediaStorageSettings().UploadTargets()) > 0
}

func (mediaArtifactStore) Resolve(task *model.Task, artifactKey string) (*StoredArtifactRef, error) {
	if task == nil {
		return nil, nil
	}
	stored := task.PrivateData.StoredMedia
	if stored == nil || stored.ObjectKey == "" || stored.ArtifactKey != artifactKey || len(stored.Targets) == 0 {
		return nil, nil
	}
	settings := system_setting.GetMediaStorageSettings()
	if settings.RetentionDays > 0 && time.Now().Unix()-stored.StoredAt > int64(settings.RetentionDays)*86400 {
		return nil, nil
	}
	var targets []string
	for _, target := range stored.Targets {
		if strings.TrimSpace(settings.Target(target).PublicURL) != "" {
			targets = append(targets, target)
		}
	}
	if len(targets) == 0 {
		return nil, nil
	}
	return &StoredArtifactRef{
		Backend:   "s3",
		ObjectKey: stored.ObjectKey,
		MimeType:  stored.MimeType,
		Size:      stored.Size,
		Targets:   targets,
	}, nil
}

// Persist uploads content to every configured target. content must be an
// io.ReadSeeker because each target reads it from the start. The copy counts
// as stored when at least one target accepted it.
func (mediaArtifactStore) Persist(ctx context.Context, task *model.Task, artifact types.TaskArtifact, content io.Reader) (*StoredArtifactRef, error) {
	settings := system_setting.GetMediaStorageSettings()
	targets := settings.UploadTargets()
	if len(targets) == 0 {
		return nil, ErrTaskArtifactStoreDisabled
	}
	file, ok := content.(io.ReadSeeker)
	if !ok {
		return nil, errors.New("media storage needs seekable content")
	}
	extension := MediaStorageExtension(artifact.MimeType)
	if extension == "" {
		return nil, fmt.Errorf("media storage does not keep %q", artifact.MimeType)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	hash := sha256.New()
	size, err := io.Copy(hash, file)
	if err != nil {
		return nil, err
	}
	payloadHash := hex.EncodeToString(hash.Sum(nil))

	name := make([]byte, 16)
	if _, err := rand.Read(name); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	objectKey := now.Format("2006/01") + "/" + hex.EncodeToString(name) + extension
	if prefix := strings.Trim(strings.TrimSpace(settings.ObjectPrefix), "/"); prefix != "" {
		objectKey = prefix + "/" + objectKey
	}

	ref := &StoredArtifactRef{Backend: "s3", ObjectKey: objectKey, MimeType: artifact.MimeType, Size: size}
	var uploadErrs []error
	for _, target := range targets {
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return nil, err
		}
		uploadStart := time.Now()
		if err := putMediaObject(ctx, settings.Target(target), objectKey, artifact.MimeType, size, payloadHash, file); err != nil {
			uploadErrs = append(uploadErrs, fmt.Errorf("%s: %w", target, err))
			continue
		}
		common.SysLog(common.LogText("media storage upload for task %s to %s: %d bytes in %s",
			task.TaskID, target, size, time.Since(uploadStart).Round(time.Millisecond)))
		ref.Targets = append(ref.Targets, target)
	}
	if len(ref.Targets) == 0 {
		return nil, errors.Join(uploadErrs...)
	}
	for _, uploadErr := range uploadErrs {
		common.SysError(common.LogText("media storage upload for task %s failed: %s", task.TaskID, uploadErr.Error()))
	}
	return ref, nil
}

// Serve redirects the viewer to the stored copy: the mainland copy for
// viewers whose Cloudflare country is listed as mainland, the overseas copy
// otherwise, and whichever copy exists when only one does.
func (mediaArtifactStore) Serve(c *gin.Context, task *model.Task, ref *StoredArtifactRef) error {
	if ref == nil || ref.ObjectKey == "" || len(ref.Targets) == 0 {
		return ErrTaskArtifactStoreDisabled
	}
	settings := system_setting.GetMediaStorageSettings()
	preferred := system_setting.MediaStorageTargetOverseas
	if settings.IsMainlandCountry(c.GetHeader("CF-IPCountry")) {
		preferred = system_setting.MediaStorageTargetMainland
	}
	chosen := ref.Targets[0]
	for _, target := range ref.Targets {
		if target == preferred {
			chosen = target
			break
		}
	}
	base := strings.TrimRight(strings.TrimSpace(settings.Target(chosen).PublicURL), "/")
	if base == "" {
		return ErrTaskArtifactStoreDisabled
	}
	c.Header("Cache-Control", "private, no-store")
	c.Redirect(http.StatusFound, base+"/"+ref.ObjectKey)
	return nil
}

// mediaObjectURL addresses an object path-style (endpoint/bucket/key) or, for
// virtual-hosted targets, as bucket.endpoint-host/key.
func mediaObjectURL(target system_setting.MediaStorageTarget, objectKey string) (string, error) {
	endpoint, err := url.Parse(strings.TrimRight(strings.TrimSpace(target.Endpoint), "/"))
	if err != nil || endpoint.Host == "" || (endpoint.Scheme != "https" && endpoint.Scheme != "http") {
		return "", errors.New("storage endpoint must be an http(s) URL")
	}
	bucket := strings.TrimSpace(target.Bucket)
	if target.VirtualHost {
		endpoint.Host = bucket + "." + endpoint.Host
		endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/" + objectKey
	} else {
		endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/" + bucket + "/" + objectKey
	}
	return endpoint.String(), nil
}

func putMediaObject(ctx context.Context, target system_setting.MediaStorageTarget, objectKey, mimeType string, size int64, payloadHash string, body io.Reader) error {
	objectURL, err := mediaObjectURL(target, objectKey)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, objectURL, io.NopCloser(body))
	if err != nil {
		return err
	}
	req.ContentLength = size
	req.Header.Set("Content-Type", mimeType)
	req.Header.Set("Cache-Control", "public, max-age=31536000, immutable")
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	region := strings.TrimSpace(target.Region)
	if region == "" {
		region = "auto"
	}
	credentials := aws.Credentials{
		AccessKeyID:     strings.TrimSpace(target.AccessKeyID),
		SecretAccessKey: strings.TrimSpace(target.AccessSecret),
	}
	if err := v4.NewSigner().SignHTTP(ctx, credentials, req, payloadHash, "s3", region, time.Now()); err != nil {
		return err
	}
	resp, err := mediaStorageHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("storage returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(detail)))
	}
	return nil
}
