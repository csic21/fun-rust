# 泛型、trait 和生命周期：写可复用但不含糊的代码

入门阶段你先写具体类型：`String`、`Vec<Lesson>`、`u32`。中级 Rust 会开始问：如果函数不只服务一种类型，应该怎么表达？如果函数只是需要“能打印”“能比较”“能转成字符串”的能力，应该怎么写？如果返回引用，编译器怎么知道这个引用来自哪里？

答案分别是：泛型、trait、生命周期。

## 本课目标

- 会读懂 `fn largest<T: Ord>(items: &[T]) -> Option<&T>` 这种签名。
- 理解 trait 是“能力契约”，不是继承树。
- 会写常见 trait bound、`impl Trait` 和 `where`。
- 理解生命周期标注是在描述引用关系，不是在延长生命。

![泛型 trait 和生命周期关系图](/images/generics-traits-lifetimes-map.png)

## 泛型：把类型作为参数

先看一个具体版本：

```rust
fn first_number(items: &[u32]) -> Option<&u32> {
    items.first()
}
```

如果希望它也支持 `String`、`Lesson`、其他类型，可以写泛型：

```rust
fn first<T>(items: &[T]) -> Option<&T> {
    items.first()
}
```

`T` 是类型参数。函数不关心元素是什么，只需要它们在切片里。

## trait：描述类型能做什么

如果你要打印元素，就不能只写 `T`，因为不是所有类型都能格式化：

```rust
fn print_all<T: std::fmt::Display>(items: &[T]) {
    for item in items {
        println!("{item}");
    }
}
```

`T: Display` 的意思是：`T` 必须实现 `Display` 这个能力。

## 错误实验室：trait bound 不满足

![trait bound 像能力契约一样筛选类型的示意图](/images/trait-bound-contract.png)

先写一个普通结构体：

```rust
struct Lesson {
    title: String,
}

fn print_all<T: std::fmt::Display>(items: &[T]) {
    for item in items {
        println!("{item}");
    }
}

fn main() {
    let lessons = vec![Lesson {
        title: String::from("泛型"),
    }];

    print_all(&lessons);
}
```

你会看到类似提示：

```text
the trait bound `Lesson: std::fmt::Display` is not satisfied
```

这句话的重点不是 `T`，而是“这个函数承诺要用 `{}` 打印，所以元素类型必须实现 `Display`”。修法有两种：如果只是调试，函数改成 `T: Debug` 并用 `{:?}`；如果是面向用户输出，就给 `Lesson` 实现 `Display`。

trait 像一份契约：

```rust
trait Summary {
    fn summary(&self) -> String;
}

struct Lesson {
    title: String,
    minutes: u32,
}

impl Summary for Lesson {
    fn summary(&self) -> String {
        format!("{} 分钟：{}", self.minutes, self.title)
    }
}
```

然后函数可以只依赖契约：

```rust
fn print_summary(item: &impl Summary) {
    println!("{}", item.summary());
}
```

## `impl Trait` 和显式泛型

这两种写法常常等价：

```rust
fn print_summary(item: &impl Summary) {
    println!("{}", item.summary());
}
```

```rust
fn print_summary<T: Summary>(item: &T) {
    println!("{}", item.summary());
}
```

区别是：显式泛型可以表达多个参数必须是同一种类型。

```rust
fn same_type<T: Summary>(a: &T, b: &T) {
    println!("{} / {}", a.summary(), b.summary());
}
```

如果用两个 `impl Summary`，它们可以是不同类型：

```rust
fn any_two(a: &impl Summary, b: &impl Summary) {
    println!("{} / {}", a.summary(), b.summary());
}
```

## `where` 让复杂约束更好读

约束变多时，不要把签名挤成一长串：

```rust
fn compare_and_print<T, U>(left: T, right: U)
where
    T: std::fmt::Display + PartialOrd<U>,
    U: std::fmt::Display,
{
    if left > right {
        println!("{left} > {right}");
    } else {
        println!("{left} <= {right}");
    }
}
```

`where` 不是新能力，只是更清楚的排版。

## 常见标准 trait

| trait | 代表能力 | 常见场景 |
| --- | --- | --- |
| `Debug` | 用 `{:?}` 调试打印 | `#[derive(Debug)]` |
| `Display` | 用 `{}` 面向用户打印 | CLI 输出、错误消息 |
| `Clone` | 显式复制值 | 需要独立副本 |
| `Copy` | 轻量按位复制 | 小整数、布尔值 |
| `Default` | 默认值 | 配置、测试数据 |
| `PartialEq` / `Eq` | 比较相等 | 断言、查找 |
| `PartialOrd` / `Ord` | 排序比较 | `sort`、最大值 |
| `From` / `Into` | 类型转换 | API 参数更灵活 |
| `Iterator` | 逐个产生值 | 集合处理 |
| `Read` / `Write` | 输入输出抽象 | 文件、网络、内存缓冲 |

## 生命周期：描述引用之间的关系

生命周期最容易被误解。它不是让引用活得更久，而是告诉编译器：返回的引用和输入引用是什么关系。

这个函数不需要写生命周期，因为规则很明显：

```rust
fn first(items: &[String]) -> Option<&String> {
    items.first()
}
```

返回的引用来自 `items`，编译器能推断。

但这个函数需要标注：

```rust
fn longer<'a>(left: &'a str, right: &'a str) -> &'a str {
    if left.len() >= right.len() {
        left
    } else {
        right
    }
}
```

`'a` 的意思不是“让 left 和 right 活到一样久”。它的意思是：返回值的有效时间不能超过 `left` 和 `right` 中较短的那个。

## 不要返回局部变量的引用

这段不能编译：

```rust
fn bad() -> &str {
    let text = String::from("hello");
    &text
}
```

`text` 在函数结束时被清理，返回它的引用会悬空。正确做法是返回拥有值：

```rust
fn good() -> String {
    String::from("hello")
}
```

或者返回引用时确保引用来自调用方传进来的数据：

```rust
fn trim_title(title: &str) -> &str {
    title.trim()
}
```

## 结构体里的引用需要生命周期

如果结构体保存引用，它必须说明引用能活多久：

```rust
struct LessonView<'a> {
    title: &'a str,
}
```

这表示 `LessonView` 不能比它借用的标题活得更久。

很多业务结构体更推荐拥有数据：

```rust
struct Lesson {
    title: String,
}
```

只有在明确需要避免复制、临时视图、解析器、零拷贝场景时，再考虑在结构体里放引用。

## 练习：从具体函数演进到抽象函数

先写具体版本：

```rust
fn print_titles(titles: &[String]) {
    for title in titles {
        println!("{title}");
    }
}
```

然后改成泛型：

```rust
fn print_items<T: std::fmt::Display>(items: &[T]) {
    for item in items {
        println!("{item}");
    }
}
```

最后写一个 trait：

```rust
trait Named {
    fn name(&self) -> &str;
}

fn print_names<T: Named>(items: &[T]) {
    for item in items {
        println!("{}", item.name());
    }
}
```

::: tip 过关标准
看到泛型签名时，你能分辨“类型参数是谁”“它需要哪些 trait 能力”“返回引用来自哪个输入”。
:::

## 设计建议

- 先写具体类型，重复出现后再抽象。
- trait 要描述真实能力，不要为了“看起来高级”创建空泛 trait。
- 参数优先用借用：`&str`、`&[T]`、`impl Read`。
- 返回值如果涉及局部构造，优先返回拥有类型。
- 生命周期报错时，先画出数据从哪里来、要返回到哪里去。
