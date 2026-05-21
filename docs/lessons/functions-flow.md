# 函数、分支和循环：让代码有节奏

写 Rust 函数时，输入和输出都很明确。清楚的边界会让后面的所有权和错误处理更容易理解。

![函数调用和表达式返回值流程图](/images/functions-control-flow.png)

## 本课目标

- 会写带参数和返回值的函数。
- 理解 Rust 里表达式可以产生值。
- 知道分号会把表达式语句化，让结果变成 `()`。
- 会用 `if`、`match`、`for`、`while` 和 `loop` 表达控制流。

## 函数参数必须写类型

```rust
fn double(n: i32) -> i32 {
    n * 2
}

fn main() {
    println!("{}", double(21));
}
```

`-> i32` 表示返回一个 `i32`。函数体最后一行没有分号，所以它是返回值。

如果加上分号，就变成“执行这句，不把值交出去”：

```rust
fn double(n: i32) -> i32 {
    n * 2;
}
```

这段会报错，因为函数承诺返回 `i32`，但实际返回了空值 `()`。

## 错误实验室：分号让返回值变成空值

![分号把返回值变成空值的流程图](/images/return-unit-error.png)

新手最常见的函数错误是多写一个分号：

```rust
fn double(n: i32) -> i32 {
    n * 2;
}
```

编译器会提示类似：

```text
expected `i32`, found `()`
```

`()` 可以先读成“没有有用的返回值”。修法是删掉最后一行分号，或者显式写 `return n * 2;`。学习 Rust 时更推荐先习惯“最后一个无分号表达式就是返回值”。

## if 也能产生值

```rust
fn badge(score: u32) -> &'static str {
    if score >= 90 {
        "太稳了"
    } else if score >= 60 {
        "能用了"
    } else {
        "继续练"
    }
}
```

Rust 的 `if` 分支可以作为表达式。每个分支必须产出同一种类型，这样调用者才知道会得到什么。

## match 适合列清楚所有情况

```rust
fn mood(level: u8) -> &'static str {
    match level {
        0 => "刚开始",
        1..=3 => "有点感觉",
        4..=7 => "越来越顺",
        _ => "可以挑战项目",
    }
}
```

`match` 很适合处理枚举，也适合把范围、特殊值和兜底情况写清楚。

## 循环：先掌握 for

```rust
fn main() {
    let steps = ["运行", "修改", "再运行"];

    for step in steps {
        println!("今天练：{step}");
    }
}
```

新手先把 `for` 用熟。`loop` 和 `while` 后面再补也来得及。

::: warning 动手 5 分钟
写一个 `level_name(level: u8) -> &'static str`，用 `match` 把 0、1 到 3、其他情况分别返回不同文案。
:::

::: tip 过关标准
你能解释“没有分号的最后一行会成为返回值”，并能让 `if` 或 `match` 返回一个字符串。
:::

## 代码块也是表达式

Rust 里 `{}` 代码块可以产生值：

```rust
fn main() {
    let score = {
        let base = 70;
        let bonus = 12;
        base + bonus
    };

    println!("{score}");
}
```

如果最后一行加分号，代码块结果会变成 `()`：

```rust
let score = {
    let base = 70;
    base + 12;
};
```

这也是很多新手看到 “expected `i32`, found `()`” 的原因。

## `while` 和 `loop`

`while` 适合条件循环：

```rust
let mut n = 3;

while n > 0 {
    println!("{n}");
    n -= 1;
}
```

`loop` 是无限循环，但可以用 `break` 返回值：

```rust
let mut n = 0;

let answer = loop {
    n += 1;

    if n * n >= 100 {
        break n;
    }
};

println!("{answer}");
```

这体现了 Rust “表达式产生值”的一致性。

## 模式匹配不只在 `match`

`if let` 适合只关心一种情况：

```rust
let maybe_score = Some(88);

if let Some(score) = maybe_score {
    println!("分数：{score}");
}
```

`while let` 适合循环处理直到没有值：

```rust
let mut stack = vec![1, 2, 3];

while let Some(value) = stack.pop() {
    println!("{value}");
}
```

后面学 `Option`、`Result`、迭代器时，这些写法会经常出现。

## 函数设计小原则

- 参数越具体，函数越容易写；参数越抽象，函数越容易复用。
- 新手先写具体类型，不要一开始就泛型化。
- 函数只读取字符串时，参数写 `&str`。
- 函数只读取列表时，参数写 `&[T]`。
- 函数可能失败时，返回 `Result<T, E>`。
