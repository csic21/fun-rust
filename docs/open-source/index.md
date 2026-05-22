# 开源读码栏目

这里不是“项目推荐列表”，而是一组长期更新的 Rust 开源项目精读。每个项目都遵守同一套规则：

- 先把源码 checkout 放在 `third_party/<project>/`，并由 `.gitignore` 忽略。
- 每篇文章写明本地路径、上游仓库、精读提交和许可证。
- 只从一条能跑通的小入口开始，不把新手一口推到最复杂模块。
- 讲解必须能在本地源码里找到证据：函数名、类型名、文件路径和调用链都要可核对。
- 每篇最后给出练习、过关标准和“暂时不要读哪里”，让读者能循序渐进扩展地图。

::: tip 怎么读这一栏
先读一个项目的一条主线，不要同时打开十几个模块。真正的能力不是“看过很多文件”，而是能说清一个值从哪里来、经过哪些类型、最后到哪里去。
:::

## 当前项目

| 项目 | 入口 | 适合练什么 |
| --- | --- | --- |
| [SWC：从小入口走进编译器](/open-source/swc) | `crates/swc-ast-explorer/src/main.rs` | parser、AST、`SourceMap`、错误恢复、visitor、codegen 接口 |
| [mdBook：从 CLI 看文档构建器](/open-source/mdbook) | `src/main.rs` 和 `src/cmd/build.rs` | CLI 分发、配置读取、递归数据结构、预处理器、renderer trait |
| [rust-analyzer：从补全请求看 IDE 编译器](/open-source/rust-analyzer) | `crates/rust-analyzer/src/main_loop.rs` 和 `crates/ide-completion/src/lib.rs` | LSP、增量数据库、syntax/HIR、补全、Cargo 项目模型、测试 fixture |

## 栏目路线

建议按这个顺序读：

1. 先读 mdBook。它是命令行工具，输入 Markdown 和 TOML，输出静态网页，业务模型更贴近日常工具。
2. 再读 SWC。它是编译器项目，文件更多、概念更硬，但从 `swc-ast-explorer` 进入可以把坡度降下来。
3. 再读 rust-analyzer。它比 SWC 更贴近日常开发体验，但架构更分层：LSP 只是外壳，IDE API、HIR、syntax、salsa 和 Cargo loading 要放到同一张图里。
4. 之后再加入更多项目时，优先选“有清晰小入口”的项目，而不是只看名气。

## 读码模板

后续每个项目都尽量保持这个结构：

```text
项目背景
  -> 本地 checkout 和提交证据
  -> 本课目标
  -> 调用链地图
  -> 第 0 站：Cargo.toml / workspace
  -> 第 1 站：最小入口
  -> 第 2 站：核心数据结构
  -> 第 3 站：主流程
  -> 第 4 站：错误处理 / trait / feature 等 Rust 重点
  -> 跟着跑一次
  -> 小练习
  -> 过关标准
  -> 暂时不要读哪里
```

这让每篇文章可以越来越详细，但读者不会丢掉方向。
