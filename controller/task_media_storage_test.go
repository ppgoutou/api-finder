package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
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

func requestStoredArtifact(t *testing.T, task *model.Task, country string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Set(middleware.TaskArtifactAccessContextKey, true)
	c.Params = gin.Params{{Key: "key", Value: task.TaskID}, {Key: "artifact_key", Value: "video"}}
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/tasks/"+task.TaskID+"/artifacts/video/content", nil)
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

	recorder := requestStoredArtifact(t, saved, "CN")
	assert.Equal(t, http.StatusFound, recorder.Code)
	assert.Equal(t, "https://cn-media.example.com/"+stored.ObjectKey, recorder.Header().Get("Location"))

	recorder = requestStoredArtifact(t, saved, "US")
	assert.Equal(t, http.StatusFound, recorder.Code)
	assert.Equal(t, "https://media.example.com/"+stored.ObjectKey, recorder.Header().Get("Location"))

	// Past the retention period the stored copy is no longer served.
	system_setting.GetMediaStorageSettings().RetentionDays = 1
	saved.PrivateData.StoredMedia.StoredAt = time.Now().Add(-48 * time.Hour).Unix()
	require.NoError(t, saved.UpdateStoredMedia())
	recorder = requestStoredArtifact(t, saved, "US")
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

	recorder := requestStoredArtifact(t, saved, "CN")
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

func TestTaskMediaCopyRetriesWithGrowingBackoff(t *testing.T) {
	now := time.Now().Unix()
	assert.True(t, taskMediaCopyDue(nil, now))
	assert.False(t, taskMediaCopyDue(&model.TaskStoredMedia{Attempts: 2, LastTryAt: now - 200}, now))
	assert.True(t, taskMediaCopyDue(&model.TaskStoredMedia{Attempts: 2, LastTryAt: now - 240}, now))
}
