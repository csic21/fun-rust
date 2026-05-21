# 先跑起来

![Rust 学习路径插图](/images/rust-learning-journey.png)

新手学 Rust 最容易卡在第一天：还没看到程序输出，就被所有权、生命周期、泛型、trait 一起砸过来。我们反过来，第一课只做一件事：让程序跑起来，并知道怎么获得反馈。

## 本课目标

- 知道 Cargo 是 Rust 项目的常用入口。
- 能创建、运行、修改一个最小程序。
- 能读懂最常见的 `fn main`、`println!`、字符串插值。

![从编辑到运行的反馈循环](/images/start-process.png)

## 第一步：创建项目

```bash
cargo new hello-rust
cd hello-rust
cargo run
```

你会看到 Cargo 先编译，再运行。现在不要纠结编译器做了多少事，只要记住：

- `cargo run` 是“保存后检查”的按钮。
- `src/main.rs` 是第一段代码的位置。
- 看到输出，说明项目结构、工具链和入口函数都通了。

## 看懂第一段代码

```rust
fn main() {
    println!("你好，Rust!");
}
```

`fn main()` 是程序入口。`println!` 后面的感叹号说明它是宏，不是普通函数。你现在不需要理解宏，只要知道它能把内容打印到终端。

Rust 里很多错误会在编译时发现。这不是“烦”，而是 Rust 在程序真正运行前帮你检查。学习阶段最重要的习惯是：一次只改一小步，然后运行。

::: warning 动手 3 分钟
把输出改成你的名字，再运行一次。然后故意删掉一个引号，看看编译器第一条错误怎么提示。
:::

## 读错误的顺序

编译错误看起来很长，新手容易慌。先按这个顺序读：

1. 找第一条 `error`，不要从最后一行开始。
2. 看文件名和行号，比如 `src/main.rs:2:14`。
3. 看箭头指向的代码。
4. 先修第一个错误，再重新运行。

::: tip 过关标准
你能解释 `cargo run` 做了“编译 + 运行”，并且能主动制造一个小错误、读到行号、修好它。
:::

## 下一步

下一课会学习变量和类型。你会看到 Rust 为什么默认让变量不可变，以及什么时候需要 `mut`。

## 补充：第一天应该认识哪些工具

Rust 工具链通常由 `rustup`、`rustc` 和 `cargo` 组成：

| 工具 | 作用 | 你现在要会的程度 |
| --- | --- | --- |
| `rustup` | 安装和管理 Rust 版本 | 会 `rustup update` 就够了 |
| `rustc` | Rust 编译器 | 知道 Cargo 会调用它 |
| `cargo` | 项目、依赖、构建和测试入口 | 重点掌握 |

常用 Cargo 命令：

```bash
cargo new hello-rust
cargo run
cargo check
cargo test
cargo build --release
```

`cargo check` 很适合学习阶段频繁使用。它只检查能不能编译，通常比完整构建更快。

## 项目结构最小地图

```text
hello-rust/
  Cargo.toml
  src/
    main.rs
```

`Cargo.toml` 是项目说明书，记录包名、版本、依赖等信息。`src/main.rs` 是二进制程序入口。等你进入模块章节，会看到 `src/lib.rs`、`tests/`、workspace 等更完整结构。

## 编译错误是学习材料

Rust 编译器错误通常包含：

- 错误编号，例如 `E0382`。
- 发生位置，例如 `src/main.rs:5:10`。
- 代码标注，指出哪一段有问题。
- 帮助信息，有时会给出可尝试的修复。

你可以用：

```bash
rustc --explain E0382
```

查看更长解释。不要一次读完所有错误说明；只在碰到具体错误时查。

## 练习阶梯

1. 创建一个新项目，打印你的名字。
2. 新增一行 `let city = "Shanghai";`，把它打印出来。
3. 故意删掉分号或引号，读第一条错误。
4. 运行 `cargo check`，再运行 `cargo run`，比较反馈。
5. 把项目目录删掉，重新创建一次，直到动作熟练。
