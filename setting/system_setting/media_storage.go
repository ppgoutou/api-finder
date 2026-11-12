package system_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// MediaStorageTarget is one S3-compatible bucket that holds copies of
// generated videos, plus the public base URL (CDN or custom domain) that
// serves its objects.
type MediaStorageTarget struct {
	Endpoint     string
	Region       string
	Bucket       string
	AccessKeyID  string
	AccessSecret string
	// VirtualHost addresses objects as bucket.endpoint-host/key instead of
	// endpoint/bucket/key. Tencent COS needs it; Cloudflare R2 accepts both.
	VirtualHost bool
	PublicURL   string
}

// MediaStorageSettings copies finished videos into this site's own object
// storage so they outlive upstream links and reach viewers from a CDN close to
// them. Viewers whose country is in MainlandCountries get the mainland copy;
// everyone else gets the overseas copy.
//
// Fields are flat so that the option API hides the *_secret values.
type MediaStorageSettings struct {
	Enabled bool `json:"enabled"`

	OverseasEndpoint     string `json:"overseas_endpoint"`
	OverseasRegion       string `json:"overseas_region"`
	OverseasBucket       string `json:"overseas_bucket"`
	OverseasAccessKeyID  string `json:"overseas_access_key_id"`
	OverseasAccessSecret string `json:"overseas_access_secret"`
	OverseasVirtualHost  bool   `json:"overseas_virtual_host"`
	OverseasPublicURL    string `json:"overseas_public_url"`

	MainlandEnabled      bool   `json:"mainland_enabled"`
	MainlandEndpoint     string `json:"mainland_endpoint"`
	MainlandRegion       string `json:"mainland_region"`
	MainlandBucket       string `json:"mainland_bucket"`
	MainlandAccessKeyID  string `json:"mainland_access_key_id"`
	MainlandAccessSecret string `json:"mainland_access_secret"`
	MainlandVirtualHost  bool   `json:"mainland_virtual_host"`
	MainlandPublicURL    string `json:"mainland_public_url"`
	MainlandCountries    string `json:"mainland_countries"`

	ObjectPrefix string `json:"object_prefix"`
	// RetentionDays stops serving a stored copy that is older than this many
	// days, to match the bucket's lifecycle rule. 0 keeps copies forever.
	RetentionDays int `json:"retention_days"`
}

const (
	MediaStorageTargetOverseas = "overseas"
	MediaStorageTargetMainland = "mainland"
)

var defaultMediaStorageSettings = MediaStorageSettings{
	OverseasRegion:    "auto",
	MainlandCountries: "CN",
	ObjectPrefix:      "videos",
}

func init() {
	config.GlobalConfig.Register("media_storage", &defaultMediaStorageSettings)
}

func GetMediaStorageSettings() *MediaStorageSettings {
	return &defaultMediaStorageSettings
}

// Target returns the bucket settings for MediaStorageTargetOverseas or
// MediaStorageTargetMainland.
func (s *MediaStorageSettings) Target(name string) MediaStorageTarget {
	if name == MediaStorageTargetMainland {
		return MediaStorageTarget{
			Endpoint: s.MainlandEndpoint, Region: s.MainlandRegion, Bucket: s.MainlandBucket,
			AccessKeyID: s.MainlandAccessKeyID, AccessSecret: s.MainlandAccessSecret,
			VirtualHost: s.MainlandVirtualHost, PublicURL: s.MainlandPublicURL,
		}
	}
	return MediaStorageTarget{
		Endpoint: s.OverseasEndpoint, Region: s.OverseasRegion, Bucket: s.OverseasBucket,
		AccessKeyID: s.OverseasAccessKeyID, AccessSecret: s.OverseasAccessSecret,
		VirtualHost: s.OverseasVirtualHost, PublicURL: s.OverseasPublicURL,
	}
}

// UploadTargets lists the targets new videos are copied to.
func (s *MediaStorageSettings) UploadTargets() []string {
	if !s.Enabled {
		return nil
	}
	var targets []string
	if s.Target(MediaStorageTargetOverseas).Configured() {
		targets = append(targets, MediaStorageTargetOverseas)
	}
	if s.MainlandEnabled && s.Target(MediaStorageTargetMainland).Configured() {
		targets = append(targets, MediaStorageTargetMainland)
	}
	return targets
}

// Configured reports whether the target has everything needed to upload.
func (t MediaStorageTarget) Configured() bool {
	return strings.TrimSpace(t.Endpoint) != "" && strings.TrimSpace(t.Bucket) != "" &&
		strings.TrimSpace(t.AccessKeyID) != "" && strings.TrimSpace(t.AccessSecret) != "" &&
		strings.TrimSpace(t.PublicURL) != ""
}

// IsMainlandCountry reports whether a two-letter country code should be served
// from the mainland copy.
func (s *MediaStorageSettings) IsMainlandCountry(country string) bool {
	country = strings.ToUpper(strings.TrimSpace(country))
	if country == "" {
		return false
	}
	for code := range strings.SplitSeq(s.MainlandCountries, ",") {
		if strings.ToUpper(strings.TrimSpace(code)) == country {
			return true
		}
	}
	return false
}
