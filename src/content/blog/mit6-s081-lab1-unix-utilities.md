---
title: "MIT6.s081——lab1 实现常见的用户程序"
description: "文章浏览阅读900次，点赞28次，收藏23次。本文介绍了在xv6操作系统中实现几个经典UNIX用户程序的方法，包括sleep、pingpong、primes、find和xargs。这些程序分别展示了系统调用的使用、进程间通信、并发编程和文件系统操作等核心概念。sleep程序通过系统调用实现定时休眠；pingpong利用管道实现父子进程间的通信；pri…"
date: 2026-01-05
tags: ["系统","Mit6.S081 2022版本","linux","运维","服务器"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":2}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/156618273"}
---
### Sleep->实现休眠的用户程序


实现 
 xv6 **
  的 UNIX 程序 sleep ;你 sleep 应该暂停 对于用户指定的刻度数。 滴答声是一种时间概念 由 XV6 内核定义，即两个中断之间的时间 来自定时器芯片。 您的解决方案应在文件中 user/sleep.c .


一些提示：


- 在开始编码之前，请阅读 [xv6 书](https://pdos.csail.mit.edu/6.S081/2020/xv6/book-riscv-rev1.pdf)的第 1 章。
- 看看其他 user/ 一些程序 （例如， user/echo.c ， user/grep.c ， 和 user/rm.c ） 看 如何获取传递给程序的命令行参数。
- 如果用户忘记传递参数，则 sleep 应打印错误消息。
- 命令行参数作为字符串传递;您可以使用以下命令将其 atoi 转换为整数（参见 user/ulib.c）。
- 使用系统调用 sleep 。
- 请参阅 kernel/sysproc.c 实现 sleep 系统调用的 xv6 内核代码（查找 sys_sleep ）， user/user.h 对于从用户程序调用的 C 定义 sleep ，以及 user/usys.S 从用户代码跳转到内核 sleep 的汇编器代码。
- 确保 main 呼叫 exit() 才能退出 你的程序。
- 将您的 sleep 程序添加到 Makefile UPROGS 中;完成此作后， make qemu 将编译您的程序，然后您将 能够从 xv6 shell 运行它。
- 查看 Kernighan 和 Ritchie 的书 *The C programming language （second edition）（K*&R） 以了解 C。


```cpp
#include "kernel/types.h"#include "user/user.h" intmain(int argc, char *argv[]){   if(argc < 2){    fprintf(2, "Usage: sleep for some time , you need to input time\n");    exit(1);  }    int sleep_time = (int)*argv[3];   sleep(sleep_time);   fprintf(1,"(nothing happens for a little while)\n");   exit(0);}
```


### Pingpong pipe->实现一个类似Unix的管道|


编写一个程序，使用 UNIX 系统调用通过一对管道（每个方向一个）在两个进程之间“pingpong”一个字节。父级应向子级发送一个字节;子节点应打印“<pid>： received ping”，其中 <pid> 是其进程 ID，将管道上的字节写入父节点，然后退出;父级应从子级读取字节，打印“<pid>： received pong”，然后退出。您的解决方案应该在文件 user/pingpong.c 中。


一些提示：


- 用于 pipe 创建管道。
- 用于 fork 创建子项。
- 用于 read 从管道读取和 write 写入管道。
- 用于 getpid 查找调用进程的进程 ID。
- 将程序添加到 Makefile UPROGS 中。
- xv6 上的用户程序具有一组有限的库 函数可供他们使用。您可以在 user/user.h ;源（系统调用除外）位于 user/ulib.c 、 和 user/printf.c user/umalloc.c 中。![图片](/Blog/images/csdn/156618273/01.png)


```cpp
#include "kernel/types.h"//这里的顺序有需求的!!!type.h中讲unsigned int重定义为uin在后面的user.h中有应用#include "user/user.h"  int main(int argc, char const *argv[]){    //创建一个父亲->孩子的pipe1    int pipe1[2];    //创建一个孩子->父亲的pipe2    int pipe2[2];     if(pipe(pipe1)<0){        fprintf(2,"There is something wrong with pipe1 (parent to child)");        exit(1);    }    if(pipe(pipe2)<0){        fprintf(2,"There is something wrong with pipe2 (child to parent)");        exit(1);    }     int pid= fork();//创建子进程，为pid    if(pid == 0){        //子进程        close(pipe1[1]);//parent->child只需要读取不需要写入        close(pipe2[0]);//child->parent只需要写入不需要读取         char x;        if(read(pipe1[0],&x,1)!=1){            exit(1);        };        fprintf(1,"%d:received ping\n",getpid());         if(write(pipe2[1],&x,1)!=1){            exit(1);        }        close(pipe1[0]);        close(pipe2[1]);        exit(0);    }else{        //父进程        close(pipe1[0]);//parent->child只需要发数据不需要读取        close(pipe2[1]);//child->parent只需要读取不需要写入         char x = 'A';        if(write(pipe1[1],&x,1)!=1){            exit(1);        }        char recv;        if (read(pipe2[0],&recv,1)!=1){            exit(1);        }        fprintf(1,"%d:received pong\n",getpid());        close(pipe1[1]);        close(pipe2[0]);        wait(0);//等待pid=0的子进程结束        exit(0);    }}
```


### Primes->实现一个质数筛(CSP线程
 模型 **
 )


使用管道编写素数筛的并发版本。这个想法归功于 Unix 管道的发明者 Doug McIlroy。 [本页](http://swtch.com/~rsc/thread/)中间的图片 周围的文字解释了如何做到这一点。 你 解决方案应位于文件 user/primes.c 中。


您的目标是使用 pipe 和 fork 设置管道。第一个过程将数字 2 到 35 输入管道。对于每个素数，您将安排创建一个进程，该进程通过管道从其左邻读取，并通过另一个管道写入其右邻。由于 xv6 的文件描述符和进程数量有限，因此第一个进程可以在 35 个时停止。


![图片](/Blog/images/csdn/156618273/02.png)


一些提示：


- 小心关闭进程不需要的文件描述符，否则程序将在第一个进程达到 35 之前运行 xv6 的资源。
- 一旦第一个进程达到 35，它应该等到整个管道终止，包括所有子级、孙级等。因此，主素数进程应仅在打印完所有输出后以及所有其他素数进程退出后退出。
- 提示： read 当写入端 管道关闭。
- 最简单的方法是直接将 32 位（4 字节） int 的 s 写入 管道，而不是使用格式化的 ASCII I/O。
- 应仅在需要时在管道中创建流程。
- 将程序添加到 Makefile UPROGS 中。


这里的质数筛是一个和Go语言的思想很相关的东西->CSP 线程模型(Go 语言中 Goroutine 和 Channel 的基础
 )


**线程 + 事件 + 消息传递（Threads and Events / Message-passing）**


**工作原理：**


- **每个线程（或进程/Goroutine）维护自己的 私有局部状态**
- **线程之间不直接访问共享内存，而是通过通道（Channels）来发送和接收消息（Messages/Events）进行交互**
- 由于数据是**通过通信来传递**的，可变状态被安全地封装在单个线程的内部，因此**不需要加锁**


```cpp
#include "kernel/types.h"#include "user/user.h" void prime_filter(int left0,int depth)//fd表示的是左边来的管道而且只是用读端因此就是left[0]表示为left0{    if(depth == 35)return;    int p;    read(left0, &p, sizeof(int));     printf("%d\n", p);//打印素数     int right[2];    pipe(right);//创建指向右边的管道     int pid = fork(); // 开始子线程     if (pid == 0)    {        // 子线程中开始往后面读数据         int x = 0;        while (read(left0, &x, sizeof(int)) > 0)        {            if (x % p != 0)            {                // 不被整除那就直接放行                write(right[1], &x, sizeof(int));            }        }        close(right[1]);        exit(0);    }    close(left0);//关闭左边的管道    prime_filter(right[0],depth+1);//主线程开始递归调用} int main(int argc, char const *argv[]){    int left[2];    pipe(left);     for(int i =2;i<=35;i++){        write(left[1],&i,sizeof(int));    }    close(left[1]);     prime_filter(left[0],0);//从0开始进行计数表示深度     exit(0);}
```


### Find->实现搜索文件/文件夹功能的用户程序


编写一个简单版本的 UNIX 查找程序：查找目录树中具有特定名称的所有文件。您的解决方案应该在文件 user/find.c 中。


一些提示：


- 查看 user/ls.c 以了解如何读取目录。
- 使用递归允许 find 下降到子目录。
- 不要递归到 “.” 和 “..”。
- 对文件系统的更改在 qemu 的运行中持续存在;运行干净的文件系统，然后 **make qemu** 运行 **make clean** .
- 您需要使用 C 字符串。看看 K&R（C 书），例如 5.5 节。
- 请注意，== 不像在 Python 中那样比较字符串。请改用 strcmp（） 。
- 将程序添加到 Makefile UPROGS 中。


测试方式如下：


```cpp
    $ make qemu    ...    init: starting sh    $ echo > b    $ mkdir a    $ echo > a/b    $ mkdir a/aa    $ echo > a/aa/b    $ find . b    ./b    ./a/b    ./a/aa/b    $
```


对应的逻辑应该如下：


```cpp
start: .├── b (文件) → 匹配！打印 ./b└── a (目录)    ├── b (文件) → 匹配！打印 ./a/b    └── aa (目录)        └── b (文件) → 匹配！打印 ./a/aa/b
```


```cpp
#include "kernel/types.h"#include "kernel/fs.h"#include "kernel/stat.h"#include "user/user.h" void find(char *find_obj, char *path){    char buf[512]; // 用来构建递归的路径    struct stat info;    struct dirent de;     int fd;    // 打开当前目录文件    if ((fd = open(path, 0)) < 0)    {        fprintf(2, "This is not a dir!");        return;    }    // 从fd中获取stat信息进行存储    if (fstat(fd, &info) < 0)    {        fprintf(2, "cannot find stat!!!");        close(fd);        return;    }    // 类型不是DIR报错要求重新来    if (info.type != T_DIR)    {        fprintf(2, "This is not a dir!");        return;    }     strcpy(buf, path); // 将当前的路径放进buffer中    char *p;    p = buf + strlen(path);    *p = '/'; // 添加路径分隔符    p++;    while (read(fd, &de, sizeof(de)) == sizeof(de))    {        // xv中目录de是按照数组形式进行存储的,read系统调用在读取一个打开的目录的时候每次返回的是一个完整的sturct dirent         if (de.inum == 0)            continue;        // 空目录跳过        if (strcmp(de.name, ".") == 0 || strcmp(de.name, "..") == 0)            continue;        // 当前目录的上一级和上上一级不允许被访问        // memmove(p, de.name, DIRSIZ); // 字符数组拼接 buf = path + '/' + de.name        // p[DIRSIZ] = '\0';            // 字符串构造        strcpy(p, de.name); // 使用strcpy才会自动进行\0的添加        if (stat(buf, &info) < 0)//从一个路径buf中获取对应的文件信息        { // 打不开的情况,直接跳过到下一个选项            fprintf(2, "cannot find stat!!!");            continue;        }        if (strlen(buf) + strlen(de.name) >= sizeof(buf))        {            printf("find:the path is too long!!!");            close(fd);            return;        }         if (info.type == T_FILE && strcmp(de.name, find_obj) == 0)            printf("%s\n", buf); // 是文件打印目录         if (info.type == T_DIR)            find(find_obj, buf); // 是目录开始递归    }    close(fd);} int main(int argc, char *argv[])//这里传入的参数argv不是const的和find函数保持一致即可{    if (argc != 3)    {        fprintf(2, "Usage:find <path> <filename>\n");        exit(1);    }    find(argv[2], argv[1]);    exit(0);}
```


### Xargs->**命令行的“参数转换器”**


编写一个简单版本的 UNIX xargs 程序：它的参数描述要运行的命令，它从标准输入中读取行，并为每一行运行命令，将该行附加到命令的参数中。您的解决方案应该在文件 user/xargs.c 中。


xargs是
 Linux **
 中一个非常实用的命令行工具，其核心功能是**将标准输入（stdin）的数据作为命令行参数传递给指定的命令**，从而简化和加速命令行操作。


一些提示：


- 使用 和 exec 在 fork 每行输入上调用命令。在父级中使用 wait 等待子节点完成命令。
- 要读取输入的各个行，请一次读取一个字符，直到出现换行符 （'\n'）。
- kernel/param.h 声明 MAXARG，如果您需要声明 argv 数组，这可能很有用。
- 将程序添加到 Makefile UPROGS 中。
- 对文件系统的更改在 qemu 的运行中持续存在;要获得干净的文件系统，请运行 make clean，然后运行 make qemu。


```cpp
	$ echo hello too | xargs echo bye    bye hello too    $ 	$ (echo 1 ; echo 2) | xargs -n 1 echo    1    2    $     # 通过需要如下的显示    $ make qemu	  ...	  init: starting sh	  $ sh < xargs test.sh	  $ $ $ $ $ $ hello	  hello	  hello	  $ $
```


在 Linux 中，很多命令（如 rm, cp, mkdir, echo）**只接受命令行参数**，而**不接受标准输入**


**比如****find . -name "*.log" | rm 就是会报错的，因为这些指令是不接受stdin的，但是如果使用xargs->find . -name "*.log" | xargs rm就是可以执行的**


xargs 不是先执行前面的命令，而是将标准输入的每一行作为参数附加到后面指定的命令上。关键点在于：命令行参数解析：xargs 命令本身是第一个参数（argv[0]），后面跟着要执行的命令（argv[1]）和固定参数（argv[2]及以后）


请注意，UNIX 上的 xargs 进行了优化，它一次将向命令提供超过 参数。我们不希望您进行此优化。要使 UNIX 上的 xargs 按照我们想要的方式运行，请将 -n 选项设置为 1 来运行它。


```cpp
#include "kernel/types.h"#include "user/user.h"#include "kernel/param.h" // 添加param.h以获取MAXARG #define Buffer 512 int main(int argc, char const *argv[]){    // 检查参数数量：至少需要xargs和一个命令    if (argc < 2)    {        fprintf(2, "Usage: xargs command [args...]\n");        exit(1);    }     // 命令名是argv[1]，固定参数从argv[2]开始    char *cmd = (char *)argv[1];    int fixed_argc = argc - 2; // 固定参数的数量(xargs+cmd)    char line[Buffer];    // 读取标准输入的内容    while (read(0, line, Buffer) > 0)    {        // 重新定义参数数组        char *all_argv[MAXARG]; // 使用MAXARG（xv6定义的参数上限）         // 将标准输入得到的东西line放到第一部分，后面拼接的是xargs的参数        int count = 0;        all_argv[count++] = cmd; // 新的argv[0]是原来的cmd         // 添加固定参数（argv[2]到argv[argc-1]）        for (int i = 0; i < fixed_argc; i++)        {            all_argv[count++] = (char *)argv[i + 2];        }         // 分割当前行（按空格和换行符分割）        char *start = line;        char *end = line;        while (*start != '\0')        {            // 跳过分隔符（空格、换行符）            while (*start && (*start == ' ' || *start == '\n'))            {                start++;            }             if (*start == '\0')            {                break;            }             // 记录当前参数的开始位置            end = start;             // 找到下一个分隔符            while (*start && *start != ' ' && *start != '\n')            {                start++;            }             // 用\0替换分隔符，标记参数结束            if (*start != '\0')            {                *start = '\0';                start++;            }             // 添加到参数数组            if (count < MAXARG - 1)            {                all_argv[count++] = end;            }        }        all_argv[count] = '\0';         // 创建子进程执行命令        int pid = fork();        if (pid < 0)        {            fprintf(2, "fork failed\n");            exit(1);        }        else if (pid == 0)        {            // 执行命令            exec(cmd, all_argv);            // 如果exec失败，退出            fprintf(2, "exec failed\n");            exit(1);        }        else        {            // 等待子进程完成            wait(0);        }    }    exit(0);}
```


### 注意事项


如果还有一些细节可以看看我自己的
 Notion **
 博客(CSDN里面的偷懒了)[https://www.notion.so/MIT6-S081-2022-2aab2af65af880bfbabef8185a563229?pvs=74](https://www.notion.so/MIT6-S081-2022-2aab2af65af880bfbabef8185a563229?pvs=74)


- 这些都是用户程序，所以都是在user目录里面写的
- 基本的逻辑都是获取命令行参数int argc, char const *argv[]，然后进行处理
- 具体处理的方法就是调用系统调用：exec调用执行程序、open调用打开文件/目录、read调用来读取文件里面的内容(但是一般都是读取stdin的内容的)、close调用来关闭这些打开的文件(这里需要注意因为xv6和Linux这些都是默认打开了三个文件的：0->stdin、1->stdout、2->stderr)
- wait调用来等待子进程的自己结束、fork来从当前线程复制一个子线程(内存信息都是一模一样)
---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/156618273)。

<!-- imported-from-csdn:156618273 -->
