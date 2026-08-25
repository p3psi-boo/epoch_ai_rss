const ORIGIN = "https://epoch.ai";
const SOURCE_URL = `${ORIGIN}/latest`;
const FEED_TITLE = "Epoch AI — Latest";
const FEED_DESCRIPTION =
  "Epoch AI's most recent work: research reports, data insights, and Gradient Updates newsletter.";
const MAX_ITEMS = 15;
const ITEM_CONCURRENCY = 4;

const TYPE_LABELS = {
  report: "Report",
  "data-insight": "Data Insight",
  newsletter: "Newsletter",
};

const ALLOWED_TAGS = new Set([
  "p", "h2", "h3", "h4", "h5", "ul", "ol", "li",
  "strong", "em", "b", "i", "a", "img", "br",
  "blockquote", "code", "pre", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const SKIP_TAGS = new Set([
  "script", "style", "svg", "nav", "button", "form",
  "aside", "iframe", "template", "type-3-player", "input",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/rss.xml" && url.pathname !== "/rss" && url.pathname !== "/") {
      return new Response("Not found. Use /rss.xml\n", { status: 404 });
    }

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/rss.xml`, request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const xml = await buildFeed();

    const response = new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=1800",
        "Access-Control-Allow-Origin": "*",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

// ---------------------------------------------------------------------------
// Feed construction
// ---------------------------------------------------------------------------

async function buildFeed() {
  let items = [];
  try {
    items = await fetchLatestItems();
  } catch (err) {
    console.error("failed to fetch item list:", err);
  }

  await fetchBodiesWithLimit(items);

  return renderRss(items);
}

function renderRss(items) {
  const now = new Date().toUTCString();
  const esc = escapeXml;

  const itemXml = items
    .map((item) => {
      const label = TYPE_LABELS[item.type] ?? "Update";
      const categories = (item.tags ?? [])
        .map((t) => `<category>${esc(t)}</category>`)
        .join("");

      const summary = item.description ? `<p>${esc(item.description)}</p>` : "";
      const body = item.bodyHtml ?? "";
      const authors = (item.authors ?? [])
        .map((a) => a.name)
        .filter(Boolean)
        .join(", ");

      return [
        "<item>",
        `<title>${esc(item.title)}</title>`,
        `<link>${esc(item.link)}</link>`,
        `<guid isPermaLink="true">${esc(item.link)}</guid>`,
        item.date ? `<pubDate>${item.date.toUTCString()}</pubDate>` : "",
        authors ? `<author>${esc(authors)}</author>` : "",
        `<category>${esc(label)}</category>`,
        categories,
        item.description
          ? `<description>${summary}</description>`
          : "<description/>",
        body
          ? `<content:encoded><![CDATA[${body.replace(
              /]]>/g,
              "]]]]><![CDATA[>"
            )}]]></content:encoded>`
          : "",
        "</item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(FEED_TITLE)}</title>
<link>${esc(SOURCE_URL)}</link>
<description>${esc(FEED_DESCRIPTION)}</description>
<language>en</language>
<lastBuildDate>${now}</lastBuildDate>
<atom:link rel="self" type="application/rss+xml" href="https://epoch-ai-rss.example.workers.dev/rss.xml"/>
${itemXml}
</channel>
</rss>`;
}

// ---------------------------------------------------------------------------
// Step 1: item list from https://epoch.ai/latest
//
// The page embeds the entry list as serialized props of an Astro island
// (`props="..."` on the Search component). Values use Astro's encoding
// `[typeIndex, value]`, where 0 = plain value, 3 = Date.
// ---------------------------------------------------------------------------

async function fetchLatestItems() {
  const html = await fetchText(SOURCE_URL);

  const m = html.match(
    /component-url="\/_astro\/Search[^"]*"[^>]*?props="([^"]*)"/
  );
  if (!m) throw new Error("could not locate Search island props");

  const data = JSON.parse(decodeHtmlEntities(m[1]));
  const entries = reviveAstro(data?.prehydratedResults);
  if (!Array.isArray(entries)) throw new Error("unexpected props shape");

  return entries
    .filter((e) => e && typeof e.url === "string")
    .filter((e) =>
      /^\/(publications|data-insights|gradient-updates)\//.test(e.url)
    )
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, MAX_ITEMS)
    .map((e) => ({
      title: typeof e.title === "string" ? e.title : e.url,
      link: ORIGIN + e.url,
      date: e.date instanceof Date && !isNaN(e.date) ? e.date : null,
      description: typeof e.description === "string" ? e.description : "",
      authors: Array.isArray(e.authors) ? e.authors : [],
      tags: Array.isArray(e.tags) ? e.tags : [],
      type: typeof e.type === "string" ? e.type : "",
      bodyHtml: null,
    }));
}

// Recursively unwrap Astro's `[type, payload]` value encoding.
function reviveAstro(value) {
  if (Array.isArray(value)) {
    if (
      value.length >= 1 &&
      value.length <= 2 &&
      typeof value[0] === "number"
    ) {
      const [tag, payload] = value;
      if (tag === 3) {
        const d = new Date(payload);
        return isNaN(d) ? null : d;
      }
      if (payload === undefined) return null;
      return reviveAstro(payload);
    }
    return value.map(reviveAstro);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = reviveAstro(value[key]);
    return out;
  }
  return value;
}

function decodeHtmlEntities(s) {
  const named = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " " };
  return s.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      try {
        const code =
          e[1] === "x" || e[1] === "X"
            ? parseInt(e.slice(2), 16)
            : parseInt(e.slice(1), 10);
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return named[e] ?? m;
  });
}

// ---------------------------------------------------------------------------
// Step 2: per-article full text via HTMLRewriter
// ---------------------------------------------------------------------------

async function fetchBodiesWithLimit(items) {
  let next = 0;
  const workers = Array.from({ length: ITEM_CONCURRENCY }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        item.bodyHtml = await fetchArticleBody(item.link);
      } catch (err) {
        console.error(`failed to fetch body for ${item.link}:`, err);
      }
    }
  });
  await Promise.all(workers);
}

async function fetchArticleBody(url) {
  const html = await fetchText(url);
  const buf = new BodyExtractor();

  const res = new Response(html);
  const transformed = new HTMLRewriter().on("*", buf.handler()).transform(res);
  await transformed.arrayBuffer(); // drain

  return buf.finish();
}

class BodyExtractor {
  constructor() {
    this.out = "";
    this.inTarget = false;
    this.skipping = false;
    this.pendingSpace = "";
    this.opened = []; // stack of emitted tags awaiting close
  }

  handler() {
    return {
      element: (el) => this.onElement(el),
      text: (t) => this.onText(t),
      comments: (c) => c.remove(),
    };
  }

  onElement(el) {
    const tag = el.tagName.toLowerCase();

    if (!this.inTarget) {
      // Detect the body container: div.formatted-text.content-body
      if (
        tag === "div" &&
        el.hasAttribute("class") &&
        /(^|\s)formatted-text(\s|$)/.test(el.getAttribute("class")) &&
        /(^|\s)content-body(\s|$)/.test(el.getAttribute("class"))
      ) {
        this.inTarget = true;
        el.onEndTag(() => {
          this.inTarget = false;
        });
      }
      return;
    }

    if (this.skipping) return;

    if (SKIP_TAGS.has(tag)) {
      this.skipping = true;
      el.onEndTag(() => {
        this.skipping = false;
      });
      return;
    }

    if (!ALLOWED_TAGS.has(tag)) return; // transparent wrapper (e.g. mdx-section)

    switch (tag) {
      case "a": {
        const href = absolutize(el.getAttribute("href"));
        this.flushSpace();
        this.out += href
          ? `<a href="${escapeXml(href)}">`
          : "<a>";
        this.opened.push("</a>");
        break;
      }
      case "img": {
        const src = absolutize(el.getAttribute("src"));
        if (!src || src.includes("arrow-return")) return;
        const alt = el.getAttribute("alt") ?? "";
        this.flushSpace();
        this.out += `<img src="${escapeXml(src)}" alt="${escapeXml(alt)}"/>`;
        return;
      }
      case "br":
        this.out += "<br/>";
        return;
      default: {
        this.flushSpace();
        this.out += `<${tag}>`;
        this.opened.push(`</${tag}>`);
      }
    }

    el.onEndTag(() => {
      const close = this.opened.pop();
      if (close) this.out += close;
    });
  }

  onText(t) {
    if (!this.inTarget || this.skipping) return;
    const text = t.text.replace(/\s+/g, " ");
    if (!text.trim()) {
      // preserve one space across chunk boundaries
      this.pendingSpace += " ";
      return;
    }
    if (/^[\s.,;:!?)\]]/.test(text)) this.flushSpace();
    else this.flushSpace(true);
    this.out += escapeXml(text);
  }

  flushSpace(trimLeading = false) {
    if (this.pendingSpace) {
      if (!trimLeading && !this.out.endsWith(">")) this.out += " ";
      this.pendingSpace = "";
    }
  }

  finish() {
    while (this.opened.length) this.out += this.opened.pop();
    return this.out.trim();
  }
}

function absolutize(href) {
  if (!href) return null;
  try {
    const u = new URL(href, ORIGIN);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "epoch-ai-rss-worker/1.0" },
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
