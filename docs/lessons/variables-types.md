# 变量和类型：先把值说清楚

Rust 的类型系统像一个认真贴标签的助手。你不必每次都手写标签，但编译器会尽量在编译时确认：这个值是什么、能不能改、会不会被当成另一种东西使用。

## 本课目标

- 理解 `let` 默认不可变。
- 会用 `mut` 明确表示“这里允许修改”。
- 知道基础类型和 `String` 的区别。
- 初步认识 shadowing，也就是用新值遮蔽旧名字。

![变量和类型标签流程图](/images/variables-types-map.png)

## 默认不可变

```rust
fn main() {
    let score = 10;
    // score = 11; // 这行会报错
    println!("{score}");
}
```

Rust 默认让变量不可变，不是为了限制你，而是为了让代码更容易推理。看到 `let score = 10`，你就可以放心：除非它被重新声明，否则它不会偷偷变掉。

需要修改时，用 `mut` 明确写出来：

```rust
fn main() {
    let mut score = 10;
    score += 1;
    println!("{score}");
}
```

## 错误实验室：不可变变量不能二次赋值

![读编译器错误的反馈循环图](/images/compiler-error-lab.png)

把上面的 `mut` 删掉，再运行：

```rust
fn main() {
    let score = 10;
    score += 1;
    println!("{score}");
}
```

你会看到类似提示：

```text
cannot assign twice to immutable variable `score`
```

先读人话：`score` 默认不可变，你第二次给它赋值了。修法不是“到处加 mut”，而是先问一句：这个值真的需要变化吗？如果只是从旧值算出新值，shadowing 也许更清楚：

```rust
let score = 10;
let score = score + 1;
```

## 常见基础类型

| 类型 | 像什么 | 例子 |
| --- | --- | --- |
| `i32` | 有正负的整数 | `-3`, `0`, `42` |
| `u32` | 没有负数的整数 | `0`, `18`, `100` |
| `f64` | 小数 | `3.14` |
| `bool` | 真或假 | `true`, `false` |
| `char` | 一个 Unicode 字符 | `'你'`, `'R'` |
| `&str` | 字符串切片，常见于字面量 | `"hello"` |
| `String` | 可增长、可修改的字符串 | `String::from("hello")` |

## 类型推断不是猜谜

```rust
let count = 3;       // 编译器通常推断成 i32
let price = 9.9;     // 通常推断成 f64
let name = "Lina"; // &str
```

如果上下文不够，或者你想让读者更清楚，可以写类型：

```rust
let count: u32 = 3;
let name: String = String::from("Lina");
```

## Shadowing：换一张新标签

Shadowing 是重新使用同一个变量名，但绑定到一个新值上。它适合做“数据转换”：

```rust
fn main() {
    let text = "42";
    let text: u32 = text.parse().expect("需要一个数字");
    println!("{}", text + 1);
}
```

这里第一个 `text` 是 `&str`，第二个 `text` 是 `u32`。名字一样，但绑定已经换了。

::: tip 心智模型
`mut` 是“同一个盒子可以改内容”；shadowing 是“拿一个新盒子继续用同一个标签”。
:::

::: warning 动手 5 分钟
删掉 `mut` 观察错误；把 `parse` 的输入改成 `"abc"`，观察 `expect` 的消息。
:::

## 常见卡点

- `String` 和 `&str` 不是同一个类型。先粗略记：`String` 更像自己拥有内容的字符串，`&str` 更像看一段已有文字。
- 不要一开始就强行背所有数字类型。先会用 `i32`、`u32`、`f64` 就够了。
- 编译器要求类型一致，不是为了挑刺，而是为了防止“明明想加数字，却拿到了文字”的问题。

## 数字类型怎么选

Rust 有很多整数类型：`i8`、`i16`、`i32`、`i64`、`i128`、`isize`，以及对应的无符号版本 `u8`、`u16` 等。初学时可以按这个顺序：

- 普通整数：先用 `i32`。
- 计数、长度、索引：标准库常用 `usize`。
- 明确不能为负的业务值：可以用 `u32`，但要小心和其他整数混用。
- 字节：用 `u8`。

示例：

```rust
let count: usize = "Rust".len();
let byte: u8 = b'R';
let year: i32 = 2026;
```

不要为了“节省内存”过早使用很小的整数类型。先让含义清楚，再做性能优化。

## `const` 和 `let` 的区别

`let` 是变量绑定，运行到这一行时创建：

```rust
let timeout_seconds = 30;
```

`const` 是常量，必须写类型，适合全局固定值：

```rust
const MAX_RETRIES: u32 = 3;
```

常量不能用运行时计算出来的值初始化。新手项目里，配置值多数先用 `let`，真正跨模块共享且永远不变的值再用 `const`。

## 类型转换要显式

Rust 不会偷偷把 `u32` 变成 `usize`：

```rust
let index: usize = 2;
let count: u32 = 10;

// println!("{}", index + count); // 类型不同
println!("{}", index + count as usize);
```

`as` 可以转换数字，但可能截断。更严谨时用 `try_from`：

```rust
let count = usize::try_from(count).expect("count 应该能放进 usize");
println!("{}", index + count);
```

## 字符串的三个常见形态

| 形态 | 说明 | 常见用法 |
| --- | --- | --- |
| `&'static str` | 写在程序里的字符串字面量 | `"hello"` |
| `String` | 拥有内容、可增长 | 用户输入、文件内容 |
| `&str` | 借用一段字符串 | 函数参数、切片 |

函数参数如果只读，优先写 `&str`：

```rust
fn greet(name: &str) {
    println!("你好，{name}");
}

let name = String::from("Lina");
greet(&name);
greet("Rust");
```

这会让 API 更灵活。

## 课程清单工具 Checkpoint 1

先不用结构体，只用变量把一节课说清楚：

```rust
fn main() {
    let title = "变量和类型";
    let minutes: u32 = 18;
    let done = false;

    println!("{title} / {minutes} 分钟 / 完成：{done}");
}
```

过关后你应该能回答：

- 哪些值适合不可变绑定？
- 哪个字段以后可能会从 `bool` 升级成枚举？
- `title` 现在是 `&str`，什么时候需要变成 `String`？

::: tip 过关标准
你能解释 `let`、`mut`、shadowing、基础数字类型和 `String` / `&str` 的区别，并能根据编译器提示修复一次不可变赋值错误。
:::
