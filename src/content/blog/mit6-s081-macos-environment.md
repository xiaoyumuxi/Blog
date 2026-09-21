---
title: "使用MacOS配置MIT6.S081的环境"
description: "记录在 macOS 上配置 xv6 / MIT 6.S081 实验环境时遇到的问题：2020 版本在本机无法正常进入内核，切换到 2022 版本后通过修改 user/usertests.c 跑通。"
date: 2025-11-02
tags: ["系统","macos","操作系统","xv6","环境搭建"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":1}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/154289549"}
---

2020版本的是有一定问题的，在 MacOS 我是跑不了的，后来换到了 2022 版本，问题小了很多。

## 2020版本

首先是安装基本的环境，使用 HomeBrew：

~~~bash
brew tap riscv-software-src/riscv
brew install riscv-tools
PATH=$PATH:/opt/homebrew/Celler/riscv-gnu-toolchain/main/bin
brew install qemu
~~~

这里面需要注意，这个 PATH 需要自己去找对应文件夹的路径。可能找不到 opt 文件，那就去搜 MacOS 怎么显示隐藏文件。这些都是在 2025 年 11 月可用的。

~~~bash
# 克隆实验室代码
git clone git://g.csail.mit.edu/xv6-labs-2020
cd xv6-labs-2020

# 切换到本实验分支
git checkout util

# 构建并启动 xv6（使用 QEMU）
# git clone https://github.com/mit-pdos/xv6-riscv.git 这个才能运行
make qemu
~~~

这里的实验室版本是有问题的。首先会出现编译报错，需要找到 runcmd 函数，在上面加一行：

~~~c
__attribute__((noreturn))
~~~

然后我个人的 Mac 会卡在最后 make qemu 的步骤，无法进入内核。

我不太清楚是不是我个人配置的原因，但是正确运行应该会进入对应 shell，并显示 xv6 内核已经启动的标记。

于是我看到一篇文章，建议去 2022 版本试试。

## 2022版本

~~~bash
git clone git://g.csail.mit.edu/xv6-labs-2022
cd xv6-labs-2022
make qemu
~~~

但是也会出现问题。于是我们去修改代码：到 user/usertests.c 中修改即可。

修改后再执行 make qemu 就可以跑通了。

---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/154289549)。

<!-- imported-from-csdn:154289549 -->
