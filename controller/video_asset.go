package controller

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// Video assets are reference images, videos and audio a signed-in user uploads
// on the video creation page. Video models only take public URLs, so the files
// are served publicly from /video-assets/<name> under random names and deleted
// after videoAssetRetention. They live under VIDEO_ASSET_DIR (default
// "video-assets" in the working directory, /data in the container).
const (
	videoAssetMaxImageBytes   = 10 << 20
	videoAssetMaxVideoBytes   = 50 << 20
	videoAssetMaxAudioBytes   = 15 << 20
	videoAssetMaxRequestBytes = videoAssetMaxVideoBytes + 1<<20
	videoAssetURLPrefix       = "/video-assets/"
	videoAssetRetention       = 7 * 24 * time.Hour
	videoAssetCleanupInterval = time.Hour
	videoAssetStoreTimeout    = 2 * time.Minute
)

// Sniffed content type → stored extension. Only media the video models accept
// as references; nothing that a browser could run as a document.
var videoAssetTypes = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/webp":      ".webp",
	"video/mp4":       ".mp4",
	"video/quicktime": ".mov",
	"audio/mpeg":      ".mp3",
	"audio/wave":      ".wav",
	"audio/mp4":       ".m4a",
}

var videoAssetServedTypes = map[string]string{
	".jpg":  "image/jpeg",
	".png":  "image/png",
	".webp": "image/webp",
	".mp4":  "video/mp4",
	".mov":  "video/quicktime",
	".mp3":  "audio/mpeg",
	".wav":  "audio/wav",
	".m4a":  "audio/mp4",
}

var videoAssetNamePattern = regexp.MustCompile(`^[a-f0-9]{32}\.(jpg|png|webp|mp4|mov|mp3|wav|m4a)$`)

func videoAssetDir() string {
	return common.GetEnvOrDefaultString("VIDEO_ASSET_DIR", "video-assets")
}

// sniffVideoAssetType returns the content type of an upload from its first
// bytes. On top of the home media rules it recognizes QuickTime and M4A by
// their major brand, and MP3 files without an ID3 tag by the MPEG frame sync.
func sniffVideoAssetType(head []byte) string {
	if len(head) >= 12 && string(head[4:8]) == "ftyp" {
		switch string(head[8:12]) {
		case "qt  ":
			return "video/quicktime"
		case "M4A ":
			return "audio/mp4"
		}
	}
	if len(head) >= 2 && head[0] == 0xFF && head[1]&0xE0 == 0xE0 {
		return "audio/mpeg"
	}
	return sniffHomeMediaType(head)
}

func videoAssetLimit(contentType string) int64 {
	switch {
	case strings.HasPrefix(contentType, "video/"):
		return videoAssetMaxVideoBytes
	case strings.HasPrefix(contentType, "audio/"):
		return videoAssetMaxAudioBytes
	default:
		return videoAssetMaxImageBytes
	}
}

// UploadVideoAsset stores one reference file for the signed-in user and
// returns its public URL. Only users with a positive balance can upload, so
// the public file host cannot be used by accounts that never pay.
func UploadVideoAsset(c *gin.Context) {
	quota, err := model.GetUserQuota(c.GetInt("id"), false)
	if err != nil {
		common.ApiErrorT(c, "Upload failed")
		return
	}
	if quota <= 0 {
		common.ApiErrorT(c, "Top up your balance before uploading reference files.")
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, videoAssetMaxRequestBytes)
	header, err := c.FormFile("file")
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			common.ApiErrorT(c, "The file is too large. Images can be up to 10 MB, videos up to 50 MB and audio up to 15 MB.")
			return
		}
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	file, err := header.Open()
	if err != nil {
		common.ApiErrorT(c, "Upload failed")
		return
	}
	defer file.Close()

	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		common.ApiErrorT(c, "Upload failed")
		return
	}
	contentType := sniffVideoAssetType(head[:n])
	ext, ok := videoAssetTypes[contentType]
	if !ok {
		common.ApiErrorT(c, "Unsupported file type. Upload a JPG, PNG or WebP image, an MP4 or MOV video, or an MP3, WAV or M4A audio file.")
		return
	}
	if header.Size > videoAssetLimit(contentType) {
		common.ApiErrorT(c, "The file is too large. Images can be up to 10 MB, videos up to 50 MB and audio up to 15 MB.")
		return
	}

	random := make([]byte, 16)
	if _, err = rand.Read(random); err != nil {
		common.ApiErrorT(c, "Upload failed")
		return
	}
	name := hex.EncodeToString(random) + ext
	dir := videoAssetDir()
	if err = os.MkdirAll(dir, 0o755); err != nil {
		common.SysError(common.LogText("video asset: create directory failed: %s", err.Error()))
		common.ApiErrorT(c, "Upload failed")
		return
	}
	// Write to a temporary file first so a failed copy never leaves a partial
	// file under a servable name.
	temp, err := os.CreateTemp(dir, ".upload-*")
	if err != nil {
		common.SysError(common.LogText("video asset: create file failed: %s", err.Error()))
		common.ApiErrorT(c, "Upload failed")
		return
	}
	tempName := temp.Name()
	_, err = io.Copy(temp, io.MultiReader(bytes.NewReader(head[:n]), file))
	closeErr := temp.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Chmod(tempName, 0o644)
	}
	if err == nil {
		err = os.Rename(tempName, filepath.Join(dir, name))
	}
	if err != nil {
		_ = os.Remove(tempName)
		common.SysError(common.LogText("video asset: save file failed: %s", err.Error()))
		common.ApiErrorT(c, "Upload failed")
		return
	}

	// Upstream video services fetch the file, so the URL is absolute. Prefer
	// the object storage copy: fetches from this server go through its 30 Mbps
	// link and time out on the first, uncached request. The local copy stays
	// as the fallback when object storage is off or the upload fails.
	assetURL := strings.TrimRight(system_setting.ServerAddress, "/") + videoAssetURLPrefix + name
	if saved, err := os.Open(filepath.Join(dir, name)); err == nil {
		ctx, cancel := context.WithTimeout(c.Request.Context(), videoAssetStoreTimeout)
		storedURL, storeErr := service.StoreVideoAsset(ctx, saved, name, contentType, header.Size)
		cancel()
		_ = saved.Close()
		if storeErr != nil {
			common.SysError(common.LogText("video asset: object storage upload failed: %s", storeErr.Error()))
		} else if storedURL != "" {
			assetURL = storedURL
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"url":          assetURL,
			"content_type": contentType,
			"size":         header.Size,
			"expires_at":   time.Now().Add(videoAssetRetention).Unix(),
		},
	})
}

// ServeVideoAsset serves an uploaded reference file with range support.
// Files past the retention period are gone even before cleanup removes them.
func ServeVideoAsset(c *gin.Context) {
	name := c.Param("name")
	if !videoAssetNamePattern.MatchString(name) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	file, err := os.Open(filepath.Join(videoAssetDir(), name))
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() || time.Since(info.ModTime()) > videoAssetRetention {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "public, max-age=86400")
	c.Header("Content-Type", videoAssetServedTypes[filepath.Ext(name)])
	c.Header("X-Content-Type-Options", "nosniff")
	http.ServeContent(c.Writer, c.Request, name, info.ModTime(), file)
}

// removeExpiredVideoAssets deletes uploads older than the retention period and
// temporary files left behind by interrupted uploads.
func removeExpiredVideoAssets(dir string, now time.Time) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			common.SysError(common.LogText("video asset: read directory failed: %s", err.Error()))
		}
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		maxAge := videoAssetRetention
		if strings.HasPrefix(entry.Name(), ".upload-") {
			maxAge = videoAssetCleanupInterval
		} else if !videoAssetNamePattern.MatchString(entry.Name()) {
			continue
		}
		if now.Sub(info.ModTime()) <= maxAge {
			continue
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil && !errors.Is(err, os.ErrNotExist) {
			common.SysError(common.LogText("video asset: delete expired file failed: %s", err.Error()))
		}
	}
}

// StartVideoAssetCleanup removes expired reference files now and then every
// hour. Files are stored per node, so every node runs it.
func StartVideoAssetCleanup() {
	for {
		removeExpiredVideoAssets(videoAssetDir(), time.Now())
		time.Sleep(videoAssetCleanupInterval)
	}
}
