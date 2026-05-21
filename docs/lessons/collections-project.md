# 集合、迭代器和小项目：把知识串起来

到这里，你已经见过变量、函数、结构体、枚举、所有权、借用和错误处理。不要继续无止境地看概念。做一个小项目，把它们放到同一个场景里。

## 项目目标：课程清单

我们做一个极小的课程清单：

- 保存多个课程。
- 给课程打完成标记。
- 统计完成数量。
- 从字符串解析分钟数，练习 `Result`。

![集合和迭代器数据管道图](/images/collections-iterator-pipeline.png)

## 第一步：定义数据

```rust
#[derive(Debug)]
struct Lesson {
    title: String,
    minutes: u32,
    done: bool,
}
```

`title` 用 `String`，因为每个课程自己拥有标题。`minutes` 是数字。`done` 是是否完成。

## 第二步：写只读函数

```rust
fn print_lessons(lessons: &[Lesson]) {
    for lesson in lessons {
        let mark = if lesson.done { "x" } else { " " };
        println!("[{mark}] {} ({} 分钟)", lesson.title, lesson.minutes);
    }
}
```

参数用切片 `&[Lesson]`，表示只借用一段课程列表，不拿走所有权。

## 第三步：写可变函数

```rust
fn mark_done(lessons: &mut Vec<Lesson>, title: &str) {
    for lesson in lessons {
        if lesson.title == title {
            lesson.done = true;
        }
    }
}
```

这里需要修改列表里的课程，所以用 `&mut Vec<Lesson>`。

## 第四步：用迭代器统计

```rust
fn done_count(lessons: &[Lesson]) -> usize {
    lessons.iter().filter(|lesson| lesson.done).count()
}
```

`iter()` 借用每一项，不消耗列表。`filter` 保留已完成课程，`count` 统计数量。

## 第五步：组合起来

```rust
#[derive(Debug)]
struct Lesson {
    title: String,
    minutes: u32,
    done: bool,
}

fn print_lessons(lessons: &[Lesson]) {
    for lesson in lessons {
        let mark = if lesson.done { "x" } else { " " };
        println!("[{mark}] {} ({} 分钟)", lesson.title, lesson.minutes);
    }
}

fn mark_done(lessons: &mut Vec<Lesson>, title: &str) {
    for lesson in lessons {
        if lesson.title == title {
            lesson.done = true;
        }
    }
}

fn done_count(lessons: &[Lesson]) -> usize {
    lessons.iter().filter(|lesson| lesson.done).count()
}

fn main() {
    let mut lessons = vec![
        Lesson { title: String::from("变量和类型"), minutes: 18, done: true },
        Lesson { title: String::from("所有权"), minutes: 35, done: false },
        Lesson { title: String::from("借用"), minutes: 30, done: false },
    ];

    mark_done(&mut lessons, "所有权");
    print_lessons(&lessons);

    println!("完成 {} / {}", done_count(&lessons), lessons.len());
}
```

你已经在一个小程序里用到了：

- `struct` 表达数据形状。
- `Vec<T>` 保存列表。
- `&[T]` 只读借用列表。
- `&mut Vec<T>` 修改列表。
- 迭代器统计数据。

## 再加一点错误处理

```rust
fn parse_minutes(text: &str) -> Result<u32, std::num::ParseIntError> {
    text.parse::<u32>()
}
```

把 `minutes` 从字符串解析出来：

```rust
let minutes = parse_minutes("35").expect("课程分钟数应该是数字");
```

等你更熟后，可以把错误返回给调用者，而不是直接 `expect`。

::: tip 过关标准
你能解释每个函数为什么选择 `&[Lesson]`、`&mut Vec<Lesson>` 或直接拥有某个值。
:::

::: warning 动手 20 分钟
给 `Lesson` 增加 `difficulty: u8`，写一个函数筛选难度小于等于 2 的课程，并打印标题。
:::

## 接下来怎么练

1. 做几道 Rustlings 对应章节的小题。
2. 把这个课程清单改成命令行交互版。
3. 遇到所有权报错时，不要立刻 `clone`，先问：这里是要拿走、借看、还是借改？

## `HashMap`：按键查找

`Vec<T>` 适合按顺序保存。需要按标题快速查找时，可以使用 `HashMap`：

```rust
use std::collections::HashMap;

let mut minutes = HashMap::new();
minutes.insert(String::from("变量"), 18);
minutes.insert(String::from("所有权"), 35);

if let Some(value) = minutes.get("所有权") {
    println!("所有权需要 {value} 分钟");
}
```

`get` 返回 `Option<&V>`，因为键可能不存在。

## `entry`：存在就改，不存在就插入

统计标签出现次数：

```rust
use std::collections::HashMap;

let tags = ["基础", "所有权", "基础", "错误处理"];
let mut counts = HashMap::new();

for tag in tags {
    let count = counts.entry(tag).or_insert(0);
    *count += 1;
}

println!("{counts:?}");
```

`entry` 很适合计数、分组和缓存。

## 切片让函数更通用

如果函数只读取列表，优先写：

```rust
fn total_minutes(lessons: &[Lesson]) -> u32 {
    lessons.iter().map(|lesson| lesson.minutes).sum()
}
```

这样调用方可以传：

- `&vec`
- `&array`
- `&lessons[0..2]`

比 `&Vec<Lesson>` 更灵活。

## `collect` 的类型提示

`collect` 很强，但有时需要你告诉它收集成什么：

```rust
let titles: Vec<String> = lessons
    .iter()
    .map(|lesson| lesson.title.clone())
    .collect();
```

也可以写 turbofish：

```rust
let titles = lessons
    .iter()
    .map(|lesson| lesson.title.clone())
    .collect::<Vec<_>>();
```

## 项目升级任务

把课程清单扩展成三个文件：

```text
src/
  main.rs
  lib.rs
  lesson.rs
```

要求：

1. `lesson.rs` 定义 `Lesson` 和 `Status`。
2. `lib.rs` 暴露统计函数。
3. `main.rs` 只负责创建数据和打印。
4. 给 `total_minutes`、`done_count`、`next_lesson` 写测试。
5. 再加一个 `HashMap` 索引函数：按标题查课程。
