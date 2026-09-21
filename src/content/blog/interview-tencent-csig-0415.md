---
title: "4.15腾讯 CSIG云服务产线 一面"
description: "腾讯 CSIG 一面复盘：Go、Spring AOP、JVM、JUC、线程池、Redis、MySQL、AI Coding，以及合并有序数组。"
date: 2026-05-18
tags: ["面试","腾讯","CSIG","Java","后端"]
draft: false
featured: false
sample: false
art: code
series: {"name":"面试记录和复盘","slug":"interview-reviews","order":4}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/161196737"}
---

## 主要问题

开场从 Go 基础开始，继续问到学习方式和实际 demo。Spring AOP 部分追得很细，包括通知类型、同类方法自调用时增强是否生效、如何获取代理对象，以及 JDK 动态代理和 CGLIB 的区别。

JVM 问了源码到类加载的过程。JUC 和线程池则覆盖 ReentrantLock、synchronized、核心线程数、最大线程数、队列和拒绝策略。

Redis 问常见数据结构、常用命令、前缀 key 查询和 SETNX。MySQL 重点是隔离级别、MVCC、RC 和 RR 的差异，以及间隙锁。

最后还聊了 AI Coding 和 Skill。

## 算法

题目是合并两个有序数组，并要求额外空间复杂度 O(1)。我一开始补了自己的前提，后面发现和面试官的题意不完全一致。

## 复盘

这场最大的反馈是：知识面不算窄，但很多内容需要引导才能讲出来，缺少主动、成体系的输出。

另外，题意不清时应该主动确认，不要自己默默补条件。个人体验上压力比较大，整体更偏八股追问，后续一面未通过。

---

> 本文由我的 CSDN 博客迁移整理而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/161196737)。

<!-- imported-from-csdn:161196737 -->
