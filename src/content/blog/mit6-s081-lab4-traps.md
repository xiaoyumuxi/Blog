---
title: "MIT6.s081——lab4 traps"
description: "MIT 6.S081 Lab4：理解 RISC-V 调用约定和寄存器，利用 frame pointer 实现 backtrace，并完成 sigalarm / sigreturn 用户级定时器中断。"
date: 2026-02-13
tags: ["系统","xv6","RISC-V","trap","笔记"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":5}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/158006798"}
---

## RISC-V assembly

这一部分主要是熟悉 RISC-V 的函数调用约定、寄存器以及汇编代码。

例如：

```c
int g(int x) {
  return x+3;
}

int f(int x) {
  return g(x);
}

void main(void) {
  printf("%d %d\n", f(8)+1, 13);
  exit(0);
}
```

参数通常通过 `a0`、`a1`、`a2` 等寄存器传递。

| 寄存器 | 用途 |
| --- | --- |
| a0-a7 | 函数参数，其中 a0/a1 也用于返回值 |
| ra | return address |
| sp | stack pointer |
| s0/fp | frame pointer |
| t0-t6 | 临时寄存器 |

优化开启后，编译器可能直接把 `f()`、`g()` 内联，所以汇编中不一定真的会看到函数调用。

### ra

`ra` 保存函数返回地址。执行：

```asm
jal ra, function
```

时，CPU 一方面跳转到 function，一方面把下一条指令地址写入 `ra`。函数最后的 `ret` 本质上会跳回 `ra` 所指向的位置。

### 小端序

假设：

```c
unsigned int i = 0x00646c72;
```

在小端机器中，低地址存放低有效字节：

```text
地址       内容
&i + 0     0x72  'r'
&i + 1     0x6c  'l'
&i + 2     0x64  'd'
&i + 3     0x00  '\0'
```

这类题目本质是在检查参数如何进入寄存器、返回地址如何保存，以及 RISC-V 的字节序。

## Backtrace

第二部分要求实现一个内核 `backtrace()`，在 panic 等情况下打印当前调用链。

在 xv6 / RISC-V 的栈帧布局里：

```text
当前 frame pointer = s0

return address     在 fp - 8
previous fp        在 fp - 16
```

可以先实现一个读取 fp 的内联汇编函数：

```c
static inline uint64
r_fp()
{
  uint64 x;
  asm volatile("mv %0, s0" : "=r" (x));
  return x;
}
```

然后逐层向上遍历：

```c
void
backtrace(void)
{
  uint64 fp = r_fp();

  while(1){
    uint64 ret = *(uint64*)(fp - 8);
    uint64 pre_fp = *(uint64*)(fp - 16);

    printf("%p\n", ret);

    if(PGROUNDDOWN(pre_fp) != PGROUNDDOWN(fp))
      break;

    fp = pre_fp;
  }
}
```

为什么可以用 `PGROUNDDOWN`？因为内核栈大小就是一页。当 previous frame pointer 已经跳出了当前内核栈所在页时，就不应该继续回溯。

最后可以在 `panic()` 中调用 `backtrace()`，这样出错时就能直接得到返回地址序列。

## Alarm

最后一部分实现用户级定时器：

```c
sigalarm(interval, handler)
```

含义是：一个进程每消耗 interval 个 CPU tick，就暂停当前用户代码，跳转执行一次 handler。handler 执行完成后，通过：

```c
sigreturn()
```

恢复到被打断前的状态。

### 进程状态

给 `struct proc` 增加：

```c
int interval;
uint64 handler;
int pass_tick;
int alarm_in_progress;
struct trapframe *alarmframe;
```

在 `allocproc()` 中初始化并分配 alarmframe：

```c
p->interval = 0;
p->handler = 0;
p->pass_tick = 0;
p->alarm_in_progress = 0;

if((p->alarmframe = (struct trapframe *)kalloc()) == 0){
  freeproc(p);
  release(&p->lock);
  return 0;
}
```

退出时记得释放。

### sigalarm

```c
uint64
sys_sigalarm(void)
{
  int interval;
  uint64 handler;
  struct proc *p = myproc();

  argint(0, &interval);
  argaddr(1, &handler);

  p->interval = interval;
  p->handler = handler;
  p->pass_tick = 0;

  return 0;
}
```

### 在 timer interrupt 中触发 handler

当 `which_dev == 2` 时说明是 timer interrupt。

```c
if(which_dev == 2){
  if(p->interval > 0 && !p->alarm_in_progress){
    p->pass_tick++;

    if(p->pass_tick >= p->interval){
      *p->alarmframe = *p->trapframe;

      // 下一次返回用户态时进入 handler
      p->trapframe->epc = p->handler;

      p->pass_tick = 0;
      p->alarm_in_progress = 1;
    }
  }

  yield();
}
```

最重要的是先保存完整 trapframe：

```c
*p->alarmframe = *p->trapframe;
```

因为 handler 结束后，需要恢复**完整的用户寄存器现场**。只保存 epc 不够；被打断时 a0、sp、ra、s0 等寄存器都属于用户程序状态。

同时需要 `alarm_in_progress` 防止 handler 自己执行时再次收到 timer interrupt，造成 alarm 重入。

### sigreturn

```c
uint64
sys_sigreturn(void)
{
  struct proc *p = myproc();

  if(p->alarmframe == 0)
    return -1;

  *p->trapframe = *p->alarmframe;
  p->alarm_in_progress = 0;

  return p->trapframe->a0;
}
```

最后一行不能简单 `return 0`。

系统调用框架通常会执行：

```c
p->trapframe->a0 = syscalls[num]();
```

如果 `sys_sigreturn()` 返回 0，那么刚刚恢复好的 a0 又会被覆盖。返回 `p->trapframe->a0` 才能保持原用户程序的寄存器状态。

整体流程：

```text
用户程序正常执行
       ↓
timer interrupt
       ↓
usertrap()
       ↓
pass_tick++
       ↓
达到 interval
       ↓
保存 trapframe → alarmframe
       ↓
epc = handler
       ↓
usertrapret()
       ↓
用户态 handler()
       ↓
sigreturn()
       ↓
恢复 alarmframe → trapframe
       ↓
回到原程序被打断的位置
```

Lab4 把 RISC-V calling convention、frame pointer、trapframe、timer interrupt 和用户态/内核态切换串了起来。

---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/158006798)。

<!-- imported-from-csdn:158006798 -->
