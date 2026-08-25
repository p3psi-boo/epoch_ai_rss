import {
  decodeHtmlEntities,
  fetchText,
  fetchArticleBody,
  byClass,
  mapWithLimit,
} from "../utils";

const ORIGIN = "https://epoch.ai";
const MAX_ITEMS = 15;
const ITEM_CONCURRENCY = 4;

const TYPE_LABELS = {
  report: "Report",
  "data-insight": "Data Insight",
  newsletter: "Newsletter",
};

export default {
  slug: "epoch-ai",
  title: "Epoch AI — Latest",
  home: `${ORIGIN}/latest`,
  description:
    "Epoch AI's most recent work: research reports, data insights, and Gradient Updates newsletter.",

  async getItems() {
    const items = await fetchLatestEntries();

    await mapWithLimit(items, ITEM_CONCURRENCY, async (item) => {
      try {
        item.bodyHtml = await fetchArticleBody(item.link, {
          base: ORIGIN,
          container: byClass("formatted-text", "content-body"),
          skipImage: (src) => src.includes("arrow-return"),
        });
      } catch (err) {
        console.error(`failed to fetch body for ${item.link}:`, err);
      }
    });

    return items;
  },
};

// ---------------------------------------------------------------------------
// Entry list from https://epoch.ai/latest
//
// The page embeds the entry list as serialized props of an Astro island
// (`props="..."` on the Search component). Values use Astro's encoding
// `[typeIndex, value]`, where 0 = plain value, 3 = Date.
// ---------------------------------------------------------------------------

async function fetchLatestEntries() {
  const html = await fetchText(`${ORIGIN}/latest`);

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
      category: TYPE_LABELS[e.type] ?? "Update",
      categories: Array.isArray(e.tags) ? e.tags : [],
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
