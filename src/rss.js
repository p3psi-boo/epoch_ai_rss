import { escapeXml } from "./utils";

export function renderRss(feed, items, selfUrl) {
  const now = new Date().toUTCString();
  const esc = escapeXml;

  const itemXml = items
    .map((item) => {
      const categories = (item.categories ?? [])
        .map((t) => `<category>${esc(t)}</category>`)
        .join("");
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
        ...item.category ? [`<category>${esc(item.category)}</category>`] : [],
        categories,
        item.description
          ? `<description><p>${esc(item.description)}</p></description>`
          : "<description/>",
        item.bodyHtml
          ? `<content:encoded><![CDATA[${item.bodyHtml.replace(
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
<title>${esc(feed.title)}</title>
<link>${esc(feed.home)}</link>
<description>${esc(feed.description)}</description>
<language>en</language>
<lastBuildDate>${now}</lastBuildDate>
<atom:link rel="self" type="application/rss+xml" href="${esc(selfUrl)}"/>
${itemXml}
</channel>
</rss>`;
}
