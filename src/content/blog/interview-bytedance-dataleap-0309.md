---
title: "3.9字节 DataLeap 部门日常实习一面"
description: "字节 DataLeap 一面复盘：Java 并发、Netty RPC、线程池、volatile、Spring，以及代码相似度判断题。"
date: 2026-05-19
tags: ["面试","字节跳动","DataLeap","Java","RPC"]
draft: false
featured: false
sample: false
art: code
series: {"name":"面试记录和复盘","slug":"interview-reviews","order":2}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/161232647"}
---

## 开场与岗位匹配

先聊了上一段实习、换实习原因、到岗时间，以及是否能稳定实习半年以上。DataLeap 本身偏大数据开发平台，岗位是后端为主、需要一定大数据基础。

## 技术问题

Java 并发问了线程创建方式、sleep 和 wait。RPC 项目是主线，继续深挖动态代理、多语言客户端、NIO 多路复用、零拷贝、SPI，以及为什么不用 JDK ServiceLoader。

线程池问了核心线程数、最大线程数、存活时间、阻塞队列和拒绝策略；另外还问了 volatile、Spring Bean、IOC、作用域和生命周期。

## 算法题

题目是判断两行代码是否相似：变量名和数字可以不同，但关键字和运算符结构必须一致。需要覆盖等号、复合赋值等情况。

## 复盘

面试官认可 RPC 项目的独立完成度，但指出了三个问题：技术总结不够系统、表达容易零散、调试效率偏低。

这场之后我更明确了一点：项目做完后必须及时沉淀设计、取舍和踩坑，不然几个月后面试时很容易只记得结论。

---

> 本文由我的 CSDN 博客迁移整理而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/161232647)。

<!-- imported-from-csdn:161232647 -->
