---
title: "MIT6.s081——lab2 系统调用的创建"
description: "文章浏览阅读656次，点赞17次，收藏8次。本文介绍了在xv6操作系统中添加系统调用和进行内核调试的方法。主要内容包括：1) 使用gdb调试xv6内核，包括设置断点、查看堆栈回溯和寄存器状态；2) 通过实验分析系统调用执行流程，包括从用户态到内核态的转换过程；3) 实现一个trace系统调用，用于跟踪指定系统调用的执行情况。文章详细展示了如何利用gd…"
date: 2026-02-12
tags: ["系统","Mit6.S081 2022版本","笔记"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":3}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/158006632"}
---
## Lab 2 
 System 
  Call


在本练习中，您将向 
 xv6 **
  添加一些新的系统调用，这将帮助您了解它们的工作原理，并让您了解 xv6 内核的一些内部结构。您将在以后的实验室中添加更多系统调用


### 使用 gdb Debug


在许多情况下，print 语句足以调试内核，但有时能够单步执行某些汇编代码或检查堆栈上的变量会很有帮助。


如何进行内核的gdb调试：


1. 在文件夹内make qemu-gdb来获取对应的远程端口 ![在这里插入图片描述](/Blog/images/csdn/158006632/01.png)
2. 新建终端运行riscv64-elf-gdb kernel/kernel(不一定可以使用默认的gdb，因为架构变了导致可能不行)，进入之后需要使用target remote 来连接qemu里面的gdb ![在这里插入图片描述](/Blog/images/csdn/158006632/02.png) 假设您想在每次内核从 syscall kernel/syscall.c 现在，假设您想中断 user/ls.c 中的 ls 函数。然后，您需要在步骤 6 中运行 file user/_ls ，因为这是该函数所在的二进制文件的名称。您还将在步骤 7 中运行 b ls 。
  1. 在 gdb 提示符内： file kernel/kernel （这是一个包含所有内核代码的二进制文件）
  2. 在 gdb 提示符中： b syscall
  3. 点击 c 。此时，您将开始击中上面的断点
  4. 继续点击 c 以查看 kernell 在哪里击中函数 syscall 。您将了解第一个窗口中的输出是如何进行的。


```c
(gdb) b syscall
Breakpoint 1 at 0x80002142: file kernel/syscall.c, line 243.
(gdb) c
Continuing.
[Switching to Thread 1.2]

Thread 2 hit Breakpoint 1, syscall () at kernel/syscall.c:243
243     {
(gdb) layout src
(gdb) backtrace
```


该 layout 命令将窗口一分为二，显示 gdb 在源代码中的位置。打印 backtrace 出堆栈回溯。


![在这里插入图片描述](/Blog/images/csdn/158006632/03.png)


layout src会出现上面的这部部分内容，会显示这个断点在源代码的位置，后面的是执行堆栈回溯(堆栈回溯是程序崩溃或中断时，调试器记录的函数调用链)


**每一行代表一个函数调用，从最底层（最先被调用）到最上层（当前执行点）**


| 编号 | 内容 | 含义 |
| --- | --- | --- |
| #0 | syscall () at kernel/syscall.c:133 | 当前正在执行 syscall() 函数，位于 kernel/syscall.c 文件第 133 行。这是当前执行点。 |
| #1 | 0x0000000080001da4 in usertrap () at kernel/trap.c:67 | 上一层调用了 usertrap() 函数，地址是 0x80001da4，在 trap.c 第 67 行。 |
| #2 | 0x000000000000001e in ?? () | 更上层调用未知（可能是用户程序），地址为 0x1e，但无法解析函数名（??） |


注意：`??` 表示调试器找不到符号表或该地址不属于已知函数，常见于用户态代码或未加载符号的区域


这就可以推出来`[用户程序] → usertrap() → syscall()` 这样的一个调用链路


gdb_slides.pdf


🔥
1. 查看回溯输出，哪个函数调用了 syscall ？ [用户程序] → usertrap() → syscall()，这个见上。因此这个usertrap()调用了syscall()系统调用
2. 键入 n 几次以步进 struct proc *p = myproc();一旦超过此语句，键入p /x *p ，它会用16进制打印当前进程的proc struct（见 kernel/proc.h） p->trapframe->a7 的值是什么？ ![在这里插入图片描述](/Blog/images/csdn/158006632/04.png) 这里可以知道trapframe的地址是0x87f74000，然后后面看下图a7就是要+168(0xa8),因此直接去print(0x87f740a8)的地址即可，因此使用x/gx 0x87f740a8来查看对应地址的值 ![在这里插入图片描述](/Blog/images/csdn/158006632/05.png)
3. CPU 之前处于什么模式？


![在这里插入图片描述](/Blog/images/csdn/158006632/06.png)

可以使用这个来打印某些特殊
 寄存器 **
 (比如sstatus)的值p /x $sstatus，具体值的含义需要阅读对应的riscv寄存器的意义的文档

![在这里插入图片描述](/Blog/images/csdn/158006632/07.png)


1. 追踪内核panic： 要追踪内核页面错误 panic 的来源，请搜索您刚刚在文件 kernel/kernel.asm 中看到的 panic 打印的 sepc 值，其中包含 编译后的内核 ![在这里插入图片描述](/Blog/images/csdn/158006632/08.png) 然后我们进行qemu的重启gdb，使用b* 0x000000008000207e的方式来打断点之后转到layout asm汇编模式，然后输入c继续，结果如下 ![在这里插入图片描述](/Blog/images/csdn/158006632/09.png) **这一行代码和138行的num=*(int*)0是同意思的** ![在这里插入图片描述](/Blog/images/csdn/158006632/10.png) 可以看到左边的虚拟地址的0的位置是没有被映射到实际地址上去的因此就会出现panic 用户空间从 `0x0000000000000000` 开始，但内核只映射了 `0x8000000000000000` 以上（或特定区域），地址 0 是 **未映射的虚拟地址** **QEMU 默认不会把 CSR（Control and Status Registers）暴露给 GDB**，除非你启用了 **GDB stub 对 CSR 的支持，因此不能使用info register来查看scause寄存器，需要**使用**`p /x $scause`** ![在这里插入图片描述](/Blog/images/csdn/158006632/11.png) **查看 RISC-V 官方文档中的 `scause` 编码表：** **值****异常类型**0Instruction Page Fault（指令页错误）1Instruction Access Fault（指令访问故障）2Illegal Instruction（非法指令）3Breakpoint（断点）4Load Page Fault（加载页错误）5Load Access Fault（加载访问故障）6Store/AMO Page Fault（存储页错误）7Store/AMO Access Fault（存储访问故障）8Environment Call from U-mode（从用户模式调用环境）→ **系统调用！**9Environment Call from S-mode（从监督模式调用环境）10Reserved11Machine Interrupt（机器中断）**因此表示这是一个系统调用**


![在这里插入图片描述](/Blog/images/csdn/158006632/12.png)


在 GDB 中，`p` 是 `print` 的缩写。`$3 = 8` 和 `$4 = 8` 是两个之前的打印结果，不是当前命令的输出。`p->name` 是当前进程（`p`）的名称字段，它的值是字符串：`"initcode\000\000\000\000\000\000"` ，这里的 `\000` 表示 **ASCII 空字符（null byte）**，即 `'\0'` 因为GDB显示的是一个缓冲区，因此后面才会有多个\0的存在


🔥
### Trace系统调用


在此作业中，你将添加一个系统调用跟踪功能，该功能可能会在调试以后的实验室时有所帮助。您将创建一个新的 trace 系统调用来控制跟踪。它应该接受一个参数，一个整数“掩码”，其位指定要跟踪的系统调用。例如，要跟踪 fork 系统调用，程序调用 trace(1 << SYS_fork) ，其中 SYS_fork 是来自 kernel/syscall.h 的系统调用号。如果系统调用的编号在掩码中设置，则必须修改 xv6 内核以在每个系统调用即将返回时打印出一行。该行应包含进程 ID、系统调用的名称和返回值;您不需要打印系统调用参数。系统调用应 trace 启用对调用它的进程及其随后分叉的任何子进程的跟踪，但不应影响其他进程。


完成后，您应该会看到如下所示的输出：


```bash
$ trace 32 grep hello README
3: syscall read -> 1023
3: syscall read -> 966
3: syscall read -> 70
3: syscall read -> 0
$

$ trace 2147483647 grep hello README
4: syscall trace -> 0
4: syscall exec -> 3
4: syscall open -> 3
4: syscall read -> 1023
4: syscall read -> 966
4: syscall read -> 70
4: syscall read -> 0
4: syscall close -> 0
$

$ grep hello README
$

$ trace 2 usertests forkforkfork
usertests starting
test forkforkfork: 407: syscall fork -> 408
408: syscall fork -> 409
409: syscall fork -> 410
410: syscall fork -> 411
409: syscall fork -> 412
410: syscall fork -> 413
409: syscall fork -> 414
411: syscall fork -> 415
...
$
```


- `trace` 的第一个参数是一个 **位掩码（bitmask）**，每一位对应一个系统调用编号。如果某一位是 1，就追踪对应的 syscall。read对应的就是5号，因此就是11111 = 32
- 2147483647表示的是01111111111111111111111111111111，即**追踪所有系统调用**
- 没有使用 `trace`，所以 **没有任何 syscall 被追踪**，自然没有输出
- `2` 是 `1 << SYS_fork`（假设 `SYS_fork = 1`，则 `1<<1 = 2`）所以只追踪 `fork` 系统调用。注意：不仅追踪父进程的 `fork`，还追踪 **所有子进程** 的 `fork`！


一些提示：


- 添加到 $U/_trace Makefile 中的 UPROGS
- 运行， **make qemu** 您将看到编译器无法编译 user/trace.c ，因为系统调用的用户空间存根尚不存在：添加系统调用的原型 user/user.h ，将存根添加到 user/usys.pl ，将系统调用编号添加到 kernel/syscall.h 。Makefile 调用 perl 脚本 user/usys.pl ，该脚本生成 user/usys.S 实际的系统调用存根，这些存根使用 RISC-V ecall 指令转换为内核。修复编译问题后，运行 **trace 32 grep hello README** ;它会失败 因为你还没有在内核中实现系统调用 还。
- 添加一个 sys_trace() ，**通过在 proc 结构中的新变量中记住其参数来实现新系统调用**（参见 kernel/proc.h ）。 kernel/sysproc.c **从用户空间检索系统调用参数的函数**在 中 kernel/syscall.c ，您可以在中 kernel/sysproc.c 看到它们的使用示例。
- 修改 fork() （请参阅 kernel/proc.c ）以将跟踪掩码从父进程复制到子进程。
- 修改 中的 syscall() kernel/syscall.c 函数以打印跟踪输出。**您需要添加一个系统调用名称数组以进行索引。**
- 如果测试用例在直接在 qemu 中运行时通过，但在使用 make grade 运行测试时出现超时，请尝试在 Athena 上测试您的实现。对于本地计算机来说，本实验室中的某些测试可能计算量太大（尤其是在使用 WSL） 时。


```bash
[用户程序 trace.c]
       ↓ 调用 trace(32)
[用户存根 trace() in usys.S]
       ↓ 执行 ecall
[CPU 切换到内核]
       ↓
[kernel/syscall.c: syscall()]
       ↓ 查 syscall 编号 = SYS_trace (22)
       ↓ 调用 sys_trace()
[kernel/sysproc.c: sys_trace()]
       ↓ 设置 myproc()->trace_mask = 32
       ↓ 返回 0
[用户程序继续]
       ↓ exec(grep...)
[之后每次 syscall]
       ↓ syscall() 检查 trace_mask
       ↓ 如果匹配，打印日志
```


因为系统调用是用汇编写的，因此需要修改pl脚本来生成usys.S的汇编代码


```bash
.global trace
trace:
    li a7, SYS_trace   # 把系统调用号放进 a7
    ecall              # 触发系统调用
    ret                # 返回（结果在 a0 中）
```


**存根（stub）** —— 一个轻量级代理，负责发起系统调用


用户程序trace，但是后续需要完成里面的trace的系统调用：


```c
#include "kernel/types.h"
#include "user/user.h"

int main(int argc, char *argv[])
{
    if (argc < 3) {
        fprintf(2, "Usage: trace <mask> <command> [args...]\n");
        exit(1);
    }

    int bitcode = atoi(argv[1]);//将字符串转换成一个int的整数


    if(trace(bitcode)<0){
        fprintf(2, "trace: failed to set mask\n");
        exit(1);
    }//这个系统调用需要自己去写

    exec(argv[2],argv + 2);//执行后面的程序

    fprintf(2, "trace: exec failed\n");
    exit(1);

}
```


系统调用的代码(sysproc.c)：


```c
uint64
sys_trace(void){
  int bitcode;
  argint(0,&bitcode);//读取用户传来的第一个整数参数
  myproc()->bitcode = bitcode;//这里需要更新struct proc添加有关trace的字段
  return 0;
}
```


而且还需要进行字段添加和初始化设置：


```c
// Look in the process table for an UNUSED proc.
// If found, initialize state required to run in the kernel,
// and return with p->lock held.
// If there are no free procs, or a memory allocation fails, return 0.
static struct proc*
allocproc(void)
{
  struct proc *p;

  for(p = proc; p < &proc[NPROC]; p++) {
    acquire(&p->lock);
    if(p->state == UNUSED) {
      goto found;
    } else {
      release(&p->lock);
    }
  }
  return 0;

found:
  p->pid = allocpid();
  p->state = USED;
  p->bitcode = 0;//初始化trace为不追踪任何系统调用

  // Allocate a trapframe page.
  if((p->trapframe = (struct trapframe *)kalloc()) == 0){
    freeproc(p);
    release(&p->lock);
    return 0;
  }

  // An empty user page table.
  p->pagetable = proc_pagetable(p);
  if(p->pagetable == 0){
    freeproc(p);
    release(&p->lock);
    return 0;
  }

  // Set up new context to start executing at forkret,
  // which returns to user space.
  memset(&p->context, 0, sizeof(p->context));
  p->context.ra = (uint64)forkret;
  p->context.sp = p->kstack + PGSIZE;

  return p;
}
```


```c
struct proc {
  struct spinlock lock;

  // p->lock must be held when using these:
  enum procstate state;        // Process state
  void *chan;                  // If non-zero, sleeping on chan
  int killed;                  // If non-zero, have been killed
  int xstate;                  // Exit status to be returned to parent's wait
  int pid;                     // Process ID

  // wait_lock must be held when using this:
  struct proc *parent;         // Parent process

  // these are private to the process, so p->lock need not be held.
  uint64 kstack;               // Virtual address of kernel stack
  uint64 sz;                   // Size of process memory (bytes)
  pagetable_t pagetable;       // User page table
  struct trapframe *trapframe; // data page for trampoline.S
  struct context context;      // swtch() here to run process
  struct file *ofile[NOFILE];  // Open files
  struct inode *cwd;           // Current directory
  char name[16];               // Process name (debugging)
  int bitcode;   //这个是trace的系统调用的配置码，默认为0
};
```


在syscall函数中进行补充：因为需要的是print的位置就是系统调用的地方


这里的num表示的是系统调用对应的编号，后续p->bitcode & (1 << num)就是来检验当前调用需不需要进行打印的


```c
void
syscall(void)
{
  int num;
  struct proc *p = myproc();

  num = p->trapframe->a7;
  //num = *(int* )0;
  if(num > 0 && num < NELEM(syscalls) && syscalls[num]) {
    // Use num to lookup the system call function for num, call it,
    // and store its return value in p->trapframe->a0
    p->trapframe->a0 = syscalls[num]();
    //执行系统调用函数，并把它的返回值放回用户程序能“看到”的地方（即寄存器 a0）。
    if (p->bitcode & (1 << num)) {
      printf("%d: syscall %s -> %d\n", p->pid, syscall_names[num], p->trapframe->a0);
    }
  } else {
    printf("%d %s: unknown sys call %d\n",
            p->pid, p->name, num);
    p->trapframe->a0 = -1;
  }
}
```


**`syscalls[num]()` 是在内核中调用了一个普通的 C 函数，这个函数就是系统调用的具体实现**


```c
// An array mapping syscall numbers from syscall.h
// to the function that handles the system call.
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
```


**为什么 `syscalls[num]()` 可以执行系统调用？**


**因为它是在内核中，根据用户传来的系统调用编号（num），查表找到对应的 C 函数（如 `sys_read`），然后正常调用它。**而“进入内核”这件事，是由 CPU 的 `ecall` 指令完成的，**不是由这行代码完成的**。


```c
if (num == SYS_read) sys_read();
else if (num == SYS_write) sys_write();
else if (num == SYS_fork) sys_fork();
...类似这种作用
```


🔥
```c
graph TD
    A[用户程序: grep] -->|1. 调用 read(fd, buf, n)| B[libc 存根函数]
    B -->|2. 设置 a0=fd, a1=buf, a2=n<br/>a7=5 (SYS_read)<br/>执行 ecall| C[CPU 硬件 trap]
    C -->|3. 自动跳转到内核<br/>保存寄存器到 trapframe| D[kernel/trap.c: usertrap()]
    D -->|4. 判断是 syscall| E[kernel/syscall.c: syscall()]
    E -->|5. num = p->trapframe->a7 = 5| F{查表 syscalls[5]}
    F -->|6. 调用 sys_read()| G[kernel/sysfile.c: sys_read()]
    G -->|7. 从 trapframe 取参数<br/>执行实际读操作| H[返回字节数, 如 1023]
    H -->|8. p->trapframe->a0 = 1023| I[内核返回用户态]
    I -->|9. CPU 恢复寄存器<br/>继续执行 ecall 下一条指令| J[用户程序拿到返回值 n=1023]
```


1. read()它是由 **C 标准库（或 xv6 的用户库）提供的“存根”（stub），每次调用这个函数实际上就是去存根里面调用对应的汇编代码——**调用 `read()` ≈ 执行 `ecall`！
2. **`ecall` 是硬件指令 —— 真正的“入口”，**作用是：**主动触发一个“异常”（exception）** **进入内核不是靠“函数调用”，而是靠 CPU 硬件机制！**
  - CPU 会：
    - 停止用户程序
    - 跳转到内核设置好的处理地址（`stvec` 寄存器）
    - 切换到内核态（特权模式）
    - 保存所有寄存器（包括 a0~a7）到内存（即 `trapframe`）


3. xv6 的 `usertrap()` 函数检测到这是一个系统调用（`scause == 8`），于是调用 `syscall()` 检测到a7里面有东西，然后开始**查表调用 —— “分发器”模式(**(*syscalls[])(void)**)**


🔥
### Sysinfo系统调用


在此分配中，您将添加一个系统调用 ， s**ysinfo 用于收集有关正在运行系统的信息**。系统调用采用一个参数：指向 a struct sysinfo 的指针（参见 kernel/sysinfo.h ）。内核应该填写这个结构的字段：该 freemem 字段应设置为可用内存的字节数，该 nproc 字段应设置为不是 UNUSED 的进程 state 数。我们提供测试程序 sysinfotest ;如果它打印“sysinfotest： OK”，则通过此分配。


一些提示：


- 添加到 $U/_sysinfotest Makefile 中的 UPROGS
- 跑 **make qemu** ; user/sysinfotest.c 将无法编译。添加系统调用 sysinfo，按照与上一个分配相同的步骤进行作。要声明 sysinfo（） in user/user.h 的原型，您需要预先声明 struct sysinfo ： struct sysinfo;  int sysinfo(struct sysinfo *); AI写代码c运行12 修复编译问题后，运行 **sysinfotest** ;它会失败，因为你没有 在内核中实现了系统调用
- sysinfo 需要将 a struct sysinfo 复制回用户空间;有关如何使用 执行此作的示例，请参阅 sys_fstat() （ kernel/sysfile.c ） 和 filestat() （ kernel/file.c ）。 copyout()
- 要收集可用内存量，请将函数 kernel/kalloc.c 添加到
- 要收集进程数，请将函数 kernel/proc.c 添加到


结构体：


```c
//该 freemem 字段应设置为可用内存的字节数，该 nproc 字段应设置为不是 UNUSED 的进程 state 数
// kernel/sysinfo.h
struct sysinfo {
  uint64 freemem;   // available memory in bytes
  uint16 nproc;     // number of processes
};//定义sysinfo结构
```


创建系统调用：


```c
#define SYS_sysinfo 23   //创建新的系统调用
```


```c
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
  //把sizeof(info)字节的数据从内核地址(char *)&info复制到用户虚拟地址addr（使用指定的页表 pagetable）
    return -1;

  return 0;
}//内核中实现sysinfo的系统调用
```


🔥
sysinfo 需要将 a struct sysinfo 复制回用户空间;有关如何使用 执行此作的示例，请参阅 sys_fstat() （ kernel/sysfile.c ） 和 filestat() （ kernel/file.c ）


```c
// Get metadata(对应的就是stat st) about file f.
// addr is a user virtual address, pointing to a struct stat.
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
```


可以明显发现，addr是用户的虚拟地址，而对应的用户空间和内核空间有关的就是copyout函数部分了


```c
// Copy from kernel to user.
// Copy len bytes from src to virtual address dstva in a given page table.
// Return 0 on success, -1 on error.
//把 len 字节的数据从内核地址 src 复制到用户虚拟地址 dstva（使用指定的页表 pagetable）
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
}//将数据从内核空间安全地复制到用户空间
```


对应配套的函数来获取空余的mem大小和已经激活的进程数量：


```c
int 
getFreeMem(void){
  struct run *r;
  int count = 0;

  acquire(&kmem.lock);
  r = kmem.freelist;//获取剩余页数
  while (r) {
    count++;//计算剩余页数
    r = r->next;
  }
  release(&kmem.lock);

  return count * PGSIZE;//返回对应字节数
}
```


**这里是页表的基础知识，这个时候的实现可能有一些问题（有点难）**


```c
struct proc proc[NPROC];//自带的用来装proc进程的数组

int 
count_active_processes(void){
  int cnt = 0;
  for (struct proc *p = proc; p < &proc[NPROC]; p++) {
    if (p->state != UNUSED)
      cnt++;//遍历出来不是UNUSED的proc进程
  }
  return cnt;
}
```


注册系统调用：


```c
//注册系统调用
extern uint64 sys_sysinfo(void);

static uint64 (*syscalls[])(void) = {
  [SYS_sysinfo]    sys_sysinfo,//前面是宏后面是对应的函数名
  // ... 其他已有系统调用
};
```


配置为系统调用供用户程序使用：


```c
//user/user.h
struct sysinfo;
int sysinfo(struct sysinfo *);
```


为CPU编写对应的调用汇编代码：


```c
//user/usys.S
.globl sysinfo
sysinfo:
    li a7, 23      # 必须是 SYS_sysinfo 的实际数值！
    ecall
    ret
```


配套的user程序：


```c
#include "kernel/types.h"
#include "kernel/riscv.h"
#include "kernel/sysinfo.h"
#include "user/user.h"

void
sinfo(struct sysinfo *info) {
  if (sysinfo(info) < 0) {
    printf("FAIL: sysinfo failed");
    exit(1);
  }
}

//
// use sbrk() to count how many free physical memory pages there are.
//
int
countfree()
{
  uint64 sz0 = (uint64)sbrk(0);
  struct sysinfo info;
  int n = 0;

  while(1){
    if((uint64)sbrk(PGSIZE) == 0xffffffffffffffff){
      break;
    }
    n += PGSIZE;
  }
  sinfo(&info);
  if (info.freemem != 0) {
    printf("FAIL: there is no free mem, but sysinfo.freemem=%d\n",
      info.freemem);
    exit(1);
  }
  sbrk(-((uint64)sbrk(0) - sz0));
  return n;
}

void
testmem() {
  struct sysinfo info;
  uint64 n = countfree();

  sinfo(&info);

  if (info.freemem!= n) {
    printf("FAIL: free mem %d (bytes) instead of %d\n", info.freemem, n);
    exit(1);
  }

  if((uint64)sbrk(PGSIZE) == 0xffffffffffffffff){
    printf("sbrk failed");
    exit(1);
  }

  sinfo(&info);

  if (info.freemem != n-PGSIZE) {
    printf("FAIL: free mem %d (bytes) instead of %d\n", n-PGSIZE, info.freemem);
    exit(1);
  }

  if((uint64)sbrk(-PGSIZE) == 0xffffffffffffffff){
    printf("sbrk failed");
    exit(1);
  }

  sinfo(&info);

  if (info.freemem != n) {
    printf("FAIL: free mem %d (bytes) instead of %d\n", n, info.freemem);
    exit(1);
  }
}

void
testcall() {
  struct sysinfo info;

  if (sysinfo(&info) < 0) {
    printf("FAIL: sysinfo failed\n");
    exit(1);
  }

  if (sysinfo((struct sysinfo *) 0xeaeb0b5b00002f5e) !=  0xffffffffffffffff) {
    printf("FAIL: sysinfo succeeded with bad argument\n");
    exit(1);
  }
}

void testproc() {
  struct sysinfo info;
  uint64 nproc;
  int status;
  int pid;

  sinfo(&info);
  nproc = info.nproc;

  pid = fork();
  if(pid < 0){
    printf("sysinfotest: fork failed\n");
    exit(1);
  }
  if(pid == 0){
    sinfo(&info);
    if(info.nproc != nproc+1) {
      printf("sysinfotest: FAIL nproc is %d instead of %d\n", info.nproc, nproc+1);
      exit(1);
    }
    exit(0);
  }
  wait(&status);
  sinfo(&info);
  if(info.nproc != nproc) {
      printf("sysinfotest: FAIL nproc is %d instead of %d\n", info.nproc, nproc);
      exit(1);
  }
}

void testbad() {
  int pid = fork();
  int xstatus;

  if(pid < 0){
    printf("sysinfotest: fork failed\n");
    exit(1);
  }
  if(pid == 0){
      sinfo(0x0);
      exit(0);
  }
  wait(&xstatus);
  if(xstatus == -1)  // kernel killed child?
    exit(0);
  else {
    printf("sysinfotest: testbad succeeded %d\n", xstatus);
    exit(xstatus);
  }
}

int
main(int argc, char *argv[])
{
  printf("sysinfotest: start\n");
  testcall();
  testmem();
  testproc();
  printf("sysinfotest: OK\n");
  exit(0);
}
```


```c
定义 struct sysinfo
        ↓
分配 SYS_sysinfo 编号
        ↓
实现 sys_sysinfo() + 辅助函数
        ↓
注册系统调用（syscall.c）
        ↓
暴露用户接口（user.h + usys.pl）
        ↓
编写测试程序 + 加入 Makefile
        ↓
make clean && make && 测试
```
---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/158006632)。

<!-- imported-from-csdn:158006632 -->
