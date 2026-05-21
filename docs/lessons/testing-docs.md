# 测试、文档和工作区：让代码可以被放心修改

写 Rust 不只是让程序跑起来，还要让未来的你敢改它。Rust 内置测试框架、文档测试和 Cargo 工作区能力，足够支撑从小练习到多 crate 项目。

## 本课目标

- 会写单元测试和集成测试。
- 会用 `cargo test`、`cargo test test_name`、`cargo test --doc`。
- 会写能被测试的文档示例。
- 理解 workspace 如何组织多 crate 项目。
- 知道 `cargo fmt`、`cargo clippy` 在工程中的位置。

![测试和文档保护公开 API 图](/images/testing-docs-pyramid.png)

## 单元测试：和代码放在一起

```rust
pub fn total_minutes(items: &[u32]) -> u32 {
    items.iter().sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sums_minutes() {
        assert_eq!(total_minutes(&[10, 20, 30]), 60);
    }
}
```

`#[cfg(test)]` 表示只有测试构建时才编译这个模块。`use super::*` 让测试能访问父模块里的函数。

运行：

```bash
cargo test
```

只跑一个测试：

```bash
cargo test sums_minutes
```

## 集成测试：像外部用户一样调用

集成测试放在 `tests/` 目录：

```text
lesson-tracker/
  src/
    lib.rs
  tests/
    total_minutes.rs
```

`tests/total_minutes.rs`：

```rust
use lesson_tracker::total_minutes;

#[test]
fn sums_from_public_api() {
    assert_eq!(total_minutes(&[5, 15]), 20);
}
```

集成测试只能通过公开 API 使用你的 crate。这能帮你检查：外部用户是否真的能按你设计的方式使用它。

## 测试错误路径

不要只测成功路径：

```rust
fn parse_minutes(text: &str) -> Result<u32, std::num::ParseIntError> {
    text.parse()
}

#[test]
fn rejects_non_number() {
    let err = parse_minutes("oops").unwrap_err();
    assert!(err.to_string().contains("invalid digit"));
}
```

如果只关心失败，不关心具体错误文本，可以这样：

```rust
assert!(parse_minutes("oops").is_err());
```

## `should_panic` 要少用

```rust
#[test]
#[should_panic(expected = "课程时长必须大于 0")]
fn rejects_zero_minutes() {
    Lesson::new("Rust", 0);
}
```

`should_panic` 适合测试确实应该 panic 的不变量。但业务错误更推荐返回 `Result`，这样调用方可以处理。

## 文档注释和 doc test

公共 API 应该告诉别人怎么用：

````rust
/// 计算课程总分钟数。
///
/// # Examples
///
/// ```
/// use lesson_tracker::total_minutes;
///
/// assert_eq!(total_minutes(&[10, 20, 30]), 60);
/// ```
pub fn total_minutes(items: &[u32]) -> u32 {
    items.iter().sum()
}
````

运行文档测试：

```bash
cargo test --doc
```

这很重要：文档里的示例如果过期，测试会提醒你。

## 忽略长测试

有些测试慢、需要网络或外部服务，可以先标记：

```rust
#[test]
#[ignore = "需要真实 API token"]
fn calls_remote_service() {
    // ...
}
```

需要时手动运行：

```bash
cargo test -- --ignored
```

## workspace 里的测试

workspace 根目录运行：

```bash
cargo test --workspace
```

只测某个 package：

```bash
cargo test -p lesson-cli
```

发布前常用检查：

```bash
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo doc --workspace --no-deps
```

## 测试设计顺序

写测试时可以按风险排序：

1. 纯函数：输入输出稳定，最容易测。
2. 错误路径：解析失败、文件不存在、权限不足。
3. 边界值：空列表、0、最大值、重复项。
4. 公共 API：集成测试确认外部使用方式。
5. CLI 或网络：用临时目录、假输入、可控输出。

## 练习：给课程清单补测试

假设有：

```rust
#[derive(Debug, PartialEq, Eq)]
pub struct Lesson {
    pub title: String,
    pub minutes: u32,
}

pub fn total_minutes(lessons: &[Lesson]) -> u32 {
    lessons.iter().map(|lesson| lesson.minutes).sum()
}
```

写三个测试：

```rust
#[test]
fn empty_list_is_zero() {
    assert_eq!(total_minutes(&[]), 0);
}

#[test]
fn sums_all_minutes() {
    let lessons = vec![
        Lesson { title: String::from("变量"), minutes: 18 },
        Lesson { title: String::from("所有权"), minutes: 35 },
    ];

    assert_eq!(total_minutes(&lessons), 53);
}

#[test]
fn lesson_debug_is_readable() {
    let lesson = Lesson { title: String::from("借用"), minutes: 30 };
    assert!(format!("{lesson:?}").contains("借用"));
}
```

::: tip 过关标准
你能把核心逻辑放进 `lib.rs`，用单元测试测内部细节，用集成测试测公开 API，用文档测试保护示例。
:::
