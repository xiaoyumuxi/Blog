---
title: "3.20字节云部门一面｜面经"
description: "字节云一面复盘：Netty、多路复用、零拷贝、TCP、Redis Stream、AI 接口异步化，以及区间和链表算法题。"
date: 2026-05-19
tags: ["面试","字节跳动","云计算","Netty","TCP"]
draft: false
featured: false
sample: false
art: code
series: {"name":"面试记录和复盘","slug":"interview-reviews","order":3}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/161232443"}
---

## 项目与基础

这场先从数据清洗实习聊起，然后重点进入 RPC 和 Netty：Netty 是什么、核心模块、Selector 和 epoll 的关系，以及 select / poll / epoll、LT / ET 的区别。

零拷贝被问得很深入。除了传统 IO 和零拷贝的区别，还继续追问为什么操作系统不是一开始就这样设计，以及长期停留在内核态是否会引入额外风险。

TCP 部分包括三次握手、四次挥手、最后 ACK 丢失、大量 TIME_WAIT 的原因。

智能面试系统继续问到 Redis Stream、重复消费、幂等、AI 接口异步化，以及 SSE / WebSocket 的选择。

## 算法

第一题是首尾相接区间的最长合并链，后来换成链表反转，并追问递归和迭代方案。

## 复盘

面试官的建议是补足网络、操作系统和数据结构的广度，同时多追问设计背后的“为什么”。这也是我后来很认同的一种学习方式：不能只记标准答案，要把设计动机和边界一起弄清楚。

整体交流体验很好，可惜算法发挥不理想。

---

> 本文由我的 CSDN 博客迁移整理而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/161232443)。

<!-- imported-from-csdn:161232443 -->
