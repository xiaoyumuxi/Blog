# xiaoyumuxi · Bluehour

蓝紫色的个人博客与资源空间。基于 Astro + MDX 的完整静态站点。

## 页面与风格

深蓝背景、蓝紫渐变、轨道视觉、文章卡片、亮暗主题、手机适配。首页、文章列表、文章详情、资源架、关于页及 404 页面齐备。首页的装饰由 CSS 绘制，无需外部图片服务；页面使用系统字体，不依赖第三方字体加载。

## 内容能力

- Markdown / MDX、表格、任务列表、脚注、引用。
- Expressive Code：代码高亮、复制按钮、行号、高亮行与 diff 代码。
- KaTeX 行内 / 块级公式；Mermaid 代码围栏。
- Callout、可键盘操作的 Tabs、图片图集与放大、原生 details 折叠。
- 下载卡片、PDF 内嵌预览；附带真实可下载的 PDF、ZIP、Markdown、JSON 示例。
- Pagefind 中文全文搜索、标签筛选、文章目录、阅读进度、RSS、Sitemap 与基础 SEO。

**边界：** 文件下载不等于所有文件都能在线预览。Office 文件默认提供下载；浏览器对 PDF、音视频编码与第三方 iframe 的支持有差异。本项目是公开静态站点，不包含登录、私有文件权限或付费下载。只运行可信的 MDX 内容。

## 本地启动

需要 Node.js 22.12+，推荐 Node.js 24。

```bash
npm install
npm run dev
```

默认访问 `http://localhost:4321/Blog/`。搜索索引在生产构建时生成，验证搜索请运行：

```bash
npm run check
npm run build
npm run preview
```

GitHub Actions 首次成功检查后会提交 `package-lock.json`。已有锁文件时，本地与 CI 推荐使用 `npm ci`。

## GitHub Pages 发布

本仓库预设：

```text
site: https://xiaoyumuxi.github.io
base: /Blog
```

1. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
2. 打开 **Actions → Build, verify and publish → Run workflow**。
3. 工作流通过后，Pages 部署步骤会发布站点。预计地址：`https://xiaoyumuxi.github.io/Blog/`，以成功部署日志为准。

未启用 Pages 时，工作流仍会构建并测试站点，但跳过发布，不会假装已经上线。`site-preview` 产物包含桌面、手机、亮色首页与文章页截图以及 `verification.json`。

工作流只在首次缺少锁文件、且远端 main 没有新提交时保存依赖锁，不使用 force push。网站源码不需要访问令牌或其他密钥。

## 换成你的内容

| 要修改的内容 | 文件位置 |
| --- | --- |
| 名称、简介、GitHub 地址 | `src/lib/site.ts` |
| 首页文案与布局 | `src/pages/index.astro` |
| 配色、间距、视觉样式 | `src/styles/global.css` |
| 关于页面 | `src/pages/about.astro` |
| 文章 | `src/content/blog/` |
| 资源列表 | `src/data/resources.ts` |
| 附件 | `public/downloads/` |
| 可复用内容组件 | `src/components/` |
| 域名和部署子路径 | `astro.config.mjs` |

初始三篇文章均标为示例，没有编造实习、项目成绩或访问量。替换正文后删除 `sample: true` 即可取消示例标签。

### 新建文章

```bash
npm run new -- my-first-post
```

文件名支持小写英文、数字和短横线。新文件默认 `draft: true`，不会被发布、搜索或 RSS 收录，也不会覆盖同名文件。写完后设置 `draft: false`。

```yaml
---
title: "我的第一篇文章"
description: "一句话介绍。"
date: 2026-09-20
tags: [笔记, 技术]
draft: false
art: orbit # orbit / code / files
---
```

文章中的完整组件用法见 `src/content/blog/writing-lab.mdx`。Mermaid 直接使用带 `mermaid` 语言标记的代码围栏；公式使用 `$...$` 或 `$$...$$`。

### 添加资源

文件放进 `public/downloads/`，在 `src/data/resources.ts` 添加对应记录。文件大小会在构建时读取；不存在的文件会使构建失败，避免发布失效入口。

```mdx
import DownloadCard from '../../components/DownloadCard.astro';

<DownloadCard
  title="我的文档"
  file="downloads/my-document.pdf"
  format="PDF"
  description="请先将真实文件放到对应位置。"
/>
```

卡片也支持 HTTPS 外链，跨域下载行为由目标服务器决定。大文件建议放在对象存储或 GitHub Releases，避免持续扩大源码仓库。

### 自定义域名 / 其他静态平台

使用环境变量覆盖默认值：

```bash
SITE_URL=https://example.com BASE_PATH=/ npm run build
```

发布目录为 `dist/`。GitHub Pages 自定义域名还需要 DNS 与 Pages 设置；可将域名写入 `public/CNAME`。更改部署位置后同时调整 `SITE_URL` 与 `BASE_PATH`，不要只修改其中一项。

## 浏览器检查

```bash
npx playwright install chromium
npm run build
npm run test:site
```

检查包括实际页面导航、主题持久化、标签筛选、KaTeX / Mermaid、标签页、灯箱、附件下载与文件签名、中文搜索、RSS、Sitemap、390px 手机溢出和浏览器异常。截图存放在 `test-results/`。

浏览器测试会使用 `writing-lab` 示例及其标签，删除示例时请同步更新 `scripts/verify.mjs` 的测试目标。

## 自动生成的示例附件

PDF 与 ZIP 示例由 `scripts/generate-downloads.mjs` 在启动、检查或构建前生成。它们不是空占位文件；已有同名附件不会被覆盖。

## 公开内容与隐私

部署到静态站点的附件对所有访问者公开。不要把 API Key、身份证明、真实内部资料或私人简历细节当作演示文件提交。删除最新文件不等于删除 Git 历史或外部副本。

示例页面中无访问统计脚本、第三方评论追踪或外部字体请求。

## 技术参考

- Astro：https://docs.astro.build/
- MDX：https://docs.astro.build/en/guides/integrations-guide/mdx/
- GitHub Pages：https://docs.astro.build/en/guides/deploy/github/
- Expressive Code：https://expressive-code.com/
- Pagefind：https://pagefind.app/
- Mermaid：https://mermaid.js.org/
- KaTeX：https://katex.org/

本仓库不替第三方依赖变更其许可证；具体依赖许可请查看各包信息。
