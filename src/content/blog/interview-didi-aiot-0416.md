---
title: "4.16滴滴 AIOT 一面｜面经"
description: "滴滴 AIOT 一面复盘：页表与中断、Reactor/epoll、零拷贝、RPC 协议、AQS/CAS、MVCC、RAG，以及国王最短路径。"
date: 2026-05-19
tags: ["面试","滴滴","AIOT","Java","算法"]
draft: false
featured: false
sample: false
art: code
series: {"name":"面试记录和复盘","slug":"interview-reviews","order":5}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/161232552"}
---

## 技术问题

操作系统先问页表映射和用户态 / 内核态切换。网络部分是 Reactor、Netty、epoll 和零拷贝。

自研 RPC 继续追问为什么基于 TCP、自定义协议相比 HTTP/2 或 gRPC 到底解决了什么。JUC 部分包括 AQS、CAS 和 ABA 问题。

性能测试问 JMH 如何降低 JIT 对 benchmark 的影响；MySQL 问 MVCC、Read View、RC 和 RR 的区别。

AI 部分围绕 RAG、embedding、向量数据库和 AI 工具使用。简历里的接口 RT 优化也被追问，面试官指出流式输出主要改善首包时间，并不等于整体推理只需要 200ms。

## 算法

题目是 Codeforces 3A 国王最短路径。核心结论是：

~~~text
最短步数 = max(|dx|, |dy|)
~~~

思路对，但 25 分钟内没有顺利实现完。

## 复盘

面试官反馈基础和 AI 实践都还可以，主要问题是算法手速。对我来说，这场最明确的教训就是：会想和能在限定时间内稳定写出来，是两种能力。

---

> 本文由我的 CSDN 博客迁移整理而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/161232552)。

<!-- imported-from-csdn:161232552 -->
