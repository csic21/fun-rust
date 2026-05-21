# 结构体和枚举：把数据形状画出来

Rust 很鼓励你把状态写进类型里。结构体回答“这个东西有哪些字段”，枚举回答“这个东西可能是哪几种形态”。

![结构体和枚举数据形状图](/images/structs-enums-shapes.png)

## 本课目标

- 会用 `struct` 把相关字段放在一起。
- 会用 `impl` 给数据添加方法。
- 理解 `enum` 适合表达互斥状态。
- 会用 `Option` 和 `match` 处理“可能没有”和“多种可能”。

## struct：一张固定表格

```rust
struct Lesson {
    title: String,
    minutes: u32,
    finished: bool,
}

fn main() {
    let lesson = Lesson {
        title: String::from("所有权"),
        minutes: 30,
        finished: false,
    };

    println!("{} 分钟：{}", lesson.minutes, lesson.title);
}
```

结构体适合描述字段固定的数据，比如课程、用户、订单、配置。

## impl：把行为放到数据旁边

```rust
struct Lesson {
    title: String,
    minutes: u32,
}

impl Lesson {
    fn summary(&self) -> String {
        format!("{} 分钟学 {}", self.minutes, self.title)
    }
}
```

`&self` 表示这个方法只借用当前值，不拿走所有权。现在先记住这个写法，后面借用章节会讲清楚。

## enum：把可能性列出来

```rust
enum Progress {
    NotStarted,
    Learning { lesson: String, minutes_left: u32 },
    Done,
}
```

枚举适合描述“只能是其中一种”的状态。比起用多个 `bool`，枚举能更清楚地表达业务规则。

## 课程清单工具 Checkpoint 2

![用枚举表达互斥状态的状态机图](/images/status-enum-state-machine.png)

把上一课的散装变量收进类型里：

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
enum Status {
    Todo,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Lesson {
    title: String,
    minutes: u32,
    status: Status,
}
```

这里把完成状态从 `bool` 改成 `Status`，是为了以后能自然扩展出 `Paused`、`Skipped` 这类状态，而不是到处猜 `true` 和 `false` 的含义。

## Option：有值或没有值

Rust 没有到处乱跑的 `null`。常见的“可能没有”会写成 `Option<T>`：

```rust
fn first_lesson(lessons: Vec<String>) -> Option<String> {
    lessons.into_iter().next()
}
```

`Option<T>` 只有两种情况：

- `Some(value)`：有值。
- `None`：没有值。

使用时通常用 `match` 或 `if let` 拆开：

```rust
let maybe_title = Some("所有权");

if let Some(title) = maybe_title {
    println!("下一课：{title}");
}
```

::: tip 心智模型
结构体像“资料卡”，枚举像“状态机”。Rust 喜欢你把模糊状态变成明确形状。
:::

::: warning 动手 8 分钟
创建一个 `Task` 结构体，包含标题和完成状态；再创建一个 `TaskState` 枚举，表示未开始、进行中、已完成。
:::

## `derive`：让常见能力自动生成

很多类型会先写：

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
struct Lesson {
    title: String,
    minutes: u32,
}
```

这些 derive 分别代表：

- `Debug`：可以用 `{:?}` 调试打印。
- `Clone`：可以显式复制。
- `PartialEq` / `Eq`：可以比较相等，测试里常用。

不要一口气给所有类型 derive 所有能力。需要什么加什么。

## 字段更新语法

从一个值创建另一个相似值：

```rust
let basic = Lesson {
    title: String::from("变量"),
    minutes: 18,
    finished: false,
};

let advanced = Lesson {
    title: String::from("所有权"),
    ..basic
};
```

注意：这里会移动 `basic` 里没有显式设置的字段。因为 `String` 可能被移动，使用后要注意所有权变化。

## 错误实验室：字段私有不是坏事

如果你把类型放进模块，只公开结构体，不公开字段：

```rust
mod course {
    pub struct Lesson {
        title: String,
    }
}

fn main() {
    let lesson = course::Lesson {
        title: String::from("结构体"),
    };
}
```

编译器会提示类似：

```text
field `title` of struct `Lesson` is private
```

这不是 Rust 刻意刁难，而是在提醒：模块外部不能随便构造内部状态。常见修法是提供构造函数：

```rust
impl Lesson {
    pub fn new(title: String) -> Self {
        Self { title }
    }
}
```

## 元组结构体和单元结构体

元组结构体适合给简单值增加类型含义：

```rust
struct Minutes(u32);
struct UserId(u64);
```

这样 `Minutes(30)` 和 `UserId(30)` 不会被混用。

单元结构体没有字段，常用于标记类型：

```rust
struct English;
struct Chinese;
```

这类类型在泛型和 trait 设计里会更常见。

## 用枚举消除非法状态

不要这样表达加载状态：

```rust
struct PageState {
    loading: bool,
    error: Option<String>,
    data: Option<String>,
}
```

这里可能出现“loading 为 true 但 data 也有值”的混乱状态。更好的方式：

```rust
enum PageState {
    Loading,
    Error(String),
    Ready(String),
}
```

枚举让每个状态互斥，非法组合根本写不出来。

## 模式匹配拆数据

```rust
fn render(state: PageState) {
    match state {
        PageState::Loading => println!("加载中"),
        PageState::Error(message) => println!("错误：{message}"),
        PageState::Ready(data) => println!("内容：{data}"),
    }
}
```

`match` 会强迫你处理所有变体。这是 Rust 建模能力非常重要的一部分。

::: tip 过关标准
你能为课程清单写出 `Lesson` 结构体和 `Status` 枚举，能解释为什么枚举能消除非法状态，并能读懂一次私有字段访问错误。
:::
