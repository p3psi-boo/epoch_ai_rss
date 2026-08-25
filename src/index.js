import { Hono } from "hono";
import { SOURCES, findSource } from "./feeds";
import { renderRss } from "./rss";
import IndexPage from "./pages/index.jsx";

const app = new Hono();

app.get("/", (c) => c.html(IndexPage()));

async function serveFeed(c) {
  const source = findSource(c.req.param("slug"));
  if (!source) return c.text("Unknown feed\n", 404);

  const cache = caches.default;
  const cached = await cache.match(c.req.raw);
  if (cached) return cached;

  let items = [];
  try {
    items = await source.getItems();
  } catch (err) {
    console.error(`failed to build feed "${source.slug}":`, err);
  }

  const selfUrl = new URL(c.req.url).origin + `/${source.slug}/rss.xml`;
  const response = new Response(renderRss(source, items, selfUrl), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });
  c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()));
  return response;
}

app.get("/:slug/rss.xml", serveFeed);
app.get("/:slug/rss", serveFeed);

app.notFound((c) => c.text("Not found. Use /:slug/rss.xml\n", 404));

export default app;
