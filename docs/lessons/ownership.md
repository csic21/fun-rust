# 所有权：谁拿钥匙，谁负责值

![所有权转移插图](/images/ownership-transfer.png)

所有权是 Rust 最重要也最容易吓到新手的概念。先不要把它想成抽象规则，先想成一把钥匙：

- 值像一个房间里的物品。
- 变量名像拿着钥匙的人。
- 同一时刻，真正负责这个值的人只有一个。
- 把钥匙交出去后，原来的人不能再用这把钥匙开门。

Rust 用这套规则解决一个很现实的问题：内存里的数据到底由谁负责清理？如果两个人都以为自己负责，可能重复释放；如果没人负责，可能泄漏；如果有人还拿着已经被清掉的数据，就会出现悬垂引用。Rust 希望这些问题在编译时就被拦住。

## 本课目标

- 明白“移动”不是复制，而是所有权交接。
- 知道哪些类型通常会复制，哪些类型会移动。
- 会用借用避免不必要的移动。
- 会判断什么时候该用 `clone`。
- 能读懂“borrow of moved value”这类错误的大意。

## 从最简单的值开始

```rust
fn main() {
    let a = 3;
    let b = a;

    println!("a = {a}, b = {b}");
}
```

这段能运行。因为 `i32` 这种小而固定的值实现了 `Copy`，赋值时会复制一份。`a` 和 `b` 都能继续用。

再看 `String`：

```rust
fn main() {
    let a = String::from("Rust");
    let b = a;

    println!("{b}");
    // println!("{a}"); // 这里会报错
}
```

`String` 的内容放在堆上。变量 `a` 里不只是文字，还包含指向堆内存的位置、长度、容量等信息。如果简单复制这些信息，就可能出现两个变量都以为自己要清理同一块内存。Rust 选择更安全的做法：把所有权从 `a` 移动给 `b`，然后 `a` 失效。

::: tip 心智模型
`let b = a` 对 `String` 来说像“把钥匙交给 b”。钥匙交出去了，a 就不能再开门。
:::

## 移动也会发生在函数调用里

函数参数也是变量。把一个 `String` 传给需要 `String` 的函数，就等于把所有权交给函数参数：

![函数调用时所有权移动和借用的真实过程图](/images/function-ownership-call.png)

```rust
fn print_title(title: String) {
    println!("课程：{title}");
}

fn main() {
    let lesson = String::from("所有权");
    print_title(lesson);

    // println!("{lesson}"); // lesson 已经移动进函数
}
```

`print_title` 结束时，参数 `title` 离开作用域，值会被清理。原来的 `lesson` 已经没有钥匙，所以不能再用。

## 作用域：值什么时候被清理

Rust 会在变量离开作用域时自动清理它拥有的值：

```rust
fn main() {
    {
        let name = String::from("Lina");
        println!("{name}");
    } // name 到这里离开作用域，String 被清理

    // println!("{name}"); // name 已经不存在
}
```

这也是为什么所有权必须明确：编译器需要知道每个值在什么时候被谁清理。

## 想继续用？先借一下

如果函数只是“看一眼”，不要拿走所有权。用引用：

```rust
fn print_title(title: &String) {
    println!("课程：{title}");
}

fn main() {
    let lesson = String::from("所有权");
    print_title(&lesson);
    println!("我还能继续用：{lesson}");
}
```

`&lesson` 表示把 `lesson` 借给函数看一下。函数拿到的是引用，不是值本身。函数结束后，借用结束，原主人还在。

更常见的参数写法是 `&str`：

```rust
fn print_title(title: &str) {
    println!("课程：{title}");
}

fn main() {
    let lesson = String::from("所有权");
    print_title(&lesson);
    print_title("借用");
}
```

`&str` 更灵活，既能接收字符串字面量，也能接收 `String` 的引用。

## 真的需要两份？用 clone

如果你确实需要两份独立的 `String`，可以显式复制堆上的内容：

```rust
fn main() {
    let a = String::from("Rust");
    let b = a.clone();

    println!("a = {a}, b = {b}");
}
```

`clone` 是有成本的，因为它复制真实内容。Rust 让你显式写出来，是为了让“复制一份”这件事不要悄悄发生。

| 你想做什么 | 推荐方式 | 原因 |
| --- | --- | --- |
| 函数只读取字符串 | `&str` 或 `&String` | 不拿走所有权 |
| 函数需要修改原值 | `&mut String` | 借来改，改完还给原主人 |
| 函数要永久保存一份 | `String` 或 `clone()` | 明确拿走或复制 |
| 小整数、布尔值这类轻量值 | 直接赋值 | 通常实现了 `Copy` |

## 常见报错：borrow of moved value

你可能会看到类似错误：

```text
borrow of moved value: `lesson`
```

先别慌。把它翻译成人话：

> 你之前已经把 `lesson` 的钥匙交出去了，现在又想借用它。

常见修法有三种：

### 修法一：函数改成借用

```rust
fn print_title(title: &str) {
    println!("{title}");
}

fn main() {
    let lesson = String::from("所有权");
    print_title(&lesson);
    println!("{lesson}");
}
```

如果函数只是打印，借用最合适。

### 修法二：先用完，再移动

```rust
fn take_title(title: String) {
    println!("保存：{title}");
}

fn main() {
    let lesson = String::from("所有权");
    println!("准备保存：{lesson}");
    take_title(lesson);
}
```

如果最后确实要交出去，就把还需要用它的代码放在移动之前。

### 修法三：显式 clone

```rust
fn take_title(title: String) {
    println!("保存：{title}");
}

fn main() {
    let lesson = String::from("所有权");
    take_title(lesson.clone());
    println!("原来的还在：{lesson}");
}
```

如果两个地方都要独立拥有，就复制一份。不要把 `clone` 当万能胶，但它是很好的新手安全出口。

## 一个小故事串起来

假设你有一张课程卡片：

```rust
struct Lesson {
    title: String,
}
```

现在有三种函数：

```rust
fn read(lesson: &Lesson) {
    println!("读一下：{}", lesson.title);
}

fn rename(lesson: &mut Lesson) {
    lesson.title.push_str(" 入门");
}

fn archive(lesson: Lesson) {
    println!("归档：{}", lesson.title);
}
```

它们分别表示：

- `read(&lesson)`：看一眼，不拿走。
- `rename(&mut lesson)`：借来改一下，改完还回去。
- `archive(lesson)`：拿走，之后原变量不能再用。

完整代码：

```rust
struct Lesson {
    title: String,
}

fn read(lesson: &Lesson) {
    println!("读一下：{}", lesson.title);
}

fn rename(lesson: &mut Lesson) {
    lesson.title.push_str(" 入门");
}

fn archive(lesson: Lesson) {
    println!("归档：{}", lesson.title);
}

fn main() {
    let mut lesson = Lesson {
        title: String::from("所有权"),
    };

    read(&lesson);
    rename(&mut lesson);
    read(&lesson);
    archive(lesson);

    // read(&lesson); // 已经归档，所有权被拿走
}
```

::: tip 过关标准
看到一个函数参数时，你能说出它是“拿走值”、 “只借来看”、还是“借来修改”。
:::

::: warning 动手 10 分钟
把 `archive(lesson)` 提到第一次 `read(&lesson)` 前面，观察后面的错误。再分别用“改成借用”“调整顺序”“clone”三种方式修复。
:::

## 暂时不要急着学生命周期

很多新手一看到借用就跳到生命周期。先不用。你现在只需要掌握：

- 值有一个主人。
- 赋值和传参可能移动所有权。
- 引用可以临时借用。
- 可变借用要更谨慎。
- `clone` 表示明确复制一份。

生命周期是“引用能活多久”的进一步规则，等你能稳定读懂移动和借用，再学会轻松很多。
