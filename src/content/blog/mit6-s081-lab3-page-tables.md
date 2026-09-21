---
title: "MIT6.s081——lab3 页表"
description: "MIT 6.S081 Lab3：通过 USYSCALL 共享只读页加速 getpid，实现页表可视化 vmprint，并通过 PTE_A 位实现 pgaccess 页面访问检测。"
date: 2026-02-12
tags: ["系统","xv6","虚拟内存","页表","笔记"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":4}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/158006742"}
---

## 加快系统调用速度

这个实验的第一部分，是通过在用户空间和内核之间共享一个**只读页面**，让某些系统调用不必每次都陷入内核。

以 `getpid()` 为例，用户程序本来无法直接访问内核中的 `struct proc`，因此正常路径需要：

```text
用户态 getpid()
    ↓
ecall
    ↓
trap
    ↓
syscall()
    ↓
sys_getpid()
    ↓
返回 pid
```

如果把当前进程的 pid 复制到一个用户可读、不可写的共享页，那么用户态可以直接读取它。

xv6 已经有 TRAMPOLINE 和 TRAPFRAME 两个特殊高地址页面，因此可以继续在它们下面定义：

```c
#define USYSCALL (TRAPFRAME - PGSIZE)

struct usyscall {
  int pid;
};
```

然后在 `struct proc` 中增加：

```c
struct proc {
  // ...
  struct trapframe *trapframe;
  struct usyscall *usyscall;
  // ...
};
```

这个实验主要会修改三个地方：

- `allocproc()`：为 USYSCALL 分配物理页，并写入 pid。
- `proc_pagetable()`：把该页映射进用户页表。
- `freeproc()` / `proc_freepagetable()`：进程退出时释放并解除映射。

### allocproc

思路与 trapframe 类似：

```c
if((p->usyscall = (struct usyscall *)kalloc()) == 0){
  freeproc(p);
  release(&p->lock);
  return 0;
}

p->usyscall->pid = p->pid;
```

### proc_pagetable

把 USYSCALL 映射到用户页表，并且只授予用户态读权限：

```c
if(mappages(pagetable, USYSCALL, PGSIZE,
            (uint64)(p->usyscall),
            PTE_R | PTE_U) < 0){
  uvmunmap(pagetable, TRAMPOLINE, 1, 0);
  uvmunmap(pagetable, TRAPFRAME, 1, 0);
  uvmfree(pagetable, 0);
  return 0;
}
```

这里最重要的是权限：

```text
PTE_R：可读
PTE_U：用户态可访问
没有 PTE_W：用户程序不能修改 pid
```

### 释放

`freeproc()`：

```c
if(p->usyscall)
  kfree((void*)p->usyscall);
p->usyscall = 0;
```

`proc_freepagetable()`：

```c
uvmunmap(pagetable, TRAMPOLINE, 1, 0);
uvmunmap(pagetable, TRAPFRAME, 1, 0);
uvmunmap(pagetable, USYSCALL, 1, 0);
uvmfree(pagetable, sz);
```

这样用户态就可以通过共享页读取 pid，而不需要每次都执行一次完整系统调用。

## Print a page table：实现 vmprint

第二部分要求打印页表，用来理解 RISC-V Sv39 的三级页表结构。

一个页表页有 512 个 PTE。对于 64 位虚拟地址，Sv39 使用三段 VPN：

```text
VA
┌──────────┬─────────┬─────────┬─────────┬────────────┐
│ 高位保留 │ VPN[2]  │ VPN[1]  │ VPN[0]  │ page offset│
└──────────┴─────────┴─────────┴─────────┴────────────┘
              9 bit     9 bit     9 bit       12 bit
```

三级页表逐层索引：

```text
root page table
      ↓ VPN[2]
level 1 page table
      ↓ VPN[1]
level 0 page table
      ↓ VPN[0]
physical page
```

可以递归遍历页表，只打印有效的 PTE：

```c
static void
print_indent(int level)
{
  for(int i = 0; i < level; i++)
    printf(" ..");
}

void
vmprint(pagetable_t page, int level)
{
  if(level > 2)
    panic("vmprint level");

  for(int i = 0; i < 512; i++){
    pte_t pte = page[i];

    if(pte & PTE_V){
      uint64 pa = PTE2PA(pte);

      print_indent(level);
      printf("%d: pte %p pa %p\n", i, pte, pa);

      if((pte & (PTE_R | PTE_W | PTE_X)) == 0)
        vmprint((pagetable_t)pa, level + 1);
    }
  }
}
```

关键判断：

```c
(pte & (PTE_R | PTE_W | PTE_X)) == 0
```

如果一个有效 PTE 没有读、写、执行权限，那么它一般不是叶子页，而是**下一级页表的地址**。这个递归过程和 `freewalk()` 很像。

## Detect which pages have been accessed：pgaccess

最后一部分实现 `pgaccess()` 系统调用。

RISC-V 页表项中有一个 `PTE_A`（Accessed）位。硬件访问某个页面之后，会把这个 bit 置为 1。

先定义：

```c
#define PTE_A (1L << 6)
```

系统调用接收：

- 起始虚拟地址。
- 需要检查的页数量。
- 用户态保存 bitmask 的地址。

入口大致如下：

```c
uint64
sys_pgaccess(void)
{
  uint64 base;
  uint64 mask;
  int len;

  argaddr(0, &base);
  argint(1, &len);
  argaddr(2, &mask);

  return pgaccess((void*)base, len, (void*)mask);
}
```

为了检查 PTE_A，需要先通过 `walk()` 找到某个虚拟地址对应的 PTE。

```c
int
pgaccess(void *base, int len, void *mask)
{
  struct proc *p = myproc();
  uint64 mask_val = 0;

  if(len <= 0 || len > 64)
    return -1;

  for(int i = 0; i < len; i++){
    uint64 va = (uint64)base + i * PGSIZE;
    pte_t *pte = walk(p->pagetable, va, 0);

    if(pte == 0)
      continue;

    if(*pte & PTE_A){
      mask_val |= (1L << i);
      *pte &= ~PTE_A;
    }
  }

  if(copyout(p->pagetable,
             (uint64)mask,
             (char*)&mask_val,
             sizeof(mask_val)) < 0)
    return -1;

  return 0;
}
```

这里有两点比较重要：

1. bitmask 中第 i 位对应从 base 开始的第 i 个页面。
2. 每次发现 `PTE_A` 后要把它清掉，否则下一次 `pgaccess()` 无法判断页面是“刚刚访问过”，还是之前的 A 位一直没有清除。

整体思路：

```text
USYSCALL
  → 利用共享只读页减少系统调用开销

vmprint
  → 递归观察三级页表

pgaccess
  → walk() 找到 PTE
  → 读取 PTE_A
  → 生成 bitmask
  → copyout 到用户空间
```

---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/158006742)。

<!-- imported-from-csdn:158006742 -->
