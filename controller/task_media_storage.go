package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaychannel "github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// The media copy job runs on the master node. Every minute it looks at tasks
// that succeeded in the last two days and copies each one's video, or the image
// of a web console request whose reply did not record its own copy, into the
// configured media storage, before upstream links expire. Reads of a copied
// artifact then redirect to the storage CDN instead of streaming through here.
const (
	taskMediaCopyInterval    = time.Minute
	taskMediaCopyWindow      = 48 * time.Hour
	taskMediaCopyBatch       = 200
	taskMediaCopyMaxAttempts = 5
	taskMediaCopyTimeout     = 20 * time.Minute
	taskMediaCopyMaxBytes    = 2 << 30
	// consoleImageCopyDelay leaves the reply to a web console request time to
	// store the image before the job copies it.
	consoleImageCopyDelay = playgroundImageStoreTimeout + time.Minute
	// upstreamVideoLinkLifetime is how long suppliers keep a finished video
	// at its upstream link; Ark (Seedance) links last 24 hours.
	upstreamVideoLinkLifetime = 24 * time.Hour
)

// taskMediaRetention is when the task's owner is told its media stops being
// available: MediaRetentionExpiry after it was copied into media storage, or
// when the upstream link expires if no copy will be made (storage off,
// copying gave up, or the copy window passed). It is 0 for unfinished tasks
// and while a copy is still in progress.
func taskMediaRetention(task *model.Task, storeEnabled bool) int64 {
	if task.Status != model.TaskStatusSuccess || !task.ResultRetrievable() || task.FinishTime == 0 {
		return 0
	}
	stored := task.PrivateData.StoredMedia
	if stored != nil && stored.StoredAt > 0 {
		return service.MediaRetentionExpiry(stored.StoredAt)
	}
	copyWindowPassed := time.Now().Unix() > task.FinishTime+int64(taskMediaCopyWindow/time.Second)
	if !storeEnabled || copyWindowPassed || (stored != nil && stored.GaveUp) {
		return task.FinishTime + int64(upstreamVideoLinkLifetime/time.Second)
	}
	return 0
}

// StartTaskMediaCopy runs the media copy job forever on the master node.
func StartTaskMediaCopy() {
	if !common.IsMasterNode {
		return
	}
	// Tasks that have no media to copy, so later rounds skip them without
	// loading them again. Entries leave once they fall out of the window.
	noMedia := make(map[int64]int64)
	for {
		time.Sleep(taskMediaCopyInterval)
		store := service.GetTaskArtifactStore()
		if !store.Enabled() {
			continue
		}
		now := time.Now().Unix()
		since := now - int64(taskMediaCopyWindow/time.Second)
		for id, finishedAt := range noMedia {
			if finishedAt < since {
				delete(noMedia, id)
			}
		}
		for _, candidate := range model.GetSucceededTasksFinishedSince(since, taskMediaCopyBatch) {
			if _, skip := noMedia[candidate.ID]; skip || !taskMediaCopyDue(candidate.PrivateData.StoredMedia, now) {
				continue
			}
			// The reply to a web console request stores its own image first.
			if candidate.IsConsoleImage() && now < candidate.FinishTime+int64(consoleImageCopyDelay/time.Second) {
				continue
			}
			task, err := model.GetTaskByID(candidate.ID)
			if err != nil {
				continue
			}
			if !copyTaskMedia(store, task) {
				noMedia[task.ID] = task.FinishTime
			}
		}
	}
}

// taskMediaCopyDue reports whether a task's media still needs copying, waiting
// longer after each failed attempt.
func taskMediaCopyDue(stored *model.TaskStoredMedia, now int64) bool {
	if stored == nil {
		return true
	}
	if stored.StoredAt > 0 || stored.GaveUp {
		return false
	}
	backoff := int64(stored.Attempts*stored.Attempts) * int64(taskMediaCopyInterval/time.Second)
	return stored.LastTryAt+backoff <= now
}

// copyTaskMedia copies one task's video or image and records the outcome on the
// task. It returns false when the task has nothing to copy.
func copyTaskMedia(store service.TaskArtifactStore, task *model.Task) bool {
	if task.Status != model.TaskStatusSuccess || !task.ResultRetrievable() {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), taskMediaCopyTimeout)
	defer cancel()

	artifact, descriptor := taskMediaContentRequest(ctx, task)
	if descriptor == nil {
		return false
	}
	stored := task.PrivateData.StoredMedia
	if stored == nil {
		stored = &model.TaskStoredMedia{}
	}
	stored.ArtifactKey = artifact.Key
	stored.Attempts++
	stored.LastTryAt = time.Now().Unix()

	gone, copyErr := downloadAndPersistTaskMedia(ctx, store, task, artifact, descriptor, stored)
	if copyErr != nil {
		stored.GaveUp = gone || stored.Attempts >= taskMediaCopyMaxAttempts
		common.SysError(common.LogText("media copy for task %s failed (attempt %d): %s", task.TaskID, stored.Attempts, copyErr.Error()))
	}
	task.PrivateData.StoredMedia = stored
	if err := task.UpdateStoredMedia(); err != nil {
		common.SysError(common.LogText("media copy for task %s could not be saved: %s", task.TaskID, err.Error()))
	}
	return true
}

// taskMediaContentRequest finds the task's video, or the first image of a web
// console request, and the upstream request that fetches it. It returns a nil
// request when the task has neither. Images of API clients are not copied here.
func taskMediaContentRequest(ctx context.Context, task *model.Task) (types.TaskArtifact, *relaychannel.TaskContentRequest) {
	if !taskHasPluginExecution(task) {
		if !legacyVideoAvailable(task) {
			return types.TaskArtifact{}, nil
		}
		return types.TaskArtifact{Key: "video", Type: "video"}, &relaychannel.TaskContentRequest{
			URL: task.GetResultURL(), Method: http.MethodGet, Credentialless: true,
		}
	}
	artifacts, err := projectTaskArtifacts(task)
	if err != nil {
		return types.TaskArtifact{}, nil
	}
	for _, artifact := range artifacts {
		if artifact.Type != "video" && (artifact.Type != "image" || !task.IsConsoleImage()) {
			continue
		}
		adaptor, err := initTaskArtifactAdaptor(task)
		if err != nil {
			return types.TaskArtifact{}, nil
		}
		provider, ok := adaptor.(relaychannel.TaskContentRequestProvider)
		if !ok {
			return types.TaskArtifact{}, nil
		}
		descriptor, err := provider.BuildContentRequest(ctx, task, artifact.Key, relaychannel.TaskArtifactClientRequest{
			Method: http.MethodGet, Headers: map[string]string{},
		})
		if err != nil || descriptor == nil {
			return types.TaskArtifact{}, nil
		}
		return types.TaskArtifact{Key: artifact.Key, Type: artifact.Type}, descriptor
	}
	return types.TaskArtifact{}, nil
}

// downloadAndPersistTaskMedia fetches the artifact through the same proxy path
// viewers use, into a temporary file, and uploads it. gone reports a failure
// that retrying cannot fix.
func downloadAndPersistTaskMedia(ctx context.Context, store service.TaskArtifactStore, task *model.Task, artifact types.TaskArtifact, descriptor *relaychannel.TaskContentRequest, stored *model.TaskStoredMedia) (gone bool, err error) {
	file, err := os.CreateTemp("", "task-media-*")
	if err != nil {
		return false, err
	}
	defer func() {
		file.Close()
		os.Remove(file.Name())
	}()

	limit := int64(taskMediaCopyMaxBytes)
	if artifact.Type == "image" {
		limit = playgroundImageMaxBytes
	}
	writer := &taskMediaFileWriter{file: file, header: http.Header{}, limit: limit}
	c, _ := gin.CreateTestContext(writer)
	c.Request, err = http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost/internal/task-media-copy", nil)
	if err != nil {
		return false, err
	}
	downloadStart := time.Now()
	if proxyErr := proxyTaskMedia(c, task, descriptor); proxyErr != nil {
		var mediaErr *taskMediaProxyError
		if errors.As(proxyErr, &mediaErr) {
			return mediaErr.status == http.StatusGone || mediaErr.code == "artifact_request_rejected", proxyErr
		}
		return false, proxyErr
	}
	if writer.overflow {
		return true, fmt.Errorf("%s is larger than the copy limit", artifact.Type)
	}
	if writer.writeErr != nil {
		return false, writer.writeErr
	}
	if writer.status != http.StatusOK || writer.written == 0 {
		return false, fmt.Errorf("upstream returned no %s content", artifact.Type)
	}

	mimeType := writer.header.Get("Content-Type")
	if service.TaskArtifactExtension(artifact.Type, mimeType) == "" {
		mimeType = http.DetectContentType(writer.head)
	}
	if service.TaskArtifactExtension(artifact.Type, mimeType) == "" {
		return true, fmt.Errorf("upstream content is not a supported %s", artifact.Type)
	}
	downloadTime := time.Since(downloadStart)
	stored.DownloadMs = downloadTime.Milliseconds()
	common.SysLog(common.LogText("media copy for task %s downloaded %d bytes from upstream in %s",
		task.TaskID, writer.written, downloadTime.Round(time.Millisecond)))
	ref, err := store.Persist(ctx, task, types.TaskArtifact{Key: artifact.Key, Type: artifact.Type, MimeType: mimeType}, file)
	if err != nil {
		return false, err
	}
	stored.ObjectKey = ref.ObjectKey
	stored.MimeType = ref.MimeType
	stored.Size = ref.Size
	stored.Targets = ref.Targets
	stored.UploadMs = ref.UploadMs
	stored.StoredAt = time.Now().Unix()
	stored.GaveUp = false
	return false, nil
}

// serveStoredTaskArtifact redirects to the task's stored copy of an artifact and
// reports whether it did.
func serveStoredTaskArtifact(c *gin.Context, task *model.Task, artifactKey string) bool {
	store := service.GetTaskArtifactStore()
	ref, err := store.Resolve(task, artifactKey)
	if err != nil || ref == nil {
		return false
	}
	return store.Serve(c, task, ref) == nil
}

// taskMediaFileWriter is the response writer the copy job hands to the media
// proxy: it saves the body to a file and keeps the first bytes for sniffing.
type taskMediaFileWriter struct {
	file     *os.File
	header   http.Header
	status   int
	written  int64
	limit    int64
	head     []byte
	overflow bool
	writeErr error
}

func (w *taskMediaFileWriter) Header() http.Header {
	return w.header
}

func (w *taskMediaFileWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
}

func (w *taskMediaFileWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	if w.written+int64(len(data)) > w.limit {
		w.overflow = true
		return 0, errors.New("task media copy limit exceeded")
	}
	if len(w.head) < 512 {
		w.head = append(w.head, data[:min(len(data), 512-len(w.head))]...)
	}
	n, err := w.file.Write(data)
	w.written += int64(n)
	if err != nil {
		w.writeErr = err
	}
	return n, err
}
