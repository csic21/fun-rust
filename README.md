# Rust 轻松入门

一个 VitePress 文档站，用中文、图解、短代码和小练习降低 Rust 学习坡度。内容从初学者入门一路铺到中级抽象、高级工程和项目实践，重点把所有权、借用、错误处理、trait、生命周期、并发、异步和 unsafe 边界拆成可练习的台阶。

## 使用

```bash
pnpm test
pnpm build
pnpm dev
```

构建结果在 `dist/`。开发预览使用 VitePress，默认监听 `127.0.0.1`。

## 结构

- `docs/.vitepress/config.mts`：VitePress 配置、导航和侧边栏
- `docs/.vitepress/theme/custom.css`：文档站视觉样式
- `docs/lessons/*.md`：循序渐进的 Rust 课程，覆盖入门基础、核心机制、中级进阶、高级主题和实践教程
- `docs/open-source/*.md`：开源读码栏目，从被 `.gitignore` 忽略的真实 Rust 项目源码 checkout 中取证讲解
- `docs/public/images/*.png`：使用 imagegen 生成的课程插图
- `test/site.test.mjs`：站点结构、内容深度和资源引用校验

## 内容依据

主线参考官方 Rust Book，示例参考 Rust By Example，API 和标准类型参考 Rust Standard Library，项目与工具链参考 The Cargo Book 和 Rustlings；中高级主题补充参考 Rust Reference、Async Book、Rustonomicon、rustdoc Book 和 Clippy 文档。开源读码栏目会引用具体上游项目提交，例如当前 SWC 读码基于 `third_party/swc/`，mdBook 读码基于 `third_party/mdbook/`，这些目录都在被忽略的 `third_party/` 下。

## 版权和商标说明

本站是独立学习项目，未获得 Rust Project 或 Rust Foundation 的官方背书、赞助或认可。文中使用 Rust 名称仅用于指代 Rust 编程语言。

除特别说明外，课程图片为本项目自有提示词生成的 AI 生成图片或项目内原创图形，不使用 Rust 官方 logo、Cargo logo、Rust Foundation logo、Ferris 吉祥物或第三方课程素材。

代码、构建脚本、主题代码、测试和课程中的代码示例使用 MIT License。课程正文、图解、AI 生成图片、学习路线等非代码教学内容使用 CC BY-NC-SA 4.0。详细边界见 `CONTENT_LICENSE.md` 和站点内的 `/license` 页面。

第三方前端依赖的开源许可证和通知见 `docs/public/THIRD_PARTY_NOTICES.txt`，构建后会随站点发布。
