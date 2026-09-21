---
title: "MIT6.s081——lab1 实现常见的用户程序"
description: "MIT 6.S081 Lab1：实现 sleep、pingpong、primes、find 和 xargs，练习 xv6 用户程序、系统调用、进程、管道与文件系统操作。"
date: 2026-01-05
tags: ["系统","linux","运维","服务器","xv6"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":2}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/156618273"}
---

## Sleep -> 实现休眠的用户程序

实现 xv6 的 UNIX 程序 sleep。sleep 应该暂停用户指定的刻度数。滴答声是一种时间概念，由 XV6 内核定义，即两个来自定时器芯片的中断之间的时间。解决方案应放在 user/sleep.c。

一些提示：

- 在开始编码之前，请阅读 xv6 书的第 1 章。
- 看看 user/ 下的其他程序，例如 user/echo.c、user/grep.c 和 user/rm.c，了解如何获取传递给程序的命令行参数。
- 如果用户忘记传递参数，sleep 应打印错误消息。
- 命令行参数以字符串形式传递，可以用 atoi 转换为整数。
- 使用系统调用 sleep。
- 可以查看 kernel/sysproc.c 中 sys_sleep 的实现、user/user.h 中的声明，以及 user/usys.S 中从用户代码跳到内核的汇编代码。
- 确保 main 调用 exit() 才能退出程序。
- 将 sleep 添加到 Makefile 的 UPROGS 中。
- C 语言细节可以参考 K&R。

~~~c
#include "kernel/types.h"
#include "user/user.h"

int
main(int argc, char *argv[])
{
  if(argc < 2){
    fprintf(2, "Usage: sleep for some time , you need to input time\n");
    exit(1);
  }

  int sleep_time = (int)*argv[3];

  sleep(sleep_time);

  fprintf(1,"(nothing happens for a little while)\n");

  exit(0);
}
~~~

## Pingpong pipe -> 实现一个类似 Unix 的管道

编写一个程序，使用 UNIX 系统调用通过一对管道（每个方向一个）在两个进程之间 “pingpong” 一个字节。父进程向子进程发送一个字节；子进程打印 “<pid>: received ping”，把字节写回父进程后退出；父进程读取后打印 “<pid>: received pong”，然后退出。解决方案位于 user/pingpong.c。

一些提示：

- 用 pipe 创建管道。
- 用 fork 创建子进程。
- 用 read / write 从管道读写。
- 用 getpid 获取当前进程 ID。
- 将程序添加到 Makefile 的 UPROGS。
- xv6 用户程序可用函数有限，声明主要在 user/user.h，用户态实现主要在 user/ulib.c、user/printf.c、user/umalloc.c。

~~~c
#include "kernel/types.h"
// 这里的顺序有需求！types.h 中讲 unsigned int 重定义为 uint，后面的 user.h 中有应用
#include "user/user.h"

int main(int argc, char const *argv[])
{
    // 创建一个父亲 -> 孩子的 pipe1
    int pipe1[2];
    // 创建一个孩子 -> 父亲的 pipe2
    int pipe2[2];

    if(pipe(pipe1)<0){
        fprintf(2,"There is something wrong with pipe1 (parent to child)");
        exit(1);
    }
    if(pipe(pipe2)<0){
        fprintf(2,"There is something wrong with pipe2 (child to parent)");
        exit(1);
    }

    int pid= fork();// 创建子进程
    if(pid == 0){
        // 子进程
        close(pipe1[1]);// parent->child 只需要读取不需要写入
        close(pipe2[0]);// child->parent 只需要写入不需要读取

        char x;
        if(read(pipe1[0],&x,1)!=1){
            exit(1);
        };
        fprintf(1,"%d:received ping\n",getpid());

        if(write(pipe2[1],&x,1)!=1){
            exit(1);
        }
        close(pipe1[0]);
        close(pipe2[1]);
        exit(0);
    }else{
        // 父进程
        close(pipe1[0]);// parent->child 只需要发数据不需要读取
        close(pipe2[1]);// child->parent 只需要读取不需要写入

        char x = 'A';
        if(write(pipe1[1],&x,1)!=1){
            exit(1);
        }
        char recv;
        if (read(pipe2[0],&recv,1)!=1){
            exit(1);
        }
        fprintf(1,"%d:received pong\n",getpid());
        close(pipe1[1]);
        close(pipe2[0]);
        wait(0);// 等待 pid=0 的子进程结束
        exit(0);
    }
}
~~~

## Primes -> 实现一个质数筛（CSP 线程模型）

使用管道编写素数筛的并发版本。目标是用 pipe 和 fork 设置一条管道链：第一个进程把 2 到 35 写入管道；对于每个素数创建一个进程，从左邻管道读取、过滤后写入右邻。由于 xv6 的文件描述符和进程数量有限，第一个进程到 35 即可停止。

注意：

- 关闭每个进程不需要的文件描述符，否则会很快耗尽 xv6 资源。
- 第一个进程写完 35 后要等待整个管道链结束。
- 最简单的方法是直接在管道里传 32 位 int，而不是格式化字符串。
- 只在需要时创建进程。
- 把程序加入 UPROGS。

这里的质数筛和 Go 的思想很相关：CSP（Communicating Sequential Processes）线程模型，也是 Goroutine 和 Channel 的基础。

其思路是“线程 + 事件 + 消息传递”：

- 每个线程 / 进程 / Goroutine 维护自己的私有局部状态。
- 线程之间不直接访问共享内存，而通过 Channel 发送和接收消息。
- 可变状态封装在单个线程内部，因此很多情况下不需要加锁。

~~~c
#include "kernel/types.h"
#include "user/user.h"

void prime_filter(int left0,int depth)
{
    if(depth == 35)return;
    int p;
    read(left0, &p, sizeof(int));

    printf("%d\n", p);// 打印素数

    int right[2];
    pipe(right);// 创建指向右边的管道
    int pid = fork();

    if (pid == 0)
    {
        int x = 0;
        while (read(left0, &x, sizeof(int)) > 0)
        {
            if (x % p != 0)
            {
                write(right[1], &x, sizeof(int));
            }
        }
        close(right[1]);
        exit(0);
    }

    close(left0);
    prime_filter(right[0],depth+1);
}

int main(int argc, char const *argv[])
{
    int left[2];
    pipe(left);

    for(int i =2;i<=35;i++){
        write(left[1],&i,sizeof(int));
    }
    close(left[1]);

    prime_filter(left[0],0);

    exit(0);
}
~~~

## Find -> 实现搜索文件 / 文件夹功能的用户程序

编写一个简单版本的 UNIX find：在目录树中查找具有特定名称的所有文件。解决方案位于 user/find.c。

提示：

- 看 user/ls.c 学习如何读取目录。
- 使用递归进入子目录。
- 不要递归到 “.” 和 “..”。
- 文件系统修改会跨 qemu 运行保留；需要干净文件系统时运行 make clean。
- 字符串比较使用 strcmp，不要用 ==。
- 把程序加入 UPROGS。

测试：

~~~text
$ make qemu
...
init: starting sh
$ echo > b
$ mkdir a
$ echo > a/b
$ mkdir a/aa
$ echo > a/aa/b
$ find . b
./b
./a/b
./a/aa/b
$
~~~

对应逻辑：

~~~text
start: .
├── b (文件) → 匹配！打印 ./b
└── a (目录)
    ├── b (文件) → 匹配！打印 ./a/b
    └── aa (目录)
        └── b (文件) → 匹配！打印 ./a/aa/b
~~~

~~~c
#include "kernel/types.h"
#include "kernel/fs.h"
#include "kernel/stat.h"
#include "user/user.h"

void find(char *find_obj, char *path)
{
    char buf[512]; // 用来构建递归的路径
    struct stat info;
    struct dirent de;

    int fd;
    if ((fd = open(path, 0)) < 0)
    {
        fprintf(2, "This is not a dir!");
        return;
    }

    if (fstat(fd, &info) < 0)
    {
        fprintf(2, "cannot find stat!!!");
        close(fd);
        return;
    }

    if (info.type != T_DIR)
    {
        fprintf(2, "This is not a dir!");
        return;
    }

    strcpy(buf, path);
    char *p;
    p = buf + strlen(path);
    *p = '/';
    p++;

    while (read(fd, &de, sizeof(de)) == sizeof(de))
    {
        if (de.inum == 0)
            continue;

        if (strcmp(de.name, ".") == 0 || strcmp(de.name, "..") == 0)
            continue;

        strcpy(p, de.name);

        if (stat(buf, &info) < 0)
        {
            fprintf(2, "cannot find stat!!!");
            continue;
        }

        if (strlen(buf) + strlen(de.name) >= sizeof(buf))
        {
            printf("find:the path is too long!!!");
            close(fd);
            return;
        }

        if (info.type == T_FILE && strcmp(de.name, find_obj) == 0)
            printf("%s\n", buf);

        if (info.type == T_DIR)
            find(find_obj, buf);
    }
    close(fd);
}

int main(int argc, char *argv[])
{
    if (argc != 3)
    {
        fprintf(2, "Usage:find <path> <filename>\n");
        exit(1);
    }
    find(argv[2], argv[1]);
    exit(0);
}
~~~

## Xargs -> 命令行的“参数转换器”

编写一个简单版 UNIX xargs。它从标准输入读取行，并为每一行运行指定命令，把该行追加到命令参数中。解决方案位于 user/xargs.c。

xargs 的核心功能就是把标准输入中的数据转成命令行参数，从而让不直接读取 stdin 的命令也可以接上管道。

提示：

- 每行输入用 fork + exec 执行命令，父进程 wait。
- 一次读取一个字符直到换行。
- kernel/param.h 声明了 MAXARG。
- 把程序加入 UPROGS。
- 需要干净文件系统时 make clean 后重新 make qemu。

测试：

~~~text
$ echo hello too | xargs echo bye
bye hello too
$

$ (echo 1 ; echo 2) | xargs -n 1 echo
1
2
$

$ make qemu
...
init: starting sh
$ sh < xargs test.sh
$ $ $ $ $ $ hello
hello
hello
$ $
~~~

在 Linux 中，很多命令（例如 rm、cp、mkdir、echo）只接受命令行参数而不接受标准输入。

例如：

~~~text
find . -name "*.log" | rm
~~~

这样会报错；使用 xargs 后：

~~~text
find . -name "*.log" | xargs rm
~~~

则可以执行。

xargs 不是先执行前面的命令，而是把标准输入的每一行作为参数附加到后面指定的命令。xargs 命令本身是 argv[0]，要执行的命令是 argv[1]，固定参数从 argv[2] 开始。

~~~c
#include "kernel/types.h"
#include "user/user.h"
#include "kernel/param.h"

#define Buffer 512

int main(int argc, char const *argv[])
{
    if (argc < 2)
    {
        fprintf(2, "Usage: xargs command [args...]\n");
        exit(1);
    }

    char *cmd = (char *)argv[1];
    int fixed_argc = argc - 2;
    char line[Buffer];

    while (read(0, line, Buffer) > 0)
    {
        char *all_argv[MAXARG];

        int count = 0;
        all_argv[count++] = cmd;

        for (int i = 0; i < fixed_argc; i++)
        {
            all_argv[count++] = (char *)argv[i + 2];
        }

        char *start = line;
        char *end = line;
        while (*start != '\0')
        {
            while (*start && (*start == ' ' || *start == '\n'))
            {
                start++;
            }

            if (*start == '\0')
            {
                break;
            }

            end = start;

            while (*start && *start != ' ' && *start != '\n')
            {
                start++;
            }

            if (*start != '\0')
            {
                *start = '\0';
                start++;
            }

            if (count < MAXARG - 1)
            {
                all_argv[count++] = end;
            }
        }
        all_argv[count] = '\0';

        int pid = fork();
        if (pid < 0)
        {
            fprintf(2, "fork failed\n");
            exit(1);
        }
        else if (pid == 0)
        {
            exec(cmd, all_argv);
            fprintf(2, "exec failed\n");
            exit(1);
        }
        else
        {
            wait(0);
        }
    }
    exit(0);
}
~~~

## 注意事项

如果还有一些细节，可以看我自己的 Notion 博客（CSDN 里偷懒了）。

这些都是用户程序，所以都在 user 目录里面写。

基本逻辑都是获取命令行参数 argc / argv，然后调用系统调用完成工作：

- exec：执行程序。
- open：打开文件 / 目录。
- read：读取内容，很多时候是 stdin。
- close：关闭文件描述符。xv6 / Linux 默认已经打开 0（stdin）、1（stdout）、2（stderr）。
- wait：等待子进程结束。
- fork：从当前进程复制一个子进程。

---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/156618273)。

<!-- imported-from-csdn:156618273 -->
