package router

import (
	"fmt"
	"image"
	_ "image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const seoTestIndex = `<html><head><!--seo:start--><title>X</title><!--seo:end--></head><body><div id="root"></div></body></html>`

func setupSEOTest(t *testing.T, homeContent string, refundPolicy string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	prevName, prevAddr, prevFooter, prevMap := common.SystemName, system_setting.ServerAddress, common.Footer, common.OptionMap
	prevLegal := *system_setting.GetLegalSettings()
	prevPricing := loadVisitorPricing
	t.Cleanup(func() {
		common.SystemName, system_setting.ServerAddress, common.Footer, common.OptionMap = prevName, prevAddr, prevFooter, prevMap
		*system_setting.GetLegalSettings() = prevLegal
		loadVisitorPricing = prevPricing
	})
	loadVisitorPricing = func() []model.Pricing {
		return []model.Pricing{
			{ModelName: "seedance-2.5", DisplayName: "Seedance 2.5", Description: "<!-- lang:zh -->\n中文说明\n<!-- lang:en -->\nByteDance Seedance 2.5 video model, 4–30 seconds per clip."},
			{ModelName: "gpt-image-2"},
		}
	}

	common.SystemName = "Acme <Video>"
	system_setting.ServerAddress = "https://video.example.com/"
	common.Footer = "<!-- lang:en -->\n<span>support@example.com</span>\n<!-- lang:zh -->\n<span>客服</span>"
	common.OptionMap = map[string]string{"HomePageContent": homeContent}
	*system_setting.GetLegalSettings() = system_setting.LegalSettings{PrivacyPolicy: "p", RefundPolicy: refundPolicy}

	engine := gin.New()
	engine.GET("/robots.txt", serveRobotsTxt)
	engine.GET("/sitemap.xml", serveSitemapXML)
	engine.NoRoute(func(c *gin.Context) {
		if redirectToCanonicalHost(c) {
			return
		}
		status, page := renderIndexPage(c, []byte(seoTestIndex), c.Request.URL.Path)
		c.Data(status, "text/html", page)
	})
	return engine
}

func getBody(t *testing.T, engine *gin.Engine, path string) string {
	t.Helper()
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	require.Equal(t, http.StatusOK, rec.Code)
	return rec.Body.String()
}

func TestRenderIndexPageServesSameMetadataAndHomeCopyToEveryone(t *testing.T) {
	engine := setupSEOTest(t, "", "r")

	home := getBody(t, engine, "/")
	assert.Contains(t, home, "<title>AI Video Generator powered by Seedance | Acme &lt;Video&gt;</title>")
	assert.Contains(t, home, `<link rel="canonical" href="https://video.example.com/" />`)
	assert.Contains(t, home, `<meta name="twitter:card" content="summary_large_image" />`)
	assert.Contains(t, home, `<meta name="twitter:site" content="@APIfinder_AI" />`)
	assert.Contains(t, home, `<meta property="og:image" content="https://video.example.com/share-card-v1.jpg" />`)
	assert.Contains(t, home, `<meta name="twitter:image" content="https://video.example.com/share-card-v1.jpg" />`)
	assert.Contains(t, home, `"logo":"https://video.example.com/logo.png"`)
	assert.Contains(t, home, `<script type="application/ld+json">{`)
	assert.Contains(t, home, `"@type":"Organization"`)
	assert.Contains(t, home, `"@id":"https://video.example.com/#organization"`)
	assert.NotContains(t, home, `"name":"Acme <Video`)
	assert.Contains(t, home, `<div id="prerender"`)
	assert.Contains(t, home, "<span>support@example.com</span>")
	assert.NotContains(t, home, "客服")
	assert.Contains(t, home, `<a href="/refund-policy">Refund Policy</a>`)
	assert.Less(t, strings.Index(home, `id="prerender"`), strings.Index(home, `<div id="root"></div>`))
	// Browsers running scripts must hide the copy before it is parsed.
	assert.Less(t, strings.Index(home, `classList.add('js')`), strings.Index(home, `id="prerender"`))
	assert.Contains(t, home, `html.js #prerender{display:none}`)

	pricing := getBody(t, engine, "/pricing")
	assert.Contains(t, pricing, "<title>Seedance AI Video Pricing per Second | Acme &lt;Video&gt;</title>")
	assert.Contains(t, pricing, `"@type":"BreadcrumbList"`)
	assert.Contains(t, pricing, `<li><a href="/pricing/gpt-image-2">gpt-image-2</a></li>`)
	assert.Contains(t, pricing, `<li><a href="/pricing/seedance-2.5">Seedance 2.5</a> — ByteDance Seedance 2.5 video model, 4–30 seconds per clip.</li>`)
	assert.NotContains(t, pricing, "中文说明")
	assert.Less(t, strings.Index(pricing, `id="prerender"`), strings.Index(pricing, `<div id="root"></div>`))

	landing := getBody(t, engine, "/landing")
	assert.Contains(t, landing, "<title>Cinematic AI Video, Billed per Second | Acme &lt;Video&gt;</title>")
	assert.Contains(t, landing, `<link rel="canonical" href="https://video.example.com/landing" />`)
	assert.NotContains(t, landing, `id="prerender"`)

	assert.Equal(t, seoTestIndex, getBody(t, engine, "/dashboard"))
}

func TestShareImageIsServedAtTheSizeThePageDeclares(t *testing.T) {
	engine := setupSEOTest(t, "", "")
	file, err := os.Open(filepath.Join("..", "web", "public", filepath.FromSlash(seoShareImagePath)))
	require.NoError(t, err)
	defer file.Close()
	config, format, err := image.DecodeConfig(file)
	require.NoError(t, err)
	assert.Equal(t, "jpeg", format)

	pricing := getBody(t, engine, "/pricing")
	assert.Contains(t, pricing, `<meta property="og:image:type" content="image/jpeg" />`)
	assert.Contains(t, pricing, fmt.Sprintf(`<meta property="og:image:width" content="%d" />`, config.Width))
	assert.Contains(t, pricing, fmt.Sprintf(`<meta property="og:image:height" content="%d" />`, config.Height))
}

func TestRenderIndexPageSkipsHomeCopyWhenCustomHomeIsConfigured(t *testing.T) {
	engine := setupSEOTest(t, "# Custom", "")

	home := getBody(t, engine, "/")
	assert.Contains(t, home, "<title>AI Video Generator powered by Seedance | ")
	assert.NotContains(t, home, `id="prerender"`)
}

func TestRobotsAndSitemapListOnlyConfiguredPublicPages(t *testing.T) {
	engine := setupSEOTest(t, "", "")

	robots := getBody(t, engine, "/robots.txt")
	assert.Contains(t, robots, "Disallow: /api/\n")
	assert.Contains(t, robots, "Sitemap: https://video.example.com/sitemap.xml\n")

	sitemap := getBody(t, engine, "/sitemap.xml")
	assert.Contains(t, sitemap, "<loc>https://video.example.com/</loc>")
	assert.Contains(t, sitemap, "<loc>https://video.example.com/landing</loc>")
	assert.Contains(t, sitemap, "<loc>https://video.example.com/privacy-policy</loc>")
	assert.Contains(t, sitemap, "<loc>https://video.example.com/docs</loc>")
	assert.Contains(t, sitemap, "<loc>https://video.example.com/pricing</loc>")
	assert.Contains(t, sitemap, "<loc>https://video.example.com/pricing/seedance-2.5</loc>")
	assert.NotContains(t, sitemap, "/refund-policy")
	assert.NotContains(t, sitemap, "/about")

	// The VIP page is listed only while the VIP program runs.
	membership := operation_setting.GetMembershipSetting()
	previousEnabled := membership.Enabled
	t.Cleanup(func() { membership.Enabled = previousEnabled })
	membership.Enabled = true
	assert.Contains(t, getBody(t, engine, "/sitemap.xml"), "<loc>https://video.example.com/vip</loc>")
	membership.Enabled = false
	assert.NotContains(t, getBody(t, engine, "/sitemap.xml"), "/vip")
}

func TestIndexPageStatusIsNotFoundOutsideAppRoutes(t *testing.T) {
	cases := map[string]int{
		"/":                          http.StatusOK,
		"/pricing":                   http.StatusOK,
		"/pricing/seedance-2.0":      http.StatusOK,
		"/sign-in":                   http.StatusOK,
		"/usage-logs/audit":          http.StatusOK,
		"/best-for/no-api-key":       http.StatusNotFound,
		"/zh/privacy":                http.StatusNotFound,
		"/ja/compare/giphy-vs-klipy": http.StatusNotFound,
		"/directory":                 http.StatusNotFound,
		"/pricing-old":               http.StatusNotFound,
	}
	for path, want := range cases {
		assert.Equal(t, want, indexPageStatus(path), path)
	}
}

// Every route the React app defines must be served with 200, or the page
// would answer crawlers with 404 while rendering fine in a browser.
func TestSPARouteRootsCoverEveryFrontendRoute(t *testing.T) {
	routePattern := regexp.MustCompile(`createFileRoute\('([^']+)'\)`)
	var files []string
	err := filepath.WalkDir("../web/src/routes", func(path string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(path, ".tsx") {
			files = append(files, path)
		}
		return err
	})
	require.NoError(t, err)

	seen := 0
	for _, file := range files {
		src, err := os.ReadFile(file)
		require.NoError(t, err)
		for _, m := range routePattern.FindAllStringSubmatch(string(src), -1) {
			var segments []string
			for segment := range strings.SplitSeq(strings.Trim(m[1], "/"), "/") {
				// Layout and group segments do not appear in the URL; "/" has none.
				if segment == "" || strings.HasPrefix(segment, "_") || strings.HasPrefix(segment, "(") {
					continue
				}
				segments = append(segments, segment)
			}
			seen++
			if len(segments) == 0 {
				continue
			}
			assert.True(t, spaRouteRoots[segments[0]], "route %s (%s) is missing from spaRouteRoots", m[1], file)
		}
	}
	assert.Greater(t, seen, 40)
}

func TestModelPagesGetTheirOwnMetadataAndUnknownModelsAreNotFound(t *testing.T) {
	engine := setupSEOTest(t, "", "")

	page := getBody(t, engine, "/pricing/seedance-2.5")
	assert.Contains(t, page, "<title>Seedance 2.5 API Pricing | Acme &lt;Video&gt;</title>")
	assert.Contains(t, page, `<meta name="description" content="ByteDance Seedance 2.5 video model, 4–30 seconds per clip." />`)
	assert.Contains(t, page, `<link rel="canonical" href="https://video.example.com/pricing/seedance-2.5" />`)
	assert.Contains(t, page, `"position":3`)
	assert.Contains(t, page, "<h1 style=\"font-size:2rem;line-height:1.2;margin:16px 0\">Seedance 2.5 API pricing</h1>")
	assert.Contains(t, page, "<code>seedance-2.5</code>")

	noDescription := getBody(t, engine, "/pricing/gpt-image-2/")
	assert.Contains(t, noDescription, `<meta name="description" content="gpt-image-2 pricing, capabilities and API model ID.`)
	assert.Contains(t, noDescription, `<link rel="canonical" href="https://video.example.com/pricing/gpt-image-2" />`)

	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/pricing/retired-model", nil))
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestPricingPagesStayGenericWhenPricingNeedsSignIn(t *testing.T) {
	engine := setupSEOTest(t, "", "")
	common.OptionMap["HeaderNavModules"] = `{"pricing":{"enabled":true,"requireAuth":true},"docs":false}`

	pricing := getBody(t, engine, "/pricing")
	assert.NotContains(t, pricing, `id="prerender"`)
	assert.Equal(t, seoTestIndex, getBody(t, engine, "/pricing/seedance-2.5"))

	sitemap := getBody(t, engine, "/sitemap.xml")
	assert.NotContains(t, sitemap, "/pricing")
	assert.NotContains(t, sitemap, "/docs")
}

func TestWWWPageRequestsRedirectToServerAddress(t *testing.T) {
	engine := setupSEOTest(t, "", "")
	cases := []struct {
		method, host, path, location string
	}{
		{http.MethodGet, "www.video.example.com", "/pricing?view=table", "https://video.example.com/pricing?view=table"},
		{http.MethodGet, "WWW.video.example.com", "/", "https://video.example.com/"},
		{http.MethodGet, "www.video.example.com", "/oauth/github?code=x", ""},
		{http.MethodPost, "www.video.example.com", "/pricing", ""},
		{http.MethodGet, "video.example.com", "/pricing", ""},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		req.Host = tc.host
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if tc.location == "" {
			assert.NotEqual(t, http.StatusMovedPermanently, rec.Code, "%s %s%s", tc.method, tc.host, tc.path)
			continue
		}
		assert.Equal(t, http.StatusMovedPermanently, rec.Code, tc.path)
		assert.Equal(t, tc.location, rec.Header().Get("Location"))
	}
}
