package controller

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// minimalMP4 starts with an ftyp box that http.DetectContentType reports as
// video/mp4, followed by a few payload bytes.
func minimalMP4() []byte {
	data := []byte{0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 'm', 'p', '4', '2', 'i', 's', 'o', 'm'}
	return append(data, []byte("payload-bytes")...)
}

type homeMediaUploadResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    struct {
		URL         string `json:"url"`
		ContentType string `json:"content_type"`
	} `json:"data"`
}

func uploadHomeMedia(t *testing.T, fileName string, content []byte) homeMediaUploadResponse {
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
	context.Request = httptest.NewRequest(http.MethodPost, "/api/home_media", body)
	context.Request.Header.Set("Content-Type", writer.FormDataContentType())
	UploadHomeMedia(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response homeMediaUploadResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func serveHomeMedia(name string, rangeHeader string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/home-media/"+name, nil)
	if rangeHeader != "" {
		context.Request.Header.Set("Range", rangeHeader)
	}
	context.Params = gin.Params{{Key: "name", Value: name}}
	ServeHomeMedia(context)
	return recorder
}

func TestUploadHomeMediaStoresVideoUnderRandomNameAndServesRanges(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME_MEDIA_DIR", dir)
	video := minimalMP4()

	response := uploadHomeMedia(t, "clip.html", video)

	require.True(t, response.Success, response.Message)
	assert.Equal(t, "video/mp4", response.Data.ContentType)
	name, ok := strings.CutPrefix(response.Data.URL, "/home-media/")
	require.True(t, ok)
	assert.Regexp(t, `^[a-f0-9]{32}\.mp4$`, name)
	stored, err := os.ReadFile(dir + "/" + name)
	require.NoError(t, err)
	assert.Equal(t, video, stored)

	served := serveHomeMedia(name, "bytes=0-3")
	assert.Equal(t, http.StatusPartialContent, served.Code)
	assert.Equal(t, video[:4], served.Body.Bytes())
	assert.Equal(t, "video/mp4", served.Header().Get("Content-Type"))
	assert.Equal(t, "nosniff", served.Header().Get("X-Content-Type-Options"))
}

func TestUploadHomeMediaRejectsContentThatIsNotVideoOrImage(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME_MEDIA_DIR", dir)

	response := uploadHomeMedia(t, "clip.mp4", []byte("<html><script>alert(1)</script></html>"))

	assert.False(t, response.Success)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Empty(t, entries)
}

func TestSniffHomeMediaType(t *testing.T) {
	ftyp := func(brands string) []byte {
		box := append([]byte{0, 0, 0, byte(8 + len(brands))}, []byte("ftyp"+brands)...)
		return append(box, []byte("\x00\x00\x00\x08moov")...)
	}
	cases := []struct {
		name string
		head []byte
		want string
	}{
		{"encoder output with isom and iso4 only", ftyp("isom\x00\x00\x00\x01isomiso4"), "video/mp4"},
		{"mp42 brand", ftyp("mp42\x00\x00\x00\x00mp42isom"), "video/mp4"},
		{"heic image", ftyp("heic\x00\x00\x00\x00mif1heic"), ""},
		{"quicktime", ftyp("qt  \x00\x00\x02\x00qt  "), ""},
		{"html", []byte("<html><body>x</body></html>"), ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := sniffHomeMediaType(tc.head)
			if tc.want != "" {
				assert.Equal(t, tc.want, got)
				return
			}
			// Whatever the standard sniffer says, these are not accepted uploads.
			_, accepted := homeMediaTypes[got]
			assert.False(t, accepted, got)
		})
	}
}

func TestServeHomeMediaOnlyServesUploadedFileNames(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME_MEDIA_DIR", dir)
	require.NoError(t, os.WriteFile(dir+"/notes.txt", []byte("secret"), 0o644))

	for _, name := range []string{"notes.txt", "../notes.txt", "0123456789abcdef0123456789abcdef.mp4"} {
		assert.Equal(t, http.StatusNotFound, serveHomeMedia(name, "").Code, name)
	}
}

func TestValidateHomeShowcase(t *testing.T) {
	uploaded := "/home-media/0123456789abcdef0123456789abcdef.mp4"
	manyItems := "[" + strings.TrimSuffix(strings.Repeat(`{"title":"x"},`, homeShowcaseMaxItems+1), ",") + "]"
	cases := []struct {
		name  string
		value string
		valid bool
	}{
		{"empty keeps built-in defaults", "", true},
		{"uploaded video and https poster", `{"hero":{"title":"Hero","video":"` + uploaded + `","poster":"https://media.example.com/p.jpg"},"showcase":[{"title":"Clip","category":"Ads","prompt":"p","video":"` + uploaded + `"}]}`, true},
		{"javascript url", `{"hero":{"video":"javascript:alert(1)"}}`, false},
		{"plain http url", `{"showcase":[{"video":"http://example.com/a.mp4"}]}`, false},
		{"traversal in uploaded path", `{"showcase":[{"video":"/home-media/../config.json"}]}`, false},
		{"too many clips", `{"showcase":` + manyItems + `}`, false},
		{"title too long", `{"showcase":[{"title":"` + strings.Repeat("长", 81) + `"}]}`, false},
		{"chinese versions", `{"hero":{"title":"Hero","title_zh":"主视频","prompt_zh":"提示词"},"showcase":[{"title":"Clip","title_zh":"案例","category":"Ads","category_zh":"广告"}]}`, true},
		{"chinese category too long", `{"showcase":[{"category_zh":"` + strings.Repeat("长", 21) + `"}]}`, false},
		{"not json", `{"showcase":`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateHomeShowcase(tc.value)
			if tc.valid {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}

func TestValidateStudioGallery(t *testing.T) {
	uploaded := "/home-media/0123456789abcdef0123456789abcdef.mp4"
	manyItems := "[" + strings.TrimSuffix(strings.Repeat(`{"title":"x"},`, studioGalleryMaxItems+1), ",") + "]"
	cases := []struct {
		name  string
		value string
		valid bool
	}{
		{"empty gallery", "", true},
		{"one clip with cover", `{"items":[{"title":"Clip","category":"Ads","prompt":"p","spec":"seedance-2.0 · 720p · 5s","video":"` + uploaded + `","poster":"https://media.example.com/p.jpg"}]}`, true},
		{"title of 100 characters", `{"items":[{"title":"` + strings.Repeat("标", 100) + `"}]}`, true},
		{"title over 100 characters", `{"items":[{"title":"` + strings.Repeat("标", 101) + `"}]}`, false},
		{"prompt of 7500 characters", `{"items":[{"title":"Clip","prompt":"` + strings.Repeat("词", 7500) + `"}]}`, true},
		{"prompt over 7500 characters", `{"items":[{"title":"Clip","prompt":"` + strings.Repeat("p", 7501) + `"}]}`, false},
		{"MiniMax prompt of 2000 characters", `{"items":[{"prompt":"` + strings.Repeat("p", 2000) + `","spec":"MiniMax-H3 · 16:9 · 768p · 6s"}]}`, true},
		{"MiniMax prompt over 2000 characters", `{"items":[{"prompt":"` + strings.Repeat("p", 2001) + `","spec":"MiniMax-H3 · 16:9 · 768p · 6s"}]}`, false},
		{"javascript url", `{"items":[{"video":"javascript:alert(1)"}]}`, false},
		{"too many clips", `{"items":` + manyItems + `}`, false},
		{"not json", `{"items":`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateStudioGallery(tc.value)
			if tc.valid {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}

func TestValidatePromoPopup(t *testing.T) {
	manyCards := strings.TrimSuffix(strings.Repeat(`{"kind":"model"},`, promoPopupMaxCards+1), ",")
	cases := []struct {
		name  string
		value string
		valid bool
	}{
		{"empty means no popup", "", true},
		{"all card kinds", `{"enabled":true,"cards":[{"kind":"model","model_name":"Seedance 2.5","sale_price":"¥0.10","original_price":"¥0.20","unit":"/秒","ends_at":"2026-11-30","href":"/pricing"},{"kind":"recharge","tiers":[{"pay":"¥100","bonus":"¥10"}]},{"kind":"list","deals":[{"model_name":"Wan 3.0","sale_price":"¥0.10"}],"href":"https://example.com/deals"}]}`, true},
		{"unknown kind", `{"cards":[{"kind":"banner"}]}`, false},
		{"too many cards", `{"cards":[` + manyCards + `]}`, false},
		{"javascript link", `{"cards":[{"kind":"model","href":"javascript:alert(1)"}]}`, false},
		{"plain http link", `{"cards":[{"kind":"model","href":"http://example.com"}]}`, false},
		{"scheme relative link", `{"cards":[{"kind":"model","href":"//example.com"}]}`, false},
		{"backslash redirect link", `{"cards":[{"kind":"model","href":"/\\example.com"}]}`, false},
		{"impossible end date", `{"cards":[{"kind":"model","ends_at":"2026-02-30"}]}`, false},
		{"too many tiers", `{"cards":[{"kind":"recharge","tiers":[{},{},{},{}]}]}`, false},
		{"too many deals", `{"cards":[{"kind":"list","deals":[{},{},{},{},{}]}]}`, false},
		{"title too long", `{"cards":[{"kind":"model","title":"` + strings.Repeat("长", 61) + `"}]}`, false},
		{"deal name too long", `{"cards":[{"kind":"list","deals":[{"model_name":"` + strings.Repeat("x", 61) + `"}]}]}`, false},
		{"not json", `{"cards":`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validatePromoPopup(tc.value)
			if tc.valid {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}
