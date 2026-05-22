export const sources = [
  {
    title: "The Rust Programming Language",
    label: "官方 Rust Book",
    url: "https://doc.rust-lang.org/book/",
    note: "主线概念来源：变量、所有权、结构体、枚举、泛型、trait、生命周期、测试、并发和 unsafe 入门。",
  },
  {
    title: "Rust By Example",
    label: "官方示例集",
    url: "https://doc.rust-lang.org/rust-by-example/",
    note: "用可运行小程序解释语法、控制流、闭包、迭代器、错误处理等。",
  },
  {
    title: "Rust Standard Library",
    label: "标准库文档",
    url: "https://doc.rust-lang.org/std/",
    note: "查标准类型、trait、集合、迭代器、线程和同步原语。",
  },
  {
    title: "The Cargo Book",
    label: "Cargo 官方书",
    url: "https://doc.rust-lang.org/cargo/",
    note: "Cargo 是 Rust 的包管理器、构建工具、测试入口和发布工具。",
  },
  {
    title: "Rust Reference",
    label: "语言参考",
    url: "https://doc.rust-lang.org/reference/",
    note: "需要精确定义时查表达式、类型、trait、生命周期、ABI 和 unsafe 语义。",
  },
  {
    title: "Asynchronous Programming in Rust",
    label: "Async Book",
    url: "https://rust-lang.github.io/async-book/",
    note: "学习 Future、async/.await、runtime、任务调度和异步生态边界。",
  },
  {
    title: "The Rustonomicon",
    label: "Rustonomicon",
    url: "https://doc.rust-lang.org/nomicon/",
    note: "高级和 unsafe 主题参考，适合已有安全 Rust 基础后阅读。",
  },
  {
    title: "rustdoc Book",
    label: "rustdoc",
    url: "https://doc.rust-lang.org/rustdoc/",
    note: "公共 API 文档、文档测试和文档生成配置。",
  },
  {
    title: "Clippy",
    label: "Clippy",
    url: "https://doc.rust-lang.org/clippy/",
    note: "常见 lint、风格建议和工程质量检查。",
  },
  {
    title: "Rustlings",
    label: "官方练习项目",
    url: "https://rustlings.rust-lang.org/",
    note: "配合 Rust Book 阅读的小练习，适合把概念变成肌肉记忆。",
  },
  {
    title: "SWC source code",
    label: "开源读码项目",
    url: "https://github.com/swc-project/swc",
    note: "用于真实 Rust 项目读码栏目，当前本地 checkout 位于 third_party/swc/，并被 .gitignore 忽略。",
  },
  {
    title: "SWC architecture notes",
    label: "SWC 架构说明",
    url: "https://github.com/swc-project/swc/blob/main/ARCHITECTURE.md",
    note: "核对 SWC 的 crate 分层、parser、AST、codegen、transform 和测试策略。",
  },
  {
    title: "mdBook source code",
    label: "开源读码项目",
    url: "https://github.com/rust-lang/mdBook",
    note: "用于真实 Rust CLI 项目读码栏目，当前本地 checkout 位于 third_party/mdbook/，并被 .gitignore 忽略。",
  },
  {
    title: "mdBook User Guide",
    label: "mdBook 官方指南",
    url: "https://rust-lang.github.io/mdBook/",
    note: "核对 mdBook 初始化、构建、配置、SUMMARY.md、预处理器和后端扩展等用户侧行为。",
  },
];

export const lessons = [
  lesson("start", "先跑起来", "不要从所有权开始", 20, "cargo-loop.svg", [0, 1, 3]),
  lesson("variables-types", "变量和类型", "先把值说清楚", 30, "type-shelves.svg", [0, 1, 2]),
  lesson("functions-flow", "函数、分支和循环", "表达式会产生值", 30, "control-flow.svg", [0, 1]),
  lesson("structs-enums", "结构体和枚举", "把数据形状画出来", 35, "data-shapes.svg", [0, 1, 2]),
  lesson("ownership", "所有权", "谁拿钥匙，谁负责值", 45, "ownership-flow.svg", [0, 1, 6]),
  lesson("borrowing", "借用", "很多读，或一个写", 40, "borrow-rules.svg", [0, 1, 2]),
  lesson("errors", "错误处理", "失败也是返回值", 35, "error-funnel.svg", [0, 1, 2]),
  lesson("collections-project", "集合、迭代器和小项目", "用项目收束概念", 45, "project-loop.svg", [0, 1, 2, 9]),
  lesson("modules-crates", "模块、crate 和包", "把代码放到该在的位置", 40, "project-loop.svg", [0, 3]),
  lesson("generics-traits-lifetimes", "泛型、trait 和生命周期", "写可复用但不含糊的代码", 55, "type-shelves.svg", [0, 2, 4]),
  lesson("iterators-closures", "闭包和迭代器深入", "把循环写成数据管道", 45, "control-flow.svg", [0, 1, 2]),
  lesson("testing-docs", "测试、文档和工作区", "让代码可以被放心修改", 45, "project-loop.svg", [0, 3, 7, 8]),
  lesson("smart-pointers", "智能指针和内部可变性", "当普通引用不够用", 50, "ownership-flow.svg", [0, 2, 6]),
  lesson("concurrency", "并发", "线程、通道和共享状态", 50, "borrow-rules.svg", [0, 2]),
  lesson("async", "异步 Rust", "很多任务等 IO 时，让线程别闲着", 55, "project-loop.svg", [5, 0]),
  lesson("unsafe-ffi", "unsafe、FFI 和底层边界", "把危险关进小房间", 60, "error-funnel.svg", [4, 6]),
  lesson("performance", "性能、发布和工程化", "先测量，再优化", 45, "cargo-loop.svg", [2, 3, 8]),
  lesson("cli-practice", "命令行项目实战", "做一个课程清单工具", 70, "project-loop.svg", [0, 2, 3]),
  lesson("advanced-projects", "综合项目路线", "从练习走向真正作品", 45, "learning-map.svg", [0, 3, 5]),
];

export const site = {
  title: "Rust 轻松入门",
  subtitle: "用图解、短代码和实践路线，把 Rust 从入门到高级拆成可练习的台阶。",
  repoHint: "VitePress 文档站，可直接部署 dist/。",
};

function lesson(slug, title, kicker, minutes, asset, sourceIds) {
  return {
    slug,
    title,
    kicker,
    minutes,
    asset,
    intro: `${title}：${kicker}。`,
    points: ["先建立心智模型", "再阅读可运行代码", "最后用练习检查理解"],
    code: `fn main() {
    println!("${title}");
}`,
    tryIt: "改一行代码，重新运行，并解释输出或错误为什么变化。",
    sourceIds,
  };
}
