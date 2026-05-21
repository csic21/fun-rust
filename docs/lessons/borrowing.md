# 借用：多人看一眼，或一个人改一下

![借用规则插图](/images/borrowing-rules.png)

借用是所有权的温柔版本：函数可以临时访问一个值，但不拿走它。借用让代码少复制、少移动，同时保持内存安全。

## 本课目标

- 区分共享引用 `&T` 和可变引用 `&mut T`。
- 理解“很多人只读”与“一个人可写”不能同时发生。
- 知道借用什么时候结束。
- 能把函数参数从拿走所有权改成借用。

## 共享引用：看一眼

```rust
fn title_len(title: &str) -> usize {
    title.len()
}

fn main() {
    let title = String::from("Rust 入门");
    let len = title_len(&title);

    println!("{title} 有 {len} 个字节");
}
```

`title_len` 只需要读取，不需要拥有字符串。所以参数写 `&str`，调用时传 `&title`。

共享引用可以有多个：

```rust
let title = String::from("Rust");
let a = &title;
let b = &title;

println!("{a} / {b}");
```

因为大家都只是看，不会把内容改乱。

## 可变引用：借来改一下

```rust
fn add_suffix(title: &mut String) {
    title.push_str(" 入门");
}

fn main() {
    let mut title = String::from("Rust");
    add_suffix(&mut title);
    println!("{title}");
}
```

要传 `&mut title`，变量本身也必须是 `mut`。这两层意思不同：

- `let mut title`：这个变量绑定允许被修改。
- `&mut title`：这次把它以可变方式借出去。

## 核心规则：很多读，或一个写

Rust 借用规则可以先记成一句话：

> 同一段使用期里，要么有很多共享引用，要么有一个可变引用。

![借用使用期流程图](/images/borrowing-rules-process.png)

这段会报错：

```rust
fn main() {
    let mut title = String::from("Rust");

    let read = &title;
    let edit = &mut title;

    println!("{read}");
    edit.push_str(" 入门");
}
```

因为 `read` 还会被使用，同时又创建了 `edit` 这个可变引用。Rust 不允许“有人正在读旧内容时，另一个人开始修改”。

## 错误实验室：一次只能有一个可变借用

![两个可变借用冲突和顺序修复示意图](/images/mutable-borrow-conflict.png)

先故意写错：

```rust
fn main() {
    let mut title = String::from("Rust");

    let a = &mut title;
    let b = &mut title;

    a.push_str(" 入门");
    b.push_str(" 进阶");
}
```

你会看到类似提示：

```text
cannot borrow `title` as mutable more than once at a time
```

先找“谁还活着”：`a` 后面还会用，所以第一个可变借用还没结束；这时创建 `b` 就违反了“一次只有一个写者”。修法通常是缩短第一个借用的使用期：

```rust
let mut title = String::from("Rust");

{
    let a = &mut title;
    a.push_str(" 入门");
}

let b = &mut title;
b.push_str(" 进阶");
```

把顺序改一下就可以：

```rust
fn main() {
    let mut title = String::from("Rust");

    let read = &title;
    println!("{read}");

    let edit = &mut title;
    edit.push_str(" 入门");

    println!("{title}");
}
```

现代 Rust 会根据最后一次使用判断借用结束。`read` 在 `println!("{read}")` 后不再使用，所以后面可以创建可变引用。

## 借用不是越省越好

新手常问：那我是不是永远用引用，绝不移动？

不是。选择方式看意图：

| 函数意图 | 参数形态 | 例子 |
| --- | --- | --- |
| 只读取 | `&T`、`&str` | 计算长度、打印标题 |
| 修改原值 | `&mut T` | 给字符串追加后缀 |
| 消费并保存 | `T` | 把任务放进归档列表 |
| 需要独立副本 | `T` 加调用方 `clone()` | 同时保留原件和副本 |

## 小练习：从拿走改成借用

先看一个不太好的版本：

```rust
fn shout(title: String) {
    println!("{}!", title.to_uppercase());
}

fn main() {
    let title = String::from("rust");
    shout(title);
    // println!("{title}"); // 不能再用
}
```

如果 `shout` 只是打印，就应该借用：

```rust
fn shout(title: &str) {
    println!("{}!", title.to_uppercase());
}

fn main() {
    let title = String::from("rust");
    shout(&title);
    println!("原值还在：{title}");
}
```

::: tip 心智模型
共享引用像图书馆里很多人同时看书；可变引用像一个人拿笔改书。看的人和改的人不能同时操作同一本。
:::

## 常见误区

### 误区一：`&String` 总是最合适

很多只读字符串参数更推荐 `&str`：

```rust
fn greet(name: &str) {
    println!("你好，{name}");
}
```

这样既能传 `&String`，也能传字符串字面量：

```rust
let name = String::from("Lina");
greet(&name);
greet("Rust");
```

### 误区二：可变引用可以多开几个

同一段使用期里只能有一个可变引用：

```rust
let mut title = String::from("Rust");
let a = &mut title;
// let b = &mut title; // 不行
a.push_str(" 入门");
```

这条规则避免数据竞争。以后学并发时，你会更感谢它。

### 误区三：借用结束必须等到花括号结束

不一定。借用通常在最后一次使用后结束：

```rust
let mut title = String::from("Rust");
let read = &title;
println!("{read}");

title.push_str(" 入门"); // 可以
```

因为 `read` 后面不再使用。

::: warning 动手 10 分钟
写三个函数：`read_title(&str)`、`add_tag(&mut String)`、`consume(String)`。分别调用它们，并在每次调用后判断原变量还能不能用。
:::

## 切片：借用集合的一部分

字符串切片 `&str` 是借用一段 UTF-8 字符串。数组和 Vec 也有切片 `&[T]`：

```rust
fn first_two(items: &[i32]) -> &[i32] {
    &items[0..2]
}

let numbers = vec![10, 20, 30];
let part = first_two(&numbers);
println!("{part:?}");
```

切片不拥有数据，只描述“从哪里开始、有多长”。所以原数据必须活得比切片更久。

## 字符串切片要小心字节边界

这段可能 panic：

```rust
let text = "你好";
// let broken = &text[0..1]; // 不在字符边界
```

Rust 字符串按 UTF-8 存储，索引是字节位置，不是“第几个汉字”。如果要按字符遍历，用：

```rust
for ch in text.chars() {
    println!("{ch}");
}
```

## 返回引用时，引用必须来自输入

可以：

```rust
fn first_title(titles: &[String]) -> Option<&String> {
    titles.first()
}
```

不可以：

```rust
fn bad_title() -> &String {
    let title = String::from("Rust");
    &title
}
```

第二段返回了局部变量的引用。函数结束后 `title` 被清理，引用会悬空，所以编译器拒绝。

## 参数设计练习

给下面函数选择参数形态：

| 需求 | 推荐参数 |
| --- | --- |
| 打印标题 | `&str` |
| 给标题追加后缀 | `&mut String` |
| 统计课程数量 | `&[Lesson]` |
| 修改课程列表里的状态 | `&mut [Lesson]` 或 `&mut Vec<Lesson>` |
| 把课程保存进归档并不再使用原值 | `Lesson` |

`&mut [Lesson]` 比 `&mut Vec<Lesson>` 更通用，因为它只要求“可变借用一段课程”，不要求一定是 Vec。

```rust
fn mark_all_done(lessons: &mut [Lesson]) {
    for lesson in lessons {
        lesson.done = true;
    }
}
```

::: tip 过关标准
你能把“拿走所有权”的函数改成只读借用或可变借用，能解释“很多读或一个写”，并能通过缩短使用期修复一次可变借用冲突。
:::
