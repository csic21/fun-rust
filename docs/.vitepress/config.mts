import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Rust 轻松入门",
  description: "用寓教于乐的图解、故事和小练习循序渐进学习 Rust。",
  lang: "zh-CN",
  base: process.env.VITEPRESS_BASE ?? "/",
  outDir: "../dist",
  srcExclude: ["superpowers/**"],
  cleanUrls: true,
  lastUpdated: false,
  markdown: {
    lineNumbers: true,
  },
  themeConfig: {
    logo: "/images/fun-first-rust-logo.svg",
    search: {
      provider: "local",
    },
    nav: [
      { text: "学习路径", link: "/" },
      { text: "入门", link: "/lessons/start" },
      { text: "进阶", link: "/lessons/modules-crates" },
      { text: "高级", link: "/lessons/smart-pointers" },
      { text: "实战", link: "/lessons/cli-practice" },
      { text: "资料来源", link: "/sources" },
      { text: "许可", link: "/license" },
    ],
    sidebar: [
      {
        text: "第一阶段：入门基础",
        items: [
          { text: "先跑起来", link: "/lessons/start" },
          { text: "变量和类型", link: "/lessons/variables-types" },
          { text: "函数、分支和循环", link: "/lessons/functions-flow" },
          { text: "结构体和枚举", link: "/lessons/structs-enums" },
        ],
      },
      {
        text: "第二阶段：核心机制",
        items: [
          { text: "所有权", link: "/lessons/ownership" },
          { text: "借用", link: "/lessons/borrowing" },
          { text: "错误处理", link: "/lessons/errors" },
          { text: "集合、迭代器和小项目", link: "/lessons/collections-project" },
        ],
      },
      {
        text: "第三阶段：中级进阶",
        items: [
          { text: "模块、crate 和包", link: "/lessons/modules-crates" },
          { text: "泛型、trait 和生命周期", link: "/lessons/generics-traits-lifetimes" },
          { text: "闭包和迭代器深入", link: "/lessons/iterators-closures" },
          { text: "测试、文档和工作区", link: "/lessons/testing-docs" },
        ],
      },
      {
        text: "第四阶段：高级主题",
        items: [
          { text: "智能指针和内部可变性", link: "/lessons/smart-pointers" },
          { text: "并发：线程、通道和共享状态", link: "/lessons/concurrency" },
          { text: "异步 Rust", link: "/lessons/async" },
          { text: "unsafe、FFI 和底层边界", link: "/lessons/unsafe-ffi" },
          { text: "性能、发布和工程化", link: "/lessons/performance" },
        ],
      },
      {
        text: "第五阶段：实践教程",
        items: [
          { text: "命令行项目实战", link: "/lessons/cli-practice" },
          { text: "综合项目路线", link: "/lessons/advanced-projects" },
          { text: "资料来源", link: "/sources" },
          { text: "许可说明", link: "/license" },
        ],
      },
    ],
    outline: {
      level: [2, 3],
      label: "本页目录",
    },
    docFooter: {
      prev: "上一课",
      next: "下一课",
    },
    footer: {
      message: "内容按 Rust Book、Rust By Example、标准库、Cargo Book、Rust Reference、Async Book 和 Rustonomicon 整理。",
    },
  },
});
