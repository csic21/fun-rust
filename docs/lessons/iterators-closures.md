# 闭包和迭代器深入：把循环写成数据管道

Rust 的 `for` 循环足够好用，但中级代码里你会经常看到 `iter().filter(...).map(...).collect()`。这不是炫技，而是一种把“怎么遍历”交给迭代器、把“每一步做什么”写成小函数的方式。

## 本课目标

- 理解闭包语法和捕获方式。
- 区分 `iter`、`iter_mut`、`into_iter`。
- 会使用 `map`、`filter`、`find`、`fold`、`collect`。
- 知道迭代器是惰性的，以及为什么通常不比手写循环慢。

![闭包捕获和迭代器惰性执行图](/images/iterators-closures-capture.png)

## 闭包：现场写的小函数

```rust
let add_one = |n: u32| n + 1;
println!("{}", add_one(41));
```

闭包可以捕获周围变量：

```rust
let bonus = 10;
let add_bonus = |score: u32| score + bonus;

println!("{}", add_bonus(80));
```

捕获方式取决于你怎么使用外部变量：

- 只读取：共享借用。
- 修改：可变借用。
- 搬进闭包：所有权移动，常见于线程和异步任务。

```rust
let mut count = 0;
let mut inc = || {
    count += 1;
};

inc();
inc();
println!("{count}");
```

## `move` 闭包

`move` 会让闭包拿走捕获值的所有权：

```rust
let title = String::from("Rust");
let printer = move || {
    println!("{title}");
};

printer();
// println!("{title}"); // title 已经被闭包拥有
```

在线程里常见：

```rust
let title = String::from("并发");

std::thread::spawn(move || {
    println!("{title}");
}).join().expect("线程应该正常结束");
```

线程可能比当前作用域活得更久，所以必须把需要的数据移进去。

## 三种迭代入口

```rust
let mut lessons = vec![String::from("变量"), String::from("所有权")];
```

只读：

```rust
for lesson in lessons.iter() {
    println!("{lesson}");
}
```

修改：

```rust
for lesson in lessons.iter_mut() {
    lesson.push_str(" 入门");
}
```

消耗集合：

```rust
for lesson in lessons.into_iter() {
    println!("{lesson}");
}
```

`into_iter` 会拿走集合里的值。之后原集合不能再用。

## 常用适配器

```rust
#[derive(Debug)]
struct Lesson {
    title: String,
    minutes: u32,
    done: bool,
}

let lessons = vec![
    Lesson { title: String::from("变量"), minutes: 18, done: true },
    Lesson { title: String::from("所有权"), minutes: 35, done: false },
    Lesson { title: String::from("借用"), minutes: 30, done: false },
];
```

筛选：

```rust
let unfinished: Vec<&Lesson> = lessons
    .iter()
    .filter(|lesson| !lesson.done)
    .collect();
```

转换：

```rust
let titles: Vec<&str> = lessons
    .iter()
    .map(|lesson| lesson.title.as_str())
    .collect();
```

查找：

```rust
let found = lessons.iter().find(|lesson| lesson.minutes > 30);
```

折叠：

```rust
let total = lessons
    .iter()
    .fold(0, |sum, lesson| sum + lesson.minutes);
```

更简单时也可以直接用 `sum`：

```rust
let total: u32 = lessons.iter().map(|lesson| lesson.minutes).sum();
```

## 惰性：不消费就不执行

这段不会打印任何东西：

```rust
let items = [1, 2, 3];

items.iter().map(|n| {
    println!("看到 {n}");
    n + 1
});
```

因为 `map` 返回新的迭代器，只有遇到 `collect`、`sum`、`count`、`for` 这类消费操作才会执行：

```rust
let values: Vec<_> = items
    .iter()
    .map(|n| {
        println!("看到 {n}");
        n + 1
    })
    .collect();
```

## `filter` 的引用层级

新手常被 `|score| **score >= 80` 绊倒：

```rust
let scores = vec![72, 88, 91];

let passed: Vec<_> = scores
    .iter()
    .filter(|score| **score >= 80)
    .collect();
```

原因是 `iter()` 产生 `&i32`，而 `filter` 的闭包参数会再借用一次，所以闭包里拿到 `&&i32`。可以用模式匹配写得更舒服：

```rust
let passed: Vec<_> = scores
    .iter()
    .filter(|&&score| score >= 80)
    .collect();
```

或者先 `copied()`：

```rust
let passed: Vec<_> = scores
    .iter()
    .copied()
    .filter(|score| *score >= 80)
    .collect();
```

## 什么时候用循环，什么时候用迭代器

用循环：

- 步骤有复杂分支。
- 需要提前调试每一步。
- 新手还在建立所有权直觉。

用迭代器：

- 数据转换链条清楚。
- 只读处理集合。
- 需要组合 `filter`、`map`、`take`、`collect`。

Rust 迭代器通常会被优化成接近手写循环的机器码。先以可读性为准，不要为了“函数式”牺牲清楚。

## 练习：统计学习计划

给定课程列表：

```rust
#[derive(Debug)]
struct Lesson {
    title: String,
    minutes: u32,
    level: u8,
}
```

完成三个函数：

```rust
fn titles_for_level(lessons: &[Lesson], max_level: u8) -> Vec<&str> {
    lessons
        .iter()
        .filter(|lesson| lesson.level <= max_level)
        .map(|lesson| lesson.title.as_str())
        .collect()
}

fn total_minutes(lessons: &[Lesson]) -> u32 {
    lessons.iter().map(|lesson| lesson.minutes).sum()
}

fn first_long_lesson(lessons: &[Lesson]) -> Option<&Lesson> {
    lessons.iter().find(|lesson| lesson.minutes >= 30)
}
```

::: tip 过关标准
你能解释 `iter`、`iter_mut`、`into_iter` 对所有权的影响，并知道迭代器链要被消费才会运行。
:::
