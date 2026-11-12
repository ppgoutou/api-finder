package service

import (
	"context"
	"errors"
	"io"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// StoredArtifactRef describes a persisted artifact object.
type StoredArtifactRef struct {
	Backend   string
	Bucket    string
	ObjectKey string
	MimeType  string
	Size      int64
	// Targets names the media storage copies that hold the object.
	Targets []string
	// UploadMs is how long each target took to accept the object.
	UploadMs map[string]int64
}

// TaskArtifactStore is the persistence boundary for generated artifact bytes.
// types.TaskArtifact is re-exported by relay/channel as channel.TaskArtifact.
type TaskArtifactStore interface {
	Enabled() bool
	Resolve(task *model.Task, artifactKey string) (*StoredArtifactRef, error)
	Persist(ctx context.Context, task *model.Task, artifact types.TaskArtifact, content io.Reader) (*StoredArtifactRef, error)
	Serve(c *gin.Context, task *model.Task, ref *StoredArtifactRef) error
}

var ErrTaskArtifactStoreDisabled = errors.New("task artifact store is disabled")

type disabledArtifactStore struct{}

func (disabledArtifactStore) Enabled() bool {
	return false
}

func (disabledArtifactStore) Resolve(*model.Task, string) (*StoredArtifactRef, error) {
	return nil, nil
}

func (disabledArtifactStore) Persist(context.Context, *model.Task, types.TaskArtifact, io.Reader) (*StoredArtifactRef, error) {
	return nil, ErrTaskArtifactStoreDisabled
}

func (disabledArtifactStore) Serve(*gin.Context, *model.Task, *StoredArtifactRef) error {
	return ErrTaskArtifactStoreDisabled
}

// taskArtifactStore is the media storage configured in the admin settings. It
// behaves as the disabled store until a target is configured and enabled.
var taskArtifactStore TaskArtifactStore = &mediaArtifactStore{}

func init() {
	_ = system_setting.LoadTaskArtifactStoreConfig()
}

// GetTaskArtifactStore returns the process-wide artifact storage backend.
func GetTaskArtifactStore() TaskArtifactStore {
	return taskArtifactStore
}
