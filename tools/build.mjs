import { mkdir, rm, cp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lessons, site, sources } from "../src/site/content.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pageShell({ title, active, body, depth = 0 }) {
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const href = (path) => `${prefix}${path}`;
  const nav = [
    `<a ${active === "home" ? "aria-current=\"page\"" : ""} href="${href("index.html")}">首页</a>`,
    ...lessons.map(
      (lesson) =>
        `<a ${active === lesson.slug ? "aria-current=\"page\"" : ""} href="${href(`lessons/${lesson.slug}.html`)}">${escapeHtml(lesson.title)}</a>`,
    ),
    `<a ${active === "sources" ? "aria-current=\"page\"" : ""} href="${href("sources.html")}">资料来源</a>`,
  ].join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(site.title)}</title>
  <link rel="stylesheet" href="${href("assets/styles.css")}">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="${href("index.html")}">
      <img class="brand-mark" src="${href("assets/fun-first-rust-logo.svg")}" alt="" aria-hidden="true">
      <span>${escapeHtml(site.title)}</span>
    </a>
    <nav aria-label="课程导航">${nav}</nav>
  </header>
  <main>${body}</main>
  <footer>
    <p>${escapeHtml(site.repoHint)} 内容依据官方文档整理，示例面向初学者简化。</p>
  </footer>
</body>
</html>`;
}

function sourceLinks(ids) {
  return ids
    .map((id) => sources[id])
    .map((source) => `<a href="${source.url}">${escapeHtml(source.label)}</a>`)
    .join(" · ");
}

function renderCode(code) {
  return `<pre><code class="language-rust">${escapeHtml(code)}</code></pre>`;
}

function renderHome() {
  const cards = lessons
    .map(
      (lesson, index) => `<a class="lesson-card" href="lessons/${lesson.slug}.html">
        <span class="step">${String(index + 1).padStart(2, "0")}</span>
        <strong>${escapeHtml(lesson.title)}</strong>
        <small>${escapeHtml(lesson.kicker)} · ${lesson.minutes} 分钟</small>
      </a>`,
    )
    .join("");

  return pageShell({
    title: "首页",
    active: "home",
    body: `<section class="hero">
      <div>
        <p class="eyebrow">Fun-first Rust</p>
        <h1>${escapeHtml(site.title)}</h1>
        <p class="lead">${escapeHtml(site.subtitle)}</p>
        <div class="hero-actions">
          <a class="button primary" href="lessons/start.html">从第一课开始</a>
          <a class="button" href="sources.html">查看权威资料</a>
        </div>
      </div>
      <img src="assets/learning-map.svg" alt="Rust 学习路线图：表达数据、组织代码、管理值、处理失败">
    </section>
    <section class="band">
      <h2>这份文档怎么降低学习曲线</h2>
      <div class="principles">
        <article><strong>一次只学一个心智模型</strong><p>每课只解决一个核心疑问，避免一上来同时塞所有权、生命周期、泛型和 trait。</p></article>
        <article><strong>图解贴着代码走</strong><p>先看值怎么流动，再看对应代码，最后用一个小练习确认理解。</p></article>
        <article><strong>资料来自权威入口</strong><p>主线参考官方 Rust Book，示例参考 Rust By Example，API 查标准库。</p></article>
      </div>
    </section>
    <section class="lessons">
      <h2>学习路径</h2>
      <div class="lesson-grid">${cards}</div>
    </section>`,
  });
}

function renderLesson(lesson, index) {
  const points = lesson.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  const next = lessons[index + 1];
  const previous = lessons[index - 1];
  return pageShell({
    title: lesson.title,
    active: lesson.slug,
    depth: 1,
    body: `<article class="lesson">
      <header class="lesson-hero">
        <div>
          <p class="eyebrow">第 ${index + 1} 课 · ${lesson.minutes} 分钟</p>
          <h1>${escapeHtml(lesson.title)}</h1>
          <p class="lead">${escapeHtml(lesson.kicker)}</p>
        </div>
        <img src="../assets/${lesson.asset}" alt="${escapeHtml(lesson.title)}图解">
      </header>
      <section class="lesson-body">
        <p class="intro">${escapeHtml(lesson.intro)}</p>
        <h2>先记住这几件事</h2>
        <ul>${points}</ul>
        <h2>代码放在眼前</h2>
        ${renderCode(lesson.code)}
        <aside class="try">
          <strong>动手 3 分钟</strong>
          <p>${escapeHtml(lesson.tryIt)}</p>
        </aside>
        <p class="sources">参考：${sourceLinks(lesson.sourceIds)}</p>
      </section>
      <nav class="pager" aria-label="上一课和下一课">
        ${previous ? `<a href="${previous.slug}.html">← ${escapeHtml(previous.title)}</a>` : "<span></span>"}
        ${next ? `<a href="${next.slug}.html">${escapeHtml(next.title)} →</a>` : `<a href="../sources.html">资料来源 →</a>`}
      </nav>
    </article>`,
  });
}

function renderSources() {
  const items = sources
    .map(
      (source) => `<article class="source-item">
        <h2><a href="${source.url}">${escapeHtml(source.title)}</a></h2>
        <p><strong>${escapeHtml(source.label)}</strong>：${escapeHtml(source.note)}</p>
      </article>`,
    )
    .join("");
  return pageShell({
    title: "资料来源",
    active: "sources",
    body: `<section class="plain">
      <p class="eyebrow">References</p>
      <h1>资料来源</h1>
      <p class="lead">这不是重新发明一本 Rust 书，而是把官方材料拆成更平缓的入口。需要深入时，直接回到这些原始资料。</p>
      <div class="source-list">${items}</div>
    </section>`,
  });
}

export async function buildSite() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, "lessons"), { recursive: true });
  await mkdir(join(dist, "assets"), { recursive: true });
  await cp(join(root, "src/assets"), join(dist, "assets"), { recursive: true });

  const pages = [
    { path: "index.html", html: renderHome() },
    ...lessons.map((lesson, index) => ({
      path: `lessons/${lesson.slug}.html`,
      html: renderLesson(lesson, index),
    })),
    { path: "sources.html", html: renderSources() },
  ];

  for (const page of pages) {
    await writeFile(join(dist, page.path), page.html);
  }

  return { pages };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildSite();
}
