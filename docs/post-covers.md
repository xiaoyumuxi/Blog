# 文章封面

首页、文章列表、使用 `PostCard` 的系列页面和文章详情共用 `PostCover.astro`，不再为每篇文章重复显示 `Art.astro` 的通用图案。正文、标题、slug、日期、标签、评论标识和固定栏目不需要修改。

## 不配图片也有独立封面

构建时，`src/pages/covers/[...id].svg.ts` 使用与文章路由相同的 `posts()` 发布过滤器，为每篇已发布文章生成 `covers/<文章 id>.svg`。草稿与未到发布日期的文章不会生成公开封面。每张图包含文章标题、主题插画、标签或系列名；有系列顺序时显示章节号。

主题优先从标题判断，再参考系列和标签，覆盖 Java/后端、Redis、数据库、系统、Rust、网络、AI 与随笔。它是确定性的关键词规则，不是调用大模型或外部图片服务。修改标题后下次构建更新封面，图片地址仍绑定稳定的文章 id；新文章无需手动补图。

图片为 1200 × 675 的静态 SVG，不需要 API Key、图片 CDN、额外依赖或浏览器 Canvas。文字使用设备的中文字体回退；没有嵌入或下载字体。超长标题自动换行、缩小，极端长度会省略，文章页面标题和 SVG 的无障碍标题仍保留全文。

## 给某篇文章指定自己的图片

把图片放入 `public/images/covers/`，在对应 Markdown/MDX 原有 frontmatter 里增加两行：

```yaml
cover: "/images/covers/my-post.webp"
coverAlt: "说明这张封面表达的内容"
```

`my-post.webp` 是示例名称，使用时替换成已经提交的实际文件。也支持完整的 HTTP(S) 图片 URL；建议优先使用本站文件，避免外链失效。路径不写 `public/`，不写部署前缀 `/Blog`，组件会通过 `href()` 自动加上正确的站点 base。`coverAlt` 可省略，默认使用文章标题。

优先级：**文章指定图片 → 该文章自动生成的标题封面**。自定义图片加载失败后回退到本地封面，只尝试一次，防止无限重试。没有自定义图片时不需要填写 `cover`。旧 `art` 字段保留兼容，但不再决定文章封面。

显示比例统一为 16:9，自定义图片会居中裁切；建议上传同一比例并把重要信息留在安全区域。列表延迟加载，详情封面优先加载。自动封面不裁切文字，手机沿用相同比例。

## 校验

```sh
node --experimental-strip-types --test scripts/post-cover.test.mjs
npm run check
npm run build
npm run test:site
```

现有站点测试会调用 `scripts/verify-post-covers.mjs`，从真实构建产物遍历文章，检查图片绑定、本地文件响应、SVG/XML 安全与标题、卡片/详情一致性、浏览器解码、失效回退和手机比例。`test-results/covers-desktop.png` 与 `covers-mobile.png` 随原有 Actions 截图产物上传。

此功能不生成社交平台专用 PNG，也不修改现有分享元数据。
