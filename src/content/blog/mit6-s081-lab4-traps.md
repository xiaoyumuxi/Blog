---
title: "MIT6.s081——lab4 trap调用实现用户态和内核态的切换"
description: "MIT 6.S081 Lab 4：RISC-V 调用约定、回溯与用户级定时器。"
date: 2026-02-13
tags: ["系统","Mit6.S081 2022版本","笔记"]
draft: false
featured: false
sample: false
art: code
series: {"name":"Mit6.S081 2022版本","slug":"mit6-s081-2022","order":5}
source: {"platform":"CSDN","url":"https://blog.csdn.net/fancyfor/article/details/158006798"}
---
🔥 

### RISC-V 原理


了解一点很重要 RISC-V 组件，您在 6.1910 （6.004） 中接触过。有一个文件 user/call.c 在 
 XV6 **
  存储库中。 **make fs.img** 编译它 并且还在 user/call.asm .阅读 call.asm 中函数 g、f 和 main 的代码。


```c
#include "kernel/param.h"
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

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


RISC-V 的使用说明书在[参考页面](https://pdos.csail.mit.edu/6.S081/2022/reference.html)上。 以下是您应该回答的一些问题（将答案
 存储 **
 在 文件 answers-traps.txt）：


[call.asm](https://www.notion.so/call-asm-2adb2af65af8815eb4c3cfd95836fb14?pvs=21)


- 哪些寄存器包含函数的参数？**哪个寄存器在 main 对 `printf` 的调用中传递第一个参数？**


**a1，a2…**


**a0传递的是格式字符串，a1对应f(8)+1的结果，a2对应13**


```c
printf("%d %d\n", f(8)+1, 13);
2c:	4635                	li	a2,13
2e:	45b1                	li	a1,12
30:	00000517          	auipc	a0,0x0
34:	7e050513          	addi	a0,a0,2016 # 810 <malloc+0xfc>
38:	00000097          	auipc	ra,0x0
3c:	620080e7          	jalr	1568(ra) # 658 <printf>
```


- main 的汇编代码中对函数 f 的调用在哪里？哪里 g 有调用


**没有对f和g的调用，而是之间生成了结果**


```c
int g(int x) {
   0:	1141                	addi	sp,sp,-16
   2:	e406                	sd	ra,8(sp)
   4:	e022                	sd	s0,0(sp)
   6:	0800                	addi	s0,sp,16
  return x+3;
}
   8:	250d                	addiw	a0,a0,3
   a:	60a2                	ld	ra,8(sp)
   c:	6402                	ld	s0,0(sp)
   e:	0141                	addi	sp,sp,16
  10:	8082                	ret

0000000000000012 <f>:

int f(int x) {
  12:	1141                	addi	sp,sp,-16
  14:	e406                	sd	ra,8(sp)
  16:	e022                	sd	s0,0(sp)
  18:	0800                	addi	s0,sp,16
  return g(x);
}
  1a:	250d                	addiw	a0,a0,3
  1c:	60a2                	ld	ra,8(sp)
  1e:	6402                	ld	s0,0(sp)
  20:	0141                	addi	sp,sp,16
  22:	8082                	ret
```


（提示：该 
 编译器 **
 可以内联函数，需要取消优化）


- 该功能 printf 位于哪个地址？ **3c: 620080e7 jalr 1568(ra) *# 658 ***


```c
void
printf(const char *fmt, ...)
{
 658:	711d                	addi	sp,sp,-96
 65a:	ec06                	sd	ra,24(sp)
 65c:	e822                	sd	s0,16(sp)
 65e:	1000                	addi	s0,sp,32
 660:	e40c                	sd	a1,8(s0)
 662:	e810                	sd	a2,16(s0)
 664:	ec14                	sd	a3,24(s0)
 666:	f018                	sd	a4,32(s0)
 668:	f41c                	sd	a5,40(s0)
 66a:	03043823          	sd	a6,48(s0)
 66e:	03143c23          	sd	a7,56(s0)
  va_list ap;

  va_start(ap, fmt);
 672:	00840613          	addi	a2,s0,8
 676:	fec43423          	sd	a2,-24(s0)
  vprintf(1, fmt, ap);
 67a:	85aa                	mv	a1,a0
 67c:	4505                	li	a0,1
 67e:	00000097          	auipc	ra,0x0
 682:	dde080e7          	jalr	-546(ra) # 45c <vprintf>
}
 686:	60e2                	ld	ra,24(sp)
 688:	6442                	ld	s0,16(sp)
 68a:	6125                	addi	sp,sp,96
 68c:	8082                	ret
```


- 寄存器 ra 中 jalr printf in main 之后的值是什么？


**`printf` 返回后应继续执行的下一条指令的地址40**


运行以下代码:


```c
unsigned i = 0x00646c72;
printf（“H%x Wo%s”， 57616， &i）;
```


- 输出是什么？ 这是一个将字节映射到字符的 [ASCII 表](https://www.asciitable.com/)


输出取决于 RISC-V 是小端的这一事实


57616=0xe110，i = 0x00646c72


| 地址 | 字节 |
| --- | --- |
| &i+0 | 0x72 → ‘r’ |
| &i+1 | 0x6c → ‘l’ |
| &i+2 | 0x64 → ‘d’ |
| &i+3 | 0x00 → ‘\0’ |


%x输出16进制的e110，%s输出rld


**因此最后的输出是He110 World**


![在这里插入图片描述](/Blog/images/csdn/158006798/01.png)


- 如果 RISC-V 是大端，您会将 `i` 设置为什么以产生相同的输出？ 你需要改变吗 `57616` 转换为不同的值？[下面是小端和大端的描述](http://www.webopedia.com/TERM/b/big_endian.html) 和 [一个更异想天开的描述](https://www.rfc-editor.org/ien/ien137.txt) **人类写法**：从左到右写 “2 0 2 5” **小端存储**：计算机把它拆成字节后，**把个位部分放前面**（就像你从右往左念：“5、2、0、2” 存进盒子），有点类似中国古代的从右到左的写法   **地址****字节**&i+00x00 → ‘\0’&i+10x64 → ‘d’&i+20x6c → ‘l’&i+30x72 → ‘r’**除了网络协议和某些文件格式，日常编程几乎只接触小端** 网络协议都是大端，因此我们还是不可以抛弃大端模式的 **大端模式下的输出会只有一个He110 Wo，后面就没了** 因为printf函数是只认小端模式的
- 在下面的代码中， `'y='`后会打印什么？ （注意：答案不是特定值。 为什么 会发生这种情况吗？  printf（“x=%d y=%d”， 3）; AI写代码c运行1 **`'y='` 后会打印一个随机值（或任意值），具体取决于运行时栈上的内容** void printf(const char *fmt, ...) {  658: 711d addi sp,sp,-96  65a: ec06 sd ra,24(sp)  65c: e822 sd s0,16(sp)  65e: 1000 addi s0,sp,32  660: e40c sd a1,8(s0)  662: e810 sd a2,16(s0)  664: ec14 sd a3,24(s0)  666: f018 sd a4,32(s0)  668: f41c sd a5,40(s0)  66a: 03043823 sd a6,48(s0)  66e: 03143c23 sd a7,56(s0) AI写代码c运行1234567891011121314 **662:e810 sd a2,16(s0)因此在栈s0+16的处的脏值被打印**


 🔥 

### 回溯backtrace


在调试时，通常很有用的是能够获得一个“回溯”（backtrace）：即从错误发生点向上，调用栈中所有函数调用的列表。**为了支持回溯功能，编译器会生成机器代码，为当前调用链中的每个函数在栈上维护一个对应的栈帧（stack frame）。**每个栈帧包含返回地址和一个指向调用者栈帧的“帧指针”（frame pointer）。寄存器 `s0` 包含指向当前栈帧的指针（实际上它指向栈上保存的返回地址的地址再加 8）。你的回溯函数应使用这些帧指针遍历调用栈，并打印出每个栈帧中保存的返回地址。


---


**实现要求：**


在 `kernel/printf.c` 中实现一个 `backtrace()` 函数。在 `sys_sleep` 函数中插入对该函数的调用，然后运行 `bttest`（该程序会调用 `sys_sleep`）。你的输出应该是一系列返回地址，格式如下（但具体数值可能不同）：


```
backtrace:
0x0000000080002cda
0x0000000080002bb6
0x0000000080002898
```


运行完 `btest` 后退出 QEMU。在终端窗口中运行命令：


```bash
addr2line -e kernel/kernel (或 riscv64-unknown-elf-addr2line -e kernel/kernel)
```


然后将你回溯输出中的地址复制粘贴进去，例如：


```bash
$ addr2line -e kernel/kernel
0x0000000080002de2
0x0000000080002f4a
0x0000000080002bfc
Ctrl-D
```


你应该看到
 类 **
 似如下的输出：


```
kernel/sysproc.c:74
kernel/syscall.c:224
kernel/trap.c:85
```


---


这个任务的目标是实现一个能打印调用栈的 `backtrace()` 函数，帮助你在内核中进行调试。


一些提示：


- 添加 backtrace() 原型， kernel/defs.h 以便可以在backtrace中sys_sleep调用
- GCC 编译器存储当前 executing 函数注册 s0 。添加以下功能至kernel/riscv.h ： static inline uint64 r_fp() {  uint64 x;  asm volatile("mv %0, s0" : "=r" (x) );  return x; } AI写代码c运行1234567 并调用此函数 backtrace 以读取当前帧指针。 r_fp() 使用[内联汇编](https://gcc.gnu.org/onlinedocs/gcc/Using-Assembly-Language-with-C.html)来读取 s0 .
- 这些 [讲义](https://pdos.csail.mit.edu/6.1810/2022/lec/l-riscv.txt)有堆栈框架布局的图片。请注意， 返回地址位于距 stackframe，并且**保存的帧指针位于帧指针的固定偏移量 （-16） 处** ![在这里插入图片描述](/Blog/images/csdn/158006798/02.png) 高地址 +------------------+ ← sp 初始值（调用前） | ... | +------------------+ ← 调用后，sp -= 16 | 保存的 ra | ← sp + 8 ← fp + 8 +------------------+ | 保存的 s0 | ← sp + 0 ← fp (错了！！！！) +------------------+ ← sp（当前） | 局部变量... | （更低地址） 低地址 AI写代码java运行12345678910
- backtrace() 需要一种方法来认识到这一点 它已经看到了最后一个堆栈帧，应该停止。 一个有用的事实是，**为每个内核分配的内存 stack 由单个页面对齐页面组成， 以便给定堆栈的所有堆栈帧 在同一页面上**。 您可以使用 PGROUNDDOWN(fp) （见 kernel/riscv.h ）以识别 帧指针引用的页面→当前栈帧对应的地址对其后和返回地址对应的地址不在一个page→停止，已经看到最后一个堆栈帧了 #define PGROUNDDOWN(a) (((a)) & ~(PGSIZE-1)) AI写代码java运行1 ![在这里插入图片描述](/Blog/images/csdn/158006798/03.png) main→f→g的调用过程


**回溯工作后，请尝试panic以便kernel/printf.c当内核崩溃时看到内核的回溯**


 🐳 

**返回地址** 是一个代码地址（比如 `0x80002cda`），它告诉你“函数执行完后跳回哪里”。**但它不包含任何关于调用者栈帧在哪儿的信息**


我们这里需要的是栈帧的位置虽然一般返回地址的位置都是在栈帧+8处，但是其表示的值是在这个上一个栈帧的任意位置都可以的呀


![图片](/Blog/images/csdn/158006798/04.png)


![在这里插入图片描述](/Blog/images/csdn/158006798/05.png)


显示有未知的调用——??:0→栈出错了


```java
void backtrace()
{
  printf("backtrace:\n");
  //获取当前栈的栈指针
  uint64 fp = r_fp();
  //进行递归到出口处
  while(fp != 0 ){
    //获取上一层的地址
    uint64 ret = *(uint64*)(fp + 8);//这个地方不是+8而是-8
    printf("%p\n",ret);
    //开始进行递归
    uint64 pre_fp = *(uint64*)fp;//这里的逻辑也是错误的
    //如果pre_fp和当前的fp不是在同一个page就退出循环
    if(PGROUNDDOWN(pre_fp) != PGROUNDDOWN(fp))break;
    fp = pre_fp;//递归
  }

}
```


```java
void panic(char *s)
{
  pr.locking = 0;
  printf("panic: ");
  printf(s);
  printf("\n");
  backtrace();//给panic添加回溯功能
  panicked = 1; // freeze uart output from other CPUs
  for (;;)
    ;
}
```


修改了之后就是：


![在这里插入图片描述](/Blog/images/csdn/158006798/06.png)


![在这里插入图片描述](/Blog/images/csdn/158006798/07.png)


```java
void backtrace()
{
  printf("backtrace:\n");
  //获取当前栈的栈指针
  uint64 fp = r_fp();
  //进行递归到出口处
  while(fp != 0 ){
    //获取上一层的地址
    uint64 ret = *(uint64*)(fp - 8);//错误1
    printf("%p\n",ret);
    //开始进行递归
    uint64 pre_fp = *(uint64*)(fp - 16);//错误2
    //如果pre_fp和当前的fp不是在同一个page就退出循环
    if(PGROUNDDOWN(pre_fp) != PGROUNDDOWN(fp))break;
    fp = pre_fp;//递归
  }

}
```


感谢https://blog.csdn.net/LostUnravel/article/details/121341055帖子的帮助


![在这里插入图片描述](/Blog/images/csdn/158006798/08.png)


**返回地址是*(fp-8)，上一个调用栈的地址是*(fp-16)，区别一下fp和sp，两个是不一样的东西！！！**


 🔥 

### 警报alarm


在这个练习中，你将为 xv6 添加一个功能：**当进程使用 CPU 时间时，内核会定期向该进程发出警报。**这对于希望限制自身消耗 CPU 时间的计算密集型进程可能很有用，或者对于那些既想进行计算又想定期执行某些操作的进程也很有用。更一般地说，你将实现一种用户级中断/故障
 处理程序 
 的原始形式；例如，你可以使用类似机制在应用程序中处理缺页错误。如果你的解决方案能通过 alarmtest 和 ‘usertests -q’，那么它就是正确的。


你**应该添加一个新的系统调用 sigalarm(interval, handler)**。**如果一个应用程序调用 sigalarm(n, fn)，那么每当该程序消耗了 n 个“ticks”的 CPU 时间后，内核就应该导致应用程序函数 fn 被调用**。当 fn 返回后，应用程序应该从它被中断的地方继续执行。一个 tick 是 xv6 中一个相当任意的时间单位，由硬件定时器产生中断的频率决定。如果一个应用程序调用 sigalarm(0, 0)，内核应该停止生成周期性的警报调用。


你会在 xv6 代码仓库中找到一个文件 user/alarmtest.c。将它添加到 
 Makefile 
  中。在你添加了 sigalarm 和 sigreturn 系统调用之前（见下文），它无法正确编译。


alarmtest 在 test0 中调用 sigalarm(2, periodic)，请求内核每 2 个 ticks 强制调用一次 periodic() 函数，然后进入一个忙等待循环。你可以在 user/alarmtest.asm 中查看 alarmtest 的汇编代码，这在调试时可能会很有帮助。当 alarmtest 产生如下输出并且 usertests -q 也能正确运行时，你的解决方案就是正确的：


```c
$ alarmtest
test0 start
........alarm!
test0 passed
test1 start
...alarm!
..alarm!
...alarm!
..alarm!
...alarm!
..alarm!
...alarm!
..alarm!
...alarm!
..alarm!
test1 passed
test2 start
................alarm!
test2 passed
test3 start
test3 passed
$ usertests -q
...
ALL TESTS PASSED
$
```


当你完成后，你的解决方案可能只有几行代码，但要写对可能有点棘手。我们将使用原始仓库中的 alarmtest.c 版本来测试你的代码。你可以修改 alarmtest.c 来帮助调试，但请确保原始的 alarmtest 显示所有测试都通过。


 🐳 

int **sigalarm**(int interval,void (*handler)());


这个函数负责的内容是CPU每次间隔interval个ticks后就执行对应的额handler进行处理


创建系统调用:为进程配置属性


```c
uint64
sys_sigreturn(void){
  return 0;
}

uint64
sys_sigalarm(void){
  int interval;
  uint64 handler;
  struct proc* p =myproc();

  argint(0,&interval);
  argaddr(1,&handler);

  p->interval = interval;
  p->handler = handler;
  p->pass_tick = 0; //重置过去的时间

  return 0;
}
```


我们需要利用pass_tick和interval来确定时间进行调用，每一次外部时钟中断都会导致pass_tick++，然后当pas_tick==interval的时候就进行handler的调用(当然handler的合法性需要进行检验！！！)


```c
void usertrap(void)
{
  int which_dev = 0;

	//....

  // give up the CPU if this is a timer interrupt.
  if (which_dev == 2){
    if (p->interval > 0)
      {
        p->pass_tick++; // tick++
        // 调用handler
        if (p->pass_tick == p->interval)//确保函数的调用在用户栈不到内核里面去
        {
          *p->alarmframe = *p->trapframe;//保存当前的栈帧
          p->trapframe->epc = p->handler;// 跳转到handler函数上去
          p->pass_tick = 0; // 进行重置
        }
      }
    yield();//CPU放弃执行一个周期(空转)
  }    

  usertrapret();
}
```


需要去找到有关时钟区的代码→中断一次tick++，相等就重置和调用对应的handler函数


当然这里需要将当前栈帧进行快照保存到对应的alaarmframe，方便在sigreturn中进行激活


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

  p->interval = 0;//初始化为0
  p->handler = 0;
  p->pass_tick = 0;
  p->alarm_in_progress = 0;//表示可以进行handler处理

  // Allocate a trapframe page.
  if((p->trapframe = (struct trapframe *)kalloc()) == 0){
    freeproc(p);
    release(&p->lock);
    return 0;
  }
  // Allocate an alarmframe page.
  if((p->alarmframe = (struct trapframe *)kalloc()) == 0){
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

// free a proc structure and the data hanging from it,
// including user pages.
// p->lock must be held.
static void
freeproc(struct proc *p)
{
  if(p->trapframe)
    kfree((void*)p->trapframe);
  p->trapframe = 0;
  if(p->alarmframe)
    kfree((void*)p->alarmframe);
  p->alarmframe = 0;
  if(p->pagetable)
    proc_freepagetable(p->pagetable, p->sz);
  p->pagetable = 0;
  p->sz = 0;
  p->pid = 0;
  p->parent = 0;
  p->name[0] = 0;
  p->chan = 0;
  p->killed = 0;
  p->xstate = 0;
  p->state = UNUSED;
}
```


这里添加了有关alarmframe的kalloc和kfree，从而可以保证其


```c
uint64
sys_sigreturn(void){
  struct proc* p = myproc();
  if(p->alarmframe == 0)
    return -1;
  *p->trapframe = *p->alarmframe;//进行恢复
  p->alarm_in_progress = 0;
  return p->trapframe->a0;//返回值也要设回去
}
```


这里需要恢复之前的快照，但是恢复之前的快照的时候因为调用了这个系统调用所有返回值a0会被系统调用的返回值进行覆盖，return 0的话就会导致之前函数的a0返回值丢失，因此就需要进行单独写入返回逻辑，确保数据一致


```c
*trapframe = *alarmframe;  // 恢复所有寄存器，包括 a0 = 42
return 0;                  // ← 错误！这会让 a0 变成 0！
```


**这个return是很有必要的！！！**


![在这里插入图片描述](/Blog/images/csdn/158006798/09.png)
---

> 本文由我的 CSDN 博客迁移而来：[查看原文](https://blog.csdn.net/fancyfor/article/details/158006798)。

<!-- imported-from-csdn:158006798 -->
