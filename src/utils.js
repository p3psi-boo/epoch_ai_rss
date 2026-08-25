// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

export async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "personal-rss-worker/1.0" },
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function absolutize(href, base) {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function decodeHtmlEntities(s) {
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

// Run fn over items with at most `limit` concurrent executions.
export async function mapWithLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Full-text extraction via HTMLRewriter
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  "p", "h2", "h3", "h4", "h5", "ul", "ol", "li",
  "strong", "em", "b", "i", "a", "img", "br",
  "blockquote", "code", "pre", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const SKIP_TAGS = new Set([
  "script", "style", "svg", "nav", "button", "form",
  "aside", "iframe", "template", "input",
]);

// Extract an HTML fragment from a page.
//
// options.container: predicate(el) -> true once the target container element
// is seen; extraction runs between its open and close tags.
// options.skipImage?: (src) => boolean to filter out images.
export async function fetchArticleBody(url, options = {}) {
  const html = await fetchText(url);
  const buf = new FragmentExtractor(options);
  const transformed = new HTMLRewriter()
    .on("*", buf.handler())
    .transform(new Response(html));
  await transformed.arrayBuffer(); // drain
  return buf.finish();
}

class FragmentExtractor {
  constructor(options = {}) {
    this.containerMatch = options.container ?? defaultContainer;
    this.skipImage = options.skipImage ?? (() => false);
    this.base = options.base ?? url;
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
      if (this.containerMatch(el, tag)) {
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

    if (!ALLOWED_TAGS.has(tag)) return; // transparent wrapper

    switch (tag) {
      case "a": {
        const href = absolutize(el.getAttribute("href"), this.base);
        this.flushSpace();
        this.out += href ? `<a href="${escapeXml(href)}">` : "<a>";
        this.opened.push("</a>");
        break;
      }
      case "img": {
        const src = absolutize(el.getAttribute("src"), this.base);
        if (!src || this.skipImage(src)) return;
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

function defaultContainer(el, tag) {
  return tag === "article" || tag === "main";
}

function hasClass(el, name) {
  const cls = el.getAttribute("class");
  return cls ? new RegExp(`(^|\\s)${name}(\\s|$)`).test(cls) : false;
}

// Common selector helpers for source modules.
export const byClass = (...names) => (el) => names.every((n) => hasClass(el, n));
