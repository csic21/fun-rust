# 开源读码：从 mdBook 看一个 Rust CLI 怎么长大

mdBook 是 Rust 生态里非常适合作为开源精读起点的项目：它是成熟项目，但主线不神秘。用户写 Markdown 和 `book.toml`，运行 `mdbook build`，最后得到一个静态网站。它既有真实工程复杂度，又不像编译器那样一上来就面对 AST、语法恢复和大量生成代码。

本页先给全项目地图，再追一条最能串起全局的主线：`mdbook build` 如何从命令行入口一路走到 HTML renderer。这样读的好处是不会把 mdBook 误会成“一个 Markdown 转 HTML 函数”，也不会第一天就被主题模板、搜索索引、watcher、HTTP server 和外部插件协议冲散注意力。

读完这页，你应该能把 mdBook 说成一个完整 Rust 工程：CLI 负责接收用户意图，driver 负责加载和调度，core 保存共享数据结构，summary 解析目录，preprocessor 修改 `Book`，renderer 输出目标格式，HTML renderer 再处理主题、静态资源、搜索、打印页和重定向。

本页基于本仓库内的源码 checkout：

- 本地路径：`third_party/mdbook/`
- 当前提交：[`0ea415897758ea9b2904ed47ba9cb4901f9eb089`](https://github.com/rust-lang/mdBook/tree/0ea415897758ea9b2904ed47ba9cb4901f9eb089)，提交日期 `2026-05-19`
- 上游仓库：[rust-lang/mdBook](https://github.com/rust-lang/mdBook)
- 上游许可证：MPL-2.0。源码目录已被 `.gitignore` 忽略，本站只引用它作为读码材料，不把第三方源码发布进本站内容。

![mdBook build 主流程图](/images/mdbook-build-pipeline.png)

::: tip 读码姿势
先看项目边界，再追 `mdbook build`：命令行入口接收子命令，`build` 命令加载一本书，driver 运行预处理器，再把 `RenderContext` 交给 renderer 输出。其他命令先放进“旁路地图”，知道它们复用哪些组件就够了。
:::

## 本课目标

读完这一页，你应该能做到五件事：

- 说清 `mdbook build` 从 `main()` 到 `Renderer::render()` 的调用链。
- 分清 CLI 层、driver 层、core 数据结构、preprocessor 和 renderer 的职责。
- 看懂 `Book`、`BookItem`、`Chapter` 这种递归数据结构。
- 认出 `Box<dyn Renderer>`、`Box<dyn Preprocessor>`、`Result`、`PathBuf`、feature gate 和拓扑排序在真实项目里的用途。
- 知道 mdBook 为什么不是“Markdown 转 HTML 一个函数”。

## 项目全景：先把边界切开

![mdBook workspace crate 分层图](/images/mdbook-crate-map.png)

mdBook 的第一层边界在 workspace。根目录 `Cargo.toml` 的 `[workspace]` 里把根 package 和 `crates/*`、示例、guide helper 放到同一个工作区。根 package 名为 `mdbook`，产出最终命令行程序；`crates/` 下的内部 crate 则把核心能力拆出去。

可以先把项目分成六块：

| 层次 | 关键位置 | 主要职责 | 读码时先问 |
| --- | --- | --- | --- |
| CLI | `src/main.rs`、`src/cmd/*.rs` | 定义子命令、解析参数、把用户意图转成 driver API 调用 | 用户运行了哪个命令？参数在哪里变成 Rust 值？ |
| Driver | `crates/mdbook-driver/src/mdbook.rs`、`load.rs` | 加载配置和书、决定 renderer/preprocessor、执行构建、运行文档测试 | 一次构建的总控对象是谁？流程在哪里串起来？ |
| Core | `crates/mdbook-core/src/book.rs`、`config.rs` | `Book`、`BookItem`、`Chapter`、`Config` 等共享数据结构 | 书在内存里长什么样？配置和内容怎么分开？ |
| Summary | `crates/mdbook-summary/src/lib.rs` | 把 `SUMMARY.md` 解析成加载配方 | 目录文件如何变成章节树？ |
| Extension API | `crates/mdbook-preprocessor`、`crates/mdbook-renderer` | 定义插件和后端协议 | 外部程序如何参与构建？trait 边界在哪里？ |
| Output | `crates/mdbook-html`、`crates/mdbook-markdown` | 把 `RenderContext` 输出成 HTML 或预处理后的 Markdown | 真正写文件的代码在哪里？ |

这张表的重点不是背路径，而是建立项目的“职责地图”。真实开源项目里，读者最容易犯的错是从一个文件钻太深，忘了它属于哪一层。mdBook 的层次很适合练这个习惯：入口层很薄，driver 层最像业务流程，core 层最像数据模型，输出层最像产品细节。

### 为什么要拆这么多 crate

从新手视角看，多 crate 可能显得绕；从工程视角看，它解决了三个问题。

第一，命令行程序和可复用库分开。`src/main.rs` 可以专心处理 `clap`、日志和退出码；`mdbook-driver` 则提供 `MDBook::load()`、`MDBook::build()`、`MDBook::init()` 这类 API。这样其他 Rust 程序也可以把 mdBook 当库用，而不是只能 shell out 调命令。

第二，扩展协议需要稳定数据类型。外部 preprocessor 和 renderer 都要读写 JSON。`Book`、`Config`、`RenderContext`、`PreprocessorContext` 这些类型如果散在 CLI crate 里，扩展边界会很混乱；放进独立 crate 后，协议边界更清楚。

第三，输出后端可以独立演化。HTML renderer 关心 Handlebars、主题、搜索、静态资源和打印页；Markdown renderer 只关心把预处理后的章节写回文件；外部 renderer 通过命令协议接入。它们都实现 `Renderer`，但不需要共享同一堆实现细节。

### 根目录 Cargo.toml 透露的工程信号

先不要打开所有 Rust 文件，先读根 `Cargo.toml`。这一份文件已经透露了很多项目判断：

- `edition.workspace = true`，workspace 统一使用 Rust 2024 edition。
- `rust-version = "1.88.0"` 写在 `[workspace.package]`，说明项目明确维护 MSRV。
- 默认 feature 是 `["watch", "serve", "search"]`，所以本地 `cargo build` 默认会编进文件监听、HTTP serve 和 HTML 搜索。
- `watch` feature 拉入 `notify`、`ignore`、`walkdir` 等文件系统监听相关依赖。
- `serve` feature 拉入 `tokio`、`axum`、`tower-http` 和 websocket 相关依赖。
- `search` feature 透传到 `mdbook-html/search`。
- `pulldown-cmark` 的注释写着 “Do not update, part of the public api.”，这是依赖版本会影响公开行为的信号。
- workspace lint 对 `missing_docs`、`rust_2018_idioms`、`unreachable_pub` 有要求，说明它把库 API 的文档和可见性当成工程质量的一部分。

这类信息不是“配置杂项”。它告诉你项目在维护什么承诺：命令行体验、库 API、插件协议、HTML 功能、最低 Rust 版本和公开行为兼容性。

## 源码索引：第一次打开哪些文件

第一次读 mdBook，不建议把 `crates/mdbook-html` 的模板 helper 全部打开。先用下面这组文件建立主干：

| 文件 | 先看什么 | 读完应该知道 |
| --- | --- | --- |
| `src/main.rs` | `main()`、`create_clap_command()`、`get_book_dir()` | CLI 怎样分发子命令，路径怎样归一化 |
| `src/cmd/build.rs` | `execute()` | `mdbook build` 只是把参数转给 `MDBook` |
| `src/cmd/command_prelude.rs` | `arg_dest_dir()`、`arg_root_dir()`、`set_dest_dir()` | 多个命令如何复用参数定义 |
| `crates/mdbook-driver/src/mdbook.rs` | `MDBook`、`load()`、`build()`、`execute_build_process()` | 一次构建的总控流程 |
| `crates/mdbook-driver/src/load.rs` | `load_book()`、`load_summary_item()`、`load_chapter()` | 磁盘文件如何进入 `Book` 树 |
| `crates/mdbook-core/src/book.rs` | `Book`、`BookItem`、`Chapter`、`BookItems` | 内存里的书如何递归表示 |
| `crates/mdbook-summary/src/lib.rs` | `parse_summary()`、`Summary`、`SummaryItem`、`Link` | `SUMMARY.md` 如何变成加载配方 |
| `crates/mdbook-preprocessor/src/lib.rs` | `Preprocessor`、`PreprocessorContext` | 预处理器的输入输出边界 |
| `crates/mdbook-renderer/src/lib.rs` | `Renderer`、`RenderContext` | renderer trait object 为什么成立 |
| `crates/mdbook-html/src/html_handlebars/hbs_renderer.rs` | `impl Renderer for HtmlHandlebars` | HTML 后端真正写了哪些文件 |

这组文件读完，基本就能解释项目骨架。后面再扩展到 `serve.rs`、`watch.rs`、主题系统、搜索索引或外部插件协议，会稳很多。

## 读码地图

先把主线画出来：

```text
src/main.rs
  -> create_clap_command()
  -> cmd::build::execute()
  -> get_book_dir()
  -> MDBook::load()
  -> MDBook::load_with_config()
  -> load_book()
  -> parse_summary()
  -> load_book_from_disk()
  -> MDBook::build()
  -> execute_build_process()
  -> preprocess_book()
  -> RenderContext::new()
  -> Renderer::render()
  -> 默认 HTML renderer: HtmlHandlebars::render()
```

这条路线故意不覆盖所有能力。第一次读只要能把“磁盘上的一本书”如何变成“内存里的 `Book`”，再如何交给 renderer 输出说清楚，就已经读到了项目骨架。

## 第 0 站：Cargo.toml 先告诉你项目边界

根目录 [`Cargo.toml`](https://github.com/rust-lang/mdBook/blob/0ea415897758ea9b2904ed47ba9cb4901f9eb089/Cargo.toml) 表明 mdBook 是 workspace，不是单 crate 小程序。

先抓几件事：

- 根 package 名为 `mdbook`，它产出最终命令行程序。
- workspace 里有多个内部 crate，例如 `mdbook-driver`、`mdbook-core`、`mdbook-html`、`mdbook-renderer`、`mdbook-summary`。
- 根 crate 更靠近 CLI，driver crate 更靠近“加载、预处理、渲染”的流程控制。
- core crate 放共享数据结构，比如 `Book`、`BookItem`、`Chapter`、`Config`。
- renderer crate 定义后端接口，HTML 输出在 `mdbook-html`。
- feature 会影响最终二进制，例如 `watch` 和 `serve` 不是无条件编译。

真实 Rust 项目经常把“用户入口”和“可复用逻辑”拆开。读开源项目时，先问两个问题：

1. 哪个 crate 是入口？
2. 哪个 crate 是核心业务逻辑？

在 mdBook 里，入口是根 crate 的 `src/main.rs`，构建主流程在 `crates/mdbook-driver/src/mdbook.rs`。

## 第 1 站：`main.rs` 只做命令分发

入口在 [`src/main.rs`](https://github.com/rust-lang/mdBook/blob/0ea415897758ea9b2904ed47ba9cb4901f9eb089/src/main.rs)。`main()` 的职责很克制：

1. 调用 `init_logger()` 初始化日志。
2. 调用 `create_clap_command()` 建立命令行结构。
3. 读取用户选择的子命令。
4. 把子命令交给对应模块执行。
5. 如果执行返回错误，打印 backtrace 信息并用退出码 `101` 结束。

可以把它简化成这个读码骨架：

```rust
fn main() {
    init_logger();
    let command = create_clap_command();

    let res = match command.get_matches().subcommand() {
        Some(("init", args)) => cmd::init::execute(args),
        Some(("build", args)) => cmd::build::execute(args),
        Some(("clean", args)) => cmd::clean::execute(args),
        Some(("test", args)) => cmd::test::execute(args),
        _ => unreachable!(),
    };

    if let Err(e) = res {
        utils::log_backtrace(&e);
        std::process::exit(101);
    }
}
```

这不是逐字复制，而是保留形状。真实源码还包含 `completions`，以及受 `#[cfg(feature = "...")]` 控制的 `watch` 和 `serve`。

这里最值得学的是分层克制：`main()` 不读 `SUMMARY.md`，不解析 Markdown，也不写 HTML。它只负责把“用户要执行哪个命令”交出去。

## 第 2 站：`create_clap_command()` 是 CLI 合同

同在 `src/main.rs` 里的 `create_clap_command()` 定义了用户能看到的 CLI 形状：

- 程序名、描述、作者、版本。
- 没传子命令时显示帮助。
- 注册 `init`、`build`、`test`、`clean`、`completions` 子命令。
- 如果编译了 `watch` / `serve` feature，再注册对应子命令。

这个函数是“用户界面”和“内部实现”的边界。CLI 稳定性很重要，所以参数定义通常集中在少数地方。新手读到这里可以顺便复习 feature gate：

```rust
#[cfg(feature = "watch")]
let app = app.subcommand(cmd::watch::make_subcommand());
```

`#[cfg(...)]` 是编译期条件，不是运行时 `if`。feature 关闭时，对应代码不会进入最终二进制。

## 第 3 站：`build` 命令是一层薄胶水

`mdbook build` 的执行函数在 [`src/cmd/build.rs`](https://github.com/rust-lang/mdBook/blob/0ea415897758ea9b2904ed47ba9cb4901f9eb089/src/cmd/build.rs)。源码很短，主流程是：

```rust
pub fn execute(args: &ArgMatches) -> Result<()> {
    let book_dir = get_book_dir(args);
    let mut book = MDBook::load(book_dir)?;

    set_dest_dir(args, &mut book);

    book.build()?;

    if args.get_flag("open") {
        let path = book.build_dir_for("html").join("index.html");
        // open path
    }

    Ok(())
}
```

这一层知道三件事：

- 命令行参数在哪里。
- 书的根目录在哪里。
- 用户是否要求构建完自动打开浏览器。

它不知道 `SUMMARY.md` 怎么解析，不知道预处理器怎么排序，也不知道 HTML 模板怎么渲染。这就是薄胶水层的价值：把用户输入转成核心 API 调用。

## 第 4 站：`get_book_dir()` 把相对路径变成明确路径

`get_book_dir()` 在 `src/main.rs`，被多个命令复用。它读取 `dir` 参数：

- 用户传了相对路径，就拼到当前工作目录上。
- 用户传了绝对路径，就直接使用。
- 用户没传，就用当前工作目录。

这一步看起来普通，但真实 CLI 很需要这种边界处理。路径不是普通字符串，`PathBuf` 能表达平台差异、相对/绝对路径和路径拼接。Rust 项目里遇到文件系统路径，优先找 `Path` / `PathBuf`，不要把路径当 `String` 硬切。

## 第 5 站：`MDBook::load()` 读取配置

高层流程在 [`crates/mdbook-driver/src/mdbook.rs`](https://github.com/rust-lang/mdBook/blob/0ea415897758ea9b2904ed47ba9cb4901f9eb089/crates/mdbook-driver/src/mdbook.rs)。`MDBook` 是构建一本书的总控对象，它保存：

- `root: PathBuf`：书的根目录。
- `config: Config`：构建配置。
- `book: Book`：内存里的书。
- `renderers: IndexMap<String, Box<dyn Renderer>>`：要执行的输出后端。
- `preprocessors: IndexMap<String, Box<dyn Preprocessor>>`：渲染前要运行的预处理器。

`MDBook::load()` 做的事是：

1. 把传入路径当作 `book_root`。
2. 查找 `book.toml`。
3. 如果配置文件存在，调用 `Config::from_disk()`。
4. 如果配置文件不存在，使用 `Config::default()`。
5. 调用 `config.update_from_env()`，允许环境变量覆盖配置。
6. 进入 `MDBook::load_with_config(book_root, config)`。

这一步能看到 `Result` 的工程价值。读取 TOML、解析配置、读取环境变量都可能失败；mdBook 用 `anyhow::Result` 把错误向上传给 CLI 层统一处理。

## 第 6 站：`load_with_config()` 建立三件核心资产

`MDBook::load_with_config()` 接着做三件事：

```text
src_dir = root.join(config.book.src)
book = load_book(src_dir, &config.build)
renderers = determine_renderers(&config)
preprocessors = determine_preprocessors(&config, &root)
```

这三件资产对应后续构建流程：

- `book`：要处理的内容。
- `renderers`：内容最后要输出到哪里。
- `preprocessors`：输出前要怎么改写内容。

这里有一个重要工程直觉：配置读取和内容加载不是一回事。`Config` 只是“构建规则”，`Book` 才是“被构建的内容”。真实项目如果把规则和数据混在一起，后面通常会很难测试和扩展。

## 第 7 站：`load_book()` 从 `SUMMARY.md` 开始

加载内容的代码在 [`crates/mdbook-driver/src/load.rs`](https://github.com/rust-lang/mdBook/blob/0ea415897758ea9b2904ed47ba9cb4901f9eb089/crates/mdbook-driver/src/load.rs)。

`load_book()` 的顺序是：

1. 找到 `src/SUMMARY.md`。
2. 读取 `SUMMARY.md` 文本。
3. 调用 `mdbook_summary::parse_summary()` 解析目录。
4. 如果 `cfg.create_missing` 为真，就根据目录创建缺失章节文件。
5. 调用 `load_book_from_disk()` 递归读取章节。

从用户视角看，`SUMMARY.md` 是一本书的目录；从程序视角看，它是一份加载配方：哪些文件要读，章节层级是什么，哪些项目是分隔线或 part title。

这一步要特别注意：mdBook 不是扫描 `src/` 下所有 Markdown 文件。它以 `SUMMARY.md` 为主线。没有出现在目录里的文件，不会自然成为书的一章。

## 第 8 站：递归读取章节

`load_book_from_disk()` 把 summary 里的 prefix、numbered、suffix 章节串起来，然后逐个调用 `load_summary_item()`。

`load_summary_item()` 是一个很好的 enum 读码例子：

```rust
match item {
    SummaryItem::Separator => Ok(BookItem::Separator),
    SummaryItem::Link(link) => load_chapter(link, src_dir, parent_names).map(BookItem::Chapter),
    SummaryItem::PartTitle(title) => Ok(BookItem::PartTitle(title.clone())),
    _ => panic!("SummaryItem {item:?} not covered"),
}
```

它把 summary 层的数据形状转换成 book 层的数据形状。遇到普通链接就加载章节，遇到分隔线就保留分隔线，遇到 part title 就保留标题。

`load_chapter()` 继续做几件事：

- 如果 link 有文件路径，就读 Markdown 文件。
- 如果文件有 UTF-8 BOM，就移除开头 BOM。
- 调用 `Chapter::new()` 建立章节。
- 如果 link 没有路径，就调用 `Chapter::new_draft()` 建立草稿章节。
- 把当前章节名压进 `parent_names`，再递归读取嵌套项目。
- 最后把子项目放进 `ch.sub_items`。

这里可以复习所有权和借用：`parent_names` 是 `Vec<String>`，递归时需要给子项一份父级路径。源码里通过 clone 和局部变量让数据流清楚，而不是让多个递归分支共享同一个可变引用。

## 第 9 站：`Book`、`BookItem`、`Chapter` 是核心数据形状

![mdBook Book 递归数据结构图](/images/mdbook-book-tree.png)

共享数据结构在 [`crates/mdbook-core/src/book.rs`](https://github.com/rust-lang/mdBook/blob/0ea415897758ea9b2904ed47ba9cb4901f9eb089/crates/mdbook-core/src/book.rs)。

可以先记这个简化模型：

```rust
struct Book {
    items: Vec<BookItem>,
}

enum BookItem {
    Chapter(Chapter),
    Separator,
    PartTitle(String),
}

struct Chapter {
    name: String,
    content: String,
    number: Option<SectionNumber>,
    sub_items: Vec<BookItem>,
    path: Option<PathBuf>,
    source_path: Option<PathBuf>,
    parent_names: Vec<String>,
}
```

这个结构很适合新手理解递归数据：

- 一本书有很多 `BookItem`。
- `BookItem` 可能是一章，也可能是分隔线或 part title。
- 一章里还有 `sub_items`，所以章节可以嵌套。
- `path` 是输出视角的路径，`source_path` 是源文件视角的路径。
- `Option<PathBuf>` 表示草稿章节可能没有真实文件。

`Book::iter()` 返回深度优先迭代器。它不是先把树复制成一个新 Vec，而是用 `VecDeque` 保存待访问项，一边走一边产出。读到这里可以把它和“迭代器是惰性的”联系起来。

### 这棵树为什么重要

后面的很多功能都围着这棵树转：

- `links` 预处理器会遍历每个 `Chapter`，展开 `include`、`rustdoc_include`、`playground` 和 `title` 这类 mdBook handlebars 指令。
- `index` 预处理器会遍历章节，把 `README.md` 这种事实上的目录页改成输出视角的 `index.md`。
- `MarkdownRenderer` 会遍历非草稿章节，把预处理后的 Markdown 写到目标目录。
- `HtmlHandlebars` 会先把 `Book` 转成渲染树，再逐章写 HTML，同时计算上一章、下一章、目录、打印页和搜索索引。
- `MDBook::test()` 也会在预处理之后遍历章节，把每个章节内容写到临时目录，再交给 `rustdoc --test`。

所以 `Book` 不是一个“展示用模型”，它是 driver、preprocessor、renderer、test 命令之间共享的核心协议。读 mdBook 时只要看到函数参数里出现 `Book`、`BookItem` 或 `Chapter`，就应该回到这张图：这个函数是在读树、改树、还是把树输出成文件？

### `iter()` 和 `for_each_mut()` 的差别

`Book::iter()` 返回不可变深度优先迭代器，适合读取。`Book::for_each_mut()` 接收闭包，递归地把每个 `BookItem` 的可变引用交给调用者，适合预处理器修改内容。

这个设计很 Rust：如果只是读，用迭代器；如果要递归修改，不强行做一个复杂的可变迭代器，而是让调用者给一个闭包。源码注释也点出原因：普通 iterator 形式可能带来 iterator invalidation 问题。读到这里可以把它和借用规则联系起来：Rust 不是不能表达递归修改，而是倾向于把可变访问的边界收窄到一个更明确的 API。

## 第 10 站：renderer 为什么是 trait object

![mdBook preprocessor 和 renderer 扩展点](/images/mdbook-extension-points.png)

renderer 接口定义在 [`crates/mdbook-renderer/src/lib.rs`](https://github.com/rust-lang/mdBook/blob/0ea415897758ea9b2904ed47ba9cb4901f9eb089/crates/mdbook-renderer/src/lib.rs)：

```rust
pub trait Renderer {
    fn name(&self) -> &str;
    fn render(&self, ctx: &RenderContext) -> Result<()>;
}
```

这段接口很小，但扩展性很强。只要某个类型能返回名字，并且能根据 `RenderContext` 输出内容，它就是 renderer。

`RenderContext` 里有 renderer 需要的材料：

- mdBook 版本。
- 书的根目录。
- 加载并预处理后的 `Book`。
- 配置。
- 输出目录。
- 内部章节标题映射。

`MDBook` 保存的是 `Box<dyn Renderer>`，因为 HTML renderer、Markdown renderer 和命令式外部 renderer 不是同一个具体类型，但它们都实现了 `Renderer`。这就是 trait object 的实用场景：运行时把不同具体类型放进同一个集合，用统一接口调用。

这里还有一个容易忽略的点：`RenderContext` 可以序列化。内置 renderer 在同一个进程里拿到 `&RenderContext`，外部命令 renderer 则由 `CmdRenderer` 把 `RenderContext` 写成 JSON，通过子进程 stdin 发出去。也就是说，`Renderer` trait 是 Rust 代码内部的扩展点，JSON 协议是外部程序的扩展点。mdBook 同时照顾了“作为 Rust 库扩展”和“作为命令行工具扩展”两种使用方式。

## 第 10.5 站：preprocessor 是渲染前的改书步骤

preprocessor 接口定义在 [`crates/mdbook-preprocessor/src/lib.rs`](https://github.com/rust-lang/mdBook/blob/0ea415897758ea9b2904ed47ba9cb4901f9eb089/crates/mdbook-preprocessor/src/lib.rs)：

```rust
pub trait Preprocessor {
    fn name(&self) -> &str;
    fn run(&self, ctx: &PreprocessorContext, book: Book) -> Result<Book>;

    fn supports_renderer(&self, _renderer: &str) -> Result<bool> {
        Ok(true)
    }
}
```

和 renderer 对比一下会更清楚：

| 接口 | 输入 | 输出 | 作用 |
| --- | --- | --- | --- |
| `Preprocessor::run()` | `PreprocessorContext` + `Book` | 新的 `Book` | 渲染前改内容，比如展开 include、改标题、改路径 |
| `Renderer::render()` | `RenderContext` | 文件系统副作用 | 把书输出到目标目录，比如 HTML、Markdown、外部后端 |

内置的 `links` 预处理器会处理 `include`、`rustdoc_include`、`playground` 和 `title` 这类 handlebars 指令。内置的 `index` 预处理器会把 `README.md` 这种输入路径改成输出视角的 `index.md`。外部预处理器由 `CmdPreprocessor` 启动子进程，把 `(PreprocessorContext, Book)` 写成 JSON 给它，再从 stdout 读回新的 `Book`。

这里要抓住一个工程要点：preprocessor 不应该直接写最终输出。它的职责是把“书的内存结构”变成另一个“书的内存结构”。最终写文件交给 renderer。这个边界让 `mdbook test`、`markdown` renderer、`html` renderer 都能复用同一份预处理逻辑。

## 第 11 站：`determine_renderers()` 决定输出后端

`determine_renderers()` 读取配置里的输出表：

- key 是 `html`，就创建 `HtmlHandlebars`。
- key 是 `markdown`，就创建 `MarkdownRenderer`。
- 其他 key 默认对应外部命令，比如 `mdbook-epub`。
- 如果配置里没有任何输出，就默认加入 HTML renderer。

所以 mdBook 的默认行为不是“硬编码永远只输出 HTML”。更准确地说：没有显式输出配置时，默认 renderer 是 HTML。

这一步也解释了 `build_dir_for()` 的逻辑：

- 只有一个 renderer 时，直接用主构建目录。
- 有多个 renderer 时，每个 renderer 在主构建目录下有自己的子目录。

这让 `html`、`epub`、`latex` 之类输出可以共存。

## 第 12 站：预处理器顺序有拓扑排序

`determine_preprocessors()` 比 renderer 更复杂，因为预处理器之间可能有顺序关系。配置支持 `before` 和 `after`，源码用 `TopologicalSort<String>` 来安排执行顺序。

它的大致流程是：

1. 如果启用默认预处理器，加入 `links` 和 `index`。
2. 读取用户配置的 `preprocessor` 表。
3. 把每个预处理器名字加入拓扑排序图。
4. 根据 `before` / `after` 添加依赖边。
5. 每次取出当前没有依赖的节点。
6. 对同一批无依赖节点排序，减少不稳定顺序。
7. 内置名字映射到内置预处理器，其他名字映射到外部命令预处理器。
8. 如果最后图里还有节点，说明有循环依赖，返回错误。

这是很好的工程课：配置里的“我想先后怎么跑”，不能直接变成随便排序。成熟项目会把它转换成明确的依赖图，并在循环依赖时给出错误。

## 第 13 站：`MDBook::build()` 执行流水线

`MDBook::build()` 的源码非常短：

```rust
pub fn build(&self) -> Result<()> {
    info!("Book building has started");

    for renderer in self.renderers.values() {
        self.execute_build_process(&**renderer)?;
    }

    Ok(())
}
```

短不代表简单。它把每个 renderer 都交给 `execute_build_process()`，而后者才是真正的构建小流水线：

```text
preprocess_book(renderer)
  -> build_dir_for(renderer.name())
  -> RenderContext::new(root, preprocessed_book, config, build_dir)
  -> renderer.render(&render_context)
```

注意预处理器是按 renderer 运行的。某些预处理器可以声明只支持某些 renderer，`preprocessor_should_run()` 会根据配置和 `supports_renderer()` 决定是否执行。

## 第 14 站：默认 HTML renderer 才真正写文件

默认 HTML 后端在 `mdbook-html` crate，主入口是 `HtmlHandlebars::render()`。第一次读不需要展开所有模板 helper，只要知道它负责把 `RenderContext` 里的 `Book` 写成完整静态站点。

HTML renderer 不只是把 Markdown 字符串转成 HTML 字符串，它还要处理：

- 输出目录。
- Handlebars 模板。
- 主题资源。
- 目录文件。
- 搜索文件。
- 404 页面。
- 打印页。
- 重定向。
- 静态资源复制。

这就是为什么前面要把职责拆开：driver 只知道“调用 renderer”，renderer 才知道某种输出格式的细节。

### HTML renderer 的主流程再拆细一点

`HtmlHandlebars::render()` 是一个很适合练“长函数切块读”的例子。不要从每个 helper 钻进去，先按副作用分段：

1. 读取 `book_config`、`html_config`、`src_dir`、`destination`、`build_dir`。
2. 如果输出目录存在，先清理旧 HTML 输出。
3. 选择主题目录，加载默认或用户主题。
4. 注册 Handlebars 模板、partial 和 helper。
5. 调用 `make_data()` 准备模板上下文。
6. 调用 `build_trees()` 把 `Book` 转成 HTML 渲染需要的章节树。
7. 准备 `StaticFiles`，按配置生成搜索文件、`toc.js`、主题资源和 playground 资源。
8. 写 `toc.html`、`.nojekyll` 和可选的 `CNAME`。
9. 遍历章节树，逐章调用 `render_chapter()`。
10. 按配置生成 `404.html`、`print.html` 和重定向文件。
11. 把源目录中非 Markdown 的剩余静态文件复制到目标目录。

这解释了一个常见误区：HTML renderer 不是“把 Markdown 字符串交给 pulldown-cmark 然后结束”。它要把一本书输出成一个可发布网站，Markdown 到 HTML 只是其中一段。

## 除了 build，其他命令怎样复用这套结构

用户看到的子命令不止 `build`。这些命令有的很薄，有的引入了 feature 和外部依赖，但它们大多复用同一个 `MDBook` 总控对象。

| 命令 | 入口文件 | 复用的核心能力 | 可以先读到什么程度 |
| --- | --- | --- | --- |
| `init` | `src/cmd/init.rs` | `MDBook::init()` 和 `BookBuilder` | 看它如何收集标题、作者、theme、`.gitignore` 选项，再生成新书结构 |
| `build` | `src/cmd/build.rs` | `MDBook::load()`、`set_dest_dir()`、`MDBook::build()` | 这是本页主线，值得追到底 |
| `test` | `src/cmd/test.rs` | `MDBook::load()`、`MDBook::test()`、`rustdoc --test` | 看它如何先预处理章节，再测试代码块 |
| `clean` | `src/cmd/clean.rs` | `MDBook::load()`、`config.build.build_dir` | 看它如何计算待删除目录和打印删除统计 |
| `watch` | `src/cmd/watch.rs` | `MDBook::load()`、`MDBook::build()`、watcher | 先知道它在变更后重建，细节可后读 |
| `serve` | `src/cmd/serve.rs` | `MDBook::build()`、`watch`、Axum 静态服务 | 先知道它构建后开 HTTP server，并用 websocket 通知刷新 |
| `completions` | `src/main.rs` | `create_clap_command()` | 看它如何复用同一份 clap 命令定义生成 shell completions |

这张表能帮助你判断“这个命令是不是主线”。`build` 是内容构建主线；`test` 是在构建模型之上接 `rustdoc`；`watch` 和 `serve` 是在构建模型外面套文件监听和服务层；`init` 是创建输入目录；`clean` 是删除输出目录。

### `test` 命令为什么也跑预处理器

`MDBook::test()` 内部会创建一个很小的 `TestRenderer`，只实现 `Renderer::name()` 和空的 `render()`。它不是为了真正渲染，而是为了复用 `preprocess_book()` 的规则。这样 `rustdoc_include`、`include` 等预处理结果也会进入测试。

后面它遍历章节，把内容写到临时目录，再调用：

```text
rustdoc <chapter_path> --test
```

如果配置里指定了 Rust edition，它还会传 `--edition 2015/2018/2021/2024`。这里能学到一个真实工程技巧：测试命令不一定复制一套加载逻辑，它可以伪装成一个 renderer 场景，复用同一条预处理管线。

### `serve` 命令为什么会改配置

`serve` 会在构建前修改两项 HTML 配置：

- `output.html.live-reload-endpoint` 设置成 `__livereload`。
- `output.html.site-url` 设置成 `/`，让本地 404 文件按本地服务路径工作。

然后它先 `book.build()`，再用 `tower_http::services::ServeDir` 服务构建目录。启用 watch feature 时，文件变动触发重建，重建后通过 websocket 发 `"reload"` 给浏览器。

这说明 mdBook 的配置不是只有 `book.toml` 一种来源。`Config::update_from_env()` 可以读环境变量，命令层也可以在特定场景下改配置。读真实项目时要留意“配置值最后在哪里被覆盖”。

## 工程要点串讲

把上面所有站点串起来，可以提炼出几条值得学的 Rust 工程要点。

| 要点 | mdBook 里的证据 | 可以迁移到自己的项目吗 |
| --- | --- | --- |
| 入口层要薄 | `src/main.rs` 只做日志、clap、分发、错误退出 | 可以，CLI、HTTP handler、UI action 都适合薄入口 |
| 路径用 `PathBuf` | `get_book_dir()`、`Chapter.path`、`RenderContext.destination` | 可以，文件系统路径不要当普通字符串切 |
| 数据结构先建模 | `Book`、`BookItem`、`Chapter` | 可以，先让数据形状清楚，再写流程 |
| trait object 做运行时插件集合 | `IndexMap<String, Box<dyn Renderer>>` | 可以，用于多个实现共享一个接口的场景 |
| 配置顺序要显式建图 | `determine_preprocessors()` + `TopologicalSort` | 可以，凡是有 before/after，就别靠随手排序 |
| 外部扩展用 JSON 协议 | `CmdPreprocessor`、`CmdRenderer` | 可以，跨语言插件比 Rust trait 更通用 |
| feature gate 控制成本 | `watch`、`serve`、`search` | 可以，把重依赖或可选能力放到 feature 后面 |
| 测试复用主流程 | `MDBook::test()` 复用 `preprocess_book()` | 可以，测试入口尽量走真实生产路径 |

这些要点比“记住函数名”更重要。函数名会随版本变化，但这种分层思路、数据建模和扩展边界会反复出现在 Rust CLI、静态站点生成器、编译器工具和构建系统里。

## 跟着跑一次

如果本机 Rust 版本满足 mdBook 当前要求，可以在 ignored 源码目录里跑一个最小实验：

```bash
cd third_party/mdbook
cargo run -- init /tmp/mdbook-demo --force --title "源码阅读小书" --ignore git
cargo run -- build /tmp/mdbook-demo
```

然后用搜索对照主线：

```bash
rg -n "fn main|pub fn execute|pub fn load|pub fn build|trait Renderer" src crates
rg -n "fn load_book|fn load_summary_item|fn load_chapter" crates/mdbook-driver/src
rg -n "pub struct Book|pub enum BookItem|pub struct Chapter" crates/mdbook-core/src
```

不要一边读一边改 mdBook 源码。先改 `/tmp/mdbook-demo/src/SUMMARY.md` 和章节文件，观察构建输出变化。这样你是在用外部输入验证源码理解，而不是把上游项目改乱。

## 精读样本：固定一本最小书

读开源项目最怕输入一直变。建议先固定一份最小书，把每个源码函数都放回这个输入里理解。

可以把 `/tmp/mdbook-demo/src/SUMMARY.md` 改成：

```markdown
# Summary

[前言](README.md)

# Part A

- [第一章](chapter_1.md)
  - [第一节](chapter_1_1.md)

---

[附录](appendix.md)
```

然后建立对应文件：

```text
src/
  SUMMARY.md
  README.md
  chapter_1.md
  chapter_1_1.md
  appendix.md
```

带着这个输入回到源码，可以逐步问：

1. `mdbook_summary::parse_summary()` 会把 `README.md` 放进 `prefix_chapters`，把 `Part A` 放成 `PartTitle`，把第一章和第一节放成嵌套的 `SummaryItem::Link`，把 `---` 放成 `Separator`。
2. `load_book_from_disk()` 会按 prefix、numbered、suffix 的顺序串起来，不是直接扫描 `src/` 目录。
3. `load_chapter()` 会给 `README.md` 建立 `Chapter`，`path` 和 `source_path` 一开始都指向源文件视角的路径。
4. `IndexPreprocessor` 后，`README.md` 在输出视角会变成 `index.md`，但 `source_path` 仍能保留原始源文件信息。
5. `LinkPreprocessor` 会在每章内容里找 `include` 等 helper，如果没有 helper，内容基本原样通过。
6. `RenderContext::new()` 会把预处理后的 `Book`、`Config`、root 和 destination 打包给 renderer。
7. `HtmlHandlebars::render()` 会把 `README.md` 对应的输出写成 `index.html`，把章节树写成多个页面，再复制静态资源。

这个样本很小，但能覆盖 prefix、part title、嵌套章节、separator、suffix、README 到 index 的转换和 HTML 输出。等它跑通后，再去读复杂 guide 或主题模板，就不会迷路。

### 用日志和搜索辅助验证

mdBook 使用 `tracing`，日志环境变量是 `MDBOOK_LOG`。如果想观察流程，可以尝试：

```bash
MDBOOK_LOG=mdbook=trace cargo run -- build /tmp/mdbook-demo
```

如果输出太多，就把 trace 收窄到想看的 crate 或模块。读源码时不要只靠日志，还要配合搜索：

```bash
rg -n "pub struct MDBook|fn execute_build_process|fn determine_renderers|fn determine_preprocessors" crates/mdbook-driver/src
rg -n "pub trait Renderer|pub struct RenderContext" crates/mdbook-renderer/src
rg -n "pub trait Preprocessor|pub struct PreprocessorContext" crates/mdbook-preprocessor/src
```

搜索的目标不是“把所有结果看完”，而是确认一个概念在哪个层次定义、在哪个层次使用。

## 常见误区

误区一：mdBook 只是 Markdown 转 HTML。

更准确地说，mdBook 根据配置和 `SUMMARY.md` 建立 `Book`，运行预处理器，再交给 renderer 输出。Markdown 渲染只是 HTML renderer 里的一个环节。

误区二：`Book` 是一个扁平列表。

`Book.items` 是顶层列表，但 `Chapter.sub_items` 还能继续放 `BookItem`。所以它是树，只是提供了深度优先迭代器方便遍历。

误区三：默认 HTML renderer 意味着扩展性差。

恰好相反。`Renderer` trait 和 `RenderContext` 把后端边界定义出来，默认 HTML 只是没有配置输出时的默认选择。

误区四：preprocessor 和 renderer 都是“插件”，所以职责差不多。

不一样。preprocessor 的输出还是 `Book`，renderer 的输出是文件。前者改内存里的书，后者写目标格式。如果外部程序只是想改章节内容，应该放在 preprocessor；如果它要生成 EPUB、PDF 或其他发布产物，才更像 renderer。

误区五：`SUMMARY.md` 只是给侧边栏看的。

对 mdBook 来说，`SUMMARY.md` 是加载配方。章节是否进入 `Book`、层级如何形成、part title 和 separator 是否出现，都从它开始。源目录里有一个 Markdown 文件，不代表它会成为书的一章。

误区六：`serve` 是构建主流程的一部分。

`serve` 是包在构建流程外面的本地服务层。它先构建，再用 HTTP server 服务输出目录；启用 watch 时，文件变化触发重建和 websocket reload。真正把书变成站点的仍然是 `MDBook::build()` 和 renderer。

## 小练习

1. 在 `src/cmd/build.rs` 里找出 `--open` 对应的行为，解释它为什么假设 HTML renderer。
2. 在 `load.rs` 里追踪一个嵌套章节，画出 `SummaryItem::Link -> Chapter -> sub_items` 的转换。
3. 在 `book.rs` 里解释 `Chapter::new_draft()` 为什么把 `path` 和 `source_path` 都设成 `None`。
4. 在 `mdbook.rs` 里找出默认 renderer 是在哪里加入的。
5. 在 `determine_preprocessors()` 里找出循环依赖是如何被发现的。
6. 在 `builtin_preprocessors/index.rs` 里解释为什么要把 `README.md` 改成 `index.md`，以及为什么还要保留 `source_path`。
7. 在 `builtin_preprocessors/cmd.rs` 里找出外部预处理器的 JSON 输入和 JSON 输出分别在哪里发生。
8. 在 `builtin_renderers/mod.rs` 里找出 `CmdRenderer` 如何把 `RenderContext` 写给外部后端。
9. 在 `src/cmd/serve.rs` 里找出 live reload endpoint 是在哪里设置、在哪里被 websocket 使用的。
10. 在 `MDBook::test_chapter()` 里找出 `rustdoc --test` 的调用位置，解释它为什么需要临时目录。

## 读码检查表

读完这一页，可以拿下面这份检查表复盘：

- 我能指出 CLI crate、driver crate、core crate、summary crate、preprocessor crate、renderer crate 和 HTML crate 的职责。
- 我能画出 `mdbook build` 的主调用链，并知道每一步输入输出是什么。
- 我能解释 `Config` 是构建规则，`Book` 是内容数据，`RenderContext` 是 renderer 的上下文。
- 我能说明 `SUMMARY.md` 为什么是加载配方，而不是普通导航配置。
- 我能解释 `BookItem` 为什么适合用 enum，`Chapter.sub_items` 为什么让它变成递归树。
- 我能说清 preprocessor 和 renderer 的区别：一个改 `Book`，一个写文件。
- 我能解释 `Box<dyn Renderer>` 和 `Box<dyn Preprocessor>` 为什么让不同实现进入同一个集合。
- 我能看懂默认 HTML renderer 之外，Markdown renderer 和外部 command renderer 如何接入。
- 我能说出 `watch`、`serve`、`search` 这些 feature 大致带来哪些额外依赖和能力。
- 我知道第一次不应该钻进主题 helper、搜索索引细节或所有测试用例，而应先把主流程跑通。

## 过关标准

你可以用下面的问题检查自己有没有读懂：

- 能不能画出 `main.rs -> build.rs -> MDBook::load -> load_book -> MDBook::build -> Renderer::render`？
- 能不能解释 `Config` 和 `Book` 的区别？
- 能不能说出 `BookItem::Chapter`、`BookItem::Separator`、`BookItem::PartTitle` 为什么适合用 enum？
- 能不能解释 `Box<dyn Renderer>` 解决了什么问题？
- 能不能指出 HTML 输出真正开始写文件的大致位置？
- 能不能解释外部 preprocessor 和外部 renderer 为什么都走 JSON，但传的数据不同？
- 能不能说清 `mdbook test` 为什么不是直接扫 Markdown 代码块，而是先复用预处理后的 `Book`？
- 能不能把 `serve` 和 `watch` 放在构建主线外面理解，而不是混进 renderer？

## 下一步读哪里

如果这条主线已经读懂，可以选一个方向继续：

- 继续轻量路线：读 `src/cmd/init.rs`，看 `mdbook init` 如何生成新书结构。
- 数据结构路线：读 `mdbook-summary`，看 `SUMMARY.md` 如何解析成 `Summary`。
- 插件路线：读 preprocessor 和 renderer 协议，理解外部程序如何参与构建。
- 输出路线：读 `mdbook-html`，看主题模板、搜索和静态资源复制。

暂时不要直接从 HTML helper、搜索索引或外部插件协议开始。那些都很有用，但第一天读它们会遮住最重要的主流程。
