# 命令行项目实战：做一个课程清单工具

实践最能检验 Rust 心智模型。这个项目不依赖复杂框架，只用标准库做一个小 CLI：读取课程文本，解析分钟数，按条件筛选，输出统计结果。

你会练到：

- 参数读取。
- 文件读取。
- `Result` 错误传播。
- `struct` 数据建模。
- 迭代器处理集合。
- 单元测试和集成测试思路。

![CLI 项目架构图](/images/cli-practice-architecture.png)

## 项目目标

输入文件 `lessons.txt`：

```text
变量和类型,18,done
所有权,35,todo
借用,30,todo
错误处理,24,done
```

运行：

```bash
cargo run -- lessons.txt
```

输出：

```text
课程数：4
完成：2
总时长：107 分钟
下一课：所有权
```

## 第一步：创建项目

```bash
cargo new lesson-cli
cd lesson-cli
```

把核心逻辑放进 `src/lib.rs`，入口放进 `src/main.rs`。

## 第二步：定义数据

`src/lib.rs`：

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Status {
    Done,
    Todo,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lesson {
    pub title: String,
    pub minutes: u32,
    pub status: Status,
}
```

用枚举表达状态，比字符串到处传更安全。

## 第三步：解析一行

```rust
#[derive(Debug, PartialEq, Eq)]
pub enum ParseLessonError {
    MissingField,
    BadMinutes,
    BadStatus,
}

pub fn parse_lesson(line: &str) -> Result<Lesson, ParseLessonError> {
    let mut parts = line.split(',');

    let title = parts.next().ok_or(ParseLessonError::MissingField)?;
    let minutes = parts.next().ok_or(ParseLessonError::MissingField)?;
    let status = parts.next().ok_or(ParseLessonError::MissingField)?;

    let minutes = minutes
        .parse::<u32>()
        .map_err(|_| ParseLessonError::BadMinutes)?;

    let status = match status {
        "done" => Status::Done,
        "todo" => Status::Todo,
        _ => return Err(ParseLessonError::BadStatus),
    };

    Ok(Lesson {
        title: title.to_string(),
        minutes,
        status,
    })
}
```

这里练了三个关键点：

- `?` 传播错误。
- `map_err` 把标准库错误转换成自己的错误。
- `match` 让状态分支明确。

## 第四步：解析整个文件内容

```rust
pub fn parse_lessons(text: &str) -> Result<Vec<Lesson>, ParseLessonError> {
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .map(parse_lesson)
        .collect()
}
```

`collect` 可以把 `Iterator<Item = Result<T, E>>` 收集成 `Result<Vec<T>, E>`。只要有一行失败，整体失败。

## 第五步：统计

```rust
pub fn total_minutes(lessons: &[Lesson]) -> u32 {
    lessons.iter().map(|lesson| lesson.minutes).sum()
}

pub fn done_count(lessons: &[Lesson]) -> usize {
    lessons
        .iter()
        .filter(|lesson| lesson.status == Status::Done)
        .count()
}

pub fn next_lesson(lessons: &[Lesson]) -> Option<&Lesson> {
    lessons.iter().find(|lesson| lesson.status == Status::Todo)
}
```

参数都用切片 `&[Lesson]`，因为这些函数只读取，不需要拥有列表。

## 第六步：入口程序

`src/main.rs`：

```rust
use std::{env, fs, process};

use lesson_cli::{done_count, next_lesson, parse_lessons, total_minutes};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let path = env::args()
        .nth(1)
        .ok_or_else(|| String::from("用法：lesson-cli <lessons.txt>"))?;

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {path} 失败：{error}"))?;

    let lessons = parse_lessons(&text)
        .map_err(|error| format!("解析课程失败：{error:?}"))?;

    println!("课程数：{}", lessons.len());
    println!("完成：{}", done_count(&lessons));
    println!("总时长：{} 分钟", total_minutes(&lessons));

    if let Some(lesson) = next_lesson(&lessons) {
        println!("下一课：{}", lesson.title);
    }

    Ok(())
}
```

入口程序只做三件事：

1. 从外部世界拿输入。
2. 调用库函数。
3. 把结果打印给用户。

核心逻辑在库里，测试会更容易。

## 第七步：补测试

`src/lib.rs` 下面：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_done_lesson() {
        let lesson = parse_lesson("变量和类型,18,done").expect("应该解析成功");

        assert_eq!(lesson.title, "变量和类型");
        assert_eq!(lesson.minutes, 18);
        assert_eq!(lesson.status, Status::Done);
    }

    #[test]
    fn rejects_bad_minutes() {
        assert_eq!(
            parse_lesson("变量和类型,oops,done"),
            Err(ParseLessonError::BadMinutes)
        );
    }

    #[test]
    fn finds_next_todo() {
        let lessons = parse_lessons(
            "变量和类型,18,done\n所有权,35,todo\n借用,30,todo\n"
        )
        .expect("应该解析成功");

        assert_eq!(next_lesson(&lessons).expect("应该有下一课").title, "所有权");
    }
}
```

运行：

```bash
cargo test
```

## 继续扩展

做完基础版后，可以按难度逐步加功能：

1. 支持 `--only todo` 只显示未完成课程。
2. 支持 `--min-minutes 30` 筛选长课程。
3. 支持把状态从 todo 改成 done 并写回文件。
4. 把错误类型实现 `std::fmt::Display`。
5. 引入 `clap` 处理参数。
6. 引入 `serde` 和 `toml` / `json` 支持结构化配置。

::: tip 过关标准
你能解释哪些函数拥有数据、哪些函数只借用数据，错误如何从底层传播到入口，测试为什么放在库逻辑旁边。
:::
