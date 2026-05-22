# 开源读码：从补全请求看懂 rust-analyzer

rust-analyzer 是 Rust 生态里最值得精读的 IDE 项目之一。它不是一个“调用 `rustc` 然后把结果展示出来”的薄壳，而是一个长期运行的、增量更新的、对不完整代码也要尽量给答案的 Rust 语义分析系统。

用户看到的是补全、跳转、引用查找、重命名、诊断、inlay hints、语义高亮和代码操作；源码里真正支撑这些能力的是 LSP 服务器、虚拟文件系统、Cargo 项目模型、lossless syntax tree、HIR、宏展开、名字解析、类型推断、salsa 增量数据库和大量专门面向 IDE 的 API 边界。

本页不从最深的类型求解器开始。我们先追一条最常见、最容易验证的真实路径：用户在编辑器里触发补全，rust-analyzer 如何从 `textDocument/completion` 一路走到 `CompletionList`。这条路会自然经过全项目的主要边界，所以很适合把整个项目分析清楚。

本页基于本仓库内的源码 checkout：

- 本地路径：`third_party/rust-analyzer/`
- 当前提交：[`56dc60dd17ff8f527fdd1732a179e47c4eb244f5`](https://github.com/rust-lang/rust-analyzer/tree/56dc60dd17ff8f527fdd1732a179e47c4eb244f5)，提交日期 `2026-05-22`
- 上游仓库：[rust-lang/rust-analyzer](https://github.com/rust-lang/rust-analyzer)
- 上游许可证：MIT OR Apache-2.0。源码目录已被 `.gitignore` 忽略，本站只引用它作为读码材料，不把第三方源码发布进本站内容。
- workspace 信息：根 `Cargo.toml` 使用 `edition = "2024"`，`rust-version = "1.95"`，workspace 成员包括 `xtask/`、`lib/*`、`lib/ungrammar/ungrammar2json` 和 `crates/*`。

![rust-analyzer 读码路线：编辑器、LSP、IDE API、HIR、base-db 和 syntax 的入口关系](/images/rust-analyzer-reading-route.png)

::: tip 读码姿势
今天只追一条“能从编辑器动作走到 IDE 结果”的路径：补全请求。先把 `main_loop`、`handle_completion`、`Analysis::completions` 和 `CompletionContext::new` 串起来，再回看 `base-db`、`syntax`、`hir` 和 `ide-db` 为什么这样分层。
:::

## 先把我们的要点钉住

rust-analyzer 的代码很大，入口很多。如果不先定要点，很容易今天看 LSP，明天看 parser，后天看 trait solver，最后每块都摸过一点，但没有一条完整路径。

这篇文档要讲清楚这些事：

- **它是 IDE-first 编译器前端**：它要在用户代码还没写完、项目还没完全能编译时，依然尽量回答“这里有什么”“这个名字指向哪里”“这个表达式是什么类型”。
- **LSP 只是外壳**：`crates/rust-analyzer` 负责 JSON/LSP、线程、请求分发和协议转换；真正的 IDE 能力在 `crates/ide` 及其子功能 crate。
- **输入状态和派生状态分开**：文件内容、source roots、crate graph 是输入；语法树、ItemTree、DefMap、类型推断结果是按需派生。
- **核心不碰 IO**：Cargo、文件系统、proc macro 进程、编辑器协议都在边界层；语义分析核心通过 `Change` 和数据库输入看世界。
- **增量是架构目标，不是优化补丁**：`ItemTree`、`AstIdMap`、稳定 ID、per-function inference 都是在减少“打一空格就重算全项目”的代价。
- **读码要从 API 边界走**：`AnalysisHost`/`Analysis`、`hir::Semantics`、`ide` 的 public POD 类型，是比内部 query 更适合新手建立地图的入口。

![rust-analyzer crate 分层地图：LSP、ide、hir、base-db、syntax、project-model、vfs 和宏边界](/images/rust-analyzer-crate-map.png)

这张图是本文的全局地图。读到某个文件时，先问它属于哪一层：

- `crates/rust-analyzer`：面向编辑器和 LSP 协议。
- `crates/ide`：面向“编辑器想问什么”的稳定门面。
- `crates/ide-*`：补全、assists、diagnostics、SSR 等具体能力。
- `crates/hir`：语义模型门面，帮你从 syntax node 找到定义、类型和作用域。
- `crates/hir-*`：宏展开、名字解析、类型推断等内部引擎。
- `crates/base-db` / `crates/ide-db`：salsa 数据库、输入状态和 IDE 共享查询。
- `crates/parser` / `crates/syntax`：Rust 语法解析和 lossless syntax tree。
- `crates/project-model` / `crates/load-cargo` / `crates/vfs`：把真实项目、Cargo、sysroot 和文件系统变成分析器输入。

## 本课目标

读完这一页，你应该能做到七件事：

- 说清 `textDocument/completion` 从 `main_loop` 到 `CompletionList` 的调用链。
- 分清 `GlobalState`、`AnalysisHost`、`Analysis` 和 `RootDatabase` 的职责。
- 解释为什么 `crates/rust-analyzer` 不应该把 LSP 类型漏进 `crates/ide` 或 `crates/hir`。
- 看懂 `FileChange` 如何把 VFS 变化变成 salsa 输入。
- 解释 parser、syntax、ItemTree、DefMap、HIR、type inference 之间的顺序。
- 知道 macro、proc macro、Cargo、VFS、flycheck 为什么都在“边界层”。
- 知道给 rust-analyzer 贡献代码时，该从哪类测试和 fixture 开始。

## 一条主线：补全请求调用链

先把路线画成一条线：

```text
编辑器触发 textDocument/completion
  -> crates/rust-analyzer/src/main_loop.rs
  -> RequestDispatcher::on_latency_sensitive::<Completion>()
  -> crates/rust-analyzer/src/handlers/request.rs
  -> handle_completion()
  -> from_proto::file_position()
  -> snap.config.completion(...)
  -> snap.analysis.completions(...)
  -> crates/ide/src/lib.rs
  -> Analysis::completions()
  -> crates/ide-completion/src/lib.rs
  -> ide_completion::completions()
  -> CompletionContext::new()
  -> fake ident + reparse
  -> expand_and_analyze()
  -> classify_name_ref() / classify_name()
  -> complete_* routines
  -> crates/rust-analyzer/src/lsp/to_proto.rs
  -> to_proto::completion_items()
  -> lsp_types::CompletionList
```

这条线不覆盖所有 rust-analyzer 功能，但它覆盖了最重要的横切边界：LSP、配置、文件位置转换、Analysis 快照、语法补洞、语义查询、功能插件和协议序列化。

![rust-analyzer 一次补全请求的真实路径：从编辑器 completion 到 CompletionList](/images/rust-analyzer-completion-flow.png)

图里有两个方向要特别注意：

- 上半段是“请求从编辑器进来”：LSP -> handler -> `Analysis`。
- 下半段是“补全引擎内部工作”：补一个临时标记、分析上下文、运行 completion routines、转回 LSP。

如果只看 `complete_dot()`，你会误以为补全就是“查字段和方法”。如果只看 `handle_completion()`，你又会误以为补全只是“协议转换”。真正的补全发生在两者之间：先把不完整代码变成可分析上下文，再让多个小 completion routine 往结果集中加候选项。

## 全项目地图：这不是单 crate 项目

根目录 `Cargo.toml` 的 `[workspace]` 非常重要。当前 checkout 的 workspace 成员是：

```toml
members = ["xtask/", "lib/*", "lib/ungrammar/ungrammar2json", "crates/*"]
exclude = ["crates/proc-macro-srv/proc-macro-test/imp"]
resolver = "2"
```

这说明 rust-analyzer 至少有三类 Rust 代码：

| 区域 | 代表路径 | 职责 |
| --- | --- | --- |
| 主体内部 crate | `crates/*` | LSP server、IDE API、HIR、syntax、database、Cargo loading、proc macro 等。 |
| 可发布小库 | `lib/*` | `line-index`、`la-arena`、`lsp-server`、`text-size`、`smol_str`、`ungrammar` 等独立库。 |
| 工程任务 | `xtask/` | 代码生成、安装、发布、文档生成和仓库维护任务。 |

仓库里还有 `editors/code/`，这是 VS Code 插件侧代码，但它不是根 Cargo workspace 成员。读 rust-analyzer 主体时，不要一开始就钻插件。先看 server 和 `ide` API；插件只是其中一个客户端。

## `lib/` 为什么不直接用本地路径

`lib/README.md` 说得很清楚：这些 crate 会发布到 crates.io，并遵守 semver。当前 workspace 里虽然有本地副本，但 rust-analyzer 默认从 crates.io 依赖它们，只有原型开发时才通过 `[patch.'crates-io']` 指向本地。

这个设计给新手一个很好的工程信号：并不是仓库里所有代码都属于同一稳定性层级。

- `crates/*` 大多是 rust-analyzer 内部实现，版本通常是 `0.0.0`。
- `lib/*` 是可发布库，需要更谨慎地维护 API。
- `crates/ide` 是 API 边界，但依然是 rust-analyzer 内部演化的一部分，不等于对外稳定承诺。
- LSP 协议是外部稳定边界，所以 JSON/LSP 类型集中在 server crate 里。

## 第 0 站：README 先告诉你项目定位

根 `README.md` 把 rust-analyzer 定位成 Rust 的 language server。它支持任何实现 LSP 的编辑器，例如 VS Code、Vim、Emacs、Zed 等。功能包括 go-to-definition、find-all-references、refactorings、code completion、rustfmt formatting，以及 rustc/clippy diagnostics。

更关键的是这句定位：内部由一组“分析 Rust 代码的库”组成。也就是说，language server 是产品形态，真正资产是库和分析模型。

所以读码时要分两层：

- 用户体验层：编辑器发 LSP 请求，server 返回 LSP 响应。
- 分析能力层：输入文件和 crate graph，得到可查询的语义模型。

## 第 1 站：`main.rs` 是入口，但不是最好的精读点

入口在 [`crates/rust-analyzer/src/bin/main.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/rust-analyzer/src/bin/main.rs)。

它做了几件事：

1. 解析命令行 flags。
2. 设置日志和 profile。
3. 判断是启动 LSP server，还是执行 batch CLI 子命令。
4. 如果是 LSP server，建立 `lsp_server::Connection::stdio()`。
5. 处理 initialize 参数、workspace root、client capabilities、配置。
6. 进入 `main_loop(config, connection)`。

入口里还有很多工程细节，例如 allocator feature、Windows 调试符号路径、`RUST_BACKTRACE` 默认值、额外栈空间线程、`RA_RUSTC_WRAPPER`。这些细节很真实，但第一次读不要被它们带跑。

这层最该记住的是：真正的 server 运行在 `main_loop()` 后面。

## 第 2 站：`main_loop` 把世界收束成 Event

主循环在 [`crates/rust-analyzer/src/main_loop.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/rust-analyzer/src/main_loop.rs)。

文件开头就说明它负责分发 LSP requests、replies 和 notifications。这里有一个非常适合读码的设计：事件被收束成一个 enum。

```rust
enum Event {
    Lsp(lsp_server::Message),
    Task(Task),
    DeferredTask(DeferredTask),
    Vfs(vfs::loader::Message),
    Flycheck(FlycheckMessage),
    TestResult(CargoTestMessage),
    DiscoverProject(DiscoverProjectMessage),
    FetchWorkspaces(FetchWorkspaceRequest),
}
```

这比“到处 spawn future”更适合读。你可以明确知道主循环会被哪些东西唤醒：

- 编辑器发来的 LSP 消息。
- 后台任务完成。
- VFS 文件加载或变更。
- flycheck 返回 rustc/clippy 诊断。
- 测试运行返回。
- 项目发现和 workspace reload 完成。

![rust-analyzer LSP 主循环：LSP、VFS、flycheck、task_pool 和响应的方向](/images/rust-analyzer-lsp-loop.png)

主循环的关键不是“循环”本身，而是它做选择：

- 会修改 server 状态的请求，留在主线程同步处理。
- 用户打字相关、要求低延迟的请求，要么同步快处理，要么进高优先级线程池。
- 语义查询通常拿一个不可变 `GlobalStateSnapshot` 去后台跑。
- 文件变更先进入 VFS，再由 `process_changes()` 变成数据库输入。

## 第 3 站：`GlobalState` 是 server 的可变世界

`GlobalState` 在 [`crates/rust-analyzer/src/global_state.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/rust-analyzer/src/global_state.rs)。

源码注释直接点明：`GlobalState` 是 language server 的主要可变状态。它最重要的成员包括：

| 字段 | 作用 |
| --- | --- |
| `sender` / `req_queue` | 给客户端发响应，跟踪发出的请求。 |
| `task_pool` / `fmt_pool` | 后台任务池；格式化单独一条线程，避免阻塞编辑器等待。 |
| `config` | server 配置和 client capability 影响很多功能。 |
| `analysis_host` | 增量分析数据库的可变入口。 |
| `diagnostics` | 保存 server 当前知道的诊断集合。 |
| `mem_docs` | 编辑器里打开但未落盘的文档。 |
| `vfs` | 虚拟文件系统快照。 |
| `workspaces` | Cargo、sysroot、rust-project.json 等项目模型。 |
| `fetch_*_queue` | workspace、build data、proc macro、prime caches 的操作队列。 |

这里的要点是：`GlobalState` 不等于分析模型。它是 server 世界，包含很多外部边界。真正的语义查询在 `analysis_host` 里。

## 第 4 站：`GlobalStateSnapshot` 让后台查询能安全并发

`GlobalStateSnapshot` 同样在 `global_state.rs`。它保存：

- `config: Arc<Config>`
- `analysis: Analysis`
- `check_fixes`
- `mem_docs`
- `semantic_tokens_cache`
- `vfs`
- `workspaces`
- `proc_macros_loaded`
- `flycheck`

当某个 LSP 请求只读状态时，dispatcher 会拿一个 snapshot，把它交给后台线程。这样后台功能不用拿 `&mut GlobalState`，也就不会阻塞主循环。

这正好对应 Rust 的所有权直觉：

- `GlobalState` 是唯一可变世界。
- `GlobalStateSnapshot` 是某一刻的只读视图。
- `Analysis` 是某一刻数据库状态的查询句柄。

## 第 5 站：请求分发器是 LSP 到 handler 的路由表

分发器在 [`crates/rust-analyzer/src/handlers/dispatch.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/rust-analyzer/src/handlers/dispatch.rs)。

它提供几类方法：

| 方法 | 用途 |
| --- | --- |
| `on_sync_mut` | 需要 `&mut GlobalState` 的请求，例如 reload workspace。 |
| `on_sync` | 快速只读请求，直接当前线程处理。 |
| `on_latency_sensitive` | 用户打字相关，但需要语义分析的请求，放进高优先级线程。 |
| `on` | 普通只读请求，放进 worker 线程池。 |
| `on_fmt_thread` | rustfmt 相关请求，单独格式化线程处理。 |

补全注册在 `main_loop.rs` 的请求分发表里：

```rust
.on_latency_sensitive::<RETRY, lsp_request::Completion>(handlers::handle_completion)
.on_latency_sensitive::<RETRY, lsp_request::ResolveCompletionItem>(handlers::handle_completion_resolve)
```

这说明补全有两个产品约束：

- 它跟用户打字强相关，需要低延迟。
- 它可能做语义分析，不能直接阻塞主循环。

## 第 6 站：`handle_completion()` 做协议转换，不做补全逻辑

handler 在 [`crates/rust-analyzer/src/handlers/request.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/rust-analyzer/src/handlers/request.rs)。

`handle_completion()` 的主干可以压缩成这样：

```rust
let mut position = from_proto::file_position(&snap, text_document_position.clone())?;
let line_index = snap.file_line_index(position.file_id)?;
let completion_trigger_character = context
    .and_then(|ctx| ctx.trigger_character)
    .and_then(|s| s.chars().next());

let source_root = snap.analysis.source_root_id(position.file_id)?;
let completion_config = &snap.config.completion(Some(source_root), snap.minicore());

let items = snap.analysis.completions(
    completion_config,
    position,
    completion_trigger_character,
)?;

let items = to_proto::completion_items(..., items);
Ok(Some(lsp_types::CompletionList { is_incomplete: true, items }.into()))
```

这段展示了 server crate 的边界职责：

- 把 LSP 里的 URI/position 转成本项目内部的 `FilePosition`。
- 从配置生成 `CompletionConfig`。
- 调用 `Analysis` API。
- 把内部 `CompletionItem` 转回 LSP `CompletionItem`。

它不直接查 HIR，不直接遍历 syntax tree，也不直接计算字段和方法。这是好事：LSP 层越薄，越不容易把协议细节污染到核心分析层。

## 第 7 站：`AnalysisHost` 和 `Analysis` 是 IDE API 的入口

`AnalysisHost` 和 `Analysis` 在 [`crates/ide/src/lib.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/ide/src/lib.rs)。

`AnalysisHost` 保存当前世界：

```rust
pub struct AnalysisHost {
    db: RootDatabase,
}
```

它有三个特别重要的方法：

- `AnalysisHost::new(...)`：创建数据库。
- `analysis(&self) -> Analysis`：拿一个只读快照。
- `apply_change(&mut self, change: ChangeWithProcMacros)`：把新输入写进数据库。

`Analysis` 是快照：

```rust
pub struct Analysis {
    db: RootDatabase,
}
```

它的 public API 面向编辑器功能，例如：

- `completions`
- `goto_definition`
- `hover`
- `references`
- `rename`
- `syntax_diagnostics`
- `semantic_diagnostics`
- `inlay_hints`
- `highlight`
- `runnables`

最重要的设计说明写在 `ide/src/lib.rs` 注释里：`Analysis` API 不应该按 LSP 类型来设计，而应该按“理想 Rust IDE 需要什么”来设计。虽然当前主要消费者是 LSP server，但 API 仍然用 `FilePosition`、`FileRange`、`CompletionItem` 这类编辑器友好的内部类型。

## 第 8 站：`Analysis::completions()` 只是一层门面

`Analysis::completions()` 很短：

```rust
pub fn completions(
    &self,
    config: &CompletionConfig<'_>,
    position: FilePosition,
    trigger_character: Option<char>,
) -> Cancellable<Option<Vec<CompletionItem>>> {
    self.with_db(|db| ide_completion::completions(db, config, position, trigger_character))
}
```

这里出现两个关键词：

- `Cancellable<T>`：IDE 查询可能因为用户继续输入而取消。
- `ide_completion::completions`：真正的补全逻辑在独立 crate。

这也是 rust-analyzer 常见分层方式：`ide` crate 暴露统一 API，复杂功能拆到 `ide-completion`、`ide-assists`、`ide-diagnostics`、`ide-ssr`、`ide-db` 等 crate。

## 第 9 站：补全是两阶段流程

补全入口在 [`crates/ide-completion/src/lib.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/ide-completion/src/lib.rs)。

源码文档把补全讲成两阶段：

1. 收集 `CompletionContext`。
2. 运行一组 completion routines，把候选项加入结果。

压缩后的主干是：

```rust
let (ctx, analysis) = &CompletionContext::new(db, position, config, trigger_character)?;
let mut completions = Completions::default();

match analysis {
    CompletionAnalysis::Name(name_ctx) => complete_name(...),
    CompletionAnalysis::NameRef(name_ref_ctx) => complete_name_ref(...),
    CompletionAnalysis::Lifetime(lifetime_ctx) => ...,
    CompletionAnalysis::String { .. } => ...,
    CompletionAnalysis::CfgPredicate => complete_cfg(...),
    CompletionAnalysis::MacroSegment => complete_macro_segment(...),
    ...
}

Some(completions.into())
```

这一步很关键：补全不是一个巨型 `if else`。它先判断“光标处到底处在什么上下文”，再把这个上下文交给相对独立的小模块处理。

## 第 10 站：为什么补全要插入 fake ident

`CompletionContext::new()` 在 [`crates/ide-completion/src/context.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/ide-completion/src/context.rs)。

补全面对的代码经常是不完整的：

```rust
let user = session.
```

在光标位置，语法树可能很别扭。rust-analyzer 会插入一个临时标记 `COMPLETION_MARKER`，重新解析修改后的文件，用这棵更完整的树判断上下文。

源码里能看到这段形状：

```rust
let file_with_fake_ident = {
    let (_, edition) = editioned_file_id.unpack(db);
    let parse = editioned_file_id.parse(db);
    parse.reparse(TextRange::empty(offset), COMPLETION_MARKER, edition).tree()
};
```

这就是很多 IDE 实现都会遇到的“补洞”技巧：用户正在打字时，代码还不是合法程序，但 IDE 不能说“等你写完再来”。

## 第 11 站：`expand_and_analyze()` 把语法和语义接上

`CompletionContext::new()` 会调用 `expand_and_analyze()`，再进入 [`crates/ide-completion/src/context/analysis.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/ide-completion/src/context/analysis.rs) 的 `analyze()`。

`analyze()` 做几类判断：

- 光标是不是在 `NameRef`、`Name`、lifetime、字符串、attribute token tree、macro segment 或 cfg predicate 里。
- 如果在 `NameRef`，走 `classify_name_ref()`。
- 如果在 `Name`，走 `classify_name()`。
- 同时计算 expected type 和 expected name。
- 处理 derive、macro、attribute 等特殊上下文。

这一步把“光标附近的 syntax node”变成“IDE 功能能消费的上下文”。所以 `CompletionContext` 里既有语法信息，也有语义信息：

- `original_token`
- `token`
- `krate`
- `module`
- `containing_function`
- `expected_type`
- `expected_name`
- `locals`
- `exclude_traits`
- `exclude_flyimport`
- `edition`

它不是简单 DTO，而是补全引擎的工作台。

## 第 12 站：`complete_dot()` 是补全的好精读样本

字段和方法补全在 [`crates/ide-completion/src/completions/dot.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/ide-completion/src/completions/dot.rs)。

`complete_dot()` 的流程很适合练真实 Rust 读码：

1. 从 `DotAccess` 里取 receiver type。
2. 如果 receiver 实现 `Future`，建议 `.await`。
3. 如果配置开启 auto await，还继续补 `.await` 后的字段和方法。
4. 调 `complete_fields()` 遍历字段。
5. 调 `complete_methods()` 查可调用方法。
6. 如果配置开启 auto iter，尝试补 `.iter()` 或 `.into_iter()` 后的方法。

这里有几个 Rust/IDE 重点：

- receiver type 来自 HIR 类型系统，不是字符串匹配。
- `autoderef()` 会沿解引用链找字段。
- 字段和方法需要去重。
- trait method 和 inherent method 的处理不一样。
- 配置会影响补全候选，但配置逻辑不应该散到 LSP 层。

读懂这个文件，你就能看到 rust-analyzer 为什么不只是 parser：补全需要类型、trait、作用域、可见性、edition 和用户配置共同参与。

## 第 13 站：`to_proto::completion_items()` 把内部项转成 LSP

补全候选项最后会回到 [`crates/rust-analyzer/src/lsp/to_proto.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/rust-analyzer/src/lsp/to_proto.rs)。

`completion_items()` 做的事包括：

- 按配置隐藏 deprecated 项。
- 计算 relevance score。
- 把内部 `CompletionItemKind` 转成 LSP `CompletionItemKind`。
- 把内部 text edit 转成 LSP text edit。
- 处理 snippet、documentation、detail、label details。
- 为 completion resolve 保存 `CompletionResolveData`。
- 限制返回项数量。

这里是 LSP 边界的另一端。内部补全项可以有适合 rust-analyzer 的字段；到了这里才转换成 LSP 世界认可的 JSON 结构。

## 输入主线：文件变化如何进入数据库

补全只是“问问题”。IDE 还要持续接收用户编辑。文件变化的主线是：

```text
VFS detects file change
  -> GlobalState::process_changes()
  -> ChangeWithProcMacros
  -> FileChange::change_file / set_roots / set_crate_graph
  -> AnalysisHost::apply_change()
  -> RootDatabase::apply_change()
  -> salsa input queries updated
```

`process_changes()` 在 `global_state.rs`。它会：

- 从 VFS 取出 changed files。
- 对文本做 line ending normalization。
- 记录 Rust 文件是否修改。
- 判断是否发生 workspace structure change。
- 对创建/删除文件重新 partition source roots。
- 调 `change.change_file(file_id, text)`。
- 必要时 `change.set_roots(roots)`。
- 最后 `self.analysis_host.apply_change(change)`。

![rust-analyzer 增量数据库：FileChange、base-db、syntax、ItemTree、DefMap、Body/Infer 和 IDE 查询结果](/images/rust-analyzer-incremental-db.png)

这张图的核心是：不是所有变更都应该一路重算到底。

- 改一行函数体实现，可能需要重算这个函数的 body/infer。
- 改 `mod foo;`，可能影响 module tree 和 name resolution。
- 改 `Cargo.toml`，可能需要 reload workspace 和 crate graph。
- 改注释或空格，syntax tree 会变，但 ItemTree 可能不变，后续全局语义不该大面积失效。

## `FileChange` 是输入事务

`FileChange` 在 [`crates/base-db/src/change.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/base-db/src/change.rs)。

它是一个简单但关键的事务对象：

```rust
pub struct FileChange {
    pub roots: Option<Vec<SourceRoot>>,
    pub files_changed: Vec<(FileId, Option<String>)>,
    pub crate_graph: Option<CrateGraphBuilder>,
}
```

它可以做三类输入修改：

- `set_roots(Vec<SourceRoot>)`
- `change_file(FileId, Option<String>)`
- `set_crate_graph(CrateGraphBuilder)`

`apply()` 里会根据 source root 的 library/local 属性设置 salsa durability。库文件更稳定，本地文件更常变。这不是装饰性优化，而是 IDE 性能模型的一部分。

## `base-db` 定义输入，不懂 Cargo

`base-db` 在 [`crates/base-db/src/lib.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/base-db/src/lib.rs)。

它定义了：

- `FileText`
- `SourceRoot`
- `SourceRootId`
- `Crate`
- `CrateGraphBuilder`
- `LocalRoots`
- `LibraryRoots`
- `SourceDatabase`

架构文档里有一个非常重要的不变量：`base-db` 不知道 Cargo。Cargo feature 会被降低成 cfg；Cargo package/target 会被降低成 crate graph。这样核心分析层面对的是抽象 crate graph，而不是 Cargo 的全部概念。

这也是为什么非 Cargo 项目可以通过 `rust-project.json` 接入：只要你能提供文件、source root、crate graph 和 cfg，核心分析不关心它来自哪个构建系统。

## `RootDatabase` 把多个数据库能力接在一起

`RootDatabase` 在 [`crates/ide-db/src/lib.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/ide-db/src/lib.rs)。

源码注释说它是 IDE 状态的核心数据结构：主要是一个 `HirDatabase`，再加上 symbol search。它用 `#[salsa_macros::db]` 定义，内部包含：

- `storage: salsa::Storage<Self>`
- `files: Arc<Files>`
- `crates_map: Arc<CratesMap>`
- `nonce`

它实现了 `salsa::Database` 和 `SourceDatabase`。从读码角度看，`RootDatabase` 是“所有查询会合的地方”。`AnalysisHost` 包一层它，`Analysis` 克隆一份快照，然后各个功能通过 `with_db()` 调查询。

## 语法系统：parser 不知道 rowan，syntax 才知道

rust-analyzer 的语法系统拆成两个 crate：

| crate | 职责 |
| --- | --- |
| `crates/parser` | 手写递归下降 parser，输入 token 流，输出事件流。 |
| `crates/syntax` | lexer、rowan tree、AST wrapper、增量 reparse、syntax error。 |

`parser/src/lib.rs` 的注释很重要：parser 不知道 token 和 syntax tree 的具体表示。它通过抽象 `Input` 和 `Output` 工作，所以 parser 本身不含 lexer。

`syntax/src/parsing.rs` 才把这几步串起来：

```text
LexedStr::new(edition, text)
  -> to_input()
  -> TopEntryPoint::SourceFile.parse(&parser_input)
  -> build_tree(lexed, parser_output)
  -> GreenNode + Vec<SyntaxError>
```

而 `syntax/src/lib.rs` 的 `SourceFile::parse()` 和 `Parse<T>` 明确说明：解析总是产生 syntax tree，即使文件完全错误，也会带着 errors 返回。

这对 IDE 至关重要。用户打字时，源码经常处于半成品状态；如果 parser 像传统编译器那样“一错就停”，补全和高亮体验会很差。

## Lossless syntax tree 为什么重要

`crates/syntax` 的设计目标是 full-fidelity：任意文本都能被精确表示成树，再转回原文本。空白和注释都保留。

这带来两个好处：

- IDE 可以做 refactor、assist、format-adjacent edit，不会随便丢注释和空白。
- syntax tree 不携带语义信息，可以独立于 crate graph、Cargo 和宏上下文复用。

但是它也带来一个问题：空白变化也会改变 syntax tree。如果后续所有语义查询直接依赖完整 syntax tree，就会导致大量不必要重算。于是 rust-analyzer 引入更稳定的中间层，例如 `ItemTree`。

## `ItemTree` 是重要的失效屏障

`ItemTree` 在 [`crates/hir-def/src/item_tree.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/hir-def/src/item_tree.rs)。

源码注释写得非常直白：`ItemTree` 是简化 AST，只包含 items，是 `hir_def` 的主要 IR，也是名字解析和很多 item data query 的输入。它按 `HirFileId` 构建，并且 crate-independent。

最关键的一句是：`ItemTree` 提供 incremental computations 的 invalidation barrier。函数体里打字时，文件的 `ItemTree` 通常不受影响，所以不需要重算名字解析和 item data。

可以把它理解成：

```text
SourceFile syntax tree
  -> ItemTree: struct / enum / fn signature / mod / use / trait / impl ...
  -> DefMap / item data / name resolution
```

函数体内部表达式当然还要分析，但它不应该让全项目的模块树和导入解析一起重来。

## `DefMap` 保存模块树和作用域

名字解析主干在 [`crates/hir-def/src/nameres.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/hir-def/src/nameres.rs)。

文件开头说明：这个模块的结果是 `DefMap`。它包含：

- module tree
- 每个 module 里的 scope
- macro-expanded code 后的定义可见性
- imports 和 extern prelude

`crate_def_map(db, crate_id)` 是关键查询。它不是随手从 syntax tree 临时算出来，而是数据库中的派生结果。读取 name resolution 时，很多 IDE 功能会反复用到它。

从增量角度看，`DefMap` 是“全局结构”。函数体里改表达式，不应该让它失效；新增 module、改 use、改宏定义，则可能影响它。

## HIR 内部分三层

rust-analyzer 的 HIR 相关 crate 可以先这样分：

| crate | 你先记住的职责 |
| --- | --- |
| `hir-expand` | 宏展开、`HirFileId`、macro file、`ChangeWithProcMacros`。 |
| `hir-def` | item lowering、module tree、name resolution、DefMap、定义 ID。 |
| `hir-ty` | 类型 lowering、类型推断、trait solving、MIR、部分诊断。 |
| `hir` | 对外语义门面，提供 `Semantics`、`Module`、`Function`、`Type` 等更好用的 API。 |

架构文档里说 `hir-*` 是“大脑”，但不是 API boundary。它们深度依赖 salsa 和内部 ID，不适合上来就作为学习入口。

更适合新手读的是 `hir` crate，尤其是 [`crates/hir/src/semantics.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/hir/src/semantics.rs)。

## `Semantics` 是从 syntax 到 HIR 的桥

`Semantics` 的注释说它是获取语义信息的主要 API。它能做很多 IDE 需要的事情：

- `parse()`
- `scope_at_offset()`
- `resolve_path()`
- `resolve_method_call()`
- `resolve_field()`
- `type_of_expr()`
- `type_of_pat()`
- `resolve_macro_call()`
- `find_node_at_offset_with_macros()`

补全里的 `CompletionContext::new()` 会创建：

```rust
let sema = Semantics::new(db);
```

然后用它解析文件、找作用域、取 crate/module/function、解析类型和路径。

这里有一个 rust-analyzer 的核心难点：source syntax 到 semantic definition 不是一对一。一个文件可能在不同 crate/cfg 下出现多次；宏展开会制造 pseudo file；同一 syntax node 可能对应不同 HIR 实例。所以 `Semantics` 和 `source_to_def` 才是 IDE 功能的关键桥梁。

## 类型推断在 `hir-ty`

`hir-ty` 的数据库 trait 在 [`crates/hir-ty/src/db.rs`](https://github.com/rust-lang/rust-analyzer/blob/56dc60dd17ff8f527fdd1732a179e47c4eb244f5/crates/hir-ty/src/db.rs)。

它包含大量 query，例如：

- `ty`
- `value_ty`
- `impl_self_ty`
- `generic_predicates`
- `infer`
- `mir_body`
- `borrowck`
- `layout_of_ty`
- `dyn_compatibility_of_trait`
- `trait_solve`

第一次读不要直接跳到 trait solver。更稳的顺序是：

1. 看 `CompletionContext` 如何需要 expected type。
2. 看 `Semantics::type_of_expr()` 如何把 syntax node 映射到 expression ID。
3. 再看 `hir-ty` 的 `infer` query 如何按函数体计算结果。

这样你是在回答一个具体 IDE 问题，而不是空降到类型系统深处。

## 宏系统为什么要单独看

宏相关 crate 包括：

- `crates/tt`
- `crates/mbe`
- `crates/proc-macro-api`
- `crates/proc-macro-srv`
- `crates/proc-macro-srv-cli`
- `crates/hir-expand`

架构文档把宏描述成 token tree -> token tree transforms。声明宏由 `mbe` 处理；proc macro 则通过 client-server 模式运行在单独进程里。

为什么要隔离 proc macro？

- proc macro 可以 panic。
- proc macro 可能 segfault。
- proc macro 可能不确定，和 salsa 的增量假设冲突。
- proc macro 使用 rustc 不稳定接口，rust-analyzer 需要维护对应兼容层。

读宏时不要从 proc macro server 开始。先理解 `HirFileId`：它可能是普通 `FileId`，也可能是宏展开产生的 file。理解这一点后，很多“为什么 mapping 这么绕”的代码才会合理。

## 项目模型：Cargo 只在边界层

`project-model` 和 `load-cargo` 负责把真实项目变成分析器输入。

典型启动时，rust-analyzer 要知道：

- workspace roots。
- Cargo packages 和 targets。
- sysroot 里的 `core`、`alloc`、`std` 等 crate。
- build script 输出。
- proc macro dylib。
- cfg flags。
- crate dependencies。

这些信息最后会被 lowered 成 `CrateGraph`、source roots 和文件输入。核心数据库并不直接“运行 Cargo”。这就是“核心不碰 IO”的具体体现。

当前源码里 flycheck 是 `crates/rust-analyzer/src/flycheck.rs` 模块，不是独立 crate。它负责 check-on-save 一类行为，把 rustc/clippy 诊断转成 IDE 可展示的信息。

## VFS：文件路径不直接进入核心

VFS 相关代码在 `crates/vfs`、`crates/vfs-notify` 和 `crates/paths`。

架构文档强调：文件系统很复杂。路径可能不是 UTF-8，大小写敏感性因系统不同，symlink 可能成环，一个 rust-analyzer 进程也可能服务多个 workspace。

所以核心分析层更多看到：

- `FileId`
- `SourceRootId`
- 相对路径
- `VfsPath`

而不是到处拿 `std::path::PathBuf`。这让分析层更可测试，也更接近“输入状态”的抽象模型。

## 诊断不是只有 rustc/clippy

rust-analyzer 有多类诊断：

- parser/syntax diagnostics：代码是否能被语法树完整表示，哪里有语法错误。
- semantic diagnostics：基于 HIR/type inference 的问题。
- native diagnostics：来自 rustc/clippy/flycheck。

`Analysis` 暴露：

- `syntax_diagnostics`
- `semantic_diagnostics`
- `full_diagnostics`

server 还要管理诊断生成、缓存、清理和 LSP report。用户看到“红线”，源码里其实跨了 syntax、HIR、external compiler 和 LSP 几个边界。

## 其他 IDE 功能怎么放进地图

有了补全主线，其他功能可以按同样方式放进去：

| 功能 | 主要入口 | 依赖什么 |
| --- | --- | --- |
| go-to-definition | `handle_goto_definition` -> `Analysis::goto_definition` | `Semantics`、path resolution、source mapping。 |
| references | `Analysis::references` / `ide-db::search` | symbol index、scope、rename/search 边界。 |
| rename | `Analysis::rename` | definition 解析、可见范围、text edits。 |
| assists | `ide-assists` | syntax edit、semantic context、assist config。 |
| inlay hints | `Analysis::inlay_hints` | type inference、function signatures、config。 |
| semantic tokens | `syntax_highlighting` | syntax + semantic classification。 |
| runnables/test explorer | `runnables` / `test_explorer` | Cargo target、test discovery、LSP extension。 |
| SSR | `ide-ssr` | structural search replace，更多依赖 syntax/HIR mapping。 |

所有这些功能都不应该直接把 LSP 类型当内部模型。它们先产出 `ide` 层的结果，再由 `to_proto` 转成 LSP。

## 错误处理：坏代码不是异常

rust-analyzer 面对的是正在编辑的代码，所以“代码坏了”是常态，不是异常。

几个常见设计：

- parser 总是产生 tree + errors，而不是简单 `Result::Err`。
- semantic 分析要能在部分缺失信息下继续。
- `Analysis` 查询可能返回 `Cancelled`，因为用户继续输入导致旧结果过时。
- LSP request 会用 `catch_unwind` 防止单个功能 panic 拉垮整个进程。
- proc macro 放到隔离进程，避免坏宏直接杀掉 server。

这跟普通 CLI 很不一样。普通 CLI 可以失败后退出；language server 是长期运行进程，必须尽量局部恢复。

## 取消：IDE 不能回答过期问题

架构文档里专门讲 cancellation。场景很直观：

1. server 正在算 semantic highlighting。
2. 用户又输入了一个字符。
3. 原来的 highlighting 结果已经过期。
4. 新输入要尽快进入数据库。

因此 `AnalysisHost::apply_change()` 会让旧 `Analysis` 快照取消。正在跑的查询如果发现 revision 改变，会通过 cancellation 机制停止。`ide` 边界再把它转换成 `Result<T, Cancelled>`。

这就是为什么 `Analysis::completions()` 返回 `Cancellable<Option<Vec<CompletionItem>>>`，而不是普通 `Option<Vec<_>>`。

## 可观测性：profile 和日志是读码工具

rust-analyzer 是长期运行进程，所以它内置了可观测性工具：

- `RA_LOG`：控制 tracing 日志。
- `RA_PROFILE`：启用层级 profiler，例如只打印超过某个阈值的动作。
- `RA_PROFILE_JSON`：输出 JSON profile。
- `RA_COUNT`：对象计数。

读大项目时，不要只靠静态搜索。对 rust-analyzer 这种项目，profile 输出能告诉你一次补全真正等在哪些 query 上。

## 代码生成：看到 generated 不要先钻

rust-analyzer 里有不少生成物：

- syntax AST API。
- `SyntaxKind`。
- assists 文档和测试。
- config 文档。
- features 文档。

`xtask` 负责很多生成任务。架构文档也提醒：生成代码通常会提交进仓库。

新手读到 generated 文件时，先问：

1. 它从哪里生成？
2. 源数据在哪里？
3. 我现在要理解的是使用方，还是生成机制？

如果只是为了理解补全路径，不需要先读完整 generated AST API。

## 测试体系：快照比手写断言更常见

rust-analyzer 测试文档在 `docs/book/src/contributing/testing.md`。

它大量使用 snapshot tests：

- 输入通常是一段 Rust fixture。
- 输出是补全列表、类型推断结果、诊断、文本编辑等。
- 使用 `expect-test` 比较。
- 设置 `UPDATE_EXPECT=1` 可以更新期望。

fixture 有自己的小语言：

- `$0` 表示光标位置。
- `$0...$0` 表示选区。
- `//- minicore: ...` 引入最小 core 模型。
- `// /lib.rs crate:foo` 表示多文件、多 crate。
- `deps:foo` 表示 crate 依赖。

这套测试特别适合 IDE 项目：你关心的是“用户在这一段代码上触发功能会看到什么”，而不是每个内部函数怎么被调用。

![rust-analyzer 贡献和测试路线：选范围、写 fixture、跑 expect-test、检查 xtask、安装本地 server](/images/rust-analyzer-testing-loop.png)

## 想改补全，先跑哪些测试

如果你正在读或改补全，优先看这些地方：

| 目标 | 建议命令或文件 |
| --- | --- |
| 补全入口 | `crates/ide-completion/src/lib.rs` |
| 补全上下文 | `crates/ide-completion/src/context.rs` |
| 光标分析 | `crates/ide-completion/src/context/analysis.rs` |
| 点补全 | `crates/ide-completion/src/completions/dot.rs` |
| 补全测试 helper | `crates/ide-completion/src/tests.rs` |
| 聚焦测试 | `cargo test -p ide-completion <test_name>` |
| 更新快照 | `UPDATE_EXPECT=1 cargo test -p ide-completion <test_name>` |

如果测试需要标准库类型，不要直接假设 `Option`、`Iterator`、`Sized` 存在；fixture 默认没有完整 libcore/libstd。按测试文档用 `minicore` 打开需要的最小能力。

## 本地调试路线

贡献 setup 文档给了一条实际路线：

```bash
cargo build
cargo xtask install --server --code-bin code-insiders --dev-rel
```

然后在 VS Code Insiders 的用户设置里把 `rust-analyzer.server.path` 指向本地构建出的 binary。

调试输出要用 `eprintln!`，不能用 `println!`，因为 language server 的 stdout 是 LSP 消息通道。把调试信息写到 stdout 会污染协议。

这也是一个很好的边界例子：普通 CLI 可以随便 `println!`，LSP server 不行。

## 读码检查表

读 rust-analyzer 时，每读一个函数，问这几个问题：

- 它属于 server 边界、ide API、HIR 内部、syntax、database，还是 project loading？
- 它拿的是 `GlobalState`、`GlobalStateSnapshot`、`Analysis`，还是 `RootDatabase`？
- 它处理的是输入状态，还是派生状态？
- 它有没有做 IO？如果有，为什么它在边界层？
- 它返回的是内部类型，还是 LSP/JSON 类型？
- 它能不能在用户代码不完整时工作？
- 它的结果会不会因为打一空格而无谓失效？
- 它有没有对应 fixture 或 snapshot test？

这张检查表比“看目录树”有用，因为它能逼你判断边界。

## 跟着跑一次

如果你本机 Rust 工具链满足当前 checkout 的要求，可以在 ignored 源码目录里做几个窄实验：

```bash
cd third_party/rust-analyzer
cargo test -p parser
cargo test -p syntax
cargo test -p ide-completion
```

如果只想观察补全相关代码，可以先用 `rg` 找入口：

```bash
rg -n "handle_completion|Analysis::completions|CompletionContext::new|complete_dot" crates
```

再按这组文件读：

| 顺序 | 文件 | 你要确认 |
| --- | --- | --- |
| 1 | `crates/rust-analyzer/src/main_loop.rs` | Completion 请求在哪里注册。 |
| 2 | `crates/rust-analyzer/src/handlers/request.rs` | LSP 参数怎样变成 `FilePosition`。 |
| 3 | `crates/ide/src/lib.rs` | `Analysis::completions()` 如何转交给 `ide-completion`。 |
| 4 | `crates/ide-completion/src/lib.rs` | 两阶段补全主流程。 |
| 5 | `crates/ide-completion/src/context.rs` | fake ident 和 `CompletionContext`。 |
| 6 | `crates/ide-completion/src/context/analysis.rs` | 光标语法/语义分类。 |
| 7 | `crates/ide-completion/src/completions/dot.rs` | 字段、方法、`.await`、auto iter。 |
| 8 | `crates/rust-analyzer/src/lsp/to_proto.rs` | 内部 completion item 如何转成 LSP。 |

## 小练习

练习一：画出一次补全请求。

- 找到 `main_loop.rs` 里 `lsp_request::Completion` 的注册。
- 找到 `handle_completion()`。
- 找到 `Analysis::completions()`。
- 找到 `CompletionContext::new()`。
- 找到 `complete_dot()`。
- 用自己的话解释每一步是否属于 LSP、IDE API、语义分析、还是协议转换。

练习二：读 `complete_dot()`。

- 找出 `.await` 候选是在哪里加的。
- 找出字段补全和方法补全分别调哪个函数。
- 找出 auto iter 相关配置在哪里被使用。
- 解释为什么 receiver type 必须来自 HIR，而不是从文本里猜。

练习三：读 `FileChange`。

- 找出 `set_roots`、`change_file`、`set_crate_graph`。
- 找出它如何设置 local roots 和 library roots。
- 解释为什么 library 文件 durability 更高。

练习四：读 `ItemTree` 注释。

- 找出它为什么 crate-independent。
- 找出它为什么能作为 invalidation barrier。
- 举一个“函数体变了但 ItemTree 不变”的例子。

练习五：读一个测试 helper。

- 打开 `crates/ide-completion/src/tests.rs`。
- 找一个带 `$0` 的补全测试。
- 解释 fixture 输入如何变成 `FilePosition`。
- 尝试写一个最小 dot completion 测试。

## 过关标准

如果你能回答下面问题，就说明这篇读码路线已经走通：

- `crates/rust-analyzer` 和 `crates/ide` 的边界在哪里？
- 为什么 `Analysis` 是快照，而 `AnalysisHost` 是可变状态？
- `CompletionContext::new()` 为什么要插入 fake ident？
- `complete_dot()` 为什么需要 receiver type？
- `FileChange` 里三类输入修改分别是什么？
- `base-db` 为什么不直接知道 Cargo feature？
- `parser` 和 `syntax` 为什么拆成两个 crate？
- `ItemTree` 为什么能减少无谓重算？
- `hir` 和 `hir-*` 的区别是什么？
- proc macro 为什么要放进单独进程？
- 补全结果最后在哪里转成 LSP `CompletionItem`？

## 暂时不要读哪里

rust-analyzer 很精彩，但有些地方不适合作为第一天入口：

- `hir-ty` 的 trait solver 深处。先知道它被谁调用，再读具体算法。
- proc macro server 兼容 rustc 不稳定接口的细节。先理解隔离边界。
- generated syntax AST 文件。先读使用方和生成源。
- VS Code 插件内部。先读 server 和 `ide` API。
- 全量 diagnostics/flycheck 流程。先分清 native diagnostics 和 semantic diagnostics。
- `xtask` 发布/生成全流程。等你确实要改 generated 内容再读。

读开源项目不是比赛谁先冲进最复杂目录。rust-analyzer 的难点是“边界多但必须低延迟”。先用补全请求把主干跑通，再沿着 syntax、HIR、database、Cargo loading、macro、testing 一层层扩展，整座项目就会从一团文件名慢慢变成一张能导航的地图。
