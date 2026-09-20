export const projects = [
  {
    name: 'XiaoYu RPC Framework',
    description: '从动态代理、服务发现到多协议传输，完整拆解一次 RPC 调用链路。',
    tech: ['Java 17', 'Netty', 'Nacos', 'Protobuf'],
    href: 'https://github.com/xiaoyumuxi/Java-RPC',
    label: 'JAVA / DISTRIBUTED',
    tone: 'blue',
  },
  {
    name: 'JobAgent',
    description: '面向 macOS 的个人网申工作台，把岗位、资料、辅助填写与进度跟踪放到一起。',
    tech: ['TypeScript', 'Electron', 'Playwright', 'SQLite'],
    href: 'https://github.com/xiaoyumuxi/personal-job-agent',
    label: 'PRODUCT / AUTOMATION',
    tone: 'violet',
  },
  {
    name: 'Lithe AI Core',
    description: 'Capability 驱动的 Rust Agent Runtime 微内核，探索可组合、可替换的 Agent 执行底座。',
    tech: ['Rust', 'Agent Runtime', 'NDJSON', 'Studio'],
    href: 'https://github.com/xiaoyumuxi/Lithe-ai-core',
    label: 'RUST / AGENT RUNTIME',
    tone: 'indigo',
  },
  {
    name: 'AgenticFix',
    description: '让 Agent 读取真实仓库与 Issue，定位问题、修改代码、运行测试并生成可验证 Patch。',
    tech: ['Python', 'Docker', 'Git Worktree', 'Agent'],
    href: 'https://github.com/xiaoyumuxi/AgenticFix',
    label: 'AGENT / SOFTWARE ENGINEERING',
    tone: 'purple',
  },
] as const;
