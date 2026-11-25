package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	// thumbnailMaxEdge fits a works card on a high-density screen.
	thumbnailMaxEdge = 512
	// thumbnailMaxPixels bounds the memory one image takes to decode.
	thumbnailMaxPixels   = 64 << 20
	thumbnailJPEGQuality = 80
)

// thumbnailSlots bounds how many images are decoded at a time.
var thumbnailSlots = make(chan struct{}, 2)

// encodeImageThumbnail scales an image down to fit thumbnailMaxEdge, as JPEG
// on white.
func encodeImageThumbnail(content []byte) ([]byte, error) {
	config, _, err := image.DecodeConfig(bytes.NewReader(content))
	if err != nil {
		return nil, err
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > thumbnailMaxPixels/config.Height {
		return nil, fmt.Errorf("image of %dx%d is too large for a thumbnail", config.Width, config.Height)
	}
	source, _, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return nil, err
	}
	width, height := config.Width, config.Height
	if longest := max(width, height); longest > thumbnailMaxEdge {
		width = max(1, width*thumbnailMaxEdge/longest)
		height = max(1, height*thumbnailMaxEdge/longest)
	}
	thumbnail := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(thumbnail, thumbnail.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.BiLinear.Scale(thumbnail, thumbnail.Bounds(), source, source.Bounds(), draw.Over, nil)

	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, thumbnail, &jpeg.Options{Quality: thumbnailJPEGQuality}); err != nil {
		return nil, err
	}
	return encoded.Bytes(), nil
}

// StoreImageThumbnail stores a small JPEG of a stored image next to it in each
// of its targets, so lists of works need not load the full image, and returns
// the thumbnail's object key.
func StoreImageThumbnail(ctx context.Context, content []byte, objectKey string, targets []string) (string, error) {
	if objectKey == "" || len(targets) == 0 {
		return "", errors.New("the image has no stored copy")
	}
	select {
	case thumbnailSlots <- struct{}{}:
	case <-ctx.Done():
		return "", ctx.Err()
	}
	thumbnail, err := encodeImageThumbnail(content)
	<-thumbnailSlots
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256(thumbnail)
	thumbnailKey := strings.TrimSuffix(objectKey, path.Ext(objectKey)) + "_thumb.jpg"
	settings := system_setting.GetMediaStorageSettings()
	for _, target := range targets {
		err := putMediaObject(ctx, settings.Target(target), thumbnailKey, "image/jpeg", int64(len(thumbnail)), hex.EncodeToString(hash[:]), bytes.NewReader(thumbnail))
		if err != nil {
			return "", fmt.Errorf("%s: %w", target, err)
		}
	}
	return thumbnailKey, nil
}

// MediaObjectPublicURL is the CDN address of an object in a target, or "" when
// the target has no public address.
func MediaObjectPublicURL(target, objectKey string) string {
	base := strings.TrimRight(strings.TrimSpace(system_setting.GetMediaStorageSettings().Target(target).PublicURL), "/")
	if base == "" || objectKey == "" {
		return ""
	}
	return base + "/" + objectKey
}

// StoredTaskImageURLs returns the CDN addresses of a task's only image and its
// thumbnail, for a viewer in country. Both are empty unless the store serves a
// copy of it; a task with several images lists them as artifacts instead.
func StoredTaskImageURLs(task *model.Task, country string) (imageURL, thumbnailURL string) {
	stored := task.PrivateData.StoredMedia
	if stored == nil || !stored.SoleImage || !task.ResultRetrievable() {
		return "", ""
	}
	ref, err := mediaArtifactStore{}.Resolve(task, stored.ArtifactKey)
	if err != nil || ref == nil {
		return "", ""
	}
	target := storedMediaTarget(ref.Targets, country)
	return MediaObjectPublicURL(target, ref.ObjectKey), MediaObjectPublicURL(target, stored.ThumbnailKey)
}
