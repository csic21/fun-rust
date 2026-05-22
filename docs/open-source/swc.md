# 开源读码：从 SWC 的小入口走进编译器

SWC 是一个用 Rust 写的 TypeScript / JavaScript 编译器。它很快，也很大：仓库里同时有 parser、AST、codegen、minifier、transform、bundler、CSS、Node 绑定和发布工具。新手直接从“完整编译器”开读，很容易第一天就迷路。

所以这一栏不从最深的优化器开始，而是从仓库里一个很小的真实二进制入口开始：[swc-ast-explorer](https://github.com/swc-project/swc/tree/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc-ast-explorer)。它做的事很单纯：从标准输入读一段 JS/TS/TSX，交给 SWC parser，最后把 AST 打印出来。你会看到真实 SWC 代码，但路线足够短。

本页基于本仓库内的源码 checkout：

- 本地路径：`third_party/swc/`
- 当前提交：[`3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d`](https://github.com/swc-project/swc/tree/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d)，提交日期 `2026-05-22`
- 上游仓库：[swc-project/swc](https://github.com/swc-project/swc)
- 上游许可证：Apache-2.0。源码目录已被 `.gitignore` 忽略，本站只引用它作为读码材料，不把第三方源码发布进本站内容。

![SWC 新手读码路线图](/images/swc-reading-route.png)

::: tip 读码姿势
今天只追一条会跑通的小路：`stdin` 输入源码，`SourceMap` 保存源码和位置，parser 产出 `Program` AST，格式化器把 AST 打印出来。transform 和 codegen 先只看接口，不钻优化细节。
:::

## 先把我们的要点钉住

这篇文档不是把 SWC 每个目录都扫一遍。我们的目标是把“怎么读一个真实 Rust 大项目”讲清楚，尤其是下面几个要点：

- **入口要小**：先从 `swc-ast-explorer` 这种能跑通、输入输出清楚的小工具进入，而不是直接钻 `Compiler`、minifier 或 Node binding。
- **边界要硬**：`SourceMap` 管源码位置，lexer 管字符到 token，parser 管 token 到 AST，format 只负责展示，codegen 才负责生成 JS。
- **项目要成图**：SWC 不是一个单 crate 项目，而是 Cargo workspace、Node packages、N-API/Wasm bindings、代码生成工具和测试夹具共同组成的 monorepo。
- **读码要可验证**：每个函数名、类型名和路径都能在 `third_party/swc/` 里用 `rg` 找到；不要用“编译器大概都这样”来替代源码证据。
- **扩展要有顺序**：看懂 AST Explorer 后，再读 `swc_ecma_codegen`、`swc_ecma_visit`、`swc::Compiler` 和 bindings；越靠近产品入口，配置和边界越复杂。

![SWC 全仓库分层图](/images/swc-project-layers.png)

这张图先帮你建立全局坐标：底层是大量 Rust crate，中间是编译器管线，上层是把能力接到开发者工作流里的 bindings、packages 和工具。后面的精读会刻意走一条很窄的路，但你需要知道旁边还有哪些街区，免得把一个小工具误认为整个项目。

## 本课目标

读完这一页，你应该能做到五件事：

- 说清 `swc-ast-explorer` 从 `main()` 到 `parse_file_as_program()` 的调用链。
- 分清 `SourceMap`、`SourceFile`、`Lexer`、`Parser`、`Program` 各自负责什么。
- 从真实源码里认出 `Result`、`Arc/Lrc`、trait、enum、feature、workspace、宏生成代码和错误恢复这些 Rust 工程写法。
- 能把 SWC 的 Rust crate、Node/Wasm binding、npm package、生成工具和测试体系放进同一张项目地图。
- 知道下一步应该读 codegen 或 visitor，而不是一头扎进 minifier 的复杂优化规则。

## 读码地图

先把路线画成一条线：

```text
crates/swc-ast-explorer/src/main.rs
  -> Args::parse()
  -> stdin.read_to_string()
  -> parse_stdin()
  -> SourceMap::new_source_file()
  -> parse_source()
  -> swc_ecma_parser::parse_file_as_program()
  -> with_file_parser()
  -> Lexer::new()
  -> Parser::new_from()
  -> Parser::parse_program()
  -> swc_ecma_ast::Program
  -> format_program()
```

这不是 SWC 的完整编译链。它是第一条安全路线：先看“源码如何变成 AST”。等这条路看懂，再去看 `swc_ecma_codegen::Emitter` 如何把 AST 打回 JS，或者看 `swc_ecma_visit` 如何遍历和修改 AST。

## 全项目地图：SWC 是双工作区 monorepo

打开 `third_party/swc/`，第一眼会看到两个工作区同时存在：

- Rust 侧由根目录 `Cargo.toml` 管理，`members` 覆盖 `xtask`、`bindings/*`、`crates/*`、`tools/generate-code` 和 `tools/swc-releaser`。
- JavaScript 侧由根目录 `package.json` 管理，`workspaces` 覆盖 `packages/*`、`packages/core/scripts/npm/*`、`packages/minifier/scripts/npm/*`、`packages/html/scripts/npm/*`、`packages/react-compiler/scripts/npm/*`、`bindings/*` 和 `bindings/binding_core_wasm/*`。

这意味着 SWC 同时面向两类用户：Rust 用户会直接依赖 `swc_ecma_parser`、`swc_ecma_visit`、`swc`、`swc_core` 等 crate；JavaScript 用户更多通过 `@swc/core`、`@swc/wasm`、minifier/html/react-compiler 相关 package 调用同一套底层能力。

可以先按功能把目录分成五组：

| 组 | 代表路径 | 先记住的职责 |
| --- | --- | --- |
| 编译器基础 | `crates/swc_common`、`crates/swc_atoms`、`crates/swc_sourcemap` | 位置、诊断、字符串、source map、通用工具。 |
| JavaScript / TypeScript 主线 | `crates/swc_ecma_ast`、`crates/swc_ecma_parser`、`crates/swc_ecma_visit`、`crates/swc_ecma_codegen` | AST、parser、visitor、codegen，是本页重点。 |
| 变换和优化 | `crates/swc_ecma_transforms_*`、`crates/swc_ecma_minifier`、`crates/swc_ecma_preset_env` | 兼容性降级、模块转换、React/TS pass、压缩和目标环境处理。 |
| 产品入口 | `crates/swc`、`crates/swc_core`、`bindings/*`、`packages/*` | 把底层 crate 包成用户能调用的 Rust API、Node 原生模块、Wasm 和 npm 包。 |
| 工程工具 | `tools/generate-code`、`tools/swc-releaser`、`xtask`、`testing` | 生成 visitor/codegen 样板、发布、仓库任务和测试辅助。 |

这里有一个读码提醒：文件夹名字越像“产品”，越可能牵涉配置、兼容、发布和平台差异；文件夹名字越像“数据结构”或“接口”，越适合新手建立心智模型。所以本文从 `swc-ast-explorer` 和 `swc_ecma_parser` 进，而不是从 `packages/core` 或 `binding_core_node` 进。

## 全局主线：从字符到用户可用的包

把 SWC 想成一个分层系统，会比把它想成“一个很快的 parser”更准确：

```text
用户入口
  -> CLI / @swc/core / Wasm / Rust API
  -> swc::Compiler 或更底层 parser/codegen crate
  -> SourceMap + Lexer + Parser
  -> swc_ecma_ast::Program
  -> visitor / transform / minifier / bundler
  -> codegen + sourcemap
  -> JS code / npm package output / Node binding result
```

本页只精读中间最短的一段：

```text
stdin
  -> SourceMap
  -> Lexer
  -> Parser
  -> Program
  -> Debug AST
```

这不是偷懒，而是读大项目的基本策略：先把一条路径跑通，再把旁支补上。等你能解释 `Program` 是怎么来的，再去读 transform pass 才不会把“树的形状”和“树的改写”搅在一起。

## 第 0 站：Cargo.toml 是项目地图

根目录 [`Cargo.toml`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/Cargo.toml) 说明 SWC 是一个 workspace：

- `members` 包含 `xtask`、`bindings/*`、`crates/*`、`tools/generate-code` 和 `tools/swc-releaser`。
- workspace 统一声明 `edition = "2021"`、`license = "Apache-2.0"` 和上游仓库地址。
- resolver 使用 `"2"`，这会影响 workspace 里 feature 的解析方式。
- 许多依赖集中放在 `[workspace.dependencies]`，各 crate 再复用这些版本。
- 发布 profile 对编译产物做了强优化，例如 `lto = "fat"`、`strip = "symbols"`、`codegen-units = 1` 和 `panic = "abort"`。

再看 [`crates/swc-ast-explorer/Cargo.toml`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc-ast-explorer/Cargo.toml)。这里有两个新手友好的信号：

- `publish = false`：它是仓库内部工具，不是对外发布的库。
- 依赖很集中：`clap` 负责参数，`swc_common` 负责源码和诊断基础设施，`swc_ecma_parser` 负责解析，`swc_ecma_ast` 提供 AST 类型，`swc_error_reporters` 把错误变成好读的报告。

这一步先学一个工程习惯：不要从文件数量开始读项目，先从 workspace 和目标 crate 看边界。

## 第 1 站：小入口 `main.rs`

入口在 [`crates/swc-ast-explorer/src/main.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc-ast-explorer/src/main.rs)。主函数可以简化成这个形状：

```rust
fn main() -> Result<()> {
    let args = Args::parse();
    let mut contents = String::new();
    io::stdin().read_to_string(&mut contents)?;

    let cm = Lrc::new(SourceMap::default());
    let program = parse_stdin(cm, contents)?;

    println!("{}", format_program(&program, args.spans));
    Ok(())
}
```

这段是教学骨架，不是逐字复制。真正源码还会把 SWC 的诊断错误转成漂亮输出。

这里已经出现了几个 Rust 重点：

- `main() -> Result<()>`：CLI 入口可以直接返回错误，`?` 会把失败往上传。
- `String::new()` 加 `read_to_string()`：标准输入被读成一整段源码文本。
- `Lrc<SourceMap>`：SWC 用自己的同步/非同步引用计数别名承载共享数据。你可以先把它理解成“这个源码地图会被多处共享”。
- `format_program(&program, args.spans)`：解析和展示分开。入口层不负责解析细节，也不负责 AST 格式化细节。

## 第 2 站：参数结构很小，但边界清楚

参数定义在 [`crates/swc-ast-explorer/src/args.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc-ast-explorer/src/args.rs)。

它只有一个开关：`--spans`。打开时保留 AST 里的位置标记，关闭时把位置字段从打印结果里拿掉。这很适合新手观察“代码位置”在编译器里长什么样。

这里的重点不是 `clap` 有多复杂，而是 derive 风格的工程写法：

```rust
#[derive(Debug, Parser)]
pub struct Args {
    #[clap(long, value_parser, default_value_t = false)]
    pub spans: bool,
}
```

`derive(Parser)` 会帮你生成命令行解析逻辑。真实项目里，宏经常用来把重复样板代码收起来。读源码时遇到宏，不要急着害怕；先看它把什么边界变短了。

## 第 3 站：`SourceMap` 让源码不只是字符串

`parse_stdin()` 仍在 `main.rs` 里。它先调用 `cm.new_source_file(FileName::Anon.into(), contents)`。

这一行非常重要：编译器不只需要源码文本，还需要知道每个 token、表达式和错误来自哪里。`SourceMap` 就像剧场座位表：源码字符是观众，`Span` 是座位号。后面 parser、错误报告、codegen source map 都会用到这张表。

`FileName::Anon` 表示这段源码来自匿名输入，而不是磁盘上的真实路径。以后如果你看 `Compiler` 或 CLI 编译文件，会看到 `load_file()` 之类的路径入口；这里为了小工具，只从 stdin 进来。

## 第 4 站：错误处理被包在 `try_with_handler`

`parse_stdin()` 还做了两层上下文设置：

```text
GLOBALS.set(...)
  -> try_with_handler(...)
     -> parse_source(&file, handler)
```

这里先记住职责，不急着钻实现：

- `GLOBALS.set(&Globals::new(), ...)`：给 SWC 这次解析准备一份全局上下文。
- `try_with_handler(...)`：创建诊断 handler，让 parser 报错时能打印出行列、源码片段和颜色。
- `parse_source(&file, handler)`：真正进入本工具自己的解析函数。

这一步适合复习闭包：`try_with_handler` 接收一个闭包，闭包里拿到 `handler`，再把它传给 parser 错误转换逻辑。

## 第 5 站：`parse_source()` 选择 TSX 语法

解析逻辑在 [`crates/swc-ast-explorer/src/parser.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc-ast-explorer/src/parser.rs)。它做了四件事：

1. 选择 `Syntax::Typescript(TsSyntax { tsx: true, ..Default::default() })`。
2. 准备 `Vec` 收集 parser 可恢复错误。
3. 调用 `parse_file_as_program(file, syntax, EsVersion::latest(), None, &mut errors)`。
4. 把不可恢复错误和可恢复错误都发给 `handler`，最后只在完全没有语法错误时返回 `Program`。

这里有一个严谨点：SWC parser 支持错误恢复。有些错误不会马上让 parser 停下，而是被放进 `errors`。这个小工具选择“只要有恢复错误，也不打印半成品 AST”，所以它会遍历 `errors`，发出诊断，然后 `bail!("Syntax Error")`。

从学习角度看，这比“遇错就 panic”成熟得多：库保留恢复能力，具体工具按自己的产品需求决定是否接受部分结果。

## 第 6 站：`parse_file_as_program()` 是公开入口，不是魔法

`parse_file_as_program()` 在 [`crates/swc_ecma_parser/src/lib.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc_ecma_parser/src/lib.rs)。源码用一个 `expose!` 宏生成几个公开函数：

```text
parse_file_as_expr
parse_file_as_module
parse_file_as_script
parse_file_as_commonjs
parse_file_as_program
```

它们最后都会走进 `with_file_parser()`。这一步的主干很清楚：

```rust
let lexer = Lexer::new(syntax, target, SourceFileInput::from(fm), comments);
let mut p = Parser::new_from(lexer);
let ret = op(&mut p);
recovered_errors.append(&mut p.take_errors());
ret
```

这段接近真实结构，但为阅读做了压缩。重点是三层职责：

- `SourceFileInput::from(fm)`：把 `SourceFile` 变成 parser 可读取的输入。
- `Lexer::new(...)`：把字符流切成 token 流。
- `Parser::new_from(lexer)`：把 token 流组织成 AST。

如果把编译器想成厨房，lexer 像切菜，parser 像装盘。菜切得再快，也还不是一道菜；token 还要被组织成表达式、语句和模块。

## 第 7 站：`Parser::parse_program()` 决定 Module 还是 Script

Parser 的主体在 [`crates/swc_ecma_parser/src/parser/mod.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc_ecma_parser/src/parser/mod.rs)。

`Parser::new_from()` 会做初始化：

- 读取语法配置，比如是否是 `.d.ts`。
- 设置 `Context::TopLevel`。
- 创建 token buffer。
- 调用 `first_bump()`，让 parser 先拿到第一个 token。

`parse_program()` 再做判断：

1. 记录起始位置。
2. 解析 shebang。
3. 在 `CanBeModule` 和 `TopLevel` 上下文里解析 module item。
4. 如果发现 `import`、`export` 等模块声明，就返回 `Program::Module`。
5. 否则把 `ModuleItem::Stmt` 收成普通语句，返回 `Program::Script`。

这也是为什么 `parse_file_as_program()` 比 `parse_file_as_module()` 更适合这个小工具：用户从 stdin 输入的代码可能是模块，也可能只是普通脚本。

## 第 8 站：AST 的形状藏在 `swc_ecma_ast`

AST 类型在 [`crates/swc_ecma_ast/src/module.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc_ecma_ast/src/module.rs)。先看简化模型：

```rust
enum Program {
    Module(Module),
    Script(Script),
}

struct Module {
    span: Span,
    body: Vec<ModuleItem>,
    shebang: Option<Atom>,
}

struct Script {
    span: Span,
    body: Vec<Stmt>,
    shebang: Option<Atom>,
}
```

真实源码里这些类型带有 `#[ast_node]`、`EqIgnoreSpan`、`Take` 等派生和实现。新手先抓主干：

- `enum Program` 表示“一段 JS/TS 代码可能是模块，也可能是脚本”。
- `Vec<ModuleItem>` 和 `Vec<Stmt>` 表示顶层内容是有顺序的列表。
- `Span` 保存源码位置，不参与“这两棵树结构是否相同”的核心理解时，常常可以先隐藏。
- `Option<Atom>` 表示 shebang 可能存在，也可能不存在；`Atom` 是 SWC 的字符串表示之一。

这一步可以把前面的 Rust 基础串起来：`enum` 表达分支形状，`struct` 表达固定字段，`Vec` 表达多个子节点，`Option` 表达可有可无。

## 第 9 站：格式化不是编译，只是把 AST 展示出来

AST Explorer 最后调用 [`crates/swc-ast-explorer/src/format.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc-ast-explorer/src/format.rs)。

它的主流程是：

1. 用 `format!("{program:#?}")` 得到 pretty debug 输出。
2. 如果没有传 `--spans`，用正则移除 span 字段。
3. 给缩进做颜色处理，让树形结构更容易扫读。

这里的 `OnceLock<Regex>` 是一个很实用的写法：正则编译有成本，所以只初始化一次，后面重复使用。它不是 SWC parser 的核心，但它展示了真实工具里常见的“小性能意识”。

这一站要分清楚：`format_program()` 没有把 AST 重新生成 JavaScript，它只是把 Rust 调试表示打印出来。真正的 JS 输出在 codegen 里。

## 第 10 站：下一扇门是 codegen 和 visitor

读完 AST Explorer 后，可以看两个相邻接口，但先别深挖全部实现。

Codegen 在 [`crates/swc_ecma_codegen/src/lib.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc_ecma_codegen/src/lib.rs)。你会看到：

- `Node` trait：AST 节点只要实现 `emit_with()`，就能被发射器输出。
- `Emitter`：拿着配置、`SourceMap`、comments 和 writer，把 AST 写成 JS 文本。
- `to_code_default()`：创建 `Emitter`，调用节点的 `emit_with()`，最后把字节转成 `String`。

Visitor 在 [`crates/swc_ecma_visit/src/lib.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc_ecma_visit/src/lib.rs)。这里能看到 `fold_pass()` 和 `visit_mut_pass()`：它们把“遍历或改写 AST”的对象包装成 compiler pass。

这两扇门对应编译器的两个常见动作：

- codegen：树变回代码。
- visitor / fold：沿着树走，读取或修改节点。

## 精读样本：先固定一段输入

读编译器源码时，不要只看抽象名词。先拿一段小代码当“探针”：

```ts
const answer: number = 40 + 2;
```

对 AST Explorer 来说，这段文本会经历这些阶段：

![SWC AST Explorer 真实解析流水线](/images/swc-ast-explorer-pipeline.png)

```text
String
  -> SourceFile
  -> token stream
  -> Program::Script 或 Program::Module
  -> Debug 格式化文本
```

这段代码没有 `import` / `export`，所以 `parse_program()` 最终会走 `Program::Script`。如果你把它改成：

```ts
export const answer: number = 40 + 2;
```

那顶层出现模块声明，结果会变成 `Program::Module`。这就是为什么本工具用 `parse_file_as_program()`，而不是强行用 `parse_file_as_script()` 或 `parse_file_as_module()`。

这张图也解释了一个很容易混淆的点：错误报告不是“最后才发生”的附属品。parser 在构造 `Program` 的同时会收集错误，AST Explorer 再决定要不要输出 AST。也就是说，诊断是解析流程的一部分，只是它的展示由 `Handler` 和 `swc_error_reporters` 接管。

## 逐行看 `main()`：每一行都在缩小问题

回到 `crates/swc-ast-explorer/src/main.rs`。入口层可以按“输入、上下文、解析、输出”四段读。

第一段是参数：

```rust
let args = Args::parse();
```

这里把“命令行字符串”变成结构体 `Args`。后面的代码不再关心用户写的是 `--spans` 还是别的原始文本，只关心 `args.spans: bool`。这是 CLI 项目常见的第一层解耦。

第二段是输入：

```rust
let mut contents = String::new();
io::stdin().read_to_string(&mut contents)?;
```

`read_to_string()` 返回 `Result<usize>`，所以这里用 `?`。如果 stdin 读取失败，错误会直接从 `main() -> Result<()>` 往上传。这个工具没有在入口层手写一大段错误处理，因为 `anyhow::Result` 已经能表达“这个 CLI 失败了”。

第三段是共享上下文：

```rust
let cm = Lrc::new(SourceMap::default());
```

`cm` 是 source map。后面 parser 和错误报告都需要它，所以它被引用计数指针包起来。SWC 的 `Lrc` 来自 `swc_common/src/sync.rs`：没有 `concurrent` feature 时它是 `Rc`，有 `concurrent` feature 时它是 `Arc`。这让同一套源码可以在单线程和并发场景下切换成本模型。

第四段是解析和展示：

```rust
let program = parse_stdin(cm, contents).map_err(TWithDiagnosticArray::to_pretty_error)?;
println!("{}", format_program(&program, args.spans));
```

`parse_stdin()` 产出的是 `swc_ecma_ast::Program`。`format_program()` 只是展示 AST，不做 transform，也不做 codegen。读到这里要守住边界：AST Explorer 的产品目标是“看树”，不是“编译 JS”。

## `SourceMap` 精读：为什么它要分配起始位置

`SourceMap` 在 [`crates/swc_common/src/source_map.rs`](https://github.com/swc-project/swc/blob/3b1a217abbfc7d94c856dcfa0e7e57a8edc3812d/crates/swc_common/src/source_map.rs)。结构体里有几个值得新手认识的字段：

```rust
pub struct SourceMap {
    files: Lock<SourceMapFiles>,
    start_pos: AtomicUsize,
    file_loader: Box<dyn FileLoader + Sync + Send>,
    path_mapping: FilePathMapping,
    doctest_offset: Option<(FileName, isize)>,
}
```

先不用追所有方法，只看职责：

- `files`：保存已经注册的 `SourceFile`。
- `start_pos`：给每个文件分配全局字节位置区间。
- `file_loader`：抽象“从哪里读文件”，默认是真实文件系统。
- `path_mapping`：支持路径重写，例如构建时隐藏本机绝对路径。
- `doctest_offset`：处理 doctest 场景下的行号偏移。

`new_source_file()` 里有一个容易被忽略的细节：它会调用 `next_start_pos(src.len())`。源码注释说明它会额外加一格，让不同文件之间留出空隙，以便区分位置。也就是说，`Span` 里的位置不是“某个文件内第几列”这么简单，而是 SourceMap 管理的一套全局位置坐标。需要显示错误时，再用 `lookup_char_pos()` 把 `BytePos` 查回文件名、行号和列号。

这就解释了为什么 parser 错误能指到源码片段：parser 节点带 `Span`，`Span` 里有 `BytePos`，`SourceMap` 能把 `BytePos` 映射回人能读的位置。

## `parse_stdin()` 精读：全局上下文和诊断 handler

`parse_stdin()` 里最像“框架代码”的部分是：

```rust
GLOBALS.set(&Globals::new(), || {
    try_with_handler(cm, handler_opts, |handler| parse_source(&file, handler))
})
```

可以分三层理解：

1. `GLOBALS.set(...)` 准备 SWC 全局上下文。
2. `try_with_handler(...)` 准备错误报告环境。
3. 闭包里调用 `parse_source(&file, handler)`。

这种写法在真实 Rust 项目里很常见：外层函数提供上下文，中间函数提供资源，最内层闭包只写业务动作。新手容易被闭包层级吓到，但按“谁准备环境，谁做核心动作”去读，就不会乱。

`HandlerOpts` 里设置了颜色和文件名显示策略。它不影响 parser 如何理解语法，只影响错误如何展示。这也是一个重要边界：诊断展示不应该和语法分析混在一起。

## `parse_source()` 精读：失败不是一种

`crates/swc-ast-explorer/src/parser.rs` 里有两类错误：

```rust
let program = parse_file_as_program(...)
    .map_err(|err| {
        err.into_diagnostic(handler).emit();
        anyhow!("Syntax Error")
    })?;

for err in errors {
    err.into_diagnostic(handler).emit();
    has_recovered_error = true;
}
```

第一类是不可恢复错误：`parse_file_as_program()` 直接返回 `Err`。例如语法结构坏到 parser 无法继续构造树。

第二类是可恢复错误：parser 继续产出了 `Program`，但把错误放进 `errors`。AST Explorer 选择把这种情况也视为失败，因为它不想给用户展示“带语法错误的半成品树”。

这个设计比“错误就是 panic”细很多：

- parser crate 保留恢复能力。
- 调用者决定恢复后的 AST 是否可接受。
- handler 负责把错误变成人能读的诊断。

所以同一个 parser 可以服务不同产品：IDE 可能愿意拿半成品 AST 做补全，命令行 AST Explorer 则宁愿拒绝输出。

## Lexer 和 Parser 的边界

`with_file_parser()` 把两个关键对象接起来：

```rust
let lexer = Lexer::new(syntax, target, SourceFileInput::from(fm), comments);
let mut p = Parser::new_from(lexer);
```

Lexer 关心“字符如何变 token”。例如：

```ts
const answer: number = 40 + 2;
```

大致会被拆成 `const`、标识符、冒号、标识符、等号、数字、加号、数字、分号这类 token。真实 token 类型比这更细，也会带 span。

Parser 关心“token 如何变语法树”。同样的 token 序列在 parser 眼里会变成：

```text
变量声明语句
  -> 声明种类: const
  -> 声明项
     -> 名字: answer
     -> 类型标注: number
     -> 初始值: 二元表达式 40 + 2
```

这就是 lexer 和 parser 的分工：lexer 不理解“变量声明”这个高层结构，parser 不直接逐字符扫描源码。

## `Parser::new_from()` 精读：先拿到一个当前 token

`Parser::new_from()` 里这几行很有意思：

```rust
let mut p = Parser {
    state: Default::default(),
    input: Buffer::new(input),
    found_module_item: false,
};

p.input.first_bump();
```

parser 创建时不是空站着，它会先 `first_bump()`，让输入缓冲区进入“当前 token 已经可读”的状态。后面 `parse_program()`、`parse_stmt_block_body()` 这些函数才能不断看当前 token、判断分支、再 bump 到下一个 token。

`found_module_item: bool` 是后面判断 `Program::Module` 的线索之一。parser 读到 module declaration 时会标记它；最后 `parse_program()` 根据这个标记和 body 里的内容决定返回 `Module` 还是 `Script`。

这类布尔字段不是“随便放的状态”。它通常是 parser 在单次扫描中积累的判断信息。

## `Program` 往下再看一层：声明和表达式在哪里

前面只看了 `Program`、`Module`、`Script`。如果继续追 `const answer: number = 40 + 2;`，你会进入这些文件：

- `crates/swc_ecma_ast/src/stmt.rs`：`Stmt`，普通语句。
- `crates/swc_ecma_ast/src/decl.rs`：`Decl`、`VarDecl`、`VarDeclarator`。
- `crates/swc_ecma_ast/src/expr.rs`：`Expr`、`BinExpr`。
- `crates/swc_ecma_ast/src/lit.rs`：数字、字符串、布尔值等字面量。
- `crates/swc_ecma_ast/src/ident.rs`：标识符。

可以用简化结构理解：

```text
Program::Script
  -> Script.body: Vec<Stmt>
     -> Stmt::Decl
        -> Decl::Var
           -> VarDecl.kind = const
           -> VarDeclarator
              -> name = answer
              -> init = Expr::Bin
                 -> left = 40
                 -> op = +
                 -> right = 2
```

真实 AST 会更丰富，因为它还要支持 TypeScript 类型标注、decorator、JSX、optional chaining、class、module declaration 等大量语法。读 AST 的策略是从一个样本往外扩，不要一次把所有 enum variant 都背下来。

## 为什么 `#[ast_node]` 和 generated visitor 不从第一天读

SWC AST 里有很多宏，例如 `#[ast_node]`。visitor 文件 `crates/swc_ecma_visit/src/generated.rs` 开头也明确写着它由 `tools/generate-code` 生成。

新手第一天应该知道两件事：

- 这些宏和生成文件是为了减少重复代码。
- 读业务主线时，先看生成结果提供了什么接口，不要从生成器开始读。

例如 `generated.rs` 里的 `Visit` trait 会为大量节点生成默认访问方法。你只需要先理解一个规律：默认方法通常会继续访问子节点；如果你自己实现某个 `visit_xxx`，要不要继续递归，需要你自己决定。

这也是为什么 SWC 文章从 `swc-ast-explorer` 开始，而不是从 visitor 生成代码开始。生成代码规模大，但不代表它是最好的入口。

## 从小入口扩展：四条路线，不要一起读

![SWC 读码扩展路线图](/images/swc-reading-expansion.png)

看懂 AST Explorer 以后，下一步不是“把整个 SWC 读完”，而是按目标选择路线：

| 路线 | 先看哪里 | 你会学到什么 | 先别碰什么 |
| --- | --- | --- | --- |
| parser 路线 | `crates/swc_ecma_parser/src/lib.rs`、`parser/mod.rs`、`parser/stmt.rs` | 语法配置、上下文、错误恢复、`Program::Module` / `Program::Script` 判断。 | 不要一开始读所有表达式和 TypeScript 分支。 |
| visitor / transform 路线 | `crates/swc_ecma_visit/src/lib.rs`、`crates/swc_ecma_transforms_base/src/*` | AST 如何被遍历、如何被改写、pass 如何组合。 | 不要第一天读完整 generated visitor。 |
| codegen / compiler 路线 | `crates/swc_ecma_codegen/src/lib.rs`、`crates/swc/src/lib.rs` | AST 如何打印成 JS，`Compiler` 如何串起 parse、transform、print。 | 不要直接钻 `.swcrc` 所有配置项。 |
| bindings / tests 路线 | `bindings/binding_core_node`、`bindings/binding_core_wasm`、`packages/core`、`CONTRIBUTING.md` | Rust 能力如何暴露给 Node/Wasm，测试和发布如何保护用户入口。 | 不要把 N-API、Wasm、npm 发布和 parser 主线混在一起。 |

这四条路线都重要，但它们回答的问题不同。parser 关心“语法是什么”，visitor 关心“树怎么走”，transform 关心“树怎么改”，codegen 关心“树怎么写回文本”，bindings 关心“用户怎么调用”。读码时只要当前问题变了，入口也应该跟着换。

## 从 AST Explorer 过渡到真正编译

AST Explorer 只停在“树长什么样”。SWC 真正编译还要继续往后走。可以用 `crates/swc/examples/transform.rs` 作为第二条路线：

```rust
let cm = Arc::<SourceMap>::default();
let c = swc::Compiler::new(cm.clone());
let fm = cm.load_file(Path::new("examples/transform-input.js"))?;
c.process_js_file(fm, handler, &Default::default())
```

这条路线和 AST Explorer 的差别是：

- 输入来自文件，不是 stdin。
- 使用高层 `swc::Compiler`，不是直接调用 parser。
- `process_js_file()` 会把 parse、transform、codegen 等动作包起来。
- 输出是 `TransformOutput`，里面有生成后的 `code`。

不要一开始就从 `Compiler::process_js_file()` 深挖全部配置。更稳的读法是：

1. 先用 AST Explorer 搞清“源码如何变 AST”。
2. 再用 codegen 搞清“AST 如何变回代码”。
3. 最后读 transform，理解“AST 中间如何被改写”。

## `swc::Compiler` 只是下一层入口，不是更简单

`crates/swc/src/lib.rs` 里的 `Compiler` 是面向实际编译任务的高层 API。它会接触更多概念：

- 输入文件和 source map。
- 配置文件。
- parser syntax。
- transform pass。
- helpers。
- minify。
- source map 输出。
- comments 保留和丢弃。

所以 `Compiler` 更像“总控制台”，不是新手第一站。读大型项目时，要区分“用户常用 API”和“适合学习的入口”。常用 API 往往为了覆盖场景而很复杂；学习入口最好选择路径短、输入输出明确的工具。

## `Compiler` 主线：高层 API 把多个世界缝在一起

`crates/swc/src/lib.rs` 里的 `Compiler` 结构体本身不大：

```rust
pub struct Compiler {
    pub cm: Arc<SourceMap>,
    comments: SwcComments,
}
```

但它的方法会调动很多 crate。比如 `process_js_file()` 只是把文件、handler 和 `Options` 传给 `process_js_with_custom_pass()`，后者再进入 `parse_js_as_input()`、配置归一化、transform 组合、source map 处理和最终打印。越往这里走，越能看到“真实产品入口”需要处理的杂事：

- `.swcrc` / `Options`：`Config` 里有 `env`、`jsc`、`module`、`minify`、`input_source_map`、`source_maps`、`is_module` 等字段。
- parser syntax：`JscConfig` 下的 `parser` 会落到 `Syntax`，再影响 `EsSyntax`、`TsSyntax`、JSX、TSX 等入口。
- transform 配置：decorator、React、TypeScript、preset-env、module transform、optimizer、plugin transform 都会按配置被拼进 pass。
- 输出策略：`PrintArgs`、comments、source map、charset、preamble、minify codegen 等会影响最后生成的文本。

`process_js_with_custom_pass()` 的注释还给了一个特别好的读码锚点：自定义 `custom_before_pass` 会在处理 decorator、应用 `resolver`、剥离 TypeScript 节点之后运行。也就是说，高层 API 不只是“调用 parser 再调用 codegen”，它会保证一些 pass 顺序，让插件作者或内部调用者站在相对稳定的位置上扩展。

读 `Compiler` 时，建议拿一张纸写下三个问题：

| 问题 | 在 `Compiler` 里的对应物 |
| --- | --- |
| 输入从哪里来？ | `SourceFile`、`SourceMap`、`load_file()`、comments。 |
| 配置如何影响行为？ | `Options`、`Config`、`JscConfig`、`ModuleConfig`、`JsMinifyOptions`。 |
| 输出如何交付？ | `TransformOutput`、`print()`、`Emitter`、source map。 |

只要这三个问题还没答清，就先别追 minifier 的每个规则。高层入口的复杂度来自“产品要覆盖很多场景”，不是来自某一个函数写得神秘。

## 三个基础 transform：resolver、hygiene、fixer

SWC 的 `ARCHITECTURE.md` 特别点名了三个 base transform：`resolver`、`hygiene`、`fixer`。它们在 `crates/swc_ecma_transforms_base/` 下，是读 transform 之前最值得先认识的三块地基。

`resolver` 在 `src/resolver/mod.rs`。它会给作用域里的标识符打上 `SyntaxContext` / `Mark`，让同名变量可以被区分：

```js
let a = 1;
{
    let a = 2;
    use(a);
}
use(a);
```

人眼看两个 `a` 能靠缩进和作用域判断，编译器则需要把“这个引用指向哪个绑定”编码进 AST。`resolver` 的文档里也提醒：如果一个 pass 要生成类似 `require` 这样的全局引用，应该接受 `unresolved_mark`，避免被用户局部变量误伤。

`hygiene` 在 `src/hygiene/mod.rs`。它把已经带上下文的同名标识符改成不会冲突的输出名。例如架构说明里用 `a#0`、`a#1` 表示两个不同上下文，最后可能打印成 `a` 和 `a1`。这一步关乎“生成代码能不能保持语义”。

`fixer` 在 `src/fixer.rs`。它在打印前修补 AST 的表示，让 codegen 不用每个 pass 都手动处理括号优先级。比如 pass 可以先构造一个语义上需要括号的二元表达式，`fixer` 再负责让输出变成 `(1 + 2) * 3` 这种不会改变含义的代码。

这三个 pass 说明了 transform 不是“随便改树”：

- `resolver` 保证名字引用有身份。
- `hygiene` 保证输出名字不冲突。
- `fixer` 保证输出语法不改变表达式含义。

等这三件事明白后，再读兼容性 transform、React transform、TypeScript transform、module transform，心里会稳很多。

## bindings 和 packages：为什么同一套 Rust 会出现在 npm 里

SWC 既是 Rust 库，也是 JavaScript 开发者每天会通过 npm 使用的工具。这个桥梁主要在两个地方：

- `bindings/*`：Rust cdylib、N-API、Wasm、CLI binding 等，把 Rust crate 编译成可被 Node/Wasm 调用的产物。
- `packages/*`：`@swc/core`、helpers、html、minifier、react-compiler 等 npm package，把 binding 和 JS 侧 API 包成用户熟悉的接口。

以 `bindings/binding_core_node/Cargo.toml` 为例，它的 `crate-type = ["cdylib"]`，依赖 `napi`、`napi-derive` 和 `swc_core`。`swc_core` 又启用了一批 feature，例如 `ecma_ast`、`ecma_minifier`、`ecma_codegen`、`ecma_transforms`、`ecma_visit`、`bundler`、`base_node`、`base_concurrent` 等。这个文件非常适合回答一个现实问题：为什么一个 Rust 编译器项目会有那么多 Node 相关目录？因为用户入口在 JavaScript 生态里，Rust 负责提供高性能核心。

`package.json` 也能看到另一层事实：根工作区的脚本会进入 `packages/core`、`packages/minifier`、`packages/html`、`packages/react-compiler` 做 build/test。这说明 SWC 的开源工程不只维护 parser 正确性，还要维护发布包、平台绑定、JavaScript 测试和生态集成。

新手读到 bindings 时要放慢一点：这里牵涉 Rust ABI、N-API、Wasm、平台产物、npm workspace 和发布脚本。它很重要，但它不是理解 parser 的前置条件。

## 测试和贡献：大项目靠反馈回路活着

`CONTRIBUTING.md` 给出的贡献路径也很值得学。它建议先读 `ARCHITECTURE.md`，找 `E-easy` 和 `E-mentor` 标签的问题，改动非平凡逻辑时加测试，并运行对应 package 的测试。

SWC 的测试规模很大，不建议新手第一天就跑全量。更实用的策略是按你读的区域缩小测试范围：

```bash
cd third_party/swc
cargo test -p swc-ast-explorer
cargo test -p swc_ecma_parser
cargo test -p swc_ecma_codegen
cargo test -p swc_ecma_transforms_base
```

架构说明还提到 parser 和 codegen 会借助 test262 以及 golden fixture。这里的工程味很浓：parser 不是只靠几个手写样例判断对错，codegen 也不是只看“能不能输出字符串”，而是用大量标准用例和引用结果保护行为。

读开源项目时，测试目录常常比 README 更诚实。README 告诉你项目想成为什么，测试告诉你维护者害怕什么会坏。SWC 这种编译器项目尤其如此：语法边界、source map、错误恢复、压缩规则、模块输出、平台 binding，任何一处回归都可能影响大量用户。

## 读码检查表

读 SWC 这类大仓库时，可以每读一段就问：

| 问题 | 在本页的答案 |
| --- | --- |
| 这段代码的输入是什么？ | stdin 里的源码字符串 |
| 第一层结构化对象是什么？ | `SourceFile` |
| 谁负责字符到 token？ | `Lexer` |
| 谁负责 token 到 AST？ | `Parser` |
| AST 顶层类型是什么？ | `Program` |
| 错误在哪里展示？ | `Handler` / diagnostic |
| 这个工具是否生成 JS？ | 不生成，只 Debug 打印 AST |
| 生成 JS 应该看哪里？ | `swc_ecma_codegen::Emitter` |
| 修改 AST 应该看哪里？ | `swc_ecma_visit` / transform pass |
| 高层编译入口在哪里？ | `swc::Compiler` |
| Node/Wasm 入口在哪里？ | `bindings/*` 和 `packages/*` |
| transform 的地基是什么？ | `resolver`、`hygiene`、`fixer` |
| 生成代码和测试夹具从哪里来？ | `tools/generate-code`、`testing`、test262、golden fixtures |

## 跟着跑一次

如果你本机 Rust 工具链能满足 SWC 当前开发环境，可以在 ignored 源码目录里试这个小工具。当前 checkout 的 `rust-toolchain` 固定为 `nightly-2026-04-10`；如果工具链缺失，第一次运行可能会安装或下载依赖。

```bash
cd third_party/swc
printf 'const answer: number = 42;\n' | cargo run -p swc-ast-explorer
printf 'const el = <Button count={1} />;\n' | cargo run -p swc-ast-explorer -- --spans
```

不想先编译也没关系，可以只用搜索读主线：

```bash
cd third_party/swc
rg -n "fn main|parse_stdin|parse_source" crates/swc-ast-explorer/src
rg -n "with_file_parser|parse_file_as_program|pub fn parse_program" crates/swc_ecma_parser/src
rg -n "pub enum Program|pub struct Module|pub struct Script" crates/swc_ecma_ast/src
```

想把全项目地图也跑一遍，可以再做一组“目录级搜索”：

```bash
cd third_party/swc
find crates -maxdepth 1 -type d | sort | sed -n '1,80p'
find bindings -maxdepth 2 -type d | sort
find packages -maxdepth 2 -type d | sort
rg -n "pub struct Compiler|process_js_file|process_js_with_custom_pass" crates/swc/src/lib.rs
rg -n "pub fn resolver|pub fn hygiene|pub fn fixer" crates/swc_ecma_transforms_base/src
```

这组命令不会让你立刻理解所有实现，但会帮你确认本文的项目分层不是凭空画出来的。

## 小练习

1. 把输入改成 `let x = 1 + 2 * 3;`，观察 AST 里二元表达式的嵌套顺序。
2. 把输入改成 `import x from "x"; console.log(x);`，观察结果为什么是 `Program::Module`。
3. 把输入改成 `function broken(`，观察 `handler` 打印的错误，而不是只看 Rust panic。
4. 打开 `--spans`，再关掉它，对比 `Span` 对“读树结构”的干扰和帮助。
5. 用 `rg -n "pub struct Config|pub struct JscConfig" crates/swc/src/config` 找到 `.swcrc` 配置如何进入 `Compiler`。
6. 打开 `bindings/binding_core_node/Cargo.toml`，找出它启用了哪些 `swc_core` feature，并解释为什么 Node binding 需要这些能力。
7. 在 `crates/swc_ecma_transforms_base/src` 里分别找到 `resolver`、`hygiene`、`fixer`，用一句话写下它们各自保护什么。

## 过关标准

你可以用下面的问题检查自己有没有真读懂：

- 能不能画出 `main.rs -> parser.rs -> swc_ecma_parser -> swc_ecma_ast` 的调用链？
- 能不能解释 `SourceMap` 为什么比普通 `String` 多一层价值？
- 能不能说出 `parse_file_as_program()` 和 `parse_file_as_module()` 的区别？
- 能不能在 `Program::Module`、`Program::Script`、`ModuleItem::Stmt` 之间分清数据形状？
- 能不能指出 AST Explorer 打印 AST，codegen 才生成 JavaScript？
- 能不能把 `crates/*`、`bindings/*`、`packages/*`、`tools/*` 分别放到 SWC 项目地图里？
- 能不能解释 `resolver`、`hygiene`、`fixer` 为什么是 transform 路线的地基？
- 能不能说明 `swc::Compiler` 为什么是产品入口而不是第一读码入口？

## 暂时不要读哪里

SWC 有很多精彩但不适合第一天读的部分：

- minifier 里的压缩规则很多，依赖大量 JavaScript 语义细节。
- transform 里的兼容性 pass 会碰到作用域、hygiene、浏览器目标和语法降级。
- Node binding 同时牵涉 Rust、N-API、包发布和平台产物。
- generated visitor 文件非常长，先知道它存在，不要从生成代码开始读。

读开源项目不是比谁更快冲进深水区。先走通一条短路径，确认每个值从哪里来、到哪里去，再逐步扩大地图。SWC 这座城市很大；今天先认识入口、路牌和主干道。
