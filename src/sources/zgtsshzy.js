import {
  decodeHtmlEntities,
  fetchText,
  fetchArticleBody,
  mapWithLimit,
} from "../utils";

const ORIGIN = "https://www.zgtsshzy.net";
const LIST_URL = `${ORIGIN}/CN/1006-6470/current.shtml`;
const MAX_ITEMS = 15;
const ITEM_CONCURRENCY = 3;

export default {
  slug: "zgtsshzy",
  title: "中国特色社会主义研究 — 当期目录",
  home: LIST_URL,
  description:
    "《中国特色社会主义研究》（ISSN 1006-6470）最新一期文章，全文来自期刊 RichHTML 版。",

  async getItems() {
    const { items, issueDate } = await parseCurrentIssue();

    await mapWithLimit(items.slice(0, MAX_ITEMS), ITEM_CONCURRENCY, async (item) => {
      try {
        const html = await fetchArticleBody(item.fullTextUrl, {
          base: ORIGIN,
          container: (el) => el.getAttribute("id") === "art_content",
        });
        // 正文进 CDATA，需把实体还原为真实字符。HTMLRewriter 不解码
        // 数字字符引用（如 &#x000B7;），经 utils 的 XML 转义后变成
        // &amp;#x000B7;，故解码两遍。
        item.bodyHtml = html
          ? decodeHtmlEntities(decodeHtmlEntities(html))
          : null;
      } catch (err) {
        console.error(`failed to fetch body for ${item.link}:`, err);
      }
    });

    for (const item of items) delete item.fullTextUrl;
    return items.map((item) => ({ ...item, date: issueDate }));
  },
};

// ---------------------------------------------------------------------------
// 当期目录列表解析
//
// 每篇文章是一个 <DIV id='artNNNN'> 块，块内依次有：
//   - <a class="txt_biaoti" href="...abstract/abstractNNNN.shtml">标题</a>
//   - <span class="abs_zuozhe">作者</span>
//   - onclick="lsdy1('RICH_HTML',...) 内嵌 RichHTML 全文页路径
//   - <div id="AbstractNNNN" class="white_content"><p>摘要</p></div>
// 栏目名来自前面的 <DIV class=dbt_header>；刊出日期来自页头。
// ---------------------------------------------------------------------------

async function parseCurrentIssue() {
  const html = await fetchText(LIST_URL);

  const dateMatch = html.match(/刊出日期[：:]\s*(\d{4}-\d{2}-\d{2})/);
  const issueDate = dateMatch ? new Date(dateMatch[1]) : null;

  // 按标记切分：<DIV id='artNNNN'> 是文章块起点，
  // <DIV class=dbt_header> 是栏目名起点；顺序扫描以归属栏目。
  const items = [];
  let category = null;
  const markerRe = /<DIV\s+(?:id='art\d+'|class=dbt_header>)/gi;
  const marks = [];
  let m;
  while ((m = markerRe.exec(html)) !== null) {
    marks.push({
      idx: m.index,
      isArticle: /^<DIV\s+id='art/i.test(m[0]),
    });
  }
  category = null;
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].idx : html.length;
    const seg = html.slice(marks[i].idx, end);
    if (!marks[i].isArticle) {
      const nameMatch = seg.match(/dbt_header>(.*?)<\/DIV>/i);
      // 页面上存在空的 dbt_header 块，遇到时不覆盖当前栏目
      const name = nameMatch ? stripTags(nameMatch[1]) : "";
      if (name) category = name;
      continue;
    }
    const parsed = parseBlock(seg);
    if (parsed) {
      if (category) parsed.category = category;
      items.push(parsed);
    }
  }

  return { items, issueDate };
}

function parseBlock(chunk) {
  // 属性顺序不定（href 可能在 class 前），先取整个 <a> 再从中提取 href
  const linkM = chunk.match(/<a[^>]*class="txt_biaoti"[^>]*>([\s\S]*?)<\/a>/i);
  if (!linkM) return null;
  const href = linkM[0].match(/href="([^"]+)"/i)?.[1];
  if (!href) return null;

  const authorM = chunk.match(/<span class="abs_zuozhe">([\s\S]*?)<\/span>/);
  const richM = chunk.match(
    /lsdy1\('RICH_HTML','\d+','[^']*','\d+','([^']+)'\)/i
  );
  const absM = chunk.match(
    /<div id="Abstract\d+"[^>]*>([\s\S]*?)<\/div>/i
  );

  return {
    title: stripTags(linkM[1]),
    link: new URL(href, ORIGIN).href,
    description: absM ? stripTags(absM[1]) : "",
    authors: authorM
      ? splitAuthors(stripTags(authorM[0]))
      : [],
    fullTextUrl: richM ? new URL(richM[1], ORIGIN).href : null,
    bodyHtml: null,
  };
}

function splitAuthors(s) {
  return s
    .split(/[,，、]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function stripTags(s) {
  return decodeHtmlEntities(
    s
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}
