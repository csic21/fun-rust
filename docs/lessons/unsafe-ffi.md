# unsafe、FFI 和底层边界：把危险关进小房间

Rust 的安全子集已经能完成大多数工作。但当你写操作系统、嵌入式、性能敏感容器、跨语言调用或底层库时，可能需要 `unsafe`。

`unsafe` 不表示“这段代码一定错”，而表示：编译器无法帮你证明全部安全性，需要你手动维护额外不变量。

## 本课目标

- 知道 `unsafe` 能启用哪几类能力。
- 理解 unsafe 的核心是维护不变量。
- 会把 unsafe 封装在小范围内，向外提供安全 API。
- 初步了解 FFI、C ABI、原始指针和 `repr(C)`。

![unsafe 和 FFI 安全边界图](/images/unsafe-ffi-boundary.png)

## unsafe 的五类能力

在 unsafe 块里可以：

1. 解引用原始指针。
2. 调用 unsafe 函数或方法。
3. 访问或修改可变静态变量。
4. 实现 unsafe trait。
5. 访问 union 字段。

普通借用规则依然存在。`unsafe` 不是关闭所有检查，只是允许你做一些编译器无法完全验证的事。

## 原始指针

```rust
let mut value = 42;

let const_ptr = &value as *const i32;
let mut_ptr = &mut value as *mut i32;
```

创建原始指针是安全的，解引用才需要 unsafe：

```rust
unsafe {
    println!("{}", *const_ptr);
    *mut_ptr += 1;
}
```

你必须保证：

- 指针非空或按 API 允许为空。
- 指向有效内存。
- 对齐正确。
- 没有违反别名和可变性规则。
- 指向的数据在使用期间仍然活着。

## unsafe 函数

```rust
unsafe fn read_first(ptr: *const i32) -> i32 {
    *ptr
}
```

调用方必须满足函数文档里的安全条件：

```rust
let value = 10;
let ptr = &value as *const i32;

let first = unsafe { read_first(ptr) };
```

unsafe 函数必须写清楚 `# Safety`：

```rust
/// # Safety
///
/// `ptr` must be non-null, properly aligned, and point to a valid `i32`.
unsafe fn read_i32(ptr: *const i32) -> i32 {
    *ptr
}
```

## 封装 unsafe

目标是让 unsafe 小而集中：

```rust
pub fn first_or_zero(items: &[i32]) -> i32 {
    if items.is_empty() {
        return 0;
    }

    unsafe { *items.as_ptr() }
}
```

这个例子里，安全 API 先检查空切片，再解引用第一个元素指针。调用方不需要知道内部用了 unsafe。

真实项目里，每个 unsafe 块附近都应该能回答：

- 这里依赖什么不变量？
- 这些不变量由谁检查？
- 如果调用方传错数据，是否仍能保持安全 API 不触发未定义行为？

## FFI：调用 C

C 函数声明常见写法：

```rust
unsafe extern "C" {
    fn abs(input: i32) -> i32;
}

fn main() {
    let value = unsafe { abs(-3) };
    println!("{value}");
}
```

跨语言边界需要关心 ABI、类型布局、字符串编码、内存分配和释放责任。

## `repr(C)`：稳定布局

Rust 默认不承诺结构体字段布局。和 C 交互时要写：

```rust
#[repr(C)]
pub struct Point {
    x: f64,
    y: f64,
}
```

这让结构体布局按 C 兼容方式排列。

## 字符串和内存所有权

C 字符串通常是以 `\0` 结尾的字节序列。Rust 里常用：

```rust
use std::ffi::CString;

let text = CString::new("hello").expect("字符串中不能包含内部 nul 字节");
let ptr = text.as_ptr();
```

注意：`ptr` 不能比 `text` 活得更久。跨 FFI 返回指针时，必须明确谁分配、谁释放。

## 什么时候不用 unsafe

- 只是为了绕过借用检查。
- 只是为了避免一次 `clone`。
- 还没写清楚数据结构不变量。
- 没有测试边界条件。
- 可以用标准库或成熟 crate 解决。

## 练习：写一个安全包装

目标：给一个切片返回第一个元素，空切片返回 `None`。

安全版本：

```rust
fn first(items: &[i32]) -> Option<i32> {
    items.first().copied()
}
```

unsafe 练习版：

```rust
fn first_with_ptr(items: &[i32]) -> Option<i32> {
    if items.is_empty() {
        None
    } else {
        Some(unsafe { *items.as_ptr() })
    }
}
```

然后写测试证明空切片和非空切片都正确。真实项目里优先使用安全版本；这个练习只是帮助你理解 unsafe 封装方式。

::: warning 高级主题
unsafe 学习应该慢一点。先会写安全 Rust，再读 Rustonomicon。不要把 unsafe 当作解决所有权报错的捷径。
:::

::: tip 过关标准
你能说出 unsafe 块依赖的不变量，并能把 unsafe 封装在小函数里，对外暴露安全 API。
:::
