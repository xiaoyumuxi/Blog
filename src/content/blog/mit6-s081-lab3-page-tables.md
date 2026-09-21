---
title: "MIT6.s081——lab3虚拟内存的结构和pgtl的实现"
description: "文章浏览阅读568次，点赞17次，收藏13次。本文摘要探讨了在xv6操作系统中通过共享只读内存区域来加速getpid()系统调用的方法。关键思路是在用户空间和内核之间映射一个包含进程PID的只读页面USYSCALL，使用户程序可直接读取而无需陷入内核。实现需要修改三个核心函数：allocproc()分配并初始化页面，proc_pagetable()建…"
date: 2026-02-12
tags: ["系统","Mit6.S081 2022版本","笔记"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":4}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/158006742"}
---
🔥 

### 加快系统调用速度


某些操作系统（例如 
 Linux 
 ）**通过在用户空间和内核之间的只读区域中共享数据来加速某些系统调用。**这样就消除了在执行这些系统调用时进行内核交叉的需要。为了帮助您了解如何将映射插入页表，**您的首要任务是在 xv6 中为 getpid() 系统调用实现此优化**。


创建每个进程时，在 USYSCALL 上映射一个只读页面（在 memlayout.h 中定义的虚拟地址）。在此页面的开头，存储 a struct usyscall （也在 memlayout.h 中定义），并初始化它以存储当前进程的 PID。对于本练习，已在用户空间端提供， ugetpid() 并将自动使用 USYSCALL 映射。如果 ugetpid 
 测试用例 **
 在运行 pgtbltest 时通过，您将获得实验室这部分的全部学分。


一些提示：


- 您可以在 中 proc_pagetable() kernel/proc.c 执行映射。
- 选择允许用户空间仅读取页面的权限位。
- 您可能会发现这是一个 mappages() 有用的实用程序。
- 不要忘记在 中 allocproc() 分配和初始化页面。
- 确保释放 freeproc() 中的页面。


**使用此共享页面可以更快地进行哪些其他 xv6 系统调用？解释如何。**


就是改变内核让getpid()不用trap进入内核就可以读取


用户程序运行在 **用户空间（user space），**`struct proc` 是内核的数据结构，存在 **内核空间（kernel space），**用户程序**不能直接访问内核内存**（这是操作系统的基本安全机制）


因此我们需要**把 PID “复制一份”放到用户能看见的地方！就是只读内存页**


内核在创建进程时，主动把 `p->pid` 写到USYSCALL页面里，这个页面被映射到用户虚拟地址空间（比如 `0x3ff000`），用户程序可以直接读：`*(int*)0x3ff000`


你需要修改以下三个函数（都在 `kernel/proc.c`）：


1. **`allocproc()`**：分配进程时，分配一页内存，填入 PID。
2. **`proc_pagetable()`**：构建页表时，将这一页映射到 `USYSCALL` 虚拟地址。
3. **`freeproc()`**：释放进程时，释放这一页。


```c
// Virtual address at which to map the usyscall page.
#define USYSCALL (TRAPFRAME - PGSIZE)  // 通常是 0x3ffffff000 - 4KB = 0x3ffffefff000

struct usyscall {
  int pid;
};
```


---


1. **需要一个属性(usyscall)来记录对应的Page的物理地址**


```c
// Per-process state
struct proc
{
  struct spinlock lock;

  // p->lock must be held when using these:
  enum procstate state; // Process state
  void *chan;           // If non-zero, sleeping on chan
  int killed;           // If non-zero, have been killed
  int xstate;           // Exit status to be returned to parent's wait
  int pid;              // Process ID

  // wait_lock must be held when using this:
  struct proc *parent; // Parent process

  // these are private to the process, so p->lock need not be held.
  uint64 kstack;               // Virtual address of kernel stack
  uint64 sz;                   // Size of process memory (bytes)
  pagetable_t pagetable;       // User page table
  struct trapframe *trapframe; // data page for trampoline.S
  struct context context;      // swtch() here to run process
  struct file *ofile[NOFILE];  // Open files
  struct inode *cwd;           // Current directory
  char name[16];               // Process name (debugging)
  struct usyscall *usyscall;   // pointer to usyscall page
};
```


1. **在开始分配进程的时候进行，分配物理地址(kalloc)** // Look in the process table for an UNUSED proc. // If found, initialize state required to run in the kernel, // and return with p->lock held. // If there are no free procs, or a memory allocation fails, return 0. static struct proc * allocproc(void) {  struct proc *p;  for (p = proc; p < &proc[NPROC]; p++)  {  acquire(&p->lock);  if (p->state == UNUSED)  {  goto found;  }  else  {  release(&p->lock);  }  }  return 0; found:  p->pid = allocpid();  p->state = USED;  struct usyscall *usyscall_page;  if ((usyscall_page = kalloc()) == 0)  {//这里来分配物理页来存对应的pid  return 0;  }  usyscall_page->pid = p->pid;//存进去  p->usyscall = usyscall_page;//存到proc进程变量中去  // Allocate a trapframe page.  if ((p->trapframe = (struct trapframe *)kalloc()) == 0)  {  freeproc(p);  release(&p->lock);  return 0;  }  // An empty user page table.  p->pagetable = proc_pagetable(p);  if (p->pagetable == 0)  {  freeproc(p);  release(&p->lock);  return 0;  }  // Set up new context to start executing at forkret,  // which returns to user space.  memset(&p->context, 0, sizeof(p->context));  p->context.ra = (uint64)forkret;  p->context.sp = p->kstack + PGSIZE;  return p; } AI写代码c运行123456789101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960
2. **创建页表映射(mappages：pp→vp的映射创建)** // Create a user page table for a given process, with no user memory, // but with trampoline and trapframe pages. pagetable_t proc_pagetable(struct proc *p) {  pagetable_t pagetable;  // An empty page table.  pagetable = uvmcreate();  if (pagetable == 0)  return 0;  // map the trampoline code (for system call return)  // at the highest user virtual address.  // only the supervisor uses it, on the way  // to/from user space, so not PTE_U.  if (mappages(pagetable, TRAMPOLINE, PGSIZE,  (uint64)trampoline, PTE_R | PTE_X) < 0)  {  uvmfree(pagetable, 0);  return 0;  }  // map the trapframe page just below the trampoline page, for  // trampoline.S.  if (mappages(pagetable, TRAPFRAME, PGSIZE,  (uint64)(p->trapframe), PTE_R | PTE_W) < 0)  {  uvmunmap(pagetable, TRAMPOLINE, 1, 0);  uvmfree(pagetable, 0);  return 0;  } #ifdef LAB_PGTBL  // 处理USYSCALL的映射关系  // Map the usyscall page at USYSCALL.  if (mappages(pagetable, USYSCALL, PGSIZE,  (uint64)p->usyscall, PTE_U | PTE_R ) < 0)  {//需要配置这个PTE具有可读和用户可访问的功能  // 如果映射失败，需要释放已分配资源（这里简化处理）  uvmunmap(pagetable, TRAMPOLINE, 1, 0);  uvmunmap(pagetable, TRAPFRAME, 1, 0);  uvmfree(pagetable, 0);  return 0;  } #endif  return pagetable; } AI写代码c运行1234567891011121314151617181920212223242526272829303132333435363738394041424344454647484950
3. **释放对应的物理空间(kfree)和对应的页表映射(uvmunmap)** // free a proc structure and the data hanging from it, // including user pages. // p->lock must be held. static void freeproc(struct proc *p) {  if (p->trapframe)  kfree((void *)p->trapframe);  p->trapframe = 0;  if (p->usyscall)  kfree((void *)p->usyscall);  p->usyscall = 0;  //因为用户页表里面映射了TRAMPOLINE、TRAPFRAME、USYSCALL的，所以需要先将里面的释放完  if (p->pagetable)  proc_freepagetable(p->pagetable, p->sz);  p->pagetable = 0;//将其地址设置为0-》null  p->sz = 0;  p->pid = 0;  p->parent = 0;  p->name[0] = 0;  p->chan = 0;  p->killed = 0;  p->xstate = 0;  p->state = UNUSED; } AI写代码c运行1234567891011121314151617181920212223242526 // Free a process's page table, and free the // physical memory it refers to. void proc_freepagetable(pagetable_t pagetable, uint64 sz) {  uvmunmap(pagetable, TRAMPOLINE, 1, 0);  uvmunmap(pagetable, TRAPFRAME, 1, 0); #ifdef LAB_PGTBL  uvmunmap(pagetable, USYSCALL, 1, 0); #endif  uvmfree(pagetable, sz); } AI写代码c运行1234567891011


 🔥 

### vmprint打印页表信息


为了帮助您可视化 RISC-V 页表，并可能有助于将来的调试，您的第二个任务是编写一个打印页表内容的函数。


定义一个名为 vmprint() 的函数。它应该接受一个 pagetable_t 参数，并以下面描述的格式打印该页表。在 之前插入 return argc exec.c if(p->pid==1) vmprint(p->pagetable) 以打印第一个进程的页表。如果您通过了 的 pte printout make 
 grade 
  测试，您将获得实验室这部分的全部学分。


现在，当您启动 
 xv6 **
  时，它应该像这样打印输出，描述第一个进程刚刚完成 exec() 时的页表 init ：


```c
page table 0x0000000087f6b000
 ..0: pte 0x0000000021fd9c01 pa 0x0000000087f67000
 .. ..0: pte 0x0000000021fd9801 pa 0x0000000087f66000
 .. .. ..0: pte 0x0000000021fda01b pa 0x0000000087f68000
 .. .. ..1: pte 0x0000000021fd9417 pa 0x0000000087f65000
 .. .. ..2: pte 0x0000000021fd9007 pa 0x0000000087f64000
 .. .. ..3: pte 0x0000000021fd8c17 pa 0x0000000087f63000
 ..255: pte 0x0000000021fda801 pa 0x0000000087f6a000
 .. ..511: pte 0x0000000021fda401 pa 0x0000000087f69000
 .. .. ..509: pte 0x0000000021fdcc13 pa 0x0000000087f73000
 .. .. ..510: pte 0x0000000021fdd007 pa 0x0000000087f74000
 .. .. ..511: pte 0x0000000020001c0b pa 0x0000000080007000
init: starting sh
```


第一行显示 的 vmprint 参数。之后，**每个 PTE 都有一行，包括引用树中更深层次的页表页面的 PTE**。每行 PTE 行都由数字 " …" 缩进，表示其 树中的深度。 每行 PTE 在其页表页面中显示 PTE 索引、pte 位和 从 PTE 中提取的物理地址。 **不要打印无效的 PTE。** 在上面的示例中， 顶级页表页具有条目 0 和 255 的映射。 下一个 条目 0 的 level down 仅映射了索引 0，并且底层 对于该索引，0 映射了条目 0、1 和 2。


您的代码发出的物理地址可能与上面显示的地址不同。条目数量和虚拟地址应相同。


一些提示：


- 你可以输入 vmprint() kernel/vm.c .
- 使用文件 kernel/riscv.h 末尾的宏 #define PA2PTE(pa) ((((uint64)pa) >> 12) << 10) #define PTE2PA(pte) (((pte) >> 10) << 12) #define PTE_FLAGS(pte) ((pte) & 0x3FF) #define PXSHIFT(level) (PGSHIFT+(9*(level))) #define PX(level, va) ((((uint64) (va)) >> PXSHIFT(level)) & PXMASK) AI写代码c运行123456789
- 该功能 freewalk 可能具有启发性（需要判断标志位） // Recursively free page-table pages. // All leaf mappings must already have been removed. void freewalk(pagetable_t pagetable) {  // there are 2^9 = 512 PTEs in a page table.  for(int i = 0; i < 512; i++){//只有一层遍历因为叶子mapping需要已经释放  pte_t pte = pagetable[i];  if((pte & PTE_V) && (pte & (PTE_R|PTE_W|PTE_X)) == 0){  // this PTE points to a lower-level page table.  uint64 child = PTE2PA(pte);  freewalk((pagetable_t)child);//开始递归的释放  pagetable[i] = 0;  } else if(pte & PTE_V){  //如果PTE_V位为0表示没有访问过不合法，出现panic  panic("freewalk: leaf");  }  }  kfree((void*)pagetable); } AI写代码c运行1234567891011121314151617181920
- 在 kernel/defs.h 中定义原型 vmprint ，以便 你可以从 exec.c 调用它。
- 在 **%p printf 调用**中使用以打印出完整的 64 位十六进制 PTE 和地址，如示例所示。


从文本中根据图 3-4 解释输出 vmprint 。第 0 页包含什么？第 2 页有什么？在用户模式下运行时，进程是否可以读取/写入第 1 页映射的内存？倒数第三页包含什么？


```c
..0: pte 0x0000000021fd9c01 pa 0x0000000087f67000
....0: pte 0x0000000021fd9801 pa 0x0000000087f66000
......0: pte 0x0000000021fda01b pa 0x0000000087f68000   ← 第 0 页：用户代码（_entry → main）
......1: pte 0x0000000021fd9417 pa 0x0000000087f65000   ← 第 1 页：用户栈（栈顶）
......2: pte 0x0000000021fd9007 pa 0x0000000087f64000   ← 第 2 页：trampoline（共享内核页）
...
..255: pte 0x0000000021fda801 pa 0x0000000087f6a000
....511: pte 0x0000000021fda401 pa 0x0000000087f69000
......511: pte 0x0000000020001c0b pa 0x0000000080007000  ← 倒数第 1 页（VA=0xffffff...ff000）
```


- 倒数第 1 页：`0x3ffffff000` → **trampoline**
- 倒数第 2 页：`0x3fffffe000` → **trapframe**
- 倒数第 3 页：`0x3fffffd000` → **通常未映射！(在我们的程序中是**USYSCALL页**)**


```c
已知：虚拟地址 va = 0x0000000080001234
目标：找到它对应的 PTE 和 物理地址 pa

步骤：
1. 从 va 提取各级索引：
   - vpn2 = (va >> 30) & 0x1ff   → 第一级索引
   - vpn1 = (va >> 21) & 0x1ff   → 第二级索引
   - vpn0 = (va >> 12) & 0x1ff   → 第三级索引

2. 从 pagetable_t（L1）开始：
   pte1 = pagetable[vpn2]
   → 如果无效，缺页
   → 否则，从中取出 L2 的物理地址 pa2 = PTE2PA(pte1)

3. 将 pa2 转为虚拟地址（因内核直接映射），得到 L2 表指针：
   pagetable_t l2 = (pagetable_t)pa2

4. 读 L2 表：
   pte2 = l2[vpn1]
   → 取出 L3 地址 pa3 = PTE2PA(pte2)

5. 读 L3 表：
   pte3 = ((pagetable_t)pa3)[vpn0]  ← 这就是最终 PTE！

6. 最终物理地址：
   pa = PTE2PA(pte3) | (va & 0xfff)
```


![在这里插入图片描述](/Blog/images/csdn/158006742/01.png)
 不可以使用`0x%016llx` 来格式化，只能%p来直接进行打印(因为xv6的printf里面没有这些有关对其等等格式的实现)


![在这里插入图片描述](/Blog/images/csdn/158006742/02.png)


![在这里插入图片描述](/Blog/images/csdn/158006742/03.png)


```c
static void
print_indent(int level)
{
  for (int i = 0; i < level + 1; i++)
  {
    printf(".. ");
  }
}

void vmprint(pagetable_t page, int level)
{
  if (level > 2)
    panic("there is fault PTE level");

  for (int i = 0; i < 512; i++)//每层PTE最多有512
  {
    pte_t pte = page[i]; // 获取pte
    if (pte & PTE_V)
    {                          // 仅仅处理有效页
      uint64 pa = PTE2PA(pte); // 根据PTE获取PA
      print_indent(level);
      printf("%d: pte 0x%p pa 0x%p\n", i, pte, pa);
      // 在 RISC-V 中，如果 PTE 没有 R/W/X 权限位，则它是下一级页表指针
      if ((pte & (PTE_R | PTE_W | PTE_X)) == 0)
      {
        vmprint((pagetable_t)pa, level + 1);
        //因为是下一级页表的指针，因此我们不可以用普通的uint来进行解释需要转换成指针
      }
    }
  }
}
```


```c
// Set up first user process.
void userinit(void)
{
  struct proc *p;

  p = allocproc();
  initproc = p;

  // allocate one user page and copy initcode's instructions
  // and data into it.
  uvmfirst(p->pagetable, initcode, sizeof(initcode));
  p->sz = PGSIZE;

  // prepare for the very first "return" from kernel to user.
  p->trapframe->epc = 0;     // user program counter
  p->trapframe->sp = PGSIZE; // user stack pointer

  safestrcpy(p->name, "initcode", sizeof(p->name));
  p->cwd = namei("/");

  p->state = RUNNABLE;
  printf("page table %p\n",p->pagetable);
  vmprint(p->pagetable,0);
  //因为我们需要在init:starting sh之前进行输出，这是第一个用户程序，因此在这里写

  release(&p->lock);
}
```


 🔥 

### 检测哪些页面已被访问


一些垃圾回收器（一种自动内存管理形式）**可以从有关已访问（读取或写入）哪些页面的信息中受益(PTE_A)**。在实验的这一部分中，您将向 xv6 添加一项新功能，该功能通过检查 RISC-V 页表中的访问位来检测此信息并将其报告给用户空间。每当 RISC-V 硬件页面步行器解决 TLB 未命中时，它都会在 PTE 中标记这些位。


你的工作是**实现 pgaccess() ，一个系统调用，报告哪些页面已被访问**。系统调用采用三个参数。首先，它**需要第一个用户页面的起始虚拟地址进行检查**。其次，**需要检查的页数**。最后，它将用户地址存储到缓冲区中，以将结果存储到位掩码（每页使用一位的数据结构，其中第一页对应于最低有效位）。如果 pgaccess 测试用例在运行 pgtbltest 时通过，您将获得实验室这部分的全部学分。


一些提示：


- 请阅读 pgaccess_test() 以 user/pgtlbtest.c 了解如何 pgaccess 使用。
- 首先在 中 kernel/sysproc.c 实现 sys_pgaccess() 。
- 您需要使用 argaddr() 和 argint() 解析参数。
- 对于输出位掩码，在内核中存储一个临时缓冲区并在填充正确的位后将其复制给用户（通过 copyout() ）会更容易。
- 可以对可扫描的页数设置上限。
- walk() in kernel/vm.c 对于找到正确的 PTE 非常有用。 walk()返回页表 pagetable 中 对应虚拟地址 va 的那个页表项（PTE）的地址，这样就可以直接读写对应的页表项的状态码    // Return the address of the PTE in page table pagetable // that corresponds to virtual address va. If alloc!=0, // create any required page-table pages. // 返回页表 pagetable 中 对应虚拟地址 va 的那个页表项（PTE）的地址，这样就可以直接读写对应的页表项的状态码 // The risc-v Sv39 scheme has three levels of page-table // pages. A page-table page contains 512 64-bit PTEs. // A 64-bit virtual address is split into five fields: // 39..63 -- must be zero. // 30..38 -- 9 bits of level-2 index. // 21..29 -- 9 bits of level-1 index. // 12..20 -- 9 bits of level-0 index. // 0..11 -- 12 bits of byte offset within the page. pte_t * walk(pagetable_t pagetable, uint64 va, int alloc) {//如果 alloc != 0，那么在遍历过程中，如果发现某一级页表缺失（未分配），就自动分配它  if (va >= MAXVA)  panic("walk");  for (int level = 2; level > 0; level--)  {  pte_t *pte = &pagetable[PX(level, va)];  if (*pte & PTE_V)  {  pagetable = (pagetable_t)PTE2PA(*pte);  }  else  {  if (!alloc || (pagetable = (pde_t *)kalloc()) == 0)  return 0;  memset(pagetable, 0, PGSIZE);  *pte = PA2PTE(pagetable) | PTE_V;  }  }  return &pagetable[PX(0, va)]; } AI写代码c运行1234567891011121314151617181920212223242526272829303132333435
  - `alloc == 0`：只查找，不分配（用于查询、检查是否已映射）
  - `alloc != 0`：查找 + 自动分配中间页表（用于 `mmap`、`exec`、`sbrk` 等需要新增映射的场景）


- 您需要在 kernel/riscv.h 中定义 PTE_A ，访问位。查阅 [RISC-V 特权架构手册](https://github.com/riscv/riscv-isa-manual/releases/download/Ratified-IMFDQC-and-Priv-v1.11/riscv-privileged-20190608.pdf)以确定其价值。
- 检查是否设置后请务必清除 PTE_A 。否则，将无法确定自上次 pgaccess() 调用以来是否访问了该页面（即，该位将永远设置）。
- vmprint() 调试页表可能会派上用场。


1. 系统调用 int sys_pgaccess(void) {  // lab pgtbl: your code here.  uint64 base, mask;  int len;  argaddr(0, &base);  argint(1, &len);  argaddr(2, &mask);  return pgaccess((void *)base, len, (void *)mask); } AI写代码c运行123456789101112
2. 实现对应的函数同时在defs.h处添加函数声明 int pgaccess(void *base, int len, void *mask) {  struct proc *p = myproc();  // 1.需要将内核里面的mask拷贝到用户区里面去，创建在内核里面的缓冲区暂存一下结果  uint64 mask_val = 0;  // 2.设置扫描页上限，64位mask code  if (len <= 0 || len > 64)  return -1;  for (int i = 0; i < 64; i++)  {  // 3.找到正确的PTE起始位置  uint64 va = (uint64)base + i * PGSIZE;  // 4.开始进行扫描PTE后面n页内PTE_A为1的页，将没有访问过的页对应的mask设置为0反之为1  pte_t *pte = walk(p->pagetable, va, 0); // 即使缺失也不需要进行分配  if (pte == 0) continue;// 页未映射，跳过（视为未访问）  if (*pte & PTE_A)  {  mask_val |= (1L << i); // 设置对应的mask码  *pte &= ~PTE_A; // 清空对应的A位  }  }  // 5.写回到用户空间中的mask处去  if (copyout(p->pagetable, (uint64)mask, (char *)&mask_val, sizeof(mask_val)) < 0)  {  return -1;  }  // 5.返回0表示成功  return 0; } AI写代码c运行1234567891011121314151617181920212223242526272829
3. 需要根据RISC-V的结构来天津对应的解释位——kernel/riscv.h 中定义 PTE_A #define PTE_A (1L << 6)// Accessed bit AI写代码c运行1 ![在这里插入图片描述](/Blog/images/csdn/158006742/04.png)
---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/158006742)。

<!-- imported-from-csdn:158006742 -->
