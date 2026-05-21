# 错误处理：失败也是一种返回值

![错误处理插图](/images/result-errors.png)

很多语言把错误当作突然抛出的异常。Rust 更喜欢把“可能失败”写在返回类型里，让调用者必须面对。

## 本课目标

- 知道 `Result<T, E>` 表示成功或失败。
- 会用 `match` 处理 `Ok` 和 `Err`。
- 会用 `?` 简化错误传播。
- 知道学习阶段什么时候用 `expect`，什么时候不要用 `unwrap`。

![Result 错误传播流程图](/images/errors-result-flow.png)

## Result 是两条路

```rust
fn parse_points(text: &str) -> Result<u32, std::num::ParseIntError> {
    text.parse::<u32>()
}
```

返回类型 `Result<u32, ParseIntError>` 可以读成：

- 成功时给我一个 `u32`。
- 失败时给我一个 `ParseIntError`。

使用时先用 `match` 看清楚：

```rust
fn main() {
    let input = "42";

    match input.parse::<u32>() {
        Ok(points) => println!("分数：{points}"),
        Err(error) => println!("解析失败：{error}"),
    }
}
```

## expect 比 unwrap 更适合新手

```rust
let points: u32 = "42".parse().expect("这里应该是数字");
```

`unwrap` 和 `expect` 都会在失败时 panic。区别是 `expect` 能留下你当时的假设。学习阶段如果你确信某处不会失败，用 `expect` 比裸 `unwrap` 更容易排查。

但真正写业务代码时，能处理就处理，能返回错误就返回错误。

## 问号：把错误交给调用者

```rust
fn bonus(text: &str) -> Result<u32, std::num::ParseIntError> {
    let points = text.parse::<u32>()?;
    Ok(points + 10)
}
```

`?` 的意思是：

- 如果是 `Ok(value)`，把 `value` 拿出来继续。
- 如果是 `Err(error)`，立刻把错误返回给调用者。

这让代码不用写很多层 `match`。

## 错误实验室：`?` 需要合适的返回类型

![问号运算符让错误提前返回的流程图](/images/question-mark-error-flow.png)

这段会报错：

```rust
fn main() {
    let points = "42".parse::<u32>()?;
    println!("{points}");
}
```

你会看到类似提示：

```text
the `?` operator can only be used in a function that returns `Result` or `Option`
```

`?` 的意思是“失败就从当前函数提前返回”，所以当前函数必须有地方装这个错误。修法之一是把逻辑放进返回 `Result` 的函数：

```rust
fn run() -> Result<(), std::num::ParseIntError> {
    let points = "42".parse::<u32>()?;
    println!("{points}");
    Ok(())
}
```

## Option 也能配合问号

```rust
fn first_char(text: &str) -> Option<char> {
    let first = text.chars().next()?;
    Some(first)
}
```

这里 `?` 遇到 `None` 会直接返回 `None`。

## 一个小任务：读取分数

```rust
fn parse_scores(items: Vec<&str>) -> Result<Vec<u32>, std::num::ParseIntError> {
    let mut scores = Vec::new();

    for item in items {
        let score = item.parse::<u32>()?;
        scores.push(score);
    }

    Ok(scores)
}

fn main() {
    match parse_scores(vec!["72", "88", "oops"]) {
        Ok(scores) => println!("分数：{scores:?}"),
        Err(error) => println!("有一项不是数字：{error}"),
    }
}
```

这段代码遇到 `"oops"` 会返回错误。注意错误没有偷偷跳出来，而是被函数签名清楚写出来了。

::: tip 心智模型
`Result` 像分拣机：成功走 `Ok` 通道，失败走 `Err` 通道。调用者必须选择怎么接住它。
:::

::: warning 动手 10 分钟
把 `"oops"` 改成 `"91"`，再改回来。然后把 `?` 改成 `match`，观察两种写法如何表达同一件事。
:::

## panic 和 Result 的边界

Rust 有两类失败：

- 可恢复错误：文件不存在、用户输入错误、网络超时，通常用 `Result`。
- 不可恢复错误：程序不变量被破坏、数组越界、测试断言失败，可能 panic。

库代码更应该返回 `Result`，把选择权交给调用方。应用入口可以决定打印错误并退出。

```rust
fn run() -> Result<(), String> {
    let input = std::fs::read_to_string("lessons.txt")
        .map_err(|error| format!("读取文件失败：{error}"))?;

    println!("{input}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
```

## 自定义错误类型

简单项目可以先用 `String`，但库和中型项目更推荐定义错误枚举：

```rust
#[derive(Debug)]
enum LessonError {
    MissingTitle,
    BadMinutes(std::num::ParseIntError),
}

fn parse_minutes(text: &str) -> Result<u32, LessonError> {
    text.parse::<u32>().map_err(LessonError::BadMinutes)
}
```

这样调用方可以精确匹配错误：

```rust
match parse_minutes("oops") {
    Ok(minutes) => println!("{minutes}"),
    Err(LessonError::BadMinutes(_)) => println!("分钟数必须是数字"),
    Err(LessonError::MissingTitle) => println!("缺少标题"),
}
```

## `map`、`map_err` 和 `and_then`

`Result` 可以像管道一样变换：

```rust
fn parse_bonus(text: &str) -> Result<u32, std::num::ParseIntError> {
    text.parse::<u32>().map(|points| points + 10)
}
```

如果下一步也可能失败，用 `and_then`：

```rust
fn non_zero(text: &str) -> Result<u32, String> {
    text.parse::<u32>()
        .map_err(|error| error.to_string())
        .and_then(|value| {
            if value == 0 {
                Err(String::from("不能为 0"))
            } else {
                Ok(value)
            }
        })
}
```

初学时先用 `match` 和 `?`，看懂后再用这些组合器。

## 课程清单工具 Checkpoint 3

现在把一行文本解析成课程，并让失败变成返回值：

```rust
#[derive(Debug, PartialEq, Eq)]
enum ParseLessonError {
    MissingField,
    BadMinutes,
}

fn parse_lesson(line: &str) -> Result<(String, u32), ParseLessonError> {
    let mut parts = line.split(',');

    let title = parts.next().ok_or(ParseLessonError::MissingField)?;
    let minutes = parts.next().ok_or(ParseLessonError::MissingField)?;
    let minutes = minutes
        .parse::<u32>()
        .map_err(|_| ParseLessonError::BadMinutes)?;

    Ok((title.to_string(), minutes))
}
```

这一步先不追求完整 CLI，只练一个边界：用户输入不可信，所以解析函数必须返回 `Result`。

## 给错误写好消息

`expect` 的消息应该写“为什么我认为这里应该成功”，而不是重复“出错了”：

```rust
let points: u32 = "42".parse().expect("示例输入固定为数字");
```

比下面更有用：

```rust
let points: u32 = "42".parse().expect("parse failed");
```

::: tip 过关标准
你能用 `match` 和 `?` 处理 `Result`，能解释 panic 与可恢复错误的边界，并能把课程文本解析失败设计成自己的错误类型。
:::
