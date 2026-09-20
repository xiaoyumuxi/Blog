# 文章阅读量：GoatCounter

## 当前状态

已实现文章标题下的阅读量组件，但 `src/data/analytics.json` 的 `goatcounterSiteCode` 默认留空。**没有站点配置就没有采集，也没有真实读数**，此时页面显示「阅读统计待启用」，不伪装成 0。giscus 的评论与 reactions 不会提供阅读量。

启用需要站点主人已有或新注册一个自己控制的 GoatCounter 站点。不要根据 GitHub 用户名猜测 GoatCounter 账号，更不要将访问发到未经确认的第三方账号。

## 一次性启用

1. 在 https://www.goatcounter.com/signup 创建或登录自己的统计站点。填写博客地址 `https://xiaoyumuxi.github.io/Blog/`。
2. 在 GoatCounter 的站点设置里开启 **Allow adding visitor counts on your website**。这是公开计数开关，不需要把整个统计后台设为公开。
3. 将其安装代码中的 `data-goatcounter="https://<site-code>.goatcounter.com/count"` 交给负责本站的 Agent；**不需要密码或 API Token**。
4. Agent 读取本文件，将已确认的 site-code 写入 `src/data/analytics.json`，运行检查并按 `AGENTS.md` / publish-blog Skill 提交部署。所有文章都由同一个模板接入，不逐篇手动配置。

```json
{
  "goatcounterSiteCode": ""
}
```

空字符串就是关闭。填写的是域名前的短名称，不是整段 URL；配置目前支持官方托管站点，自托管/自定义域名需另行验证后扩展。

## 显示与边界

- 采集和读取使用同一个完整 pathname，如 `/Blog/blog/backend-interview-basics/`；不把查询参数或 hash 混入统计键。改 URL 前确认计数迁移方案。
- 只有生产构建、HTTPS、地址与 `astro.config.mjs` 中 site origin 一致、非 iframe 时才加载采集脚本。开发、preview、CI 不给生产统计刷数；测试使用拦截的模拟响应。
- 每个页面只加载一次官方 `count.js`，不额外调用一次 `count()`。只统计文章访问，不采集下载/按钮事件；来源仅保留 origin，不保留来源 query。
- 浏览器开启 Do Not Track / Global Privacy Control 时不发送统计请求。其他拦截工具也可能导致漏记。
- 公共 JSON API 通过 `credentials: omit` 读取，不需要前端访问令牌；数字以接口响应为准，不做本地 `+1`。
- 未配置 →「阅读统计待启用」；真实 0 →「0 次阅读」；404 →「暂无阅读数据」；错误/超时 →「阅读量暂不可用」。失败不能当作 0。
- GoatCounter 默认统计 visits，有会话内去重；不是实时在线人数，也不是阅读完成率。公开 counter 响应可能缓存最多约四小时，不保证每刷新一次立刻变化。
- 启用前没有采集的数据不会被自动补回来。不要编造历史访问量。

## 验证

`node --test scripts/page-views.test.mjs` 检查配置、编码路径及读数解析；`npm run test:site` 还检查文章中的状态与 9 种模拟网络/隐私状态，不向真实统计端点发送请求。

完成账号配置后的真实验收由用户在文章上访问一次并检查 GoatCounter 后台；同时核对公开计数权限及 `/counter/<encoded-path>.json`。不能把模拟测试通过称为真实数据已采集。

官方文档：
- 安装：https://www.goatcounter.com/help/start
- JS 参数：https://www.goatcounter.com/help/js
- 公共计数及缓存：https://www.goatcounter.com/help/visitor-counter
- visits 口径：https://www.goatcounter.com/help/sessions
