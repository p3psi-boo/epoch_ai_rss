---
name: add-source
description: 给本项目添加新的 RSS 源。当用户要"加个源/添加 feed/订阅某个网站/支持新站点/新增 source 模块"时使用。
---

# Add Source（添加 RSS 源）

把一个网站变成 `/​{slug}/rss.xml` 全文 feed。每个源是 `src/sources/<slug>.js` 里的一个模块，注册进 `src/feeds.js` 即自动出现在索引页和路由里。

## 步骤

### 1. 侦察

抓取目标页面，回答两个问题：

- **列表在哪**：条目列表怎么拿？优先级：已有 RSS/Atom/API JSON > 页面内嵌数据（如 Astro/Next 的序列化 props）> 解析 HTML 列表。如果站方已有官方 RSS，直接告诉用户，不要造轮子。
- **正文在哪**：文章页的正文容器是什么选择器？（`article`？某个 class？）找不到稳定容器就明确决定做 summary-only。

完成标准：能写出"列表来自 X，正文容器是 Y"这句话。写不出就继续侦察，不许动手编码。

### 2. 写 source 模块

新建 `src/sources/<slug>.js`，default export 一个对象：

```js
export default {
  slug: "example",              // URL 段，kebab-case，全局唯一
  title: "Example — Latest",    // feed 标题
  home: "https://example.com/", // feed <link>，通常是列表页
  description: "...",

  async getItems() {
    // 返回 item 数组，字段见下方 Reference
    // 正文用 fetchArticleBody(link, {...}) 抓取
    // 并发用 mapWithLimit(items, N, fn)，N ≤ 5
  },
};
```

完成标准：模块导出五个元数据字段 + `getItems()`，item 至少含 `title` / `link` / `bodyHtml`。

### 3. 注册

`src/feeds.js`：import 后加入 `SOURCES` 数组。完成标准：一行 import + 一行数组项，没有其他改动。

### 4. 验证

清本地缓存后实测：

```sh
rm -rf .wrangler/state
npx wrangler dev --local &
curl -s http://localhost:8787/<slug>/rss.xml
```

完成标准（全部满足才算完）：

- `<item>` 数量 > 0（summary-only 也 > 0）
- 非 summary-only 时 `content:encoded` 数量 = item 数量
- 索引页 `/` 上出现新条目
- XML 可被解析（`xmllint --noout` 或肉眼检查无转义事故）

## Reference

### Item 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 字符串 |
| `link` | 是 | 绝对 URL，同时作 guid |
| `date` | 否 | Date 对象 |
| `description` | 否 | 摘要纯文本，渲染时自动包 `<p>` 并转义 |
| `authors` | 否 | `[{ name }]` |
| `category` | 否 | 单个分类字符串（如内容类型） |
| `categories` | 否 | 标签字符串数组 |
| `bodyHtml` | 否 | 正文 HTML 片段，进 `content:encoded` |

### utils.js 工具（不要重复实现）

- `fetchText(url)` — 带 CF 缓存的 GET
- `fetchArticleBody(url, { base, container, skipImage })` — HTMLRewriter 白名单提取；`container(el, tag)` 返回 true 处开始截取；默认容器为 `article`/`main`
- `byClass(...names)` — 生成按 class 匹配容器的谓词
- `mapWithLimit(items, limit, fn)` — 有界并发
- `absolutize(href, base)` / `decodeHtmlEntities(s)` / `escapeXml(s)`

### 约定

- 缓存由 `src/index.js` 统一处理（`caches.default`，30 分钟），source 模块不管缓存。
- 特殊解析逻辑（如 epoch 的 Astro island props）留在各自 source 模块内，不往 utils 塞——utils 只收两个以上源都要用的东西。
