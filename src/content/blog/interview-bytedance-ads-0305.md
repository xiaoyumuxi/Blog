---
title: "3.5字节广告部门一面面经"
description: "字节广告部门一面复盘：实习项目、智能面试系统、RPC 框架，以及 SQL 和 Java 多线程编码题。"
date: 2026-05-18
tags: ["面试","字节跳动","Java","后端","实习"]
draft: false
featured: false
sample: false
art: code
series: {"name":"面试记录和复盘","slug":"interview-reviews","order":1}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/161196445"}
---

## 这场主要问了什么

开场先从上一段实习展开，重点追问酒店数据整合项目：不同平台的房型命名如何匹配、双向字典和正则预编译怎么做、优化前后耗时差多少。

智能面试系统部分主要聊了死信队列、Redis Stream 选型、RAG 流程，以及为什么不用 RabbitMQ 或 Kafka。RPC 项目则继续问到和 gRPC、Thrift 的差异，以及项目到底是独立实现还是基于开源项目修改。

## 手写题

- SQL：查询每个学生的平均成绩。
- Java：两个线程交替打印。
- 继续追问 wait/notify 之外的实现，以及 Lock + Condition 的思路。

## 复盘

这一场最大的暴露点是基础和手写熟练度。项目虽然准备过，但 SQL、并发和编码如果不够熟，面试里还是会很明显。

当时我刚开始恢复刷题，很多基本代码写得不够顺。后来最大的结论就是：不要拿目标公司练手，面试前必须把基础代码重新写熟。

后续结果：一面未通过。

---

> 本文由我的 CSDN 博客迁移整理而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/161196445)。

<!-- imported-from-csdn:161196445 -->
