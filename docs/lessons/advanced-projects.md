# 综合项目路线：从练习走向真正作品

学完语法后，最常见的卡点是“不知道做什么项目”。项目不需要一开始很大，但要能逼你同时使用多个知识点。下面给三条路线：CLI 工具、Web API、并发任务系统。每条都可以从初级版本开始，逐步升级到高级版本。

![综合项目升级路线图](/images/advanced-projects-roadmap.png)

## 路线一：学习清单 CLI

适合阶段：入门到中级。

### 版本 1：纯标准库

能力目标：

- `struct` 和 `enum` 建模。
- 文件读取。
- `Result` 错误传播。
- `Vec`、切片、迭代器。
- 单元测试。

功能：

- 从文本文件读取课程。
- 统计完成数量和总时长。
- 找到下一节未完成课程。

### 版本 2：真实参数解析

新增能力：

- 使用外部 crate。
- Cargo feature 和依赖管理。
- 更友好的错误消息。

功能：

- `lesson-cli list`
- `lesson-cli done "所有权"`
- `lesson-cli stats`

### 版本 3：配置和持久化

新增能力：

- `serde` 序列化。
- JSON 或 TOML 文件。
- 集成测试。
- 文档测试。

功能：

- 支持配置默认文件路径。
- 支持导入导出。
- 支持按难度和标签筛选。

## 路线二：课程 Web API

适合阶段：中级到高级。

### 版本 1：内存 API

能力目标：

- 模块拆分。
- trait 抽象 repository。
- 错误类型设计。
- 集成测试。

核心类型：

```rust
#[derive(Debug, Clone)]
pub struct Lesson {
    pub id: u64,
    pub title: String,
    pub minutes: u32,
}

pub trait LessonStore {
    fn list(&self) -> Vec<Lesson>;
    fn get(&self, id: u64) -> Option<Lesson>;
    fn insert(&mut self, lesson: Lesson);
}
```

### 版本 2：异步服务

新增能力：

- async runtime。
- handler 中的共享状态。
- `Arc`、锁或异步锁。
- JSON 序列化。

需要特别注意：

- 不要在 async handler 里调用阻塞 IO。
- 不要长时间持锁跨 `.await`。
- 错误响应要结构化。

### 版本 3：数据库和迁移

新增能力：

- async 数据库客户端。
- 连接池。
- 配置管理。
- 测试数据库或容器化测试。

重点不是框架名字，而是边界：

- API 层处理 HTTP。
- service 层处理业务规则。
- repository 层处理存储。
- domain 类型表达核心概念。

## 路线三：并发任务系统

适合阶段：高级。

### 版本 1：线程池练习

能力目标：

- `thread::spawn`。
- 通道。
- `Arc<Mutex<T>>`。
- graceful shutdown。

功能：

- 主线程发送任务。
- worker 接收任务并执行。
- 收集成功和失败数量。

### 版本 2：异步任务队列

新增能力：

- `tokio::spawn`。
- async channel。
- 超时。
- 取消。
- backpressure。

需要思考：

- 队列满了怎么办？
- 任务失败是否重试？
- shutdown 时是否等待任务完成？
- 指标如何收集？

### 版本 3：插件式执行器

新增能力：

- trait object。
- 泛型和动态分发选择。
- 错误边界。
- 配置驱动。

示例接口：

```rust
pub trait Job: Send + Sync {
    fn name(&self) -> &str;
    fn run(&self) -> Result<(), JobError>;
}
```

如果改成 async trait，就要重新考虑对象安全、生命周期和 runtime 绑定。

## 每个项目都要保留的工程习惯

- 核心逻辑优先放库里，入口只做 IO 和参数。
- 所有 public 类型都写基本文档。
- 错误路径要测试。
- 先写同步版本，再在确实需要时引入 async。
- 先用安全 Rust，unsafe 只出现在经过审查的小边界。
- 每次引入依赖都问：它解决了什么问题，代价是什么？

## 学习者分层建议

初学者：

- 做 CLI 版本 1。
- 少用外部 crate。
- 把所有权、借用、错误处理练顺。

中级学习者：

- 做 CLI 版本 2 和 Web API 版本 1。
- 练模块、trait、测试、文档、依赖管理。
- 开始关注 API 设计。

高级学习者：

- 做 Web API 版本 2/3 或并发任务系统。
- 练 async、共享状态、取消、性能、发布流程。
- 读标准库源码和 Rustonomicon 的相关章节。

::: tip 过关标准
你能为一个项目画出模块边界，说明每个边界用所有权、trait、错误类型和测试保护什么。
:::
