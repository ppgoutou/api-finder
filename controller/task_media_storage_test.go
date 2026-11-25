package controller

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeMediaBucket struct {
	mu      sync.Mutex
	objects map[string]string
	types   map[string]string
}

func newFakeMediaBucket(t *testing.T) (*fakeMediaBucket, *httptest.Server) {
	t.Helper()
	bucket := &fakeMediaBucket{objects: map[string]string{}, types: map[string]string{}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut || !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 Credential=ak/") {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		body, _ := io.ReadAll(r.Body)
		bucket.mu.Lock()
		bucket.objects[r.URL.Path] = string(body)
		bucket.types[r.URL.Path] = r.Header.Get("Content-Type")
		bucket.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)
	return bucket, server
}

func configureMediaStorageTest(t *testing.T, overseasEndpoint, mainlandEndpoint string) {
	t.Helper()
	settings := system_setting.GetMediaStorageSettings()
	original := *settings
	t.Cleanup(func() { *settings = original })
	*settings = system_setting.MediaStorageSettings{
		Enabled:          true,
		OverseasEndpoint: overseasEndpoint, OverseasRegion: "auto", OverseasBucket: "global-media",
		OverseasAccessKeyID: "ak", OverseasAccessSecret: "sk", OverseasPublicURL: "https://media.example.com/",
		MainlandEnabled:  true,
		MainlandEndpoint: mainlandEndpoint, MainlandRegion: "ap-hongkong", MainlandBucket: "cn-media",
		MainlandAccessKeyID: "ak", MainlandAccessSecret: "sk", MainlandPublicURL: "https://cn-media.example.com",
		MainlandCountries: "CN",
		ObjectPrefix:      "videos",
	}
}

// setupConsoleImageTaskTest stores a finished image task submitted from the web
// console, whose plugin lists imageURL as its only artifact.
func setupConsoleImageTaskTest(t *testing.T, imageURL string) *model.Task {
	t.Helper()
	task := setupGenericTaskTest(t)
	previousMemoryCache := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = false
	t.Cleanup(func() { common.MemoryCacheEnabled = previousMemoryCache })
	task.Action = constant.TaskActionTextToImage
	task.Platform = constant.TaskPlatform("alibaba")
	task.PrivateData.Execution = &model.TaskExecutionSnapshot{TaskPlugin: &model.TaskPluginSnapshot{
		Key: "alibaba", Name: "Alibaba", Version: "1.0.0", APIVersion: 1,
	}}
	task.SetData(map[string]any{"output": map[string]any{"choices": []any{map[string]any{
		"message": map[string]any{"content": []any{map[string]any{"image": imageURL}}},
	}}}})
	require.NoError(t, model.DB.Save(task).Error)
	return task
}

func requestStoredArtifact(t *testing.T, task *model.Task, country, artifactKey string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Set(middleware.TaskArtifactAccessContextKey, true)
	c.Params = gin.Params{{Key: "key", Value: task.TaskID}, {Key: "artifact_key", Value: artifactKey}}
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/tasks/"+task.TaskID+"/artifacts/"+artifactKey+"/content", nil)
	if country != "" {
		c.Request.Header.Set("CF-IPCountry", country)
	}
	TaskArtifactContent(c)
	return recorder
}

func TestTaskMediaCopyStoresVideoAndRedirectsByCountry(t *testing.T) {
	task := setupGenericTaskTest(t)
	video := "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom-video-bytes"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write([]byte(video))
	}))
	defer upstream.Close()
	allowPrivateTaskMediaTest(t)
	overseas, overseasServer := newFakeMediaBucket(t)
	mainland, mainlandServer := newFakeMediaBucket(t)
	configureMediaStorageTest(t, overseasServer.URL, mainlandServer.URL)

	task.Action = constant.TaskActionTextToVideo
	task.PrivateData.ResultURL = upstream.URL + "/result.mp4"
	require.NoError(t, model.DB.Save(task).Error)

	candidates := model.GetSucceededTasksFinishedSince(task.FinishTime, 10)
	require.Len(t, candidates, 1)
	assert.Equal(t, task.ID, candidates[0].ID)
	assert.Nil(t, candidates[0].PrivateData.StoredMedia)
	assert.Empty(t, model.GetSucceededTasksFinishedSince(task.FinishTime+1, 10))

	require.True(t, copyTaskMedia(service.GetTaskArtifactStore(), task))

	candidates = model.GetSucceededTasksFinishedSince(task.FinishTime, 10)
	require.Len(t, candidates, 1)
	require.NotNil(t, candidates[0].PrivateData.StoredMedia)

	saved, err := model.GetTaskByID(task.ID)
	require.NoError(t, err)
	stored := saved.PrivateData.StoredMedia
	require.NotNil(t, stored)
	assert.Equal(t, []string{"overseas", "mainland"}, stored.Targets)
	assert.Equal(t, "video", stored.ArtifactKey)
	assert.Equal(t, "video/mp4", stored.MimeType)
	assert.Equal(t, int64(len(video)), stored.Size)
	assert.Regexp(t, `^videos/\d{4}/\d{2}/[0-9a-f]{32}\.mp4$`, stored.ObjectKey)
	assert.Equal(t, upstream.URL+"/result.mp4", saved.PrivateData.ResultURL)
	assert.Equal(t, model.TaskStatus(model.TaskStatusSuccess), saved.Status)
	assert.Equal(t, video, overseas.objects["/global-media/"+stored.ObjectKey])
	assert.Equal(t, "video/mp4", overseas.types["/global-media/"+stored.ObjectKey])
	assert.Equal(t, video, mainland.objects["/cn-media/"+stored.ObjectKey])
	assert.False(t, taskMediaCopyDue(stored, time.Now().Unix()+3600))
	assert.Contains(t, stored.UploadMs, "overseas")
	assert.Contains(t, stored.UploadMs, "mainland")

	// Copy timings reach administrators only.
	adminView := tasksToDto([]*model.Task{saved}, false, common.RoleAdminUser)[0]
	require.NotNil(t, adminView.AdminInfo)
	require.NotNil(t, adminView.AdminInfo.MediaCopy)
	assert.True(t, adminView.AdminInfo.MediaCopy.Stored)
	assert.Equal(t, int64(len(video)), adminView.AdminInfo.MediaCopy.Size)
	assert.Equal(t, stored.UploadMs, adminView.AdminInfo.MediaCopy.UploadMs)
	assert.Nil(t, tasksToDto([]*model.Task{saved}, false, common.RoleCommonUser)[0].AdminInfo)

	recorder := requestStoredArtifact(t, saved, "CN", "video")
	assert.Equal(t, http.StatusFound, recorder.Code)
	assert.Equal(t, "https://cn-media.example.com/"+stored.ObjectKey, recorder.Header().Get("Location"))

	recorder = requestStoredArtifact(t, saved, "US", "video")
	assert.Equal(t, http.StatusFound, recorder.Code)
	assert.Equal(t, "https://media.example.com/"+stored.ObjectKey, recorder.Header().Get("Location"))

	// Past the retention period the stored copy is no longer served.
	system_setting.GetMediaStorageSettings().RetentionDays = 1
	saved.PrivateData.StoredMedia.StoredAt = time.Now().Add(-48 * time.Hour).Unix()
	require.NoError(t, saved.UpdateStoredMedia())
	recorder = requestStoredArtifact(t, saved, "US", "video")
	assert.NotEqual(t, http.StatusFound, recorder.Code)
}

func TestTaskMediaCopyServesOverseasWhenMainlandUploadFails(t *testing.T) {
	task := setupGenericTaskTest(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("video-bytes"))
	}))
	defer upstream.Close()
	allowPrivateTaskMediaTest(t)
	_, overseasServer := newFakeMediaBucket(t)
	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer failing.Close()
	configureMediaStorageTest(t, overseasServer.URL, failing.URL)

	task.Action = constant.TaskActionTextToVideo
	task.PrivateData.ResultURL = upstream.URL
	require.NoError(t, model.DB.Save(task).Error)

	require.True(t, copyTaskMedia(service.GetTaskArtifactStore(), task))
	saved, err := model.GetTaskByID(task.ID)
	require.NoError(t, err)
	require.NotNil(t, saved.PrivateData.StoredMedia)
	assert.Equal(t, []string{"overseas"}, saved.PrivateData.StoredMedia.Targets)

	recorder := requestStoredArtifact(t, saved, "CN", "video")
	assert.Equal(t, http.StatusFound, recorder.Code)
	assert.True(t, strings.HasPrefix(recorder.Header().Get("Location"), "https://media.example.com/videos/"))
}

func TestTaskMediaCopyGivesUpOnGoneOrNonVideoContent(t *testing.T) {
	cases := []struct {
		name    string
		handler http.HandlerFunc
	}{
		{"gone", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNotFound) }},
		{"not video", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<html>expired</html>"))
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := setupGenericTaskTest(t)
			upstream := httptest.NewServer(tc.handler)
			defer upstream.Close()
			allowPrivateTaskMediaTest(t)
			_, bucketServer := newFakeMediaBucket(t)
			configureMediaStorageTest(t, bucketServer.URL, bucketServer.URL)

			task.Action = constant.TaskActionTextToVideo
			task.PrivateData.ResultURL = upstream.URL
			require.NoError(t, model.DB.Save(task).Error)

			require.True(t, copyTaskMedia(service.GetTaskArtifactStore(), task))
			saved, err := model.GetTaskByID(task.ID)
			require.NoError(t, err)
			stored := saved.PrivateData.StoredMedia
			require.NotNil(t, stored)
			assert.True(t, stored.GaveUp)
			assert.Zero(t, stored.StoredAt)
			assert.Equal(t, 1, stored.Attempts)
			assert.False(t, taskMediaCopyDue(stored, time.Now().Unix()+3600))
		})
	}
}

func TestTaskMediaCopySkipsTasksWithoutVideo(t *testing.T) {
	task := setupGenericTaskTest(t)
	_, bucketServer := newFakeMediaBucket(t)
	configureMediaStorageTest(t, bucketServer.URL, bucketServer.URL)

	assert.False(t, copyTaskMedia(service.GetTaskArtifactStore(), task))
	saved, err := model.GetTaskByID(task.ID)
	require.NoError(t, err)
	assert.Nil(t, saved.PrivateData.StoredMedia)
}

func TestTaskMediaCopyStoresConsoleImagesOnly(t *testing.T) {
	pngBytes := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(pngBytes)
	}))
	defer upstream.Close()
	allowPrivateTaskMediaTest(t)
	overseas, overseasServer := newFakeMediaBucket(t)
	_, mainlandServer := newFakeMediaBucket(t)
	configureMediaStorageTest(t, overseasServer.URL, mainlandServer.URL)

	task := setupConsoleImageTaskTest(t, upstream.URL+"/a.png")
	assert.True(t, tasksToDto([]*model.Task{task}, false, common.RoleCommonUser)[0].ConsoleImage)
	require.True(t, copyTaskMedia(service.GetTaskArtifactStore(), task))
	saved, err := model.GetTaskByID(task.ID)
	require.NoError(t, err)
	stored := saved.PrivateData.StoredMedia
	require.NotNil(t, stored)
	assert.Equal(t, "image-1", stored.ArtifactKey)
	assert.Equal(t, "image/png", stored.MimeType)
	assert.Regexp(t, `^images/\d{4}/\d{2}/[0-9a-f]{32}\.png$`, stored.ObjectKey)
	assert.Equal(t, string(pngBytes), overseas.objects["/global-media/"+stored.ObjectKey])
	assert.Equal(t, http.StatusFound, requestStoredArtifact(t, saved, "US", "image-1").Code)

	// An API client's image stays at its upstream link.
	task.PrivateData.TokenId = 5
	task.PrivateData.StoredMedia = nil
	require.NoError(t, model.DB.Save(task).Error)
	assert.False(t, tasksToDto([]*model.Task{task}, false, common.RoleCommonUser)[0].ConsoleImage)
	assert.False(t, copyTaskMedia(service.GetTaskArtifactStore(), task))
}

func encodeTestPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, width, height))))
	return encoded.Bytes()
}

func requireThumbnail(t *testing.T, content string, width, height int) {
	t.Helper()
	config, format, err := image.DecodeConfig(strings.NewReader(content))
	require.NoError(t, err)
	assert.Equal(t, "jpeg", format)
	assert.Equal(t, []int{width, height}, []int{config.Width, config.Height})
}

// getOwnTask returns the task as its owner's task list carries it.
func getOwnTask(t *testing.T, task *model.Task, country string) dto.TaskDto {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Set("id", task.UserId)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/task/self?p=1&page_size=10&task_id="+task.TaskID, nil)
	c.Request.Header.Set("CF-IPCountry", country)
	GetUserTask(c)
	var response struct {
		Data struct {
			Items []dto.TaskDto `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data.Items, 1)
	return response.Data.Items[0]
}

func TestTaskMediaCopyGivesConsoleImagesAThumbnailAndDirectLinks(t *testing.T) {
	content := encodeTestPNG(t, 2048, 1024)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(content)
	}))
	defer upstream.Close()
	allowPrivateTaskMediaTest(t)
	overseas, overseasServer := newFakeMediaBucket(t)
	mainland, mainlandServer := newFakeMediaBucket(t)
	configureMediaStorageTest(t, overseasServer.URL, mainlandServer.URL)
	store := service.GetTaskArtifactStore()
	task := setupConsoleImageTaskTest(t, upstream.URL+"/a.png")

	require.True(t, copyTaskMedia(store, task))
	saved, err := model.GetTaskByID(task.ID)
	require.NoError(t, err)
	stored := saved.PrivateData.StoredMedia
	require.NotNil(t, stored)
	assert.Equal(t, strings.TrimSuffix(stored.ObjectKey, ".png")+"_thumb.jpg", stored.ThumbnailKey)
	requireThumbnail(t, overseas.objects["/global-media/"+stored.ThumbnailKey], 512, 256)
	requireThumbnail(t, mainland.objects["/cn-media/"+stored.ThumbnailKey], 512, 256)
	assert.False(t, consoleImageIncomplete(saved))

	item := getOwnTask(t, saved, "CN")
	assert.Equal(t, "https://cn-media.example.com/"+stored.ObjectKey, item.ImageURL)
	assert.Equal(t, "https://cn-media.example.com/"+stored.ThumbnailKey, item.ThumbnailURL)
	assert.Equal(t, "https://media.example.com/"+stored.ThumbnailKey, getOwnTask(t, saved, "US").ThumbnailURL)

	// An image stored before thumbnails existed gets one from its stored copy.
	system_setting.GetMediaStorageSettings().OverseasPublicURL = upstream.URL
	stored.ThumbnailKey, stored.SoleImage = "", false
	require.NoError(t, saved.UpdateStoredMedia())
	assert.Empty(t, getOwnTask(t, saved, "US").ImageURL)
	require.True(t, consoleImageIncomplete(saved))
	require.True(t, completeConsoleImage(store, saved))
	saved, err = model.GetTaskByID(task.ID)
	require.NoError(t, err)
	assert.False(t, consoleImageIncomplete(saved))
	assert.NotEmpty(t, getOwnTask(t, saved, "US").ThumbnailURL)

	// Past the storage retention period the links are no longer given out.
	system_setting.GetMediaStorageSettings().RetentionDays = 1
	saved.PrivateData.StoredMedia.StoredAt = time.Now().Add(-48 * time.Hour).Unix()
	require.NoError(t, saved.UpdateStoredMedia())
	assert.Empty(t, getOwnTask(t, saved, "US").ImageURL)
}

func TestTaskMediaCopyRetriesConsoleImageGivenUpAsVideo(t *testing.T) {
	content := encodeTestPNG(t, 64, 64)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(content)
	}))
	defer upstream.Close()
	allowPrivateTaskMediaTest(t)
	_, bucketServer := newFakeMediaBucket(t)
	configureMediaStorageTest(t, bucketServer.URL, bucketServer.URL)
	store := service.GetTaskArtifactStore()
	task := setupConsoleImageTaskTest(t, upstream.URL+"/a.png")

	// A copy given up on for the image itself is final.
	task.PrivateData.StoredMedia = &model.TaskStoredMedia{ArtifactKey: "image-1", Attempts: 5, GaveUp: true}
	require.True(t, consoleImageIncomplete(task))
	assert.False(t, completeConsoleImage(store, task))

	task.PrivateData.StoredMedia.ArtifactKey = "video"
	require.True(t, completeConsoleImage(store, task))
	saved, err := model.GetTaskByID(task.ID)
	require.NoError(t, err)
	require.NotNil(t, saved.PrivateData.StoredMedia)
	assert.Equal(t, "image-1", saved.PrivateData.StoredMedia.ArtifactKey)
	assert.InDelta(t, time.Now().Unix()+7*86400, taskMediaRetention(saved, true), 5)
}

func TestTaskMediaCopyRetriesWithGrowingBackoff(t *testing.T) {
	now := time.Now().Unix()
	assert.True(t, taskMediaCopyDue(nil, now))
	assert.False(t, taskMediaCopyDue(&model.TaskStoredMedia{Attempts: 2, LastTryAt: now - 200}, now))
	assert.True(t, taskMediaCopyDue(&model.TaskStoredMedia{Attempts: 2, LastTryAt: now - 240}, now))
}

func TestTaskMediaRetentionTellsOwnerHowLongTheMediaLasts(t *testing.T) {
	settings := system_setting.GetMediaStorageSettings()
	previousRetention := settings.RetentionDays
	t.Cleanup(func() { settings.RetentionDays = previousRetention })

	now := time.Now().Unix()
	day := int64(86400)
	finishedAt := now - 3600
	succeeded := func(stored *model.TaskStoredMedia, finishTime int64) *model.Task {
		return &model.Task{
			Status:      model.TaskStatusSuccess,
			FinishTime:  finishTime,
			PrivateData: model.TaskPrivateData{StoredMedia: stored},
		}
	}
	cases := []struct {
		name          string
		task          *model.Task
		storeEnabled  bool
		retentionDays int
		wantExpiresAt int64
	}{
		{"stored copy shown for 15 days", succeeded(&model.TaskStoredMedia{StoredAt: finishedAt}, finishedAt), true, 0, finishedAt + 15*day},
		{"stored image shown for 7 days", succeeded(&model.TaskStoredMedia{StoredAt: finishedAt, MimeType: "image/png"}, finishedAt), true, 0, finishedAt + 7*day},
		{"shorter storage retention wins for images", succeeded(&model.TaskStoredMedia{StoredAt: finishedAt, MimeType: "image/png"}, finishedAt), true, 3, finishedAt + 3*day},
		{"shorter storage retention wins", succeeded(&model.TaskStoredMedia{StoredAt: finishedAt}, finishedAt), true, 7, finishedAt + 7*day},
		{"longer storage retention keeps 15 days", succeeded(&model.TaskStoredMedia{StoredAt: finishedAt}, finishedAt), true, 30, finishedAt + 15*day},
		{"copy pending reports nothing", succeeded(nil, finishedAt), true, 0, 0},
		{"storage off uses upstream link", succeeded(nil, finishedAt), false, 0, finishedAt + day},
		{"copy gave up uses upstream link", succeeded(&model.TaskStoredMedia{GaveUp: true}, finishedAt), true, 0, finishedAt + day},
		{"copy window passed uses upstream link", succeeded(nil, now-3*day), true, 0, now - 2*day},
		{"unfinished task reports nothing", &model.Task{Status: model.TaskStatusInProgress}, true, 0, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			settings.RetentionDays = tc.retentionDays
			assert.Equal(t, tc.wantExpiresAt, taskMediaRetention(tc.task, tc.storeEnabled))
		})
	}
}

func TestStorePlaygroundImagesReplacesLinksWithStoredCopies(t *testing.T) {
	gin.SetMode(gin.TestMode)
	allowPrivateTaskMediaTest(t)
	pngBytes := encodeTestPNG(t, 600, 1200)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(pngBytes)
	}))
	defer upstream.Close()
	overseas, overseasServer := newFakeMediaBucket(t)
	mainland, mainlandServer := newFakeMediaBucket(t)
	configureMediaStorageTest(t, overseasServer.URL, mainlandServer.URL)

	// The task of an image drawn by a task plugin; nil for other models.
	var drawnBy *model.Task
	serve := func(status int, body any) *httptest.ResponseRecorder {
		engine := gin.New()
		engine.POST("/pg/images/generations", StorePlaygroundImages, func(c *gin.Context) {
			common.SetContextKey(c, constant.ContextKeyPlaygroundImageTask, drawnBy)
			c.JSON(status, body)
		})
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil))
		return recorder
	}

	recorder := serve(http.StatusOK, gin.H{
		"created": 1790000000,
		"data": []gin.H{
			{"url": upstream.URL + "/a.png"},
			{"b64_json": base64.StdEncoding.EncodeToString(pngBytes)},
		},
	})
	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Created int64 `json:"created"`
		Data    []struct {
			URL            string `json:"url"`
			ThumbnailURL   string `json:"thumbnail_url"`
			B64JSON        string `json:"b64_json"`
			MediaExpiresAt int64  `json:"media_expires_at"`
			TaskID         string `json:"task_id"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, int64(1790000000), response.Created)
	require.Len(t, response.Data, 2)
	for _, item := range response.Data {
		assert.True(t, strings.HasPrefix(item.URL, "https://cn-media.example.com/images/"), item.URL)
		assert.True(t, strings.HasSuffix(item.URL, ".png"), item.URL)
		assert.Empty(t, item.B64JSON)
		thumbnailKey := strings.TrimPrefix(item.ThumbnailURL, "https://cn-media.example.com/")
		requireThumbnail(t, mainland.objects["/cn-media/"+thumbnailKey], 256, 512)
		assert.InDelta(t, time.Now().Unix()+7*86400, item.MediaExpiresAt, 5)
	}
	assert.Len(t, mainland.objects, 4)
	assert.Empty(t, overseas.objects)

	// The copy of a task plugin's image also serves the owner's works list.
	drawnBy = setupConsoleImageTaskTest(t, upstream.URL+"/a.png")
	recorder = serve(http.StatusOK, gin.H{"data": []gin.H{{"url": upstream.URL + "/a.png", "task_id": drawnBy.TaskID}}})
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data, 1)
	assert.Equal(t, drawnBy.TaskID, response.Data[0].TaskID)
	saved, err := model.GetTaskByID(drawnBy.ID)
	require.NoError(t, err)
	require.NotNil(t, saved.PrivateData.StoredMedia)
	assert.Equal(t, "image-1", saved.PrivateData.StoredMedia.ArtifactKey)
	assert.Equal(t, response.Data[0].URL, "https://cn-media.example.com/"+saved.PrivateData.StoredMedia.ObjectKey)
	assert.False(t, taskMediaCopyDue(saved.PrivateData.StoredMedia, time.Now().Unix()))
	assert.Equal(t, response.Data[0].ThumbnailURL, getOwnTask(t, saved, "US").ThumbnailURL)
	served := requestStoredArtifact(t, saved, "US", "image-1")
	assert.Equal(t, http.StatusFound, served.Code)
	assert.Equal(t, response.Data[0].URL, served.Header().Get("Location"))
	drawnBy = nil

	// API clients of a task plugin get the stored copy next to any base64 data,
	// and keep the supplier's link when it cannot be copied.
	data := []any{
		map[string]any{"url": upstream.URL + "/b.png", "b64_json": "QUFB"},
		map[string]any{"url": "https://127.0.0.1:1/gone.png"},
	}
	storeTaskPluginImages(t.Context(), data)
	stored := data[0].(map[string]any)
	assert.True(t, strings.HasPrefix(stored["url"].(string), "https://cn-media.example.com/images/"), stored["url"])
	assert.Equal(t, "QUFB", stored["b64_json"])
	assert.Equal(t, "https://127.0.0.1:1/gone.png", data[1].(map[string]any)["url"])

	// Failed generations reach the client untouched.
	recorder = serve(http.StatusBadRequest, gin.H{"error": gin.H{"message": "bad prompt"}})
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.JSONEq(t, `{"error":{"message":"bad prompt"}}`, recorder.Body.String())
}
