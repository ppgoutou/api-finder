package controller

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// Home page media are files an administrator uploads for the public home page
// (hero clip, showcase clips, posters). They are stored under HOME_MEDIA_DIR
// (default "home-media" in the working directory, /data in the container) with
// random names and served publicly from /home-media/<name>.
const (
	homeMediaMaxVideoBytes   = 95 << 20
	homeMediaMaxImageBytes   = 10 << 20
	homeMediaMaxRequestBytes = homeMediaMaxVideoBytes + 1<<20
	homeMediaURLPrefix       = "/home-media/"
	homeShowcaseOptionKey    = "HomeShowcase"
	homeShowcaseMaxItems     = 30
	studioGalleryOptionKey   = "StudioGallery"
	studioGalleryMaxItems    = 30
)

// Sniffed content type → stored extension. SVG and HTML are never accepted, so
// an upload cannot become an active document on the site's origin.
var homeMediaTypes = map[string]string{
	"video/mp4":  ".mp4",
	"video/webm": ".webm",
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

var homeMediaServedTypes = map[string]string{
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".jpg":  "image/jpeg",
	".png":  "image/png",
	".webp": "image/webp",
}

// mp4Brands are ISO base media brands of plain MP4 video. http.DetectContentType
// only recognizes files listing an "mp4*" brand, while common encoder output
// declares only isom/iso2-iso9/avc1.
var mp4Brands = map[string]bool{
	"isom": true, "iso2": true, "iso3": true, "iso4": true, "iso5": true,
	"iso6": true, "iso7": true, "iso8": true, "iso9": true,
	"mp41": true, "mp42": true, "avc1": true, "dash": true, "mmp4": true,
	"msnv": true, "M4V ": true,
}

// sniffHomeMediaType returns the content type of an upload from its first
// bytes, treating an ftyp box with an MP4 brand as video/mp4. Other ISO media
// files (HEIC, AVIF, QuickTime) keep the standard sniffing result.
func sniffHomeMediaType(head []byte) string {
	if len(head) >= 16 && string(head[4:8]) == "ftyp" {
		end := min(int(binary.BigEndian.Uint32(head[:4])), len(head))
		for offset := 8; offset+4 <= end; offset += 4 {
			if offset == 12 { // minor version, not a brand
				continue
			}
			if mp4Brands[string(head[offset:offset+4])] {
				return "video/mp4"
			}
		}
	}
	return http.DetectContentType(head)
}

var homeMediaNamePattern = regexp.MustCompile(`^[a-f0-9]{32}\.(mp4|webm|jpg|png|webp)$`)

func homeMediaDir() string {
	return common.GetEnvOrDefaultString("HOME_MEDIA_DIR", "home-media")
}

// UploadHomeMedia stores one video or image for the home page and returns its
// public URL.
func UploadHomeMedia(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, homeMediaMaxRequestBytes)
	header, err := c.FormFile("file")
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			common.ApiErrorT(c, "The file is too large. Videos can be up to 95 MB and images up to 10 MB.")
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
	contentType := sniffHomeMediaType(head[:n])
	ext, ok := homeMediaTypes[contentType]
	if !ok {
		common.ApiErrorT(c, "Unsupported file type. Upload an MP4 or WebM video, or a JPG, PNG or WebP image.")
		return
	}
	limit := int64(homeMediaMaxImageBytes)
	if strings.HasPrefix(contentType, "video/") {
		limit = homeMediaMaxVideoBytes
	}
	if header.Size > limit {
		common.ApiErrorT(c, "The file is too large. Videos can be up to 95 MB and images up to 10 MB.")
		return
	}

	random := make([]byte, 16)
	if _, err = rand.Read(random); err != nil {
		common.ApiErrorT(c, "Upload failed")
		return
	}
	name := hex.EncodeToString(random) + ext
	dir := homeMediaDir()
	if err = os.MkdirAll(dir, 0o755); err != nil {
		common.SysError(common.LogText("home media: create directory failed: %s", err.Error()))
		common.ApiErrorT(c, "Upload failed")
		return
	}
	// Write to a temporary file first so a failed copy never leaves a partial
	// file under a servable name.
	temp, err := os.CreateTemp(dir, ".upload-*")
	if err != nil {
		common.SysError(common.LogText("home media: create file failed: %s", err.Error()))
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
		common.SysError(common.LogText("home media: save file failed: %s", err.Error()))
		common.ApiErrorT(c, "Upload failed")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"url":          homeMediaURLPrefix + name,
			"content_type": contentType,
			"size":         header.Size,
		},
	})
}

// DeleteHomeMedia removes an uploaded home page file. Deleting a file that is
// already gone succeeds.
func DeleteHomeMedia(c *gin.Context) {
	name := c.Param("name")
	if !homeMediaNamePattern.MatchString(name) {
		common.ApiErrorT(c, "Invalid file name")
		return
	}
	err := os.Remove(filepath.Join(homeMediaDir(), name))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		common.SysError(common.LogText("home media: delete file failed: %s", err.Error()))
		common.ApiErrorT(c, "Delete failed")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

// ServeHomeMedia serves an uploaded home page file with range support, so
// browsers can stream and seek videos.
func ServeHomeMedia(c *gin.Context) {
	name := c.Param("name")
	if !homeMediaNamePattern.MatchString(name) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	file, err := os.Open(filepath.Join(homeMediaDir(), name))
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	// Names are random and never reused, so the content never changes.
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("Content-Type", homeMediaServedTypes[filepath.Ext(name)])
	c.Header("X-Content-Type-Options", "nosniff")
	http.ServeContent(c.Writer, c.Request, name, info.ModTime(), file)
}

// GetHomeShowcase returns the home page video settings (a JSON string, empty
// when the built-in defaults apply).
func GetHomeShowcase(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	value := common.OptionMap[homeShowcaseOptionKey]
	common.OptionMapRWMutex.RUnlock()
	serveRevalidatedJSON(c, value)
}

// GetStudioGallery returns the video-studio gallery settings (a JSON string of
// curated clips; empty when the gallery has no configured works).
func GetStudioGallery(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	value := common.OptionMap[studioGalleryOptionKey]
	common.OptionMapRWMutex.RUnlock()
	serveRevalidatedJSON(c, value)
}

type homeShowcaseItem struct {
	Title    string `json:"title"`
	Category string `json:"category"`
	Prompt   string `json:"prompt"`
	// Chinese versions shown to Chinese interfaces; empty falls back to the
	// default text above.
	TitleZh    string `json:"title_zh"`
	CategoryZh string `json:"category_zh"`
	PromptZh   string `json:"prompt_zh"`
	Spec       string `json:"spec"`
	Video      string `json:"video"`
	Poster     string `json:"poster"`
	Image      string `json:"image"`
}

type homeShowcaseSettings struct {
	Hero         *homeShowcaseItem  `json:"hero"`
	ImageToVideo *homeShowcaseItem  `json:"image_to_video"`
	Showcase     []homeShowcaseItem `json:"showcase"`
}

type studioGallerySettings struct {
	Items []homeShowcaseItem `json:"items"`
}

var errInvalidHomeShowcase = errors.New("invalid home showcase settings")
var errInvalidStudioGallery = errors.New("invalid studio gallery settings")

// showcaseMediaAllowed reports whether every media link of a clip is an
// uploaded home-media file or an https link.
func showcaseMediaAllowed(item homeShowcaseItem) bool {
	for _, link := range []string{item.Video, item.Poster, item.Image} {
		if link == "" {
			continue
		}
		if name, ok := strings.CutPrefix(link, homeMediaURLPrefix); ok {
			if !homeMediaNamePattern.MatchString(name) {
				return false
			}
			continue
		}
		parsed, err := url.Parse(link)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
			return false
		}
	}
	return true
}

// validateHomeShowcase checks the HomeShowcase option before it is saved:
// bounded text, at most homeShowcaseMaxItems clips, and media URLs that are
// either uploaded files or https links.
func validateHomeShowcase(value string) error {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	var settings homeShowcaseSettings
	if err := common.UnmarshalJsonStr(value, &settings); err != nil {
		return errInvalidHomeShowcase
	}
	if len(settings.Showcase) > homeShowcaseMaxItems {
		return errInvalidHomeShowcase
	}
	items := settings.Showcase
	if settings.Hero != nil {
		items = append(items, *settings.Hero)
	}
	if settings.ImageToVideo != nil {
		items = append(items, *settings.ImageToVideo)
	}
	for _, item := range items {
		if utf8.RuneCountInString(item.Title) > 80 ||
			utf8.RuneCountInString(item.TitleZh) > 80 ||
			utf8.RuneCountInString(item.Category) > 20 ||
			utf8.RuneCountInString(item.CategoryZh) > 20 ||
			utf8.RuneCountInString(item.Prompt) > 2000 ||
			utf8.RuneCountInString(item.PromptZh) > 2000 ||
			utf8.RuneCountInString(item.Spec) > 60 ||
			!showcaseMediaAllowed(item) {
			return errInvalidHomeShowcase
		}
	}
	return nil
}

// validateStudioGallery checks the StudioGallery option before it is saved:
// titles of at most 100 characters, prompts of any length, at most
// studioGalleryMaxItems works, and media URLs that are uploaded files or
// https links.
func validateStudioGallery(value string) error {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	var settings studioGallerySettings
	if err := common.UnmarshalJsonStr(value, &settings); err != nil {
		return errInvalidStudioGallery
	}
	if len(settings.Items) > studioGalleryMaxItems {
		return errInvalidStudioGallery
	}
	for _, item := range settings.Items {
		if utf8.RuneCountInString(item.Title) > 100 ||
			utf8.RuneCountInString(item.Category) > 20 ||
			utf8.RuneCountInString(item.Spec) > 60 ||
			!showcaseMediaAllowed(item) {
			return errInvalidStudioGallery
		}
	}
	return nil
}
