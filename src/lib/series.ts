import type { CollectionEntry } from 'astro:content';
import { posts } from './site';

export type BlogPost = CollectionEntry<'blog'>;

export const seriesDescriptions: Record<string, string> = {
  'backend-fundamentals': 'Java、JVM、Spring、MySQL、Redis 等后端基础与面试知识整理。',
  'ai': '大模型、Agent、Spring AI 与 AI 应用工程的学习和实践记录。',
  'projects': '个人项目的设计、实现与工程实践记录。',
  'language-crash-course': '面向已有编程基础的语言速通与对照笔记。',
  'algorithms-data-structures': '算法题、数据结构与解题过程记录。',
  'troubleshooting': '开发与设备使用中遇到的疑难问题和排查过程。',
  'interview-reviews': '实习与秋招面试记录、复盘与改进。',
  'mit6-s081-2022': 'MIT 6.S081 / xv6 2022 课程环境、实验与 Lab 学习笔记。',
};

export interface SeriesGroup {
  name: string;
  slug: string;
  description: string;
  posts: BlogPost[];
  latest: Date;
}

export function groupSeries(all: BlogPost[]): SeriesGroup[] {
  const grouped = new Map<string, SeriesGroup>();

  for (const post of all) {
    const series = post.data.series;
    if (!series) continue;

    let group = grouped.get(series.slug);
    if (!group) {
      group = {
        name: series.name,
        slug: series.slug,
        description: seriesDescriptions[series.slug] ?? `${series.name} 系列文章。`,
        posts: [],
        latest: post.data.date,
      };
      grouped.set(series.slug, group);
    }
    group.posts.push(post);
    if (post.data.date > group.latest) group.latest = post.data.date;
  }

  for (const group of grouped.values()) {
    group.posts.sort((a, b) => {
      const orderA = a.data.series?.order;
      const orderB = b.data.series?.order;
      if (orderA != null && orderB != null) return orderA - orderB;
      if (orderA != null) return -1;
      if (orderB != null) return 1;
      return a.data.date.valueOf() - b.data.date.valueOf();
    });
  }

  return [...grouped.values()].sort((a, b) => b.latest.valueOf() - a.latest.valueOf());
}

export async function seriesGroups() {
  return groupSeries(await posts());
}
