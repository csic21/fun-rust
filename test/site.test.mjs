import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(path, "utf8");
}

test("site uses VitePress with a beginner-friendly lesson structure", () => {
  const config = read("docs/.vitepress/config.mts");
  const packageJson = JSON.parse(read("package.json"));
  const lessons = readdirSync("docs/lessons").filter((file) => file.endsWith(".md"));

  assert.match(packageJson.scripts.build, /vitepress build docs/);
  assert.match(packageJson.scripts.dev, /vitepress dev docs/);
  assert.match(config, /defineConfig/);
  assert.match(config, /local/);
  assert.match(config, /\/images\/fun-first-rust-logo\.svg/);
  assert.match(config, /srcExclude:\s*\["superpowers\/\*\*"\]/);
  assert.match(config, /link:\s*"\/license"/);
  assert.doesNotMatch(config, /logo:\s*"\/images\/rust-learning-journey\.png"/);
  assert.ok(lessons.length >= 19);

  const home = read("docs/index.md");
  assert.match(home, /Rust 轻松入门/);
  assert.match(home, /\/images\/rust-learning-journey\.png/);
  assert.match(home, /从第一课开始/);
});

test("lessons are rich, progressive, and emphasize ownership clearly", () => {
  const start = read("docs/lessons/start.md");
  const ownership = read("docs/lessons/ownership.md");
  const borrowing = read("docs/lessons/borrowing.md");
  const project = read("docs/lessons/collections-project.md");

  assert.match(start, /cargo run/);
  assert.match(start, /过关标准/);
  assert.match(ownership, /谁拿钥匙，谁负责值/);
  assert.match(ownership, /borrow of moved value/);
  assert.match(ownership, /移动/);
  assert.match(ownership, /借用/);
  assert.match(ownership, /clone/);
  assert.match(ownership, /作用域/);
  assert.match(ownership, /暂时不要急着学生命周期/);
  assert.ok(ownership.split("\n").length > 250);
  assert.match(borrowing, /很多读，或一个写/);
  assert.match(borrowing, /切片/);
  assert.match(project, /&mut Vec<Lesson>/);
  assert.match(project, /HashMap/);
});

test("intermediate and advanced tracks cover the requested Rust knowledge map", () => {
  const expectedFiles = [
    "modules-crates.md",
    "generics-traits-lifetimes.md",
    "iterators-closures.md",
    "testing-docs.md",
    "smart-pointers.md",
    "concurrency.md",
    "async.md",
    "unsafe-ffi.md",
    "performance.md",
    "cli-practice.md",
    "advanced-projects.md",
  ];

  for (const file of expectedFiles) {
    assert.ok(existsSync(`docs/lessons/${file}`), `${file} should exist`);
  }

  const modules = read("docs/lessons/modules-crates.md");
  const generics = read("docs/lessons/generics-traits-lifetimes.md");
  const iterators = read("docs/lessons/iterators-closures.md");
  const testing = read("docs/lessons/testing-docs.md");
  const smartPointers = read("docs/lessons/smart-pointers.md");
  const concurrency = read("docs/lessons/concurrency.md");
  const asyncRust = read("docs/lessons/async.md");
  const unsafeFfi = read("docs/lessons/unsafe-ffi.md");
  const performance = read("docs/lessons/performance.md");
  const cliPractice = read("docs/lessons/cli-practice.md");

  assert.match(modules, /workspace/);
  assert.match(modules, /feature/);
  assert.match(generics, /trait/);
  assert.match(generics, /生命周期/);
  assert.match(iterators, /闭包/);
  assert.match(iterators, /into_iter/);
  assert.match(testing, /doc test/);
  assert.match(testing, /cargo clippy/);
  assert.match(smartPointers, /Rc<RefCell<T>>/);
  assert.match(concurrency, /Arc<Mutex<T>>/);
  assert.match(asyncRust, /Future/);
  assert.match(asyncRust, /runtime/);
  assert.match(unsafeFfi, /# Safety/);
  assert.match(unsafeFfi, /FFI/);
  assert.match(performance, /cargo build --release/);
  assert.match(cliPractice, /parse_lesson/);
});

test("project-bound illustrations are generated bitmap assets, not svg references", () => {
  for (const image of [
    "rust-learning-journey.png",
    "ownership-transfer.png",
    "borrowing-rules.png",
    "result-errors.png",
    "function-ownership-call.png",
    "start-process.png",
    "variables-types-map.png",
    "functions-control-flow.png",
    "structs-enums-shapes.png",
    "borrowing-rules-process.png",
    "errors-result-flow.png",
    "collections-iterator-pipeline.png",
    "modules-crates-tree.png",
    "generics-traits-lifetimes-map.png",
    "iterators-closures-capture.png",
    "testing-docs-pyramid.png",
    "smart-pointers-choice.png",
    "concurrency-message-state.png",
    "async-runtime-flow.png",
    "unsafe-ffi-boundary.png",
    "performance-release-loop.png",
    "cli-practice-architecture.png",
    "advanced-projects-roadmap.png",
  ]) {
    assert.ok(existsSync(`docs/public/images/${image}`));
  }

  const lessonFiles = readdirSync("docs/lessons")
    .filter((file) => file.endsWith(".md"))
    .map((file) => `docs/lessons/${file}`);
  const markdown = ["docs/index.md", ...lessonFiles].map(read).join("\n");
  const imageRefs = [...markdown.matchAll(/!\[[^\]]*]\(\/images\/([^)]+\.png)\)/g)].map((match) => match[1]);

  assert.doesNotMatch(markdown, /\.svg/);
  assert.ok(imageRefs.length >= lessonFiles.length);
  for (const image of imageRefs) {
    assert.ok(existsSync(`docs/public/images/${image}`), `${image} should exist`);
  }
  assert.match(markdown, /\/images\/ownership-transfer\.png/);
  assert.match(markdown, /\/images\/borrowing-rules\.png/);
  assert.match(markdown, /\/images\/result-errors\.png/);
  assert.match(markdown, /\/images\/function-ownership-call\.png/);
});

test("authoritative sources remain visible", () => {
  const sources = read("docs/sources.md");
  for (const expected of [
    "The Rust Programming Language",
    "Rust By Example",
    "Rust Standard Library",
    "The Cargo Book",
    "Rust Reference",
    "Asynchronous Programming in Rust",
    "The Rustonomicon",
    "rustdoc Book",
    "Clippy",
    "Rustlings",
  ]) {
    assert.match(sources, new RegExp(expected));
  }
});

test("copyright and image provenance notes are visible", () => {
  const readme = read("README.md");
  const sources = read("docs/sources.md");
  const contentLicense = read("CONTENT_LICENSE.md");
  const siteLicense = read("docs/license.md");
  const mitLicense = read("LICENSE");
  const notices = read("docs/public/THIRD_PARTY_NOTICES.txt");
  const combined = `${readme}\n${sources}\n${contentLicense}\n${siteLicense}`;

  assert.match(combined, /独立学习项目/);
  assert.match(combined, /未获得 Rust Project 或 Rust Foundation 的官方背书/);
  assert.match(combined, /课程图片/);
  assert.match(combined, /AI 生成/);
  assert.match(combined, /MIT License/);
  assert.match(combined, /CC BY-NC-SA 4\.0|Attribution-NonCommercial-ShareAlike 4\.0/);
  assert.match(combined, /\/license|许可说明/);
  assert.match(combined, /THIRD_PARTY_NOTICES\.txt/);
  assert.match(mitLicense, /Permission is hereby granted/);
  assert.match(notices, /License Summary/);
  assert.match(notices, /MIT:/);
  assert.match(notices, /BSD-3-Clause:/);
});

test("every lesson has a complete learning loop", () => {
  const lessons = readdirSync("docs/lessons")
    .filter((file) => file.endsWith(".md"))
    .sort();

  for (const file of lessons) {
    const text = read(`docs/lessons/${file}`);
    assert.match(text, /本课目标|项目目标|能力目标/, `${file} should state learning goals`);
    assert.match(text, /练习|动手|任务|继续扩展/, `${file} should include practice`);
    assert.match(text, /过关标准/, `${file} should include a completion standard`);
  }
});

test("core lessons teach compiler-error driven practice", () => {
  const expectedLabs = {
    "variables-types.md": [/错误实验室/, /cannot assign twice to immutable variable/],
    "functions-flow.md": [/错误实验室/, /expected `i32`, found `\(\)`/],
    "structs-enums.md": [/错误实验室/, /field .* of struct .* is private/],
    "borrowing.md": [/错误实验室/, /cannot borrow .* as mutable more than once/],
    "errors.md": [/错误实验室/, /the `\?` operator can only be used/],
    "generics-traits-lifetimes.md": [/错误实验室/, /the trait bound .* is not satisfied/],
  };

  for (const [file, patterns] of Object.entries(expectedLabs)) {
    const text = read(`docs/lessons/${file}`);
    for (const pattern of patterns) {
      assert.match(text, pattern, `${file} should include ${pattern}`);
    }
  }
});

test("site exposes a through-line project and modern Rust engineering guidance", () => {
  const home = read("docs/index.md");
  const variables = read("docs/lessons/variables-types.md");
  const structs = read("docs/lessons/structs-enums.md");
  const errors = read("docs/lessons/errors.md");
  const performance = read("docs/lessons/performance.md");
  const sources = read("docs/sources.md");

  assert.match(home, /贯穿项目：课程清单工具/);
  assert.match(home, /Checkpoint 1/);
  assert.match(home, /Checkpoint 5/);
  assert.match(variables, /课程清单工具 Checkpoint 1/);
  assert.match(structs, /课程清单工具 Checkpoint 2/);
  assert.match(errors, /课程清单工具 Checkpoint 3/);

  for (const expected of [
    /edition = "2024"/,
    /resolver = "3"/,
    /rust-version/,
    /MSRV/,
    /cargo tree -d/,
    /cargo update -p/,
  ]) {
    assert.match(performance, expected);
  }

  assert.match(sources, /Edition Guide/);
  assert.match(sources, /Cargo Reference/);
});

test("advanced topics include when-not-to-use guidance", () => {
  for (const file of [
    "smart-pointers.md",
    "concurrency.md",
    "async.md",
    "unsafe-ffi.md",
    "performance.md",
  ]) {
    const text = read(`docs/lessons/${file}`);
    assert.match(text, /什么时候不用|什么时候先不用|不要用它的场景/, `${file} should explain when to avoid the tool`);
  }
});

test("new visual explanations are present where abstract ideas need support", () => {
  const expected = {
    "docs/index.md": "lesson-cli-checkpoints.png",
    "docs/lessons/variables-types.md": "compiler-error-lab.png",
    "docs/lessons/functions-flow.md": "return-unit-error.png",
    "docs/lessons/structs-enums.md": "status-enum-state-machine.png",
    "docs/lessons/borrowing.md": "mutable-borrow-conflict.png",
    "docs/lessons/errors.md": "question-mark-error-flow.png",
    "docs/lessons/generics-traits-lifetimes.md": "trait-bound-contract.png",
    "docs/lessons/performance.md": "modern-cargo-tooling.png",
  };

  for (const [file, image] of Object.entries(expected)) {
    assert.match(read(file), new RegExp(`/images/${image}`), `${file} should reference ${image}`);
    assert.ok(existsSync(`docs/public/images/${image}`), `${image} should exist`);
  }
});

test("custom theme preserves dark-mode color tokens", () => {
  const themeCss = read("docs/.vitepress/theme/custom.css");

  assert.match(themeCss, /\.dark\s*{/);
  assert.match(themeCss, /--vp-c-bg:\s*#[0-9a-f]{6}/i);
  assert.match(themeCss, /--vp-c-text-1:\s*#[0-9a-f]{6}/i);
  assert.doesNotMatch(themeCss, /background:\s*white;/);
  assert.match(themeCss, /--lesson-image-bg/);
  assert.match(themeCss, /--lesson-tip-bg/);
  assert.match(themeCss, /--lesson-warning-bg/);
});

test("article images are wired for medium-zoom previews", () => {
  const packageJson = JSON.parse(read("package.json"));
  const themeEntry = read("docs/.vitepress/theme/index.ts");
  const themeCss = read("docs/.vitepress/theme/custom.css");

  assert.match(packageJson.devDependencies["medium-zoom"], /^\^?\d/);
  assert.match(themeEntry, /vitepress\/theme-without-fonts/);
  assert.match(themeEntry, /import\("medium-zoom"\)/);
  assert.match(themeEntry, /onContentUpdated/);
  assert.match(themeEntry, /\.vp-doc :not\(a\) > img:not\(.image-src\)/);
  assert.match(themeEntry, /zoom\.detach\(\)/);
  assert.match(themeEntry, /zoom\.attach\(imageZoomSelector\)/);
  assert.match(themeCss, /cursor:\s*zoom-in/);
  assert.match(themeCss, /\.medium-zoom-overlay/);
  assert.match(themeCss, /\.medium-zoom-image--opened/);
});
