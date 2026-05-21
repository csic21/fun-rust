# 性能、发布和工程化：先测量，再优化

Rust 给你很好的性能上限，但不会自动让每个程序都快。工程化的关键是：先写清楚，再测试，再测量，再针对瓶颈优化。

## 本课目标

- 理解 debug 和 release 的差异。
- 会用基本工具检查格式、lint、测试和文档。
- 知道 clone、分配、锁、IO、算法复杂度对性能的影响。
- 初步理解 profile、benchmark 和发布检查。

![性能工程循环图](/images/performance-release-loop.png)

## debug 和 release

开发时：

```bash
cargo run
```

发布性能测试：

```bash
cargo run --release
```

debug 构建编译快、调试信息多、优化少。release 构建优化多，运行性能通常差很多。

不要用 debug 运行结果判断性能。

## 基础质量命令

发布前常用：

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo doc --no-deps
cargo build --release
```

workspace 项目：

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace --release
```

## 现代 Cargo 配置

![现代 Cargo 配置和依赖治理工具图](/images/modern-cargo-tooling.png)

新项目可以明确写出 edition 和最低支持版本，让读者和 CI 都知道项目边界：

```toml
[package]
name = "lesson-cli"
version = "0.1.0"
edition = "2024"
rust-version = "1.85"

[workspace]
resolver = "3"
```

`edition = "2024"` 表示使用 Rust 2024 版语言规则。`rust-version` 表示 MSRV，也就是 Minimum Supported Rust Version：这个项目承诺支持的最低 Rust 版本。workspace 里写 `resolver = "3"` 可以让依赖解析遵循新版规则，尤其是和 package 的 Rust 版本约束配合时更清楚。

依赖治理也要进入日常检查：

```bash
cargo tree -d
cargo update -p crate_name
```

`cargo tree -d` 用来查看重复版本依赖。`cargo update -p crate_name` 用来只更新某个依赖，适合修补安全问题或小范围升级。真正发布前，还可以加依赖审计工具，但先把 Cargo 自带命令用熟更重要。

## 性能直觉一：少做不必要分配

这会不断创建新字符串：

```rust
let mut text = String::new();

for word in words {
    text = text + word;
}
```

更好：

```rust
let mut text = String::new();

for word in words {
    text.push_str(word);
}
```

如果能估计大小：

```rust
let mut text = String::with_capacity(1024);
```

`with_capacity` 不改变长度，只提前预留空间。

## 性能直觉二：别急着 `clone`

`clone` 有时是正确选择，但要知道它复制了什么：

```rust
fn print_title(title: &str) {
    println!("{title}");
}

let title = String::from("Rust");
print_title(&title);
```

只读就借用。需要独立拥有才 clone：

```rust
let cached = title.clone();
```

## 性能直觉三：算法先于微优化

`Vec` 里反复线性查找：

```rust
let found = lessons.iter().find(|lesson| lesson.title == wanted);
```

如果查找很多次，考虑 `HashMap`：

```rust
use std::collections::HashMap;

let by_title: HashMap<_, _> = lessons
    .iter()
    .map(|lesson| (lesson.title.as_str(), lesson))
    .collect();
```

复杂度从多次 O(n) 查找变成平均 O(1) 查找，通常比改几行微小语法更有用。

## 性能直觉四：锁和 IO 比你想的贵

不要在循环里频繁持锁做慢操作：

```rust
for item in items {
    let mut output = shared.lock().expect("锁不应该中毒");
    output.push(item);
}
```

更好是先在本地收集，再一次性合并：

```rust
let local: Vec<_> = items.collect();

let mut output = shared.lock().expect("锁不应该中毒");
output.extend(local);
```

IO 也是一样。批量写通常比一行一行写更稳定。

## 什么时候先不用优化

优化前先问三个问题：慢在哪里？慢到影响谁？怎么证明变快了？下面这些情况先不要动性能代码：

- 还没有测试保护行为。
- 还没有 release 构建下的测量结果。
- 只是看到 `clone`、分配或循环就本能想改。
- 算法和数据规模还不清楚。
- 改动会显著降低可读性，但收益没有数据支撑。

Rust 已经帮你省掉很多运行时成本，但工程上仍然要先测量。没有基准的优化，很容易只是把代码改难懂。

## benchmark 入门

Rust 官方稳定测试框架不直接提供完整 benchmark。项目里常用社区工具，比如 Criterion。你可以先建立原则：

- benchmark 必须跑 release。
- 每次只比较一个变量。
- 输入数据要接近真实场景。
- 优化前后都保留测试，防止行为变了。

## profile 入门

不同平台工具不同，但方法一致：

1. 用 release 构建。
2. 准备真实或接近真实的数据。
3. 用 profiler 找热点。
4. 优化热点，不猜。
5. 再跑测试和 benchmark。

常见热点：

- 过多分配。
- 过多 clone。
- 字符串处理。
- 锁竞争。
- 同步 IO。
- 算法复杂度不合适。

## 发布 crate 前检查

如果你要发布库：

```bash
cargo package
cargo publish --dry-run
```

检查：

- `Cargo.toml` 里的 `description`、`license`、`repository`。
- README 是否说明用途和示例。
- 公共 API 是否有文档。
- feature 是否合理。
- `cargo test --all-features` 是否通过。

## 练习：优化课程统计

先写清楚版本：

```rust
fn total_minutes(lessons: &[Lesson]) -> u32 {
    lessons.iter().map(|lesson| lesson.minutes).sum()
}
```

如果你发现按标题查询很多次：

```rust
fn find_lesson<'a>(lessons: &'a [Lesson], title: &str) -> Option<&'a Lesson> {
    lessons.iter().find(|lesson| lesson.title == title)
}
```

再改成索引：

```rust
use std::collections::HashMap;

fn index_by_title<'a>(lessons: &'a [Lesson]) -> HashMap<&'a str, &'a Lesson> {
    lessons
        .iter()
        .map(|lesson| (lesson.title.as_str(), lesson))
        .collect()
}
```

::: tip 过关标准
你能先用测试保证行为，再用 release 和测量判断性能，而不是凭感觉优化。
:::
