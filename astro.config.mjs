import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import diagrams from './scripts/remark-diagrams.mjs';

export default defineConfig({
  site: process.env.SITE_URL || 'https://xiaoyumuxi.github.io',
  base: process.env.BASE_PATH ?? '/Blog',
  output: 'static', trailingSlash: 'always', compressHTML: true,
  integrations: [
    expressiveCode({ themes: ['github-dark', 'github-light'],
      themeCssSelector: theme => `[data-theme="${theme.name === 'github-dark' ? 'dark' : 'light'}"]`,
      useDarkModeMediaQuery: false, plugins: [pluginLineNumbers()],
      defaultProps: { showLineNumbers: true } }),
    mdx(), sitemap()
  ],
  markdown: { processor: unified({ smartypants: false,
    remarkPlugins: [remarkMath, diagrams], rehypePlugins: [rehypeKatex] }) }
});
