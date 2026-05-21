# 并发：线程、通道和共享状态

Rust 的并发优势不是“语法更短”，而是把很多数据竞争问题提前变成编译错误。你仍然需要设计并发模型，但 `Send`、`Sync`、所有权和借用规则会帮你守住底线。

## 本课目标

- 会启动线程并等待线程结束。
- 理解 `move` 在线程里的作用。
- 会用通道传消息。
- 会用 `Arc<Mutex<T>>` 共享可变状态。
- 初步理解 `Send` 和 `Sync`。

![并发消息传递和共享状态图](/images/concurrency-message-state.png)

## 启动线程

```rust
use std::thread;

let handle = thread::spawn(|| {
    println!("来自新线程");
});

println!("来自主线程");
handle.join().expect("线程应该正常结束");
```

`join` 会等待线程完成。如果线程 panic，`join` 会返回错误。

## 为什么线程常用 `move`

这段通常不行：

```rust
let title = String::from("并发");

std::thread::spawn(|| {
    println!("{title}");
});
```

线程可能比当前函数活得更久。闭包借用 `title` 不安全，所以要把所有权移进去：

```rust
let title = String::from("并发");

let handle = std::thread::spawn(move || {
    println!("{title}");
});

handle.join().expect("线程正常结束");
```

这和所有权章节是同一个模型：谁拿到值，谁负责值。

## 通道：用消息传递共享数据

Rust 标准库提供多生产者、单消费者通道：

```rust
use std::sync::mpsc;
use std::thread;

let (tx, rx) = mpsc::channel();

thread::spawn(move || {
    tx.send(String::from("学完所有权")).expect("接收方还在");
});

let message = rx.recv().expect("发送方应该发送消息");
println!("{message}");
```

`send` 会移动值。发送后，发送线程不再拥有那条消息。

多个生产者可以 clone 发送端：

```rust
let (tx, rx) = std::sync::mpsc::channel();

for id in 0..3 {
    let tx = tx.clone();
    std::thread::spawn(move || {
        tx.send(format!("任务 {id} 完成")).expect("接收方还在");
    });
}

drop(tx);

for message in rx {
    println!("{message}");
}
```

`drop(tx)` 很重要：主线程里的原始发送端不丢掉，`for message in rx` 可能一直等。

## 共享状态：`Arc<Mutex<T>>`

有些场景更适合共享状态：

```rust
use std::sync::{Arc, Mutex};
use std::thread;

let counter = Arc::new(Mutex::new(0));
let mut handles = Vec::new();

for _ in 0..5 {
    let counter = Arc::clone(&counter);
    handles.push(thread::spawn(move || {
        let mut value = counter.lock().expect("锁不应该中毒");
        *value += 1;
    }));
}

for handle in handles {
    handle.join().expect("线程正常结束");
}

println!("计数：{}", *counter.lock().expect("锁不应该中毒"));
```

拆开看：

- `Arc`：多个线程共同拥有计数器。
- `Mutex`：同一时刻只允许一个线程修改计数器。
- `lock()`：拿锁，得到可以修改内部值的 guard。
- guard 离开作用域时自动释放锁。

## 少持锁

不要在持锁期间做慢操作：

```rust
let value = {
    let mut data = shared.lock().expect("锁不应该中毒");
    data.push(1);
    data.len()
}; // 锁在这里释放

println!("长度：{value}");
```

把锁的作用域缩短，可以减少其他线程等待。

## `Send` 和 `Sync`

你经常会在错误里看到：

```text
`T` cannot be sent between threads safely
```

粗略理解：

- `Send`：值可以被移动到另一个线程。
- `Sync`：多个线程可以安全地共享 `&T`。

大多数普通类型自动实现这些 trait。`Rc<T>` 不是 `Send` 也不是 `Sync`，所以不能跨线程；跨线程用 `Arc<T>`。

## 什么时候用线程，什么时候用 async

线程适合：

- CPU 密集任务。
- 阻塞式库。
- 简单并行任务。
- 需要操作系统线程隔离的场景。

async 适合：

- 大量 IO 等待。
- 网络服务器。
- 同时处理很多连接或任务。
- 希望用少量线程调度大量等待中的工作。

## 什么时候不用并发

并发会让数据流和失败路径都更难看清。下面这些情况先保持单线程：

- 数据量很小，顺序执行已经足够快。
- 任务之间强依赖，拆成线程后大部分时间都在等待。
- 共享状态很多，但还没有明确谁负责修改。
- 还没有测试覆盖，无法判断并发改动是否保持行为。
- 只是想“看起来高级”，而不是有真实的吞吐量或响应性问题。

先写清楚同步版本，再用测量结果决定是否并发。Rust 能帮你防数据竞争，但不能替你设计任务边界。

::: tip 过关标准
你能用 `thread::spawn` + `move` 启动线程，用通道发送拥有值，用 `Arc<Mutex<T>>` 做共享计数器，并说出每一层解决什么问题。
:::
