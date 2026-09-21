#!/usr/bin/env python3
"""Import the public CSDN archive for fancyfor into Astro Markdown posts.

CSDN rejects GitHub-hosted runner IPs with HTTP 521 on article pages, so article
content is fetched through the public Jina Reader endpoint. Discovery still uses
the public profile page, which exposes the full article URL list.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

from bs4 import BeautifulSoup
from markdownify import markdownify as to_markdown

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

SERIES_SLUGS = {
    "后端八股": "backend-fundamentals",
    "AI": "ai",
    "个人项目相关": "projects",
    "语言快速入门": "language-crash-course",
    "算法和数据结构": "algorithms-data-structures",
    "一些稀奇古怪的问题的解决方案记录": "troubleshooting",
    "面试记录和复盘": "interview-reviews",
    "Mit6.S081 2022版本": "mit6-s081-2022",
    "MIT6.S081 2022版本": "mit6-s081-2022",
}

SERIES_TAGS = {
    "后端八股": "后端",
    "AI": "AI",
    "个人项目相关": "项目",
    "语言快速入门": "语言",
    "算法和数据结构": "算法",
    "一些稀奇古怪的问题的解决方案记录": "问题排查",
    "面试记录和复盘": "面试",
    "Mit6.S081 2022版本": "系统",
    "MIT6.S081 2022版本": "系统",
}


KNOWN_ARTICLE_IDS = [
    "163421557", "163421176", "163421160", "163421128", "163420934",
    "163398923", "163398520", "163398250", "163398088", "161797165",
    "161779694", "161648730", "161648373", "161232752", "161232647",
    "161232552", "161232443", "161196737", "161196445", "161172871",
    "161172556", "160157511", "160157491", "160157465", "158462929",
    "158462452", "158462270", "158040989", "158006798", "158006742",
    "158006632", "156618273", "156240993", "156199320", "156198988",
    "156198476", "155134179", "154289549", "152822984", "152818735",
    "150586940",
]


@dataclass
class Category:
    name: str
    slug: str
    url: str


@dataclass
class Article:
    article_id: str
    url: str
    title: str
    description: str
    published: datetime
    tags: list[str]
    body: str
    series: Category | None = None
    series_order: int | None = None


def fetch(
    url: str,
    *,
    retries: int = 3,
    headers: dict[str, str] | None = None,
) -> str:
    request_headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if headers:
        request_headers.update(headers)

    last_error = None
    for attempt in range(retries):
        request = urllib.request.Request(url, headers=request_headers)
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
                charset = response.headers.get_content_charset() or "utf-8"
                return data.decode(charset, errors="replace")
        except Exception as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def article_id_from_url(url: str) -> str | None:
    match = re.search(r"/article/details/(\d+)", url)
    return match.group(1) if match else None


def normalise_url(url: str, base: str) -> str:
    if url.startswith("//"):
        return f"https:{url}"
    return urllib.parse.urljoin(base, url)


def discover_articles(profile_html: str, base_url: str, user: str) -> list[str]:
    soup = BeautifulSoup(profile_html, "html.parser")
    urls: list[str] = []
    pattern = re.compile(rf"/{re.escape(user)}/article/details/\d+")

    for link in soup.find_all("a", href=True):
        url = normalise_url(link["href"], base_url)
        if pattern.search(url):
            urls.append(url.split("?")[0].split("#")[0])

    discovered = unique(urls)
    known_urls = [
        f"https://blog.csdn.net/{user}/article/details/{article_id}"
        for article_id in KNOWN_ARTICLE_IDS
    ]
    if len(discovered) < len(known_urls):
        print(
            f"Profile exposed only {len(discovered)} article links; "
            f"using the known {len(known_urls)}-article archive snapshot."
        )
        return known_urls
    return discovered


def fetch_reader(url: str) -> str:
    reader_url = f"https://r.jina.ai/{url}"
    return fetch(
        reader_url,
        retries=2,
        headers={"Accept": "text/plain"},
    )


def reader_content(raw: str) -> str:
    marker = "Markdown Content:"
    if marker in raw:
        return raw.split(marker, 1)[1].strip()
    return raw.strip()


def reader_title(raw: str, content: str) -> str:
    match = re.search(r"^Title:\s*(.+)$", raw, flags=re.MULTILINE)
    if match:
        title = match.group(1).strip()
        title = re.sub(r"\s*[-_]\s*CSDN博客\s*$", "", title).strip()
        if title:
            return title

    heading = re.search(r"^#\s+(.+)$", content, flags=re.MULTILINE)
    if heading:
        return heading.group(1).strip()
    return "未命名文章"


def reader_date(raw: str, content: str) -> datetime:
    for text in (content, raw):
        match = re.search(
            r"于\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*首次发布",
            text,
        )
        if match:
            return datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S")

    match = re.search(r"^Published Time:\s*(.+)$", raw, flags=re.MULTILINE)
    if match:
        value = match.group(1).strip().replace("T", " ").replace("Z", "")
        value = re.sub(r"([+-]\d{2}):?(\d{2})$", "", value).strip()
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(value[:19], fmt)
            except ValueError:
                pass

    raise RuntimeError("Could not determine original publish date")


def reader_series(content: str, article_url: str) -> Category | None:
    marker = content.find("收录于")
    prefix = content[marker:marker + 2500] if marker >= 0 else content[:2500]

    link_pattern = re.compile(
        r"\[([^\]]+)\]\((https?://blog\.csdn\.net/fancyfor/category_(\d+)\.html[^)]*)\)",
        flags=re.IGNORECASE,
    )
    for match in link_pattern.finditer(prefix):
        name = re.sub(r"\s+", " ", match.group(1)).strip()
        name = re.sub(r"\s*\d+\s*篇.*$", "", name).strip()
        if not name or name in {"查看详情", "订阅专栏"}:
            continue
        category_id = match.group(3)
        return Category(
            name=name,
            slug=SERIES_SLUGS.get(name, f"csdn-column-{category_id}"),
            url=match.group(2).split("?")[0].split("#")[0],
        )

    for name in sorted(SERIES_SLUGS, key=len, reverse=True):
        if name in prefix:
            return Category(
                name=name,
                slug=SERIES_SLUGS[name],
                url=article_url,
            )
    return None


def split_reader_body(content: str) -> tuple[str, str]:
    publish = re.search(
        r"于\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*首次发布\s*",
        content,
    )
    if not publish:
        raise RuntimeError("Could not find CSDN first-published marker")

    remainder = content[publish.end():].lstrip()

    tag_match = re.search(r"\n\s*标签\s*\n", remainder)
    if tag_match:
        body = remainder[:tag_match.start()].rstrip()
        tags_section = remainder[tag_match.end():]
    else:
        footer = re.search(
            r"\n(?:确定要放弃本次机会？|作者简介|热门文章|相关推荐)\s*\n",
            remainder,
        )
        body = remainder[:footer.start()].rstrip() if footer else remainder.rstrip()
        tags_section = ""

    if len(body) < 80:
        raise RuntimeError("Reader returned too little article content")
    return body, tags_section


def reader_tags(tags_section: str) -> list[str]:
    tags = re.findall(r"\[#([^\]]+)\]\([^)]+\)", tags_section)
    if not tags:
        tags = re.findall(r"(?<!\w)#([\w\u4e00-\u9fff.+#-]{1,40})", tags_section)
    return unique(tag.strip() for tag in tags if tag.strip())[:8]


def reader_description(body: str, title: str) -> str:
    for block in re.split(r"\n\s*\n", body):
        value = block.strip()
        if not value:
            continue
        if value.startswith(("#", "![", "|", ">")):
            continue

        value = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", value)
        value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
        value = re.sub(r"[*_~]", "", value)
        value = re.sub(r"\s+", " ", value).strip()

        if value and value != title and len(value) >= 8:
            return (value[:176].rstrip() + "…") if len(value) > 180 else value

    return title


def parse_article(url: str) -> Article:
    raw = fetch_reader(url)
    content = reader_content(raw)
    body, tags_section = split_reader_body(content)

    article_id = article_id_from_url(url)
    if not article_id:
        raise RuntimeError(f"Could not determine article id for {url}")

    title = reader_title(raw, content)
    return Article(
        article_id=article_id,
        url=url,
        title=title,
        description=reader_description(body, title),
        published=reader_date(raw, content),
        tags=reader_tags(tags_section),
        body=body,
        series=reader_series(content, url),
    )


def json_flow(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def clean_markdown(markdown: str) -> str:
    markdown = markdown.replace("\r\n", "\n")
    markdown = re.sub(r"\n{4,}", "\n\n\n", markdown)
    markdown = re.sub(r"[ \t]+\n", "\n", markdown)
    return markdown.strip()


def write_article(article: Article, output_dir: Path) -> None:
    tags = list(article.tags)
    if article.series:
        broad_tag = SERIES_TAGS.get(article.series.name)
        if broad_tag and broad_tag not in tags:
            tags.insert(0, broad_tag)
    tags = unique(tags)[:8]

    series_line = ""
    if article.series:
        series_data = {
            "name": article.series.name,
            "slug": article.series.slug,
        }
        if article.series_order is not None:
            series_data["order"] = article.series_order
        series_line = f"series: {json_flow(series_data)}\n"

    frontmatter = (
        "---\n"
        f"title: {json_flow(article.title)}\n"
        f"description: {json_flow(article.description or article.title)}\n"
        f"date: {article.published.strftime('%Y-%m-%d')}\n"
        f"tags: {json_flow(tags)}\n"
        "draft: false\n"
        "featured: false\n"
        "sample: false\n"
        "art: code\n"
        f"{series_line}"
        f"source: {json_flow({'platform': 'CSDN', 'url': article.url})}\n"
        "---\n\n"
    )

    source_note = (
        f"\n\n---\n\n"
        f"> 本文由我的 CSDN 博客迁移而来：[查看原文]({article.url})。\n"
    )
    marker = f"\n<!-- imported-from-csdn:{article.article_id} -->\n"

    path = output_dir / f"csdn-{article.article_id}.md"
    path.write_text(
        frontmatter + clean_markdown(article.body) + source_note + marker,
        encoding="utf-8",
    )
    print(f"Wrote {path}: {article.title}")


def assign_series_order(articles: list[Article]) -> None:
    slugs = sorted({article.series.slug for article in articles if article.series})
    for slug in slugs:
        members = sorted(
            [
                article
                for article in articles
                if article.series and article.series.slug == slug
            ],
            key=lambda article: (article.published, article.article_id),
        )
        for order, article in enumerate(members, start=1):
            article.series_order = order


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", default="fancyfor")
    parser.add_argument("--output", default="src/content/blog")
    args = parser.parse_args()

    profile_url = f"https://blog.csdn.net/{args.user}"
    profile_html = fetch(profile_url, retries=3)
    article_urls = discover_articles(profile_html, profile_url, args.user)

    if not article_urls:
        raise SystemExit("No CSDN articles discovered.")

    print(f"Discovered {len(article_urls)} article URLs for {profile_url}")

    articles: list[Article] = []
    for index, url in enumerate(article_urls, start=1):
        print(f"[{index}/{len(article_urls)}] Fetching through Reader: {url}")
        started = time.monotonic()
        try:
            articles.append(parse_article(url))
        except Exception as error:
            print(f"ERROR: {url}: {error}")

        elapsed = time.monotonic() - started
        if elapsed < 3.2:
            time.sleep(3.2 - elapsed)

    minimum = max(1, int(len(article_urls) * 0.8))
    if len(articles) < minimum:
        raise SystemExit(
            f"Only parsed {len(articles)} of {len(article_urls)} articles; "
            "refusing a partial migration."
        )

    assign_series_order(articles)

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    for article in sorted(articles, key=lambda item: item.published):
        write_article(article, output_dir)

    series_count = len({a.series.slug for a in articles if a.series})
    print(f"Imported {len(articles)} articles across {series_count} series.")


if __name__ == "__main__":
    main()
