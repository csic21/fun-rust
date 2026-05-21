# 模块、crate 和包：把代码放到该在的位置

写完几个单文件练习后，你很快会遇到新问题：函数越来越多、类型越来越多、文件越来越长。Rust 的组织方式从小到大是：

- `mod`：模块，给代码分房间。
- `crate`：编译单元，可以是库或二进制程序。
- `package`：Cargo 管理的项目，包含一个 `Cargo.toml`，可以产出一个或多个 crate。
- `workspace`：多个 package 的工作区，适合大型项目或多 crate 协作。

## 本课目标

- 理解 package、crate、module 的区别。
- 会把代码从 `main.rs` 拆到 `lib.rs` 和模块文件。
- 会用 `pub`、`use` 和 `crate::` 控制可见性与路径。
- 初步理解依赖、feature 和 workspace。

![模块 crate 和包结构图](/images/modules-crates-tree.png)

## 先记住三句话

1. `Cargo.toml` 描述 package。
2. `src/main.rs` 是二进制 crate 的入口。
3. `src/lib.rs` 是库 crate 的入口。

一个 package 可以同时有库和二进制：

```text
lesson-tracker/
  Cargo.toml
  src/
    lib.rs
    main.rs
```

`main.rs` 负责命令行入口，`lib.rs` 放可测试、可复用的核心逻辑。这是很多 Rust 项目的推荐结构。

## 从单文件拆模块

一开始你可能写成这样：

```rust
#[derive(Debug)]
struct Lesson {
    title: String,
    minutes: u32,
}

fn total_minutes(lessons: &[Lesson]) -> u32 {
    lessons.iter().map(|lesson| lesson.minutes).sum()
}
```

当代码变多，可以创建 `src/lib.rs`：

```rust
pub mod lesson;
```

再创建 `src/lesson.rs`：

```rust
#[derive(Debug)]
pub struct Lesson {
    pub title: String,
    pub minutes: u32,
}

pub fn total_minutes(lessons: &[Lesson]) -> u32 {
    lessons.iter().map(|lesson| lesson.minutes).sum()
}
```

然后在 `src/main.rs` 使用库 crate。假设 package 名叫 `lesson_tracker`：

```rust
use lesson_tracker::lesson::{total_minutes, Lesson};

fn main() {
    let lessons = vec![
        Lesson { title: String::from("所有权"), minutes: 35 },
        Lesson { title: String::from("借用"), minutes: 30 },
    ];

    println!("总时长：{}", total_minutes(&lessons));
}
```

## `pub` 不是越多越好

Rust 默认私有。你要显式写 `pub` 才能让外部访问：

```rust
pub struct Lesson {
    pub title: String,
    minutes: u32,
}
```

这里外部能看到 `Lesson` 和 `title`，但不能直接访问 `minutes`。这很有用：你可以把字段保护起来，通过方法保证不变量。

```rust
pub struct Lesson {
    title: String,
    minutes: u32,
}

impl Lesson {
    pub fn new(title: impl Into<String>, minutes: u32) -> Self {
        assert!(minutes > 0, "课程时长必须大于 0");
        Self {
            title: title.into(),
            minutes,
        }
    }

    pub fn minutes(&self) -> u32 {
        self.minutes
    }
}
```

对新手来说，`pub` 可以理解成 API 承诺：一旦公开，别人就会依赖它。先少公开，后面需要再公开。

## 路径：`crate::`、`self::` 和 `super::`

模块里常见三种相对路径：

```rust
crate::lesson::Lesson  // 从当前 crate 根开始
self::helper           // 从当前模块开始
super::shared          // 从父模块开始
```

项目变大后，优先用 `crate::` 写清楚从根开始的路径，读者更容易定位。

## `use` 是引入名字，不是复制代码

```rust
use std::collections::HashMap;

fn main() {
    let mut scores = HashMap::new();
    scores.insert("Rust", 100);
}
```

`use` 只是让路径短一点。下面两种写法等价：

```rust
let mut a = std::collections::HashMap::new();
```

```rust
use std::collections::HashMap;
let mut b = HashMap::new();
```

团队项目里，建议把标准库和外部 crate 的 `use` 放在文件顶部，局部特别短的辅助类型可以在函数内 `use`。

## 依赖和 feature

添加依赖时，Cargo 会把它写进 `Cargo.toml`：

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
```

feature 是 crate 暴露的可选能力。比如 `serde` 的 `derive` feature 会启用 `#[derive(Serialize, Deserialize)]`。不要盲目打开 `"full"`，除非你知道项目确实需要全部能力；feature 越多，编译和依赖面越大。

常用命令：

```bash
cargo add serde --features derive
cargo tree
cargo update
```

`cargo tree` 很适合看依赖为什么被引入。

## workspace：多个包一起管理

当项目有 CLI、核心库、测试工具时，可以用 workspace：

```text
rust-study/
  Cargo.toml
  crates/
    core/
    cli/
    xtask/
```

根 `Cargo.toml`：

```toml
[workspace]
members = ["crates/core", "crates/cli", "crates/xtask"]
resolver = "2"
```

workspace 的好处：

- 共享一个 `Cargo.lock`。
- 可以一次运行所有测试。
- 可以把核心逻辑和入口程序拆开。
- 适合做可复用库加多个二进制工具。

## 练习：拆出可测试库

从一个 `main.rs` 开始：

```rust
fn total_minutes(items: &[u32]) -> u32 {
    items.iter().sum()
}

fn main() {
    let minutes = [15, 20, 35];
    println!("{}", total_minutes(&minutes));
}
```

把它改成：

```text
src/
  lib.rs
  main.rs
```

`lib.rs` 放 `pub fn total_minutes`，`main.rs` 调用它。再加一个测试：

```rust
#[test]
fn sums_minutes() {
    assert_eq!(total_minutes(&[15, 20, 35]), 70);
}
```

::: tip 过关标准
你能说清楚 `src/main.rs`、`src/lib.rs`、`mod lesson;`、`pub` 和 `use` 分别解决什么问题。
:::

## 常见卡点

### 文件名和模块名对不上

`mod lesson;` 会找 `lesson.rs` 或 `lesson/mod.rs`。如果写 `mod lessons;`，文件也要叫 `lessons.rs` 或 `lessons/mod.rs`。

### 在 `main.rs` 里重复声明模块

如果库逻辑在 `lib.rs`，二进制入口通常通过 crate 名引用库：

```rust
use lesson_tracker::lesson::Lesson;
```

不要在 `main.rs` 里又写一套 `mod lesson;`，否则你可能得到两份平行的模块树。

### 为了省事把所有字段都 `pub`

短练习可以这样做，但项目里最好公开方法而不是公开所有字段。公开字段会让不变量难以维护。
