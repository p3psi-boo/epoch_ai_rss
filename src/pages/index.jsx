/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { SOURCES as FEEDS } from "../feeds";

const styles = `
  :root {
    --bg: #faf9f7;
    --ink: #1c1c1a;
    --muted: #8a8880;
    --hairline: #e5e2dc;
    --accent: #2f5d50;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    line-height: 1.6;
  }
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 18vh 1.5rem 6rem;
  }
  .kicker {
    font-size: 0.6875rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h1 {
    font-size: 1.75rem;
    font-weight: 500;
    letter-spacing: -0.01em;
    margin-top: 0.75rem;
  }
  ul { list-style: none; margin-top: 3rem; border-top: 1px solid var(--hairline); }
  .feed { border-bottom: 1px solid var(--hairline); }
  .feed-link {
    display: block;
    padding: 1.25rem 0;
    text-decoration: none;
    color: inherit;
    transition: padding-left 160ms ease;
  }
  .feed-link:hover { padding-left: 0.5rem; }
  .feed-link:hover .feed-title { color: var(--accent); }
  .feed-title {
    display: block;
    font-weight: 500;
    transition: color 160ms ease;
  }
  .feed-desc {
    display: block;
    font-size: 0.875rem;
    color: var(--muted);
    margin-top: 0.125rem;
  }
  .feed-url {
    display: block;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.75rem;
    color: var(--muted);
    margin-top: 0.5rem;
  }
  footer {
    margin-top: 4rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
`;

export default function IndexPage() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>RSS Feeds</title>
        <style>{raw(styles)}</style>
      </head>
      <body>
        <main>
          <p class="kicker">Personal RSS</p>
          <h1>Feeds</h1>
          <ul>
            {FEEDS.map((f) => (
              <li class="feed">
                <a href={`/${f.slug}/rss.xml`} class="feed-link">
                  <span class="feed-title">{f.title}</span>
                  <span class="feed-desc">{f.description}</span>
                  <span class="feed-url">/{f.slug}/rss.xml</span>
                </a>
              </li>
            ))}
          </ul>
          <footer>Full-text feeds, served from a Worker.</footer>
        </main>
      </body>
    </html>
  );
}
