package router

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
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
	t.Cleanup(func() {
		common.SystemName, system_setting.ServerAddress, common.Footer, common.OptionMap = prevName, prevAddr, prevFooter, prevMap
		*system_setting.GetLegalSettings() = prevLegal
	})

	common.SystemName = "Acme <Video>"
	system_setting.ServerAddress = "https://video.example.com/"
	common.Footer = "<!-- lang:en -->\n<span>support@example.com</span>\n<!-- lang:zh -->\n<span>客服</span>"
	common.OptionMap = map[string]string{"HomePageContent": homeContent}
	*system_setting.GetLegalSettings() = system_setting.LegalSettings{PrivacyPolicy: "p", RefundPolicy: refundPolicy}

	engine := gin.New()
	engine.GET("/robots.txt", serveRobotsTxt)
	engine.GET("/sitemap.xml", serveSitemapXML)
	engine.NoRoute(func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html", renderIndexPage(c, []byte(seoTestIndex), c.Request.URL.Path))
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
	assert.Contains(t, home, `<meta property="og:image" content="https://video.example.com/logo.png" />`)
	assert.Contains(t, home, `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"https://video.example.com/#organization","name":"Acme \u003cVideo\u003e","url":"https://video.example.com/"`)
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
	assert.NotContains(t, pricing, "application/ld+json")
	assert.NotContains(t, pricing, `id="prerender"`)

	landing := getBody(t, engine, "/landing")
	assert.Contains(t, landing, "<title>Cinematic AI Video, Billed per Second | Acme &lt;Video&gt;</title>")
	assert.Contains(t, landing, `<link rel="canonical" href="https://video.example.com/landing" />`)
	assert.NotContains(t, landing, `id="prerender"`)

	assert.Equal(t, seoTestIndex, getBody(t, engine, "/dashboard"))
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
	assert.NotContains(t, sitemap, "/refund-policy")
	assert.NotContains(t, sitemap, "/about")
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
