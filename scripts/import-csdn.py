#!/usr/bin/env python3
"""Import the public CSDN archive for fancyfor into Astro Markdown posts.

The importer is intentionally idempotent: files are keyed by the stable CSDN
article id and can be refreshed by running the workflow again.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
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

BLOCKED_HOSTS = {
    "passport.csdn.net",
    "so.csdn.net",
}


@dataclass
class Category:
    name: str
    slug: str
    url: str
    article_ids: list[str]


@dataclass
class Article:
    article_id: str
    url: str
    title: str
    description: str
    published: datetime
    tags: list[str]
    body_html: str
    series: Category | None = None
    series_order: int | None = None


def fetch(url: str, *, binary: bool = False, referer: str | None = None, retries: int = 4):
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        "Accept": "*/*" if binary else "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    last_error = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                data = response.read()
                if binary:
                    return data, response.headers
                charset = response.headers.get_content_charset() or "utf-8"
                return data.decode(charset, errors="replace")
        except Exception as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
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


def discover_articles(profile_html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(profile_html, "html.parser")
    urls = []
    for link in soup.find_all("a", href=True):
        url = normalise_url(link["href"], base_url)
        if re.search(r"/fancyfor/article/details/\d+", url):
            urls.append(url.split("?")[0].split("#")[0])
    return unique(urls)


def category_name(soup: BeautifulSoup, category_id: str) -> str:
    for selector in (
        ".column_title",
        ".column-title",
        ".column_info h3",
        ".column-info h3",
        "h3",
    ):
        node = soup.select_one(selector)
        if node:
            text = node.get_text(" ", strip=True)
            if text and "热门文章" not in text and "分类专栏" not in text:
                return text
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    for suffix in ("_晨曦中的暮雨的博客-CSDN博客", "_晨曦中的暮雨的博客", "-CSDN博客"):
        title = title.replace(suffix, "")
    return title.strip(" _-") or f"CSDN 专栏 {category_id}"


def discover_categories(profile_html: str, base_url: str) -> list[Category]:
    soup = BeautifulSoup(profile_html, "html.parser")
    category_urls: list[str] = []
    for link in soup.find_all("a", href=True):
        url = normalise_url(link["href"], base_url)
        if re.search(r"/fancyfor/category_\d+\.html", url):
            category_urls.append(url.split("?")[0].split("#")[0])

    categories: list[Category] = []
    for url in unique(category_urls):
        category_id = re.search(r"category_(\d+)", url).group(1)
        page = fetch(url)
        category_soup = BeautifulSoup(page, "html.parser")
        name = category_name(category_soup, category_id)
        ids = []
        for link in category_soup.find_all("a", href=True):
            article_url = normalise_url(link["href"], url)
            article_id = article_id_from_url(article_url)
            if article_id:
                ids.append(article_id)
        categories.append(
            Category(
                name=name,
                slug=SERIES_SLUGS.get(name, f"csdn-column-{category_id}"),
                url=url,
                article_ids=unique(ids),
            )
        )
        print(f"Discovered series: {name} ({len(unique(ids))} articles)")
    return categories


def extract_date(soup: BeautifulSoup, raw_html: str) -> datetime:
    candidates: list[str] = []
    for key, value in (
        ("property", "article:published_time"),
        ("name", "date"),
        ("itemprop", "datePublished"),
    ):
        node = soup.find("meta", attrs={key: value})
        if node and node.get("content"):
            candidates.append(node["content"])

    text = soup.get_text(" ", strip=True)
    for pattern in (
        r"于\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*首次发布",
        r"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*首次发布",
        r'"datePublished"\s*:\s*"([^"]+)"',
        r'"dateCreated"\s*:\s*"([^"]+)"',
    ):
        target = raw_html if '"date' in pattern else text
        match = re.search(pattern, target)
        if match:
            candidates.append(match.group(1))

    for value in candidates:
        cleaned = value.strip().replace("T", " ").replace("Z", "")
        cleaned = re.sub(r"([+-]\d{2}):?(\d{2})$", "", cleaned).strip()
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(cleaned[:19], fmt)
            except ValueError:
                pass
    return datetime.now()


def extract_title(soup: BeautifulSoup) -> str:
    for selector in ("h1.title-article", "h1"):
        node = soup.select_one(selector)
        if node:
            title = node.get_text(" ", strip=True)
            if title:
                return title
    meta = soup.find("meta", attrs={"property": "og:title"})
    if meta and meta.get("content"):
        return meta["content"].replace("-CSDN博客", "").strip()
    return "未命名文章"


def extract_description(soup: BeautifulSoup, body: BeautifulSoup, title: str) -> str:
    node = soup.find("meta", attrs={"name": "description"})
    value = html.unescape(node.get("content", "")).strip() if node else ""
    for prefix in (title, f"{title}-CSDN博客"):
        if value.startswith(prefix):
            value = value[len(prefix):].lstrip(" _-|：:")
    value = re.sub(r"\s+", " ", value)
    if not value:
        paragraph = body.find("p")
        value = paragraph.get_text(" ", strip=True) if paragraph else ""
    return (value[:176].rstrip() + "…") if len(value) > 180 else value


def extract_tags(soup: BeautifulSoup) -> list[str]:
    values = []
    for selector in (
        ".blog-tags-box a",
        ".tags-box a",
        ".article-info-box a[href*='so.csdn.net']",
        "a[href*='so.csdn.net'][class*='tag']",
    ):
        for node in soup.select(selector):
            tag = node.get_text(" ", strip=True).lstrip("#").strip()
            if tag and len(tag) <= 40:
                values.append(tag)
    return unique(values)[:8]


def clean_body(body: BeautifulSoup, article_url: str) -> BeautifulSoup:
    for selector in (
        "script",
        "style",
        "iframe",
        "noscript",
        ".hide-preCode-box",
        ".hljs-button",
        ".look-more-preCode",
        ".recommend-box",
        ".article-copyright",
        ".passport-login-container",
    ):
        for node in body.select(selector):
            node.decompose()

    for anchor in body.find_all("a", href=True):
        href = anchor["href"].strip()
        if href.startswith(("javascript:", "#")):
            anchor.attrs.pop("href", None)
            continue
        absolute = normalise_url(href, article_url)
        host = urllib.parse.urlparse(absolute).hostname or ""
        if host not in BLOCKED_HOSTS:
            anchor["href"] = absolute

    for image in body.find_all("img"):
        src = image.get("data-src") or image.get("data-original") or image.get("src")
        if src:
            image["src"] = normalise_url(src, article_url)
        for attr in ("data-src", "data-original", "style", "onclick"):
            image.attrs.pop(attr, None)
    return body


def parse_article(url: str) -> Article:
    raw_html = fetch(url)
    soup = BeautifulSoup(raw_html, "html.parser")
    body = soup.find(id="content_views") or soup.select_one(".article_content") or soup.select_one("article")
    if body is None:
        raise RuntimeError(f"Could not find article body in {url}")
    body = clean_body(body, url)
    article_id = article_id_from_url(url)
    if not article_id:
        raise RuntimeError(f"Could not determine article id for {url}")
    title = extract_title(soup)
    return Article(
        article_id=article_id,
        url=url,
        title=title,
        description=extract_description(soup, body, title),
        published=extract_date(soup, raw_html),
        tags=extract_tags(soup),
        body_html=str(body),
    )


def choose_series(article_id: str, categories: list[Category]) -> Category | None:
    memberships = [category for category in categories if article_id in category.article_ids]
    if not memberships:
        return None
    # Prefer the most specific/smaller series if CSDN happens to place one post in
    # multiple columns.
    return sorted(memberships, key=lambda category: len(category.article_ids))[0]


def safe_extension(url: str, content_type: str | None) -> str:
    path_ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if re.fullmatch(r"\.(png|jpe?g|gif|webp|svg)", path_ext):
        return ".jpg" if path_ext == ".jpeg" else path_ext
    guessed = mimetypes.guess_extension((content_type or "").split(";")[0].strip()) or ".jpg"
    return ".jpg" if guessed == ".jpe" else guessed


def migrate_images(
    markdown: str,
    article: Article,
    image_root: Path,
    *,
    max_total_bytes: int,
    total_state: list[int],
) -> str:
    image_pattern = re.compile(r"!\[([^\]]*)\]\((https?://[^)\s]+)(?:\s+\"[^\"]*\")?\)")
    urls = unique(match.group(2) for match in image_pattern.finditer(markdown))
    if not urls:
        return markdown

    target_dir = image_root / article.article_id
    target_dir.mkdir(parents=True, exist_ok=True)

    replacements: dict[str, str] = {}
    for index, url in enumerate(urls, start=1):
        if total_state[0] >= max_total_bytes:
            print("Image migration size cap reached; remaining images stay remote.")
            break
        try:
            data, headers = fetch(url, binary=True, referer=article.url, retries=2)
            if len(data) > 5 * 1024 * 1024:
                print(f"Skip oversized image ({len(data)} bytes): {url}")
                continue
            if total_state[0] + len(data) > max_total_bytes:
                continue
            extension = safe_extension(url, headers.get("Content-Type"))
            digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]
            filename = f"{index:02d}-{digest}{extension}"
            (target_dir / filename).write_bytes(data)
            total_state[0] += len(data)
            replacements[url] = f"../../images/csdn/{article.article_id}/{filename}"
        except Exception as error:
            print(f"Keep remote image after download failure: {url} ({error})")

    for original, local in replacements.items():
        markdown = markdown.replace(f"]({original})", f"]({local})")
    return markdown


def markdown_body(article: Article) -> str:
    markdown = to_markdown(
        article.body_html,
        heading_style="ATX",
        bullets="-",
        strip=["script", "style"],
    )
    markdown = markdown.replace("\r\n", "\n")
    markdown = re.sub(r"\n{4,}", "\n\n\n", markdown)
    markdown = re.sub(r"[ \t]+\n", "\n", markdown)
    return markdown.strip()


def json_flow(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def write_article(article: Article, output_dir: Path, image_root: Path, download_images: bool, total_state: list[int], max_total_bytes: int):
    tags = list(article.tags)
    if article.series:
        broad_tag = SERIES_TAGS.get(article.series.name)
        if broad_tag and broad_tag not in tags:
            tags.insert(0, broad_tag)
    tags = unique(tags)[:8]

    body = markdown_body(article)
    if download_images:
        body = migrate_images(
            body,
            article,
            image_root,
            max_total_bytes=max_total_bytes,
            total_state=total_state,
        )

    series_line = ""
    if article.series:
        series_line = (
            f"series: {json_flow({'name': article.series.name, 'slug': article.series.slug, 'order': article.series_order})}\n"
        )

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
    source_note = f"\n\n---\n\n> 本文由我的 CSDN 博客迁移而来：[查看原文]({article.url})。\n"
    marker = f"\n<!-- imported-from-csdn:{article.article_id} -->\n"
    path = output_dir / f"csdn-{article.article_id}.md"
    path.write_text(frontmatter + body + source_note + marker, encoding="utf-8")
    print(f"Wrote {path}: {article.title}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", default="fancyfor")
    parser.add_argument("--output", default="src/content/blog")
    parser.add_argument("--image-root", default="public/images/csdn")
    parser.add_argument("--download-images", action="store_true")
    parser.add_argument("--max-image-mb", type=int, default=60)
    args = parser.parse_args()

    profile_url = f"https://blog.csdn.net/{args.user}"
    profile_html = fetch(profile_url)
    article_urls = discover_articles(profile_html, profile_url)
    if not article_urls:
        raise SystemExit("No CSDN articles discovered.")
    print(f"Discovered {len(article_urls)} article URLs from {profile_url}")

    categories = discover_categories(profile_html, profile_url)

    articles: list[Article] = []
    for index, url in enumerate(article_urls, start=1):
        print(f"[{index}/{len(article_urls)}] Fetching {url}")
        try:
            article = parse_article(url)
            article.series = choose_series(article.article_id, categories)
            articles.append(article)
        except Exception as error:
            print(f"ERROR: {error}")

    if len(articles) < max(1, int(len(article_urls) * 0.8)):
        raise SystemExit(
            f"Only parsed {len(articles)} of {len(article_urls)} articles; refusing a partial migration."
        )

    for category in categories:
        members = sorted(
            [article for article in articles if article.series and article.series.slug == category.slug],
            key=lambda article: (article.published, article.article_id),
        )
        for order, article in enumerate(members, start=1):
            article.series_order = order

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    image_root = Path(args.image_root)
    total_state = [0]
    max_total_bytes = args.max_image_mb * 1024 * 1024

    for article in sorted(articles, key=lambda item: item.published):
        write_article(
            article,
            output_dir,
            image_root,
            args.download_images,
            total_state,
            max_total_bytes,
        )

    print(
        f"Imported {len(articles)} articles across "
        f"{len({a.series.slug for a in articles if a.series})} series."
    )
    if args.download_images:
        print(f"Downloaded {total_state[0] / 1024 / 1024:.1f} MiB of images.")


if __name__ == "__main__":
    main()
