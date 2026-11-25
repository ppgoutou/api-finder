package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
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

// mediaArtifactStore keeps copies of generated videos and images in up to two
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
	extension := TaskArtifactExtension(artifact.Type, artifact.MimeType)
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
	prefix := strings.Trim(strings.TrimSpace(settings.ObjectPrefix), "/")
	if artifact.Type == "image" {
		prefix = generatedImageObjectDir
	}
	if prefix != "" {
		objectKey = prefix + "/" + objectKey
	}

	ref := &StoredArtifactRef{Backend: "s3", ObjectKey: objectKey, MimeType: artifact.MimeType, Size: size, UploadMs: map[string]int64{}}
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
		uploadTime := time.Since(uploadStart)
		ref.UploadMs[target] = uploadTime.Milliseconds()
		common.SysLog(common.LogText("media storage upload for task %s to %s: %d bytes in %s",
			task.TaskID, target, size, uploadTime.Round(time.Millisecond)))
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
	location := MediaObjectPublicURL(storedMediaTarget(ref.Targets, c.GetHeader("CF-IPCountry")), ref.ObjectKey)
	if location == "" {
		return ErrTaskArtifactStoreDisabled
	}
	c.Header("Cache-Control", "private, no-store")
	c.Redirect(http.StatusFound, location)
	return nil
}

// storedMediaTarget picks which of a copy's targets serves a viewer in country.
func storedMediaTarget(targets []string, country string) string {
	preferred := system_setting.MediaStorageTargetOverseas
	if system_setting.GetMediaStorageSettings().IsMainlandCountry(country) {
		preferred = system_setting.MediaStorageTargetMainland
	}
	if slices.Contains(targets, preferred) {
		return preferred
	}
	return targets[0]
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

// videoAssetObjectDir holds reference files users upload for video models,
// apart from the generated videos under ObjectPrefix.
const videoAssetObjectDir = "video-assets"

// generatedImageObjectDir holds images generated from the web console.
const generatedImageObjectDir = "images"

var generatedImageExtensions = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
}

// GeneratedImageExtension returns the object extension for an image content
// type, or "" when the type is not an image this store keeps.
func GeneratedImageExtension(mimeType string) string {
	mimeType, _, _ = strings.Cut(strings.ToLower(strings.TrimSpace(mimeType)), ";")
	return generatedImageExtensions[strings.TrimSpace(mimeType)]
}

// TaskArtifactExtension returns the object extension for a task's video or
// image, or "" when the store does not keep that content type.
func TaskArtifactExtension(artifactType, mimeType string) string {
	if artifactType == "image" {
		return GeneratedImageExtension(mimeType)
	}
	return MediaStorageExtension(mimeType)
}

// How long users are told a stored video or image stays available.
const (
	VideoDisplayRetentionDays = 15
	ImageDisplayRetentionDays = 7
)

// MediaRetentionExpiry is when users are told a copy of mimeType stored at
// storedAt expires: after the display retention of its kind, or sooner when
// the storage retention period is shorter.
func MediaRetentionExpiry(storedAt int64, mimeType string) int64 {
	days := VideoDisplayRetentionDays
	if GeneratedImageExtension(mimeType) != "" {
		days = ImageDisplayRetentionDays
	}
	if retentionDays := system_setting.GetMediaStorageSettings().RetentionDays; retentionDays > 0 {
		days = min(days, retentionDays)
	}
	return storedAt + int64(days)*86400
}

// StoreVideoAsset copies a reference file a user uploaded into object storage
// and returns its public URL, so upstream video services fetch it from the
// CDN instead of this server. It returns "" with no error when media storage
// is off.
func StoreVideoAsset(ctx context.Context, content io.ReadSeeker, name, mimeType string, size int64) (string, error) {
	stored, err := storeMediaObject(ctx, videoAssetObjectDir, content, name, mimeType, size)
	return stored.URL, err
}

// StoredMediaObject is a file kept in one media storage target. Its URL is
// empty when media storage is off.
type StoredMediaObject struct {
	URL       string
	ObjectKey string
	Target    string
	MimeType  string
	Size      int64
	// ThumbnailKey is the object of the image's thumbnail, once stored.
	ThumbnailKey string
}

// StoreGeneratedImage copies an image generated from the web console into
// object storage under a random name; nothing is stored when media storage is
// off.
func StoreGeneratedImage(ctx context.Context, content []byte, mimeType string) (StoredMediaObject, error) {
	extension := GeneratedImageExtension(mimeType)
	if extension == "" {
		return StoredMediaObject{}, fmt.Errorf("unsupported image type %q", mimeType)
	}
	name := common.GetUUID() + extension
	return storeMediaObject(ctx, generatedImageObjectDir, bytes.NewReader(content), name, mimeType, int64(len(content)))
}

// storeMediaObject uploads content to dir/YYYY/MM/name. The Bangkok COS bucket (mainland target) is tried first because it
// shares the server's region and uploads over the internal network; the
// overseas bucket is the fallback.
func storeMediaObject(ctx context.Context, dir string, content io.ReadSeeker, name, mimeType string, size int64) (StoredMediaObject, error) {
	settings := system_setting.GetMediaStorageSettings()
	targets := settings.UploadTargets()
	if len(targets) == 0 {
		return StoredMediaObject{}, nil
	}
	if _, err := content.Seek(0, io.SeekStart); err != nil {
		return StoredMediaObject{}, err
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, content); err != nil {
		return StoredMediaObject{}, err
	}
	payloadHash := hex.EncodeToString(hash.Sum(nil))
	objectKey := dir + "/" + time.Now().UTC().Format("2006/01") + "/" + name

	var uploadErrs []error
	for i := len(targets) - 1; i >= 0; i-- {
		target := settings.Target(targets[i])
		if _, err := content.Seek(0, io.SeekStart); err != nil {
			return StoredMediaObject{}, err
		}
		uploadStart := time.Now()
		if err := putMediaObject(ctx, target, objectKey, mimeType, size, payloadHash, content); err != nil {
			uploadErrs = append(uploadErrs, fmt.Errorf("%s: %w", targets[i], err))
			continue
		}
		common.SysLog(common.LogText("media upload of %s to %s: %d bytes in %s",
			dir, targets[i], size, time.Since(uploadStart).Round(time.Millisecond)))
		return StoredMediaObject{
			URL:       MediaObjectPublicURL(targets[i], objectKey),
			ObjectKey: objectKey,
			Target:    targets[i],
			MimeType:  mimeType,
			Size:      size,
		}, nil
	}
	return StoredMediaObject{}, errors.Join(uploadErrs...)
}
