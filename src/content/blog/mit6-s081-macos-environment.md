---
title: "使用MacOS配置MIT6.S081的环境"
description: "文章浏览阅读277次，点赞8次，收藏3次。摘要：在MacOS上运行XV6实验时，2020版本存在较多问题，包括环境配置复杂、路径查找困难以及运行时报错，最终无法进入内核。切换到2022版本后问题有所改善，但仍需修改user/usertests.c中的代码才能成功运行。建议直接使用2022版本进行实验，并注意环境配置和代码调试。"
date: 2025-11-02
tags: ["系统","Mit6.S081 2022版本","一些稀奇古怪的问题的解决方案记录","macos","操作系统","xv6","环境搭建"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":1}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/154289549"}
---
2020版本的是有一定问题的在MacOS我是跑不了的，后来换到了2022版本，问题小了很多


### 2020版本


首先是安装基本的环境，使用HomeBrew


```bash
brew tap riscv-software-src/riscvbrew install riscv-toolsPATH=$PATH:/opt/homebrew/Celler/riscv-gnu-toolchain/main/binbrew install qemu
```


这里面需要进行注意，就是这个PATH需要自己去找对应的文件夹的路径，可能找不到opt文件，那就去搜MacOS怎么显示隐藏文件，这些都是在2025年11月可用的


```bash
# 克隆实验室代码git clone git://g.csail.mit.edu/xv6-labs-2020cd xv6-labs-2020 # 切换到本实验分支git checkout util # 构建并启动 xv6（使用 QEMU）# git clone https://github.com/mit-pdos/xv6-riscv.git这个才能运行make qemu
```


这里的实验室版本是有问题的，首先是会出现下面的报错![图片](/Blog/images/csdn/154289549/01.png)


出现这样的报错需要进行修改→找到runcmd函数在上面加一行代码


```bash
__attribute__((noreturn))
```


![图片](/Blog/images/csdn/154289549/02.png)


然后我个人的mac会卡在这一步也就是最后make qemu的步骤，无法进入内核


![图片](/Blog/images/csdn/154289549/03.png)


我不太清楚是不是我个人配置的原因，但是正确的运行应该会进入对应的shell，如下图会有显示
 xv6 **
 内核已经启动的标记


![图片](/Blog/images/csdn/154289549/04.png)


于是我看到了一篇文章让我去2022版本试试


### 2022版本


```bash
git clone git://g.csail.mit.edu/xv6-labs-2022cd xv6-labs-2022make qemu
```


但是也是会出现问题的，如下图：


![图片](/Blog/images/csdn/154289549/05.png)


于是我们去修改代码：到user/usertests.c中去修改即可


![图片](/Blog/images/csdn/154289549/06.png)


然后再执行make qemu就可以跑通了
---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/154289549)。

<!-- imported-from-csdn:154289549 -->
