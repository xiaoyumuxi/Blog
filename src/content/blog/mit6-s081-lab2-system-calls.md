---
title: "MIT6.s081——lab2 系统调用的创建"
description: "MIT 6.S081 Lab2：用 GDB 调试 xv6 内核，并实现 trace 与 sysinfo 系统调用，理解 ecall、trap、syscall 分发和用户/内核空间的数据传递。"
date: 2026-02-12
tags: ["系统","xv6","操作系统","笔记"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":3}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/158006632"}
---

## Lab 2 System Call

在本练习中，需要向 xv6 添加新的系统调用。这个过程可以帮助理解系统调用的工作原理，以及 xv6 内核内部的组织方式。

## 使用 GDB Debug

很多情况下 print 足够调试内核，但有时需要单步执行汇编、检查寄存器和调用栈。

内核 GDB 调试基本流程：

1. 在 xv6 目录执行 make qemu-gdb，获取 QEMU 暴露的远程调试端口。
2. 新开终端运行 riscv64-elf-gdb kernel/kernel。因为架构是 RISC-V，不一定能用系统默认 gdb。
3. 在 GDB 中通过 target remote 连接 QEMU。
4. 给 syscall 等函数设置断点。

例如：

~~~text
(gdb) b syscall
Breakpoint 1 at 0x80002142: file kernel/syscall.c, line 243.
(gdb) c
Continuing.
[Switching to Thread 1.2]

Thread 2 hit Breakpoint 1, syscall () at kernel/syscall.c:243
243     {
(gdb) layout src
(gdb) backtrace
~~~

layout src 会把终端分割成源代码与命令窗口；backtrace 打印调用栈。

典型调用链：

~~~text
[用户程序] → usertrap() → syscall()
~~~

回溯里：

| 编号 | 内容 | 含义 |
| --- | --- | --- |
| #0 | syscall() at kernel/syscall.c | 当前执行点 |
| #1 | usertrap() at kernel/trap.c | 上一层内核调用 |
| #2 | ?? | 更上层通常是用户态地址，当前符号表无法解析 |

### 看 trapframe 与 CSR

执行到：

~~~c
struct proc *p = myproc();
~~~

之后，可以打印 proc 结构体。

p->trapframe->a7 保存系统调用编号。可以从 trapframe 地址加对应偏移去看 a7。

CPU 之前处于什么模式，可以通过 CSR，例如：

~~~text
p /x $sstatus
p /x $scause
~~~

QEMU 默认不一定会把所有 CSR 暴露给 info registers，所以直接打印 CSR 更可靠。

RISC-V 的 scause 中，8 表示 Environment Call from U-mode，也就是用户态 ecall 触发的系统调用。

| 值 | 异常类型 |
| --- | --- |
| 0 | Instruction Page Fault |
| 1 | Instruction Access Fault |
| 2 | Illegal Instruction |
| 3 | Breakpoint |
| 4 | Load Page Fault |
| 5 | Load Access Fault |
| 6 | Store/AMO Page Fault |
| 7 | Store/AMO Access Fault |
| 8 | Environment Call from U-mode（系统调用） |
| 9 | Environment Call from S-mode |
| 11 | Machine Interrupt |

## Trace 系统调用

目标是实现一个 trace(mask) 系统调用。mask 是位掩码，每一位对应一个系统调用编号。

例如：

~~~text
$ trace 32 grep hello README
3: syscall read -> 1023
3: syscall read -> 966
3: syscall read -> 70
3: syscall read -> 0

$ trace 2147483647 grep hello README
4: syscall trace -> 0
4: syscall exec -> 3
4: syscall open -> 3
4: syscall read -> 1023
...
~~~

trace 的整体路径：

~~~text
[用户程序 trace.c]
       ↓ trace(mask)
[用户存根 trace() / usys.S]
       ↓ ecall
[CPU 切换到内核]
       ↓
[kernel/trap.c: usertrap()]
       ↓
[kernel/syscall.c: syscall()]
       ↓ 根据 a7 查系统调用编号
[kernel/sysproc.c: sys_trace()]
       ↓ 保存 mask 到当前 proc
[后续 syscall()]
       ↓ 检查 mask
       ↓ 命中则打印
~~~

### 用户态存根

系统调用最终需要一段汇编 stub：

~~~asm
.global trace
trace:
    li a7, SYS_trace
    ecall
    ret
~~~

stub 是用户态的轻量代理，真正进入内核是 CPU 执行 ecall。

### trace 用户程序

~~~c
#include "kernel/types.h"
#include "user/user.h"

int main(int argc, char *argv[])
{
    if (argc < 3) {
        fprintf(2, "Usage: trace <mask> <command> [args...]\n");
        exit(1);
    }

    int bitcode = atoi(argv[1]);

    if(trace(bitcode)<0){
        fprintf(2, "trace: failed to set mask\n");
        exit(1);
    }

    exec(argv[2],argv + 2);

    fprintf(2, "trace: exec failed\n");
    exit(1);
}
~~~

### 内核实现

~~~c
uint64
sys_trace(void){
  int bitcode;
  argint(0,&bitcode);
  myproc()->bitcode = bitcode;
  return 0;
}
~~~

proc 中增加字段并初始化：

~~~c
struct proc {
  struct spinlock lock;
  enum procstate state;
  void *chan;
  int killed;
  int xstate;
  int pid;
  struct proc *parent;

  uint64 kstack;
  uint64 sz;
  pagetable_t pagetable;
  struct trapframe *trapframe;
  struct context context;
  struct file *ofile[NOFILE];
  struct inode *cwd;
  char name[16];

  int bitcode; // trace 系统调用配置码
};
~~~

allocproc 里初始化：

~~~c
p->bitcode = 0;
~~~

fork 时还需要把父进程的 mask 复制给子进程，否则子进程不会继承 trace 状态。

### 在 syscall() 中打印

~~~c
void
syscall(void)
{
  int num;
  struct proc *p = myproc();

  num = p->trapframe->a7;

  if(num > 0 && num < NELEM(syscalls) && syscalls[num]) {
    p->trapframe->a0 = syscalls[num]();

    if (p->bitcode & (1 << num)) {
      printf("%d: syscall %s -> %d\n",
             p->pid,
             syscall_names[num],
             p->trapframe->a0);
    }
  } else {
    printf("%d %s: unknown sys call %d\n",
           p->pid, p->name, num);
    p->trapframe->a0 = -1;
  }
}
~~~

syscalls 本身就是“系统调用号 → 内核 C 函数”的分发表：

~~~c
static uint64 (*syscalls[])(void) = {
  [SYS_fork]    sys_fork,
  [SYS_exit]    sys_exit,
  [SYS_wait]    sys_wait,
  [SYS_pipe]    sys_pipe,
  [SYS_read]    sys_read,
  [SYS_kill]    sys_kill,
  [SYS_exec]    sys_exec,
  [SYS_fstat]   sys_fstat,
  [SYS_chdir]   sys_chdir,
  [SYS_dup]     sys_dup,
  [SYS_getpid]  sys_getpid,
  [SYS_sbrk]    sys_sbrk,
  [SYS_sleep]   sys_sleep,
  [SYS_uptime]  sys_uptime,
  [SYS_open]    sys_open,
  [SYS_write]   sys_write,
  [SYS_mknod]   sys_mknod,
  [SYS_unlink]  sys_unlink,
  [SYS_link]    sys_link,
  [SYS_mkdir]   sys_mkdir,
  [SYS_close]   sys_close,
  [SYS_trace]   sys_trace,
};
~~~

为什么 syscalls[num]() 能执行系统调用？

因为进入内核这件事已经由 ecall + trap 完成。syscall() 运行在内核态，只需要根据 a7 中的编号查表，然后调用普通的内核 C 函数。

~~~text
用户程序 read()
  ↓ 用户态 stub
a0/a1/a2 放参数，a7 放 SYS_read
  ↓ ecall
CPU trap
  ↓
usertrap()
  ↓
syscall()
  ↓
syscalls[SYS_read] → sys_read()
  ↓
返回值写入 trapframe->a0
  ↓
回到用户态
~~~

## Sysinfo 系统调用

sysinfo 用于收集系统运行信息。参数是 struct sysinfo*，内核需要填写：

- freemem：可用内存字节数。
- nproc：state != UNUSED 的进程数量。

结构体：

~~~c
// kernel/sysinfo.h
struct sysinfo {
  uint64 freemem;
  uint16 nproc;
};
~~~

分配系统调用号：

~~~c
#define SYS_sysinfo 23
~~~

实现：

~~~c
#include "sysinfo.h"

extern uint64 kalloc_freemem(void);
extern int count_active_processes(void);

int
sys_sysinfo(void)
{
  struct sysinfo info;
  struct proc *p = myproc();
  uint64 addr;

  if (argaddr(0, &addr) < 0)
    return -1;

  info.freemem = kalloc_freemem();
  info.nproc = count_active_processes();

  if (copyout(p->pagetable, addr, (char *)&info, sizeof(info)) < 0)
    return -1;

  return 0;
}
~~~

关键是 copyout：内核里的 info 不能直接交给用户指针，需要依据该进程页表，把数据安全复制到用户虚拟地址。

参考 filestat：

~~~c
int
filestat(struct file *f, uint64 addr)
{
  struct proc *p = myproc();
  struct stat st;

  if(f->type == FD_INODE || f->type == FD_DEVICE){
    ilock(f->ip);
    stati(f->ip, &st);
    iunlock(f->ip);
    if(copyout(p->pagetable, addr, (char *)&st, sizeof(st)) < 0)
      return -1;
    return 0;
  }
  return -1;
}
~~~

copyout 的核心逻辑：

~~~c
int
copyout(pagetable_t pagetable, uint64 dstva, char *src, uint64 len)
{
  uint64 n, va0, pa0;

  while(len > 0){
    va0 = PGROUNDDOWN(dstva);
    pa0 = walkaddr(pagetable, va0);
    if(pa0 == 0)
      return -1;

    n = PGSIZE - (dstva - va0);
    if(n > len)
      n = len;

    memmove((void *)(pa0 + (dstva - va0)), src, n);

    len -= n;
    src += n;
    dstva = va0 + PGSIZE;
  }
  return 0;
}
~~~

统计空闲内存可以遍历 kalloc 的 freelist：

~~~c
int
getFreeMem(void){
  struct run *r;
  int count = 0;

  acquire(&kmem.lock);
  r = kmem.freelist;

  while (r) {
    count++;
    r = r->next;
  }

  release(&kmem.lock);
  return count * PGSIZE;
}
~~~

统计活跃进程：

~~~c
struct proc proc[NPROC];

int
count_active_processes(void){
  int cnt = 0;

  for (struct proc *p = proc; p < &proc[NPROC]; p++) {
    if (p->state != UNUSED)
      cnt++;
  }

  return cnt;
}
~~~

注册：

~~~c
extern uint64 sys_sysinfo(void);

static uint64 (*syscalls[])(void) = {
  [SYS_sysinfo] sys_sysinfo,
  // ...
};
~~~

用户接口：

~~~c
// user/user.h
struct sysinfo;
int sysinfo(struct sysinfo *);
~~~

以及对应 stub：

~~~asm
.globl sysinfo
sysinfo:
    li a7, 23
    ecall
    ret
~~~

最终实现路径可以概括为：

~~~text
定义 struct sysinfo
        ↓
分配 SYS_sysinfo 编号
        ↓
实现 sys_sysinfo() + 辅助函数
        ↓
注册系统调用（syscall.c）
        ↓
暴露用户接口（user.h + usys.pl / usys.S）
        ↓
编写测试程序 + 加入 Makefile
        ↓
make clean && make && 测试
~~~

---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/158006632)。

<!-- imported-from-csdn:158006632 -->
