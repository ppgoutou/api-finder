package controller

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type videoAssetUploadResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    struct {
		URL         string `json:"url"`
		ContentType string `json:"content_type"`
		ExpiresAt   int64  `json:"expires_at"`
	} `json:"data"`
}

// setupVideoAssetTest stores uploads in a temporary directory and creates a
// user with the given wallet balance.
func setupVideoAssetTest(t *testing.T, quota int) (dir string, userID int) {
	t.Helper()
	db := openTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	user := model.User{Username: "creator", Password: "password123", Quota: quota, Status: common.UserStatusEnabled, Group: "default"}
	require.NoError(t, db.Create(&user).Error)

	dir = t.TempDir()
	t.Setenv("VIDEO_ASSET_DIR", dir)
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://api.example.com/"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })
	return dir, user.Id
}

func uploadVideoAsset(t *testing.T, userID int, fileName string, content []byte) videoAssetUploadResponse {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", fileName)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/video_assets", body)
	context.Request.Header.Set("Content-Type", writer.FormDataContentType())
	context.Set("id", userID)
	UploadVideoAsset(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response videoAssetUploadResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func serveVideoAsset(name string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/video-assets/"+name, nil)
	context.Params = gin.Params{{Key: "name", Value: name}}
	ServeVideoAsset(context)
	return recorder
}

func TestUploadVideoAssetReturnsAbsoluteURLAndServesFile(t *testing.T) {
	dir, userID := setupVideoAssetTest(t, 1000)
	jpeg := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, []byte("jpeg-payload")...)

	response := uploadVideoAsset(t, userID, "photo.html", jpeg)

	require.True(t, response.Success, response.Message)
	assert.Equal(t, "image/jpeg", response.Data.ContentType)
	name, ok := strings.CutPrefix(response.Data.URL, "https://api.example.com/video-assets/")
	require.True(t, ok, response.Data.URL)
	assert.Regexp(t, `^[a-f0-9]{32}\.jpg$`, name)
	assert.InDelta(t, time.Now().Add(videoAssetRetention).Unix(), response.Data.ExpiresAt, 5)
	stored, err := os.ReadFile(filepath.Join(dir, name))
	require.NoError(t, err)
	assert.Equal(t, jpeg, stored)

	served := serveVideoAsset(name)
	assert.Equal(t, http.StatusOK, served.Code)
	assert.Equal(t, "image/jpeg", served.Header().Get("Content-Type"))
	assert.Equal(t, "nosniff", served.Header().Get("X-Content-Type-Options"))
}

func TestUploadVideoAssetReturnsObjectStorageURL(t *testing.T) {
	jpeg := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, []byte("jpeg-payload")...)
	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer failing.Close()

	cases := []struct {
		name           string
		mainlandFails  bool
		overseasFails  bool
		wantURLPrefix  string
		wantBucketPath string
	}{
		{name: "mainland bucket first", wantURLPrefix: "https://cn-media.example.com/video-assets/", wantBucketPath: "/cn-media/video-assets/"},
		{name: "overseas when mainland fails", mainlandFails: true, wantURLPrefix: "https://media.example.com/video-assets/", wantBucketPath: "/global-media/video-assets/"},
		{name: "local when both fail", mainlandFails: true, overseasFails: true, wantURLPrefix: "https://api.example.com/video-assets/"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir, userID := setupVideoAssetTest(t, 1000)
			bucket, bucketServer := newFakeMediaBucket(t)
			mainland, overseas := bucketServer.URL, bucketServer.URL
			if tc.mainlandFails {
				mainland = failing.URL
			}
			if tc.overseasFails {
				overseas = failing.URL
			}
			configureMediaStorageTest(t, overseas, mainland)

			response := uploadVideoAsset(t, userID, "photo.jpg", jpeg)

			require.True(t, response.Success, response.Message)
			require.True(t, strings.HasPrefix(response.Data.URL, tc.wantURLPrefix), response.Data.URL)
			name := filepath.Base(response.Data.URL)
			assert.Regexp(t, `^[a-f0-9]{32}\.jpg$`, name)
			_, err := os.Stat(filepath.Join(dir, name))
			require.NoError(t, err, "the local copy stays as the fallback")
			if tc.wantBucketPath == "" {
				assert.Empty(t, bucket.objects)
				return
			}
			require.Len(t, bucket.objects, 1)
			for path, body := range bucket.objects {
				assert.True(t, strings.HasPrefix(path, tc.wantBucketPath), path)
				assert.True(t, strings.HasSuffix(path, "/"+name), path)
				assert.Equal(t, string(jpeg), body)
				assert.Equal(t, "image/jpeg", bucket.types[path])
			}
		})
	}
}

func TestUploadVideoAssetRequiresPositiveBalance(t *testing.T) {
	dir, userID := setupVideoAssetTest(t, 0)

	response := uploadVideoAsset(t, userID, "photo.jpg", []byte{0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3})

	assert.False(t, response.Success)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Empty(t, entries)
}

func TestUploadVideoAssetRejectsDocuments(t *testing.T) {
	dir, userID := setupVideoAssetTest(t, 1000)

	response := uploadVideoAsset(t, userID, "photo.jpg", []byte("<html><script>alert(1)</script></html>"))

	assert.False(t, response.Success)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Empty(t, entries)
}

func TestSniffVideoAssetType(t *testing.T) {
	ftyp := func(brand string) []byte {
		return append([]byte{0, 0, 0, 0x14, 'f', 't', 'y', 'p'}, []byte(brand+"\x00\x00\x02\x00"+brand)...)
	}
	cases := []struct {
		name string
		head []byte
		want string
	}{
		{"mp4", ftyp("isom"), "video/mp4"},
		{"quicktime", ftyp("qt  "), "video/quicktime"},
		{"m4a", ftyp("M4A "), "audio/mp4"},
		{"mp3 with id3", []byte("ID3\x04\x00\x00\x00\x00\x00\x00"), "audio/mpeg"},
		{"mp3 frame sync", []byte{0xFF, 0xFB, 0x90, 0x64, 0, 0}, "audio/mpeg"},
		{"wav", []byte("RIFF\x24\x00\x00\x00WAVEfmt "), "audio/wave"},
		{"jpeg", []byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0}, "image/jpeg"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, sniffVideoAssetType(tc.head))
			_, accepted := videoAssetTypes[tc.want]
			assert.True(t, accepted)
		})
	}
	_, accepted := videoAssetTypes[sniffVideoAssetType([]byte("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))]
	assert.False(t, accepted, "svg must not be accepted")
}

func TestVideoAssetExpiresAfterRetention(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("VIDEO_ASSET_DIR", dir)
	now := time.Now()
	fresh := "0123456789abcdef0123456789abcdef.png"
	expired := "fedcba9876543210fedcba9876543210.mp4"
	staleTemp := ".upload-123"
	unrelated := "notes.txt"
	for _, name := range []string{fresh, expired, staleTemp, unrelated} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644))
	}
	old := now.Add(-videoAssetRetention - time.Hour)
	require.NoError(t, os.Chtimes(filepath.Join(dir, expired), old, old))
	require.NoError(t, os.Chtimes(filepath.Join(dir, staleTemp), old, old))
	require.NoError(t, os.Chtimes(filepath.Join(dir, unrelated), old, old))

	assert.Equal(t, http.StatusNotFound, serveVideoAsset(expired).Code, "expired files are not served before cleanup")

	removeExpiredVideoAssets(dir, now)

	assert.FileExists(t, filepath.Join(dir, fresh))
	assert.NoFileExists(t, filepath.Join(dir, expired))
	assert.NoFileExists(t, filepath.Join(dir, staleTemp))
	assert.FileExists(t, filepath.Join(dir, unrelated), "files that are not uploads are left alone")
	assert.Equal(t, http.StatusNotFound, serveVideoAsset("../"+fresh).Code)
}

func TestPreparePlaygroundRewritesToNativeEndpointWithoutTokenQuota(t *testing.T) {
	cases := []struct {
		name       string
		route      string
		prepare    gin.HandlerFunc
		nativePath string
	}{
		{"video", "/pg/videos", PreparePlaygroundVideo, PlaygroundVideoPath},
		{"image", "/pg/images/generations", PreparePlaygroundImage, PlaygroundImagePath},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, userID := setupVideoAssetTest(t, 1000)
			var seenPath string
			var seenTokenID int
			var playground bool

			recorder := httptest.NewRecorder()
			context, engine := gin.CreateTestContext(recorder)
			engine.POST(tc.route, func(c *gin.Context) {
				c.Set("id", userID)
				tc.prepare(c)
			}, func(c *gin.Context) {
				seenPath = c.Request.URL.Path
				seenTokenID = c.GetInt("token_id")
				playground = common.GetContextKeyBool(c, constant.ContextKeyPlayground)
				c.Status(http.StatusNoContent)
			})
			context.Request = httptest.NewRequest(http.MethodPost, tc.route, strings.NewReader(`{"model":"seedream-5.0"}`))
			engine.HandleContext(context)

			assert.Equal(t, http.StatusNoContent, recorder.Code)
			assert.Equal(t, tc.nativePath, seenPath)
			assert.Zero(t, seenTokenID, "the temporary token has no quota of its own")
			assert.True(t, playground)
		})
	}
}

func TestPreparePlaygroundVideoRejectsAccessTokens(t *testing.T) {
	_, userID := setupVideoAssetTest(t, 1000)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/pg/videos", nil)
	context.Set("id", userID)
	context.Set("use_access_token", true)

	PreparePlaygroundVideo(context)

	assert.True(t, context.IsAborted())
	assert.Equal(t, "/pg/videos", context.Request.URL.Path)
}
