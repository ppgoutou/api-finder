package service

import (
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// maxConsoleTaskRequestSize bounds what is kept of one request: a prompt of
// the longest accepted length and a handful of file addresses fit well within.
const maxConsoleTaskRequestSize = 64 << 10

// consoleTaskRequest lists the fields of a creation page request that are kept
// with its task. Anything else in the body is dropped.
type consoleTaskRequest struct {
	Model         string   `json:"model"`
	Prompt        string   `json:"prompt"`
	Seconds       *int     `json:"seconds,omitempty"`
	Resolution    string   `json:"resolution,omitempty"`
	Ratio         string   `json:"ratio,omitempty"`
	Size          string   `json:"size,omitempty"`
	AspectRatio   string   `json:"aspect_ratio,omitempty"`
	Image         []string `json:"image,omitempty"`
	Images        []string `json:"images,omitempty"`
	Videos        []string `json:"videos,omitempty"`
	Audios        []string `json:"audios,omitempty"`
	FirstImageURL string   `json:"first_image_url,omitempty"`
	LastImageURL  string   `json:"last_image_url,omitempty"`
}

// ConsoleTaskRequest reads the prompt and the kept fields, as JSON, of a
// creation page request. Both are empty for a body in another form, so a
// request the page would not send is never kept.
func ConsoleTaskRequest(c *gin.Context) (prompt string, request string) {
	var body consoleTaskRequest
	if err := common.UnmarshalBodyReusable(c, &body); err != nil || strings.TrimSpace(body.Prompt) == "" {
		return "", ""
	}
	// Files are kept as addresses only; an inline file would put the user's
	// media itself into the task row.
	for _, addresses := range [][]string{body.Image, body.Images, body.Videos, body.Audios, {body.FirstImageURL, body.LastImageURL}} {
		for _, address := range addresses {
			if address == "" {
				continue
			}
			parsed, err := url.Parse(address)
			if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") {
				return "", ""
			}
		}
	}
	encoded, err := common.Marshal(body)
	if err != nil || len(encoded) > maxConsoleTaskRequestSize {
		return "", ""
	}
	return body.Prompt, string(encoded)
}
