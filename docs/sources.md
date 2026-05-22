# 资料来源

这不是替代官方书，而是把官方材料拆成更平缓、更适合中文学习者进入的路径。需要深入时，优先回到这些来源。

> 本站是独立学习项目，未获得 Rust Project 或 Rust Foundation 的官方背书、赞助或认可。课程图片除特别说明外为本项目自有提示词生成的 AI 生成图片或项目内原创图形。

本站的代码和教学内容采用分层授权，详见 [许可说明](/license)。第三方前端依赖的开源许可证和通知随站点发布在 [THIRD_PARTY_NOTICES.txt](/THIRD_PARTY_NOTICES.txt)。

| 资料 | 用途 |
| --- | --- |
| [The Rust Programming Language](https://doc.rust-lang.org/book/) | 主线概念：安装、变量、所有权、结构体、枚举、泛型、trait、生命周期、测试、智能指针、并发、模式和 unsafe 入门。 |
| [Rust By Example](https://doc.rust-lang.org/rust-by-example/) | 用可运行小程序理解语法、表达式、闭包、迭代器、错误处理、标准库和宏等常见写法。 |
| [Rust Standard Library](https://doc.rust-lang.org/std/) | 查 `String`、`Vec<T>`、`HashMap<K, V>`、`Option<T>`、`Result<T, E>`、迭代器、线程、同步原语和基础 trait。 |
| [The Cargo Book](https://doc.rust-lang.org/cargo/) | 理解 `cargo new`、`cargo run`、依赖管理、feature、workspace、测试、发布和常用 Cargo 命令。 |
| [Cargo Reference](https://doc.rust-lang.org/cargo/reference/) | 查询 `Cargo.toml` 字段、依赖解析、lockfile、resolver、MSRV 和发布元数据等细节。 |
| [Edition Guide](https://doc.rust-lang.org/edition-guide/) | 了解 Rust edition 的迁移规则，尤其是 Rust 2024 带来的语义和 Cargo 默认行为变化。 |
| [Rust Reference](https://doc.rust-lang.org/reference/) | 需要精确定义时使用：表达式、类型、trait、生命周期、宏、unsafe、ABI 和语言语义。 |
| [Asynchronous Programming in Rust](https://rust-lang.github.io/async-book/) | 异步 Rust 的官方学习入口：`Future`、`.await`、runtime、任务调度、pinning 和生态边界。 |
| [The Rustonomicon](https://doc.rust-lang.org/nomicon/) | 高级和 unsafe 主题参考：别名规则、生命周期细节、所有权底层模型、FFI 和不安全抽象边界。 |
| [rustdoc Book](https://doc.rust-lang.org/rustdoc/) | 写 API 文档、运行文档测试、配置文档生成和发布库文档。 |
| [Clippy](https://doc.rust-lang.org/clippy/) | 学习常见 lint、代码风格建议和工程质量检查。 |
| [Rustlings](https://rustlings.rust-lang.org/) | 把阅读变成练习，适合每学完一章做几个小题。 |
| [SWC source code](https://github.com/swc-project/swc) | “开源读码”栏目使用的真实 Rust 项目源码；本仓库本地 checkout 位于被 `.gitignore` 忽略的 `third_party/swc/`，当前读码基于提交 `3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d`。 |
| [SWC architecture notes](https://github.com/swc-project/swc/blob/main/ARCHITECTURE.md) | 用来核对 SWC 内部结构：`swc_common`、`swc_ecma_ast`、`swc_ecma_parser`、`swc_ecma_codegen`、transform、测试策略等。 |
| [mdBook source code](https://github.com/rust-lang/mdBook) | “开源读码”栏目使用的真实 Rust 项目源码；本仓库本地 checkout 位于被 `.gitignore` 忽略的 `third_party/mdbook/`，当前读码基于提交 `0ea415897758ea9b2904ed47ba9cb4901f9eb089`。 |
| [mdBook User Guide](https://rust-lang.github.io/mdBook/) | 用来核对 mdBook 用户侧行为：初始化、构建、目录格式、配置、预处理器和后端扩展。 |
| [rust-analyzer source code](https://github.com/rust-lang/rust-analyzer) | “开源读码”栏目使用的真实 Rust IDE 项目源码；本仓库本地 checkout 位于被 `.gitignore` 忽略的 `third_party/rust-analyzer/`，当前读码基于提交 `56dc60dd17ff8f527fdd1732a179e47c4eb244f5`。 |
| [rust-analyzer manual](https://rust-analyzer.github.io/book/) | 用来核对 rust-analyzer 的安装、配置、功能、诊断、隐私安全和贡献文档。 |
| [rust-analyzer architecture notes](https://rust-analyzer.github.io/book/contributing/architecture.html) | 用来核对 rust-analyzer 的 LSP server、`Analysis` API、syntax/HIR、salsa 增量数据库、宏系统、测试和可观测性设计。 |

## 本站如何使用这些资料

- 初学章节以 Rust Book 和 Rust By Example 为主，目标是建立能运行、能修改、能读错误的反馈循环。
- 中级章节以 Rust Book、标准库、Cargo Book、Cargo Reference、Edition Guide 和 rustdoc Book 为主，目标是补齐工程结构、抽象边界和测试习惯。
- 高级章节会参考 Rust Reference、Async Book 和 Rustonomicon，但只把安全使用边界讲清楚，不鼓励新手过早写 unsafe。
- 实战章节会把官方概念组合成小项目，帮助你从“看懂片段”过渡到“能组织一个程序”。
- 开源读码栏目会引用具体上游提交和本地忽略目录中的源码，以当前源码为准，不凭记忆解释项目结构。
