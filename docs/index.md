---
layout: home

hero:
  name: Rust 轻松入门
  text: 从第一行代码到工程级 Rust
  tagline: 先建立反馈感，再逐步进入所有权、trait、生命周期、测试、并发、异步、unsafe 边界和项目实践。
  image:
    src: /images/rust-learning-journey.png
    alt: Rust 学习路径插图
  actions:
    - theme: brand
      text: 从第一课开始
      link: /lessons/start
    - theme: alt
      text: 查看完整路线
      link: /#完整学习路线

features:
  - title: 初学者能进门
    details: 每课先给心智模型，再给短代码和可修改练习，不把生命周期、trait 和异步一次性倒出来。
  - title: 中级学习者能补全体系
    details: 模块、crate、泛型、trait、生命周期、闭包、迭代器、测试和文档都有独立章节。
  - title: 高级学习者能查路线
    details: 智能指针、内部可变性、并发、async、unsafe、FFI、性能和发布流程都有实践导向说明。
---

## 完整学习路线

这份文档不是替代官方书，而是把官方资料拆成更平缓、更可练习的学习路径。你可以按阶段读，也可以把它当作 Rust 主题索引。

### 第一阶段：入门基础

1. [先跑起来](/lessons/start)：安装、创建项目、运行、读第一条错误。
2. [变量和类型](/lessons/variables-types)：`let`、`mut`、基础类型、`String`、shadowing 和类型转换。
3. [函数、分支和循环](/lessons/functions-flow)：表达式、返回值、`if`、`match`、`for`、`while`、`loop`。
4. [结构体和枚举](/lessons/structs-enums)：数据建模、`impl`、方法、`Option`、模式匹配。

### 第二阶段：核心机制

5. [所有权](/lessons/ownership)：移动、复制、作用域、借用、`clone` 和常见移动错误。
6. [借用](/lessons/borrowing)：共享引用、可变引用、借用结束、切片和参数设计。
7. [错误处理](/lessons/errors)：`Result`、`Option`、`?`、错误传播、panic 边界。
8. [集合、迭代器和小项目](/lessons/collections-project)：`Vec`、`HashMap`、切片、迭代器和课程清单项目。

### 第三阶段：中级进阶

9. [模块、crate 和包](/lessons/modules-crates)：项目结构、可见性、`use`、依赖和 feature。
10. [泛型、trait 和生命周期](/lessons/generics-traits-lifetimes)：抽象边界、trait bound、`impl Trait`、生命周期标注。
11. [闭包和迭代器深入](/lessons/iterators-closures)：闭包捕获、惰性迭代器、适配器、性能直觉。
12. [测试、文档和工作区](/lessons/testing-docs)：单元测试、集成测试、doc test、workspace 和 CI 检查。

### 第四阶段：高级主题

13. [智能指针和内部可变性](/lessons/smart-pointers)：`Box`、`Rc`、`Arc`、`RefCell`、`Mutex`、`Deref`、`Drop`。
14. [并发：线程、通道和共享状态](/lessons/concurrency)：`thread`、`move`、`mpsc`、`Arc<Mutex<T>>`、`Send`、`Sync`。
15. [异步 Rust](/lessons/async)：`Future`、`.await`、runtime、任务、取消、阻塞边界。
16. [unsafe、FFI 和底层边界](/lessons/unsafe-ffi)：五种 unsafe 能力、封装不变量、C ABI、原始指针。
17. [性能、发布和工程化](/lessons/performance)：profile、benchmark、Clippy、format、release、依赖审计。

### 第五阶段：实践教程

18. [命令行项目实战](/lessons/cli-practice)：从参数解析、文件读取、错误设计到测试一个小 CLI。
19. [综合项目路线](/lessons/advanced-projects)：把前面知识变成三条可扩展项目路线。

### 第六阶段：开源读码

20. [开源读码栏目](/open-source/)：基于本仓库忽略目录中的真实源码 checkout 精读项目；当前包含 [SWC](/open-source/swc)、[mdBook](/open-source/mdbook) 和 [rust-analyzer](/open-source/rust-analyzer)，以后可以继续扩展更多项目。

## 贯穿项目：课程清单工具

![课程清单工具贯穿项目 checkpoint 路线图](/images/lesson-cli-checkpoints.png)

这条项目线把零散概念串成一个小作品。每个 Checkpoint 都只加一层能力，不抢跑到框架和复杂依赖。

| Checkpoint | 对应章节 | 你会得到什么 |
| --- | --- | --- |
| Checkpoint 1 | [变量和类型](/lessons/variables-types#课程清单工具-checkpoint-1) | 用普通变量描述一节课，分清 `&str`、数字和布尔值。 |
| Checkpoint 2 | [结构体和枚举](/lessons/structs-enums#课程清单工具-checkpoint-2) | 用 `Lesson` 和 `Status` 消除散装字段和模糊状态。 |
| Checkpoint 3 | [错误处理](/lessons/errors#课程清单工具-checkpoint-3) | 把文本解析失败变成 `Result`，不让错误偷偷跳出来。 |
| Checkpoint 4 | [集合、迭代器和小项目](/lessons/collections-project) | 把多节课放进 `Vec`，统计、筛选、查找下一课。 |
| Checkpoint 5 | [命令行项目实战](/lessons/cli-practice) | 接上文件读取、入口程序和测试，变成可运行 CLI。 |

::: tip 怎么学最稳
每学完一课，至少做一次“改一行再运行”。Rust 的学习收益来自反馈循环：写代码、读错误、修正心智模型。
:::

::: warning 不要跳过官方资料
这份文档负责铺路，官方资料负责定准。遇到概念分歧时，以 [The Rust Programming Language](/sources)、标准库文档和 Rust Reference 为准。
:::
