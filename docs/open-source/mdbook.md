# 开源读码：从 mdBook 看一个 Rust CLI 怎么长大

mdBook 是 Rust 生态里非常适合作为开源精读起点的项目：它是成熟项目，但主线不神秘。用户写 Markdown 和 `book.toml`，运行 `mdbook build`，最后得到一个静态网站。它既有真实工程复杂度，又不像编译器那样一上来就面对 AST、语法恢复和大量生成代码。

本页只追一条主线：`mdbook build` 如何从命令行入口一路走到 HTML renderer。等这条路走通，再去看 `serve`、`watch`、preprocessor 协议或主题模板。

本页基于本仓库内的源码 checkout：

- 本地路径：`third_party/mdbook/`
- 当前提交：[`0ea415897758ea9b2904ed47ba9cb4901f9eb089`](https://github.com/rust-lang/mdBook/tree/0ea415897758ea9b2904ed47ba9cb4901f9eb089)，提交日期 `2026-05-19`
- 上游仓库：[rust-lang/mdBook](https://github.com/rust-lang/mdBook)
- 上游许可证：MPL-2.0。源码目录已被 `.gitignore` 忽略，本站只引用它作为读码材料，不把第三方源码发布进本站内容。

::: tip 读码姿势
今天只追 `mdbook build`：命令行入口接收子命令，`build` 命令加载一本书，driver 运行预处理器，再把 `RenderContext` 交给 renderer 输出。
:::

## 本课目标

读完这一页，你应该能做到五件事：

- 说清 `mdbook build` 从 `main()` 到 `Renderer::render()` 的调用链。
- 分清 CLI 层、driver 层、core 数据结构、preprocessor 和 renderer 的职责。
- 看懂 `Book`、`BookItem`、`Chapter` 这种递归数据结构。
- 认出 `Box<dyn Renderer>`、`Box<dyn Preprocessor>`、`Result`、`PathBuf`、feature gate 和拓扑排序在真实项目里的用途。
- 知道 mdBook 为什么不是“Markdown 转 HTML 一个函数”。

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

## 第 10 站：renderer 为什么是 trait object

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

## 常见误区

误区一：mdBook 只是 Markdown 转 HTML。

更准确地说，mdBook 根据配置和 `SUMMARY.md` 建立 `Book`，运行预处理器，再交给 renderer 输出。Markdown 渲染只是 HTML renderer 里的一个环节。

误区二：`Book` 是一个扁平列表。

`Book.items` 是顶层列表，但 `Chapter.sub_items` 还能继续放 `BookItem`。所以它是树，只是提供了深度优先迭代器方便遍历。

误区三：默认 HTML renderer 意味着扩展性差。

恰好相反。`Renderer` trait 和 `RenderContext` 把后端边界定义出来，默认 HTML 只是没有配置输出时的默认选择。

## 小练习

1. 在 `src/cmd/build.rs` 里找出 `--open` 对应的行为，解释它为什么假设 HTML renderer。
2. 在 `load.rs` 里追踪一个嵌套章节，画出 `SummaryItem::Link -> Chapter -> sub_items` 的转换。
3. 在 `book.rs` 里解释 `Chapter::new_draft()` 为什么把 `path` 和 `source_path` 都设成 `None`。
4. 在 `mdbook.rs` 里找出默认 renderer 是在哪里加入的。
5. 在 `determine_preprocessors()` 里找出循环依赖是如何被发现的。

## 过关标准

你可以用下面的问题检查自己有没有读懂：

- 能不能画出 `main.rs -> build.rs -> MDBook::load -> load_book -> MDBook::build -> Renderer::render`？
- 能不能解释 `Config` 和 `Book` 的区别？
- 能不能说出 `BookItem::Chapter`、`BookItem::Separator`、`BookItem::PartTitle` 为什么适合用 enum？
- 能不能解释 `Box<dyn Renderer>` 解决了什么问题？
- 能不能指出 HTML 输出真正开始写文件的大致位置？

## 下一步读哪里

如果这条主线已经读懂，可以选一个方向继续：

- 继续轻量路线：读 `src/cmd/init.rs`，看 `mdbook init` 如何生成新书结构。
- 数据结构路线：读 `mdbook-summary`，看 `SUMMARY.md` 如何解析成 `Summary`。
- 插件路线：读 preprocessor 和 renderer 协议，理解外部程序如何参与构建。
- 输出路线：读 `mdbook-html`，看主题模板、搜索和静态资源复制。

暂时不要直接从 HTML helper、搜索索引或外部插件协议开始。那些都很有用，但第一天读它们会遮住最重要的主流程。
