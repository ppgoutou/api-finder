package router

import (
	"bytes"
	"fmt"
	"html/template"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// The built index.html wraps its default title and description in these
// markers so the server can swap in page-specific metadata. Every visitor,
// crawler or browser, receives the same document for the same path.
var (
	seoHeadStart = []byte("<!--seo:start-->")
	seoHeadEnd   = []byte("<!--seo:end-->")
	rootDiv      = []byte(`<div id="root"`)
)

type seoPage struct {
	// Title is followed by the system name, e.g. "Pricing | API-Finder", so
	// the words a page ranks for lead its search result.
	Title       string
	Description string
}

const seoHomeDescription = "AI video creation platform powered by ByteDance Seedance. Turn a prompt, an image or a reference clip into cinematic video up to 4K and 30 seconds, billed by the second."

var seoPages = map[string]seoPage{
	"/": {
		Title:       "AI Video Generator powered by Seedance",
		Description: seoHomeDescription,
	},
	"/landing": {
		Title:       "Cinematic AI Video, Billed per Second",
		Description: "Create cinematic AI video with ByteDance Seedance: text-to-video, image-to-video and reference video up to 4K, pay as you go with no subscription.",
	},
	"/pricing": {
		Title:       "Seedance AI Video Pricing per Second",
		Description: "Per-second prices for Seedance 2.0 text-to-video, image-to-video and reference-video generation, below official list prices. Pay as you go with no subscription or minimum spend.",
	},
	"/about": {
		Title:       "About",
		Description: "About our AI video creation platform, the team behind it and how to contact us.",
	},
	"/privacy-policy": {
		Title:       "Privacy Policy",
		Description: "How we collect, use and protect your personal data.",
	},
	"/user-agreement": {
		Title:       "Terms of Service",
		Description: "The terms that govern use of our AI video creation platform.",
	},
	"/refund-policy": {
		Title:       "Refund Policy",
		Description: "When and how unused balance can be refunded.",
	},
}

var seoHeadTemplate = template.Must(template.New("seo-head").Parse(`<title>{{.FullTitle}}</title>
    <meta name="title" content="{{.FullTitle}}" />
    <meta name="description" content="{{.Description}}" />
    {{- if .URL}}
    <link rel="canonical" href="{{.URL}}" />
    <meta property="og:url" content="{{.URL}}" />
    {{- end}}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="{{.SiteName}}" />
    <meta property="og:title" content="{{.FullTitle}}" />
    <meta property="og:description" content="{{.Description}}" />
    {{- if .Image}}
    <meta property="og:image" content="{{.Image}}" />
    {{- end}}
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="{{.FullTitle}}" />
    <meta name="twitter:description" content="{{.Description}}" />
    {{- if .Image}}
    <meta name="twitter:image" content="{{.Image}}" />
    {{- end}}
    {{- if .StructuredData}}
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":{{.OrgID}},"name":{{.SiteName}},"url":{{.HomeURL}},"logo":{{.Image}}},{"@type":"WebSite","name":{{.SiteName}},"url":{{.HomeURL}},"publisher":{"@id":{{.OrgID}}}}]}</script>
    {{- end}}
    `))

// seoHomeTemplate is a static rendering of the home page copy for crawlers
// and clients without JavaScript; it mirrors the React home page. Browsers
// that run scripts hide it at once, so a first visit waiting on uncached
// bundles never shows it unstyled, and main.tsx removes it before mounting.
var seoHomeTemplate = template.Must(template.New("seo-home").Parse(`<style>html.js #prerender{display:none}</style>
    <script>document.documentElement.classList.add('js')</script>
    <div id="prerender" style="max-width:960px;margin:0 auto;padding:96px 24px 48px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6">
      <header>
        <p style="font-weight:600">{{.SiteName}}</p>
        <h1 style="font-size:2.5rem;line-height:1.15;margin:16px 0">Turn one sentence into cinematic video</h1>
        <p>An AI video creation platform powered by ByteDance Seedance. Turn a prompt, an image or a reference clip into a finished video in the browser, billed by the second.</p>
        <p><a href="/sign-up">Sign up free and start creating</a> · <a href="/pricing">View pricing</a></p>
        <ul>
          <li>Up to 4K resolution</li>
          <li>4–30 seconds per clip</li>
          <li>Text, image or reference-video input</li>
          <li>Top up by card, use instantly</li>
        </ul>
      </header>
      <section>
        <h2>Three ways to generate</h2>
        <ul>
          <li><strong>Text to video</strong> — describe the scene in words and get a video.</li>
          <li><strong>Image to video (first frame)</strong> — upload an image as the first frame to keep the scene and characters consistent.</li>
          <li><strong>Reference video</strong> — provide a reference clip to mimic its motion and camera work.</li>
        </ul>
      </section>
      <section>
        <h2>Video for every team that creates</h2>
        <ul>
          <li><strong>Product and e-commerce ads</strong> — turn a product photo into a polished commercial shot for your store or listing.</li>
          <li><strong>Social media shorts</strong> — make eye-catching vertical clips for TikTok, Reels and Shorts in minutes.</li>
          <li><strong>Film and storyboards</strong> — preview scenes, camera moves and pacing before you shoot anything.</li>
          <li><strong>Anime and game art</strong> — animate characters and worlds from concept art while keeping their look.</li>
        </ul>
      </section>
      <section>
        <h2>Models and pricing</h2>
        <p>seedance-2.0: 480p to 4K, 4–15 seconds per clip. seedance-2.5: 480p to 1080p, 4–30 seconds per clip.</p>
        <p>Billed per generated second, below official list prices. No monthly fee or minimum spend. <a href="/pricing">See all prices</a>.</p>
      </section>
      <section>
        <h2>For developers</h2>
        <p>Prefer code? Create an API key in the console and generate the same videos with the video API.</p>
      </section>
      <footer>
        {{- if .Contact}}
        <p>{{.Contact}}</p>
        {{- end}}
        <p><a href="/about">About</a>{{range .LegalLinks}} · <a href="{{.Href}}">{{.Label}}</a>{{end}}</p>
      </footer>
    </div>
    `))

type seoLink struct {
	Href  string
	Label string
}

type seoView struct {
	SiteName string
	HomeURL  string
	OrgID    string
	// StructuredData adds schema.org Organization and WebSite data, which
	// belongs on the home page only.
	StructuredData bool
	FullTitle      string
	Description    string
	URL            string
	Image          string
	Contact        template.HTML
	LegalLinks     []seoLink
}

// seoSnapshot is the option state needed to render SEO output, read once
// under the option lock.
type seoSnapshot struct {
	siteName    string
	baseURL     string
	footer      string
	customHome  bool
	hasAbout    bool
	legalLinks  []seoLink
	sitemapURLs []string
}

func readSEOSnapshot(c *gin.Context) seoSnapshot {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()

	snap := seoSnapshot{
		siteName:   common.SystemName,
		baseURL:    strings.TrimRight(system_setting.ServerAddress, "/"),
		footer:     common.Footer,
		customHome: strings.TrimSpace(common.OptionMap["HomePageContent"]) != "",
		hasAbout:   strings.TrimSpace(common.OptionMap["About"]) != "",
	}
	if snap.baseURL == "" {
		scheme := "http"
		if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		snap.baseURL = scheme + "://" + c.Request.Host
	}

	legal := system_setting.GetLegalSettings()
	if legal.UserAgreement != "" {
		snap.legalLinks = append(snap.legalLinks, seoLink{Href: "/user-agreement", Label: "Terms of Service"})
	}
	if legal.PrivacyPolicy != "" {
		snap.legalLinks = append(snap.legalLinks, seoLink{Href: "/privacy-policy", Label: "Privacy Policy"})
	}
	if legal.RefundPolicy != "" {
		snap.legalLinks = append(snap.legalLinks, seoLink{Href: "/refund-policy", Label: "Refund Policy"})
	}

	snap.sitemapURLs = []string{"/", "/landing", "/pricing"}
	if snap.hasAbout {
		snap.sitemapURLs = append(snap.sitemapURLs, "/about")
	}
	for _, link := range snap.legalLinks {
		snap.sitemapURLs = append(snap.sitemapURLs, link.Href)
	}
	return snap
}

// footerContact returns the English block of the admin footer HTML (or the
// whole footer when it has no language blocks) so the prerendered page shows
// the same contact details as the live footer.
func footerContact(footer string) string {
	const enMarker = "<!-- lang:en -->"
	_, after, found := strings.Cut(footer, enMarker)
	if !found {
		if strings.Contains(footer, "<!-- lang:") {
			return ""
		}
		return strings.TrimSpace(footer)
	}
	block, _, _ := strings.Cut(after, "<!-- lang:")
	return strings.TrimSpace(block)
}

// renderIndexPage returns the index document for path with page-specific
// metadata and, for the default home page, a static rendering of its copy.
func renderIndexPage(c *gin.Context, indexPage []byte, path string) []byte {
	page, ok := seoPages[path]
	if !ok {
		return indexPage
	}
	start := bytes.Index(indexPage, seoHeadStart)
	end := bytes.Index(indexPage, seoHeadEnd)
	if start < 0 || end < start {
		return indexPage
	}

	snap := readSEOSnapshot(c)
	view := seoView{
		SiteName:    snap.siteName,
		HomeURL:     snap.baseURL + "/",
		OrgID:       snap.baseURL + "/#organization",
		FullTitle:   page.Title + " | " + snap.siteName,
		Description: page.Description,
		URL:         snap.baseURL + path,
		Image:       snap.baseURL + "/logo.png",
		LegalLinks:  snap.legalLinks,

		StructuredData: path == "/",
	}
	// Admin-authored footer HTML is already rendered unescaped by the app.
	view.Contact = template.HTML(footerContact(snap.footer))

	var head bytes.Buffer
	if err := seoHeadTemplate.Execute(&head, view); err != nil {
		return indexPage
	}

	var out bytes.Buffer
	out.Grow(len(indexPage) + head.Len() + 4096)
	out.Write(indexPage[:start])
	out.Write(head.Bytes())
	rest := indexPage[end+len(seoHeadEnd):]

	rootAt := bytes.Index(rest, rootDiv)
	if path != "/" || snap.customHome || rootAt < 0 {
		out.Write(rest)
		return out.Bytes()
	}
	var body bytes.Buffer
	if err := seoHomeTemplate.Execute(&body, view); err != nil {
		out.Write(rest)
		return out.Bytes()
	}
	out.Write(rest[:rootAt])
	out.Write(body.Bytes())
	out.Write(rest[rootAt:])
	return out.Bytes()
}

// spaRouteRoots are the first path segments the React app routes, plus the
// old console paths it redirects. Any other path gets the app shell with a 404
// status, so crawlers drop URLs that never existed here (the domain served a
// different site before, and Google kept reporting its pages as soft 404s).
// A test keeps this list in step with web/src/routes.
var spaRouteRoots = map[string]bool{
	"401": true, "403": true, "404": true, "500": true, "503": true,
	"about": true, "channels": true, "chat": true, "chat2link": true,
	"console": true, "dashboard": true, "docs": true, "errors": true,
	"forgot-password": true, "keys": true, "landing": true, "login": true,
	"models": true, "oauth": true, "otp": true, "playground": true,
	"pricing": true, "privacy-policy": true, "profile": true,
	"rankings": true, "redemption-codes": true, "refund-policy": true,
	"register": true, "reset": true, "security": true, "setup": true,
	"sign-in": true, "sign-up": true, "subscriptions": true,
	"system-info": true, "system-settings": true, "task-plugins": true,
	"usage-logs": true, "user": true, "user-agreement": true, "users": true,
	"video-studio": true, "wallet": true,
}

// indexPageStatus is the HTTP status for the app shell served at path.
func indexPageStatus(path string) int {
	first, _, _ := strings.Cut(strings.TrimPrefix(path, "/"), "/")
	if first == "" || spaRouteRoots[first] {
		return http.StatusOK
	}
	return http.StatusNotFound
}

// Signed-in areas are disallowed so crawlers spend their budget on public pages.
var robotsDisallow = []string{
	"/api/", "/v1/", "/dashboard", "/keys", "/wallet", "/usage-logs",
	"/profile", "/security", "/system-settings", "/channels", "/users",
	"/models", "/redemption-codes", "/subscriptions", "/task-plugins",
	"/playground", "/chat", "/video-studio", "/setup", "/oauth",
}

func serveRobotsTxt(c *gin.Context) {
	snap := readSEOSnapshot(c)
	var b strings.Builder
	b.WriteString("User-agent: *\nAllow: /\n")
	for _, path := range robotsDisallow {
		b.WriteString("Disallow: ")
		b.WriteString(path)
		b.WriteString("\n")
	}
	fmt.Fprintf(&b, "\nSitemap: %s/sitemap.xml\n", snap.baseURL)
	c.Header("Cache-Control", "max-age=3600")
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(b.String()))
}

func serveSitemapXML(c *gin.Context) {
	snap := readSEOSnapshot(c)
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, path := range snap.sitemapURLs {
		b.WriteString("  <url><loc>")
		template.HTMLEscape(&b, []byte(snap.baseURL+path))
		b.WriteString("</loc></url>\n")
	}
	b.WriteString("</urlset>\n")
	c.Header("Cache-Control", "max-age=3600")
	c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(b.String()))
}
