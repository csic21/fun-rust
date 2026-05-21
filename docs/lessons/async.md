# 异步 Rust：很多任务等 IO 时，让线程别闲着

异步 Rust 的目标不是让每一段代码更快，而是在大量任务等待 IO 时，让少量线程服务更多任务。它常用于网络服务、爬虫、消息队列客户端、数据库访问和高并发 IO。

## 本课目标

- 理解 `async fn` 返回的是 `Future`。
- 知道 `.await` 会等待 future，并允许 runtime 调度其他任务。
- 理解 runtime、task、blocking 的边界。
- 会读懂 Tokio 风格的入门程序。
- 知道 async trait、pinning、取消等高级主题存在但不用一开始深挖。

![异步 Runtime 调度流程图](/images/async-runtime-flow.png)

## 最小 async 程序

常见 Tokio 程序：

```rust
#[tokio::main]
async fn main() {
    say_hello().await;
}

async fn say_hello() {
    println!("hello async");
}
```

`async fn say_hello()` 调用后不会立刻执行完并返回普通值，而是创建一个 future。`.await` 会驱动它直到完成。

## runtime 是什么

Rust 标准库提供 `Future` trait 和 `async/.await` 语法，但不提供完整执行器。你需要 runtime，比如 Tokio。

runtime 负责：

- 调度 async task。
- 管理 IO 事件。
- 提供定时器、网络、异步文件等工具。
- 在 future 可以继续前唤醒任务。

所以你会在 `Cargo.toml` 里看到：

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
```

学习时可以用 `"full"` 简化配置。项目成熟后再按需缩小 feature。

## `.await` 不是开线程

```rust
async fn load_user() -> String {
    String::from("Lina")
}

async fn page() {
    let user = load_user().await;
    println!("{user}");
}
```

`.await` 的含义是：如果这个 future 还没准备好，就把执行权还给 runtime，让别的任务先跑。它不是自动新建线程。

## 并发等待

顺序等待：

```rust
let user = load_user().await;
let lessons = load_lessons().await;
```

如果两个任务互不依赖，可以并发：

```rust
let (user, lessons) = tokio::join!(load_user(), load_lessons());
```

`join!` 会在同一个任务里轮流推进多个 future。要真正生成独立任务，可以 `spawn`：

```rust
let handle = tokio::spawn(async {
    load_user().await
});

let user = handle.await.expect("任务不应 panic");
```

被 `tokio::spawn` 的 future 通常需要 `'static`，因为任务可能比当前函数活得更久。很多生命周期错误都来自这里。

## 不要在 async 里随便阻塞

这不好：

```rust
async fn bad() {
    std::thread::sleep(std::time::Duration::from_secs(1));
}
```

`thread::sleep` 会阻塞整个线程，runtime 上的其他任务也可能被拖住。应该使用异步版本：

```rust
async fn good() {
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
}
```

如果必须调用阻塞代码，用 runtime 提供的阻塞池：

```rust
let value = tokio::task::spawn_blocking(|| {
    expensive_blocking_work()
})
.await
.expect("阻塞任务不应 panic");
```

## 什么时候不用 async

async 适合等待 IO，不是所有项目的默认答案。下面这些情况先别引入 runtime：

- 只是写一个小脚本或一次性 CLI。
- 主要瓶颈是 CPU 计算，而不是网络、文件或数据库等待。
- 依赖库只有阻塞 API，引入 async 后反而到处 `spawn_blocking`。
- 团队还不熟悉取消、生命周期和任务边界。
- 同步版本已经足够清楚、足够快、足够容易测试。

先写同步版本并保留清楚的模块边界。等你真的需要同时等待很多 IO，再把边界内的实现换成 async。

## 取消：future 可以被丢弃

在 Rust async 里，取消通常意味着 future 被 drop。也就是说，函数可能执行到某个 `.await` 之后就不再继续。设计 async 代码时要注意：

- 不要假设 `.await` 后面的清理一定会执行。
- 关键资源清理应依赖 `Drop` 或明确的事务边界。
- 持锁跨 `.await` 要非常小心，可能造成死锁或长时间占用。

## async trait 的现实边界

Rust 已经支持在 trait 中写 `async fn` 的基础形式，但涉及动态分发、对象安全和公共 API 时仍需要谨慎。库作者常会选择：

- 返回 `impl Future`。
- 使用关联类型。
- 使用 crate 提供的辅助宏。
- 把 async 放在具体类型方法上，而不是一开始塞进 trait。

学习阶段先会写和调用 async 函数，再研究 trait 里的 async。

## 练习：并发加载两个资源

```rust
async fn load_profile() -> &'static str {
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    "profile"
}

async fn load_lessons() -> &'static str {
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    "lessons"
}

#[tokio::main]
async fn main() {
    let (profile, lessons) = tokio::join!(load_profile(), load_lessons());
    println!("{profile} + {lessons}");
}
```

把它改成顺序 `.await`，观察总耗时差异。

::: tip 过关标准
你能解释 `async fn`、`Future`、`.await`、runtime、task 和 blocking 的关系，并知道 async 适合 IO 等待而不是自动加速 CPU 计算。
:::
