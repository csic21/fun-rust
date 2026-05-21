# 智能指针和内部可变性：当普通引用不够用

入门阶段你主要用 `String`、`Vec<T>` 和引用。到中高级，你会遇到更复杂的所有权形状：递归数据、多个所有者、运行时借用检查、跨线程共享状态。这时就需要智能指针。

智能指针不是“高级魔法”，本质上是带额外规则和能力的类型。

## 本课目标

- 理解 `Box<T>`、`Rc<T>`、`Arc<T>`、`RefCell<T>`、`Mutex<T>` 的适用场景。
- 知道 `Deref` 和 `Drop` 为什么让智能指针像普通引用一样好用。
- 理解内部可变性：外面看起来不可变，里面可以通过运行时规则修改。
- 避免 `Rc<RefCell<T>>` 和 `Arc<Mutex<T>>` 滥用。

![智能指针选择图](/images/smart-pointers-choice.png)

## `Box<T>`：把值放到堆上

`Box<T>` 拥有一个堆上的值：

```rust
let value = Box::new(42);
println!("{value}");
```

常见用途：

- 递归类型。
- 大对象避免在栈上移动。
- trait object：`Box<dyn Trait>`。

递归类型必须用指针打断无限大小：

```rust
enum List {
    Cons(i32, Box<List>),
    Nil,
}
```

如果没有 `Box`，`List` 会包含 `List`，大小无法确定。

## `Rc<T>`：单线程多个所有者

有时一个值需要被多个地方共同拥有：

```rust
use std::rc::Rc;

let title = Rc::new(String::from("Rust"));
let a = Rc::clone(&title);
let b = Rc::clone(&title);

println!("引用计数：{}", Rc::strong_count(&title));
```

`Rc` 是 reference counted。每次 `clone` 只是增加计数，不复制里面的字符串。最后一个所有者离开作用域时，值被清理。

限制：`Rc<T>` 不能跨线程共享。跨线程用 `Arc<T>`。

## `Arc<T>`：跨线程多个所有者

`Arc` 是 atomic reference counted，适合线程间共享：

```rust
use std::sync::Arc;
use std::thread;

let title = Arc::new(String::from("并发 Rust"));
let mut handles = Vec::new();

for _ in 0..3 {
    let title = Arc::clone(&title);
    handles.push(thread::spawn(move || {
        println!("{title}");
    }));
}

for handle in handles {
    handle.join().expect("线程正常结束");
}
```

`Arc<T>` 只解决多个所有者，不自动允许修改。要修改共享值，需要同步原语，比如 `Mutex<T>`。

## `RefCell<T>`：运行时借用检查

普通引用的借用规则在编译期检查。`RefCell<T>` 把检查推迟到运行时：

```rust
use std::cell::RefCell;

let title = RefCell::new(String::from("Rust"));

title.borrow_mut().push_str(" 入门");
println!("{}", title.borrow());
```

如果违反“很多读或一个写”，程序会 panic：

```rust
let value = RefCell::new(1);
let _a = value.borrow_mut();
// let _b = value.borrow_mut(); // 运行时 panic
```

`RefCell` 适合单线程场景下的内部可变性，比如测试替身、树结构中需要从共享引用修改局部状态。不要把它当作绕过编译器的万能钥匙。

## `Rc<RefCell<T>>`：共享拥有 + 可变

有时图结构或 UI 状态需要多个所有者，同时需要修改：

```rust
use std::cell::RefCell;
use std::rc::Rc;

type SharedLesson = Rc<RefCell<Lesson>>;

#[derive(Debug)]
struct Lesson {
    title: String,
    done: bool,
}

let lesson: SharedLesson = Rc::new(RefCell::new(Lesson {
    title: String::from("智能指针"),
    done: false,
}));

let a = Rc::clone(&lesson);
let b = Rc::clone(&lesson);

a.borrow_mut().done = true;
println!("{:?}", b.borrow());
```

这很方便，也很容易让所有权关系变复杂。使用前问自己：

- 是否真的需要多个所有者？
- 是否可以改成树状所有权？
- 是否可以通过消息传递修改状态？
- 是否能把可变操作集中在一个管理器里？

## `Mutex<T>`：跨线程修改共享状态

```rust
use std::sync::{Arc, Mutex};
use std::thread;

let counter = Arc::new(Mutex::new(0));
let mut handles = Vec::new();

for _ in 0..10 {
    let counter = Arc::clone(&counter);
    handles.push(thread::spawn(move || {
        let mut value = counter.lock().expect("锁不应该中毒");
        *value += 1;
    }));
}

for handle in handles {
    handle.join().expect("线程正常结束");
}

println!("{}", *counter.lock().expect("锁不应该中毒"));
```

`Mutex` 让同一时刻只有一个线程能修改值。代价是可能等待锁，也可能因持锁太久影响性能。

## 什么时候先不用智能指针

智能指针解决的是所有权形状，不是代码组织混乱。遇到编译器报借用错误时，先不要立刻套 `Rc<RefCell<T>>` 或 `Arc<Mutex<T>>`：

- 如果数据天然只有一个主人，先保持普通拥有类型。
- 如果函数只是读取，优先传 `&T`、`&str`、`&[T]`。
- 如果需要修改，优先把修改集中在一个拥有者方法里。
- 如果跨线程只是广播只读配置，用 `Arc<T>` 就够了，不要顺手加 `Mutex`。
- 如果你说不清谁会改、何时改，先画数据流，别急着把检查推迟到运行时。

## `Deref` 和 `Drop`

智能指针之所以用起来像引用，是因为实现了 `Deref`：

```rust
let value = Box::new(String::from("Rust"));
println!("{}", value.len());
```

`Box<String>` 能调用 `String` 的 `len`，这是解引用强制转换在帮忙。

`Drop` 决定值离开作用域时做什么：

```rust
struct Guard;

impl Drop for Guard {
    fn drop(&mut self) {
        println!("离开作用域，清理资源");
    }
}
```

文件、锁、网络连接、临时资源都依赖 `Drop` 做自动清理。这也是 Rust RAII 风格的核心。

## 选择表

| 需求 | 常见选择 |
| --- | --- |
| 堆分配、递归类型、trait object | `Box<T>` |
| 单线程多个所有者 | `Rc<T>` |
| 多线程多个所有者 | `Arc<T>` |
| 单线程运行时可变借用 | `RefCell<T>` |
| 多线程互斥修改 | `Mutex<T>` |
| 多线程读多写少 | `RwLock<T>` |
| 简单共享不可变数据 | `Arc<T>` |

## 练习：给选择写理由

给下面场景选类型，并写一句理由：

| 场景 | 你的选择 |
| --- | --- |
| 递归链表节点 | `Box<T>` |
| 单线程 UI 树里多个控件共享同一份状态 | `Rc<RefCell<T>>`，但先确认没有更简单的数据流 |
| 多线程共享只读配置 | `Arc<T>` |
| 多线程计数器 | `Arc<Mutex<T>>` 或原子类型 |

::: tip 过关标准
你能解释为什么 `Rc<T>` 不等于可变共享，为什么 `Arc<T>` 常常要和 `Mutex<T>` 搭配，以及 `RefCell<T>` 的风险从编译期变成了运行时。
:::
