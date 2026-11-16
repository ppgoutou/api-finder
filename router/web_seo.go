package router

import (
	"bytes"
	"cmp"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
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
	"/docs": {
		Title:       "Seedance Video API Documentation",
		Description: "Generate Seedance AI video from code: authentication, creating text-to-video, image-to-video and reference-video tasks, polling results and request examples.",
	},
	"/sign-in": {
		Title:       "Sign In",
		Description: "Sign in to create AI video with Seedance and manage your balance and API keys.",
	},
	"/sign-up": {
		Title:       "Sign Up Free",
		Description: "Create a free account to generate AI video with ByteDance Seedance. Pay as you go, no subscription.",
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
    {{- if .JSONLD}}
    <script type="application/ld+json">{{.JSONLD}}</script>
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

// seoCatalogTemplate is a static rendering of the pricing page, or of one
// model's page, for crawlers and clients without JavaScript. It lists names
// and descriptions only: prices stay in the app.
var seoCatalogTemplate = template.Must(template.New("seo-catalog").Parse(`<style>html.js #prerender{display:none}</style>
    <script>document.documentElement.classList.add('js')</script>
    <div id="prerender" style="max-width:960px;margin:0 auto;padding:96px 24px 48px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6">
      <nav><a href="/">{{.SiteName}}</a> · <a href="/pricing">Pricing</a> · <a href="/docs">API docs</a></nav>
      {{- if .Model}}
      <h1 style="font-size:2rem;line-height:1.2;margin:16px 0">{{.Model.Name}} API pricing</h1>
      {{- if .Model.Description}}
      <p>{{.Model.Description}}</p>
      {{- end}}
      <p>Model ID: <code>{{.Model.ID}}</code>. Billed per use with no subscription or minimum spend.</p>
      <p><a href="/sign-up">Sign up to try {{.Model.Name}}</a> · <a href="/pricing">Compare all models</a></p>
      {{- else}}
      <h1 style="font-size:2rem;line-height:1.2;margin:16px 0">AI video and image model pricing</h1>
      <p>{{.Description}}</p>
      <ul>
        {{- range .Models}}
        <li><a href="{{.Href}}">{{.Name}}</a>{{if .Summary}} — {{.Summary}}{{end}}</li>
        {{- end}}
      </ul>
      <p><a href="/sign-up">Sign up free</a> · <a href="/docs">Read the API docs</a></p>
      {{- end}}
    </div>
    `))

// seoModel is one model an anonymous visitor sees on the pricing page.
type seoModel struct {
	ID          string
	Href        string
	Name        string
	Description string
	// Summary is the description cut to the length of a meta description.
	Summary string
}

// loadVisitorPricing is swapped in tests, which have no pricing database.
var loadVisitorPricing = controller.VisitorPricing

// visitorModels lists the models the pricing page shows a visitor who is not
// signed in, or nil when the pricing page itself needs a sign-in.
func visitorModels() []seoModel {
	if !middleware.HeaderNavModuleIsPublic("pricing") {
		return nil
	}
	pricing := loadVisitorPricing()
	models := make([]seoModel, 0, len(pricing))
	for _, item := range pricing {
		models = append(models, newSEOModel(item))
	}
	slices.SortFunc(models, func(a, b seoModel) int { return cmp.Compare(a.ID, b.ID) })
	return models
}

func newSEOModel(item model.Pricing) seoModel {
	name := strings.TrimSpace(item.DisplayName)
	if name == "" {
		name = item.ModelName
	}
	description := strings.Join(strings.Fields(englishBlock(item.Description)), " ")
	summary := description
	if utf8.RuneCountInString(summary) > 155 {
		cut := string([]rune(summary)[:155])
		if space := strings.LastIndex(cut, " "); space > 80 {
			cut = cut[:space]
		}
		summary = strings.TrimRight(cut, " ,.;:") + "…"
	}
	return seoModel{
		ID:          item.ModelName,
		Href:        "/pricing/" + url.PathEscape(item.ModelName),
		Name:        name,
		Description: description,
		Summary:     summary,
	}
}

type seoLink struct {
	Href  string
	Label string
}

type seoView struct {
	SiteName    string
	FullTitle   string
	Description string
	URL         string
	Image       string
	// JSONLD is schema.org data built by seoStructuredData.
	JSONLD     template.JS
	Contact    template.HTML
	LegalLinks []seoLink
	Models     []seoModel
	Model      *seoModel
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

	snap.sitemapURLs = []string{"/", "/landing"}
	if snap.hasAbout {
		snap.sitemapURLs = append(snap.sitemapURLs, "/about")
	}
	for _, link := range snap.legalLinks {
		snap.sitemapURLs = append(snap.sitemapURLs, link.Href)
	}
	return snap
}

// englishBlock returns the English block of admin text written in
// "<!-- lang:xx -->" blocks (or the whole text when it has no language
// blocks), such as the footer HTML or a model description.
func englishBlock(text string) string {
	const enMarker = "<!-- lang:en -->"
	_, after, found := strings.Cut(text, enMarker)
	if !found {
		if strings.Contains(text, "<!-- lang:") {
			return ""
		}
		return strings.TrimSpace(text)
	}
	block, _, _ := strings.Cut(after, "<!-- lang:")
	return strings.TrimSpace(block)
}

// renderIndexPage returns the HTTP status and index document for path, with
// page-specific metadata and, for the home, pricing and model pages, a static
// rendering of their copy.
func renderIndexPage(c *gin.Context, indexPage []byte, path string) (int, []byte) {
	status := indexPageStatus(path)
	page, ok := seoPages[path]
	var models []seoModel
	if path == "/pricing" || strings.HasPrefix(path, "/pricing/") {
		models = visitorModels()
	}
	var current *seoModel
	if !ok {
		modelID, isModelPage := strings.CutPrefix(strings.TrimSuffix(path, "/"), "/pricing/")
		if !isModelPage || models == nil {
			return status, indexPage
		}
		index := slices.IndexFunc(models, func(m seoModel) bool { return m.ID == modelID })
		if index < 0 {
			return http.StatusNotFound, indexPage
		}
		current = &models[index]
		page = seoPage{Title: current.Name + " API Pricing", Description: current.Summary}
		if page.Description == "" {
			page.Description = current.Name + " pricing, capabilities and API model ID. Pay as you go with no subscription."
		}
		path = current.Href
	}
	start := bytes.Index(indexPage, seoHeadStart)
	end := bytes.Index(indexPage, seoHeadEnd)
	if start < 0 || end < start {
		return status, indexPage
	}

	snap := readSEOSnapshot(c)
	view := seoView{
		SiteName:    snap.siteName,
		FullTitle:   page.Title + " | " + snap.siteName,
		Description: page.Description,
		URL:         snap.baseURL + path,
		Image:       snap.baseURL + "/logo.png",
		LegalLinks:  snap.legalLinks,
		Models:      models,
		Model:       current,
	}
	view.JSONLD = seoStructuredData(snap, view, path)
	// Admin-authored footer HTML is already rendered unescaped by the app.
	view.Contact = template.HTML(englishBlock(snap.footer))

	var head bytes.Buffer
	if err := seoHeadTemplate.Execute(&head, view); err != nil {
		return status, indexPage
	}

	var out bytes.Buffer
	out.Grow(len(indexPage) + head.Len() + 8192)
	out.Write(indexPage[:start])
	out.Write(head.Bytes())
	rest := indexPage[end+len(seoHeadEnd):]

	var bodyTemplate *template.Template
	switch {
	case path == "/" && !snap.customHome:
		bodyTemplate = seoHomeTemplate
	case models != nil:
		bodyTemplate = seoCatalogTemplate
	}
	rootAt := bytes.Index(rest, rootDiv)
	var body bytes.Buffer
	if bodyTemplate == nil || rootAt < 0 || bodyTemplate.Execute(&body, view) != nil {
		out.Write(rest)
		return status, out.Bytes()
	}
	out.Write(rest[:rootAt])
	out.Write(body.Bytes())
	out.Write(rest[rootAt:])
	return status, out.Bytes()
}

// seoStructuredData returns schema.org JSON-LD for the page: the organization
// and website on the home page, and a breadcrumb trail on pricing pages.
func seoStructuredData(snap seoSnapshot, view seoView, path string) template.JS {
	home := snap.baseURL + "/"
	var data map[string]any
	switch {
	case path == "/":
		orgID := snap.baseURL + "/#organization"
		data = map[string]any{
			"@context": "https://schema.org",
			"@graph": []any{
				map[string]any{"@type": "Organization", "@id": orgID, "name": snap.siteName, "url": home, "logo": view.Image},
				map[string]any{"@type": "WebSite", "name": snap.siteName, "url": home, "publisher": map[string]any{"@id": orgID}},
			},
		}
	case strings.HasPrefix(path, "/pricing"):
		crumbs := []any{
			map[string]any{"@type": "ListItem", "position": 1, "name": "Home", "item": home},
			map[string]any{"@type": "ListItem", "position": 2, "name": "Pricing", "item": snap.baseURL + "/pricing"},
		}
		if view.Model != nil {
			crumbs = append(crumbs, map[string]any{"@type": "ListItem", "position": 3, "name": view.Model.Name, "item": view.URL})
		}
		data = map[string]any{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": crumbs}
	default:
		return ""
	}
	encoded, err := common.Marshal(data)
	if err != nil {
		return ""
	}
	// Keep admin-provided names from closing the script element.
	return template.JS(strings.ReplaceAll(string(encoded), "<", `\u003c`))
}

// redirectToCanonicalHost answers a page request on the www host of the
// configured server address with a permanent redirect to the address itself,
// so search engines index one copy of each page. OAuth callbacks stay on the
// host the provider was given, where their state cookie lives.
func redirectToCanonicalHost(c *gin.Context) bool {
	if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
		return false
	}
	if strings.HasPrefix(c.Request.URL.Path, "/oauth") {
		return false
	}
	common.OptionMapRWMutex.RLock()
	address := system_setting.ServerAddress
	common.OptionMapRWMutex.RUnlock()
	canonical, err := url.Parse(strings.TrimRight(address, "/"))
	if err != nil || canonical.Host == "" || !strings.EqualFold(c.Request.Host, "www."+canonical.Host) {
		return false
	}
	c.Redirect(http.StatusMovedPermanently, canonical.Scheme+"://"+canonical.Host+c.Request.URL.RequestURI())
	return true
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
	paths := snap.sitemapURLs
	if middleware.HeaderNavModuleIsPublic("docs") {
		paths = append(paths, "/docs")
	}
	if models := visitorModels(); models != nil {
		paths = append(paths, "/pricing")
		for _, m := range models {
			paths = append(paths, m.Href)
		}
	}
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, path := range paths {
		b.WriteString("  <url><loc>")
		template.HTMLEscape(&b, []byte(snap.baseURL+path))
		b.WriteString("</loc></url>\n")
	}
	b.WriteString("</urlset>\n")
	c.Header("Cache-Control", "max-age=3600")
	c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(b.String()))
}
