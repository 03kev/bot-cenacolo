#!/usr/bin/env python3
"""Monitor ticket-sale announcements from cenacolovinciano.org/notizie.

The script checks recent news, filters posts related to ticket sales,
and sends notifications for new matches (stdout by default, Telegram optional).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup

DEFAULT_NEWS_URL = "https://cenacolovinciano.org/notizie/"
DEFAULT_BASE_URL = "https://cenacolovinciano.org"
DEFAULT_STATE_FILE = ".cenacolo_seen.json"

TITLE_PATTERNS = [
    re.compile(r"^in vendita i biglietti per", re.IGNORECASE),
    re.compile(r"^apertura vendite", re.IGNORECASE),
]

BODY_KEYWORDS = [
    "saranno messi in vendita i biglietti",
    "messi in vendita i biglietti",
    "apertura vendite",
    "in vendita i biglietti",
]


@dataclass
class NewsItem:
    title: str
    link: str
    date: str
    excerpt: str

    @property
    def uid(self) -> str:
        return self.link or f"{self.date}|{self.title}".strip()


def normalize_spaces(value: str) -> str:
    return " ".join(value.split())


def text_matches_sale(item: NewsItem) -> bool:
    title = normalize_spaces(item.title).lower()
    excerpt = normalize_spaces(item.excerpt).lower()

    if any(pattern.search(title) for pattern in TITLE_PATTERNS):
        return True

    return any(keyword in excerpt for keyword in BODY_KEYWORDS)


def fetch_posts_api(base_url: str, limit: int, timeout: int) -> list[NewsItem]:
    endpoint = f"{base_url.rstrip('/')}/wp-json/wp/v2/posts"
    params = {
        "per_page": min(max(limit, 1), 100),
        "orderby": "date",
        "order": "desc",
        "_fields": "date,link,title,excerpt",
    }

    response = requests.get(endpoint, params=params, timeout=timeout)
    response.raise_for_status()

    items: list[NewsItem] = []
    for entry in response.json():
        title_html = entry.get("title", {}).get("rendered", "")
        excerpt_html = entry.get("excerpt", {}).get("rendered", "")
        title = BeautifulSoup(title_html, "html.parser").get_text(" ", strip=True)
        excerpt = BeautifulSoup(excerpt_html, "html.parser").get_text(" ", strip=True)

        items.append(
            NewsItem(
                title=title,
                link=entry.get("link", ""),
                date=entry.get("date", ""),
                excerpt=excerpt,
            )
        )

    return items


def fetch_posts_html(news_url: str, timeout: int) -> list[NewsItem]:
    response = requests.get(news_url, timeout=timeout)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    seen_uids: set[str] = set()
    items: list[NewsItem] = []

    for article in soup.select("article"):
        heading = article.select_one("h1, h2, h3, h4, h5, h6")
        if not heading:
            continue

        title = normalize_spaces(heading.get_text(" ", strip=True))
        link_tag = heading.find("a", href=True) or article.find("a", href=True)
        date_tag = article.find("time")

        excerpt_parts = [p.get_text(" ", strip=True) for p in article.select("p")]
        excerpt = normalize_spaces(" ".join(part for part in excerpt_parts if part))

        link = link_tag["href"] if link_tag else ""
        date = date_tag.get("datetime", "") if date_tag else ""

        item = NewsItem(title=title, link=link, date=date, excerpt=excerpt)
        if item.uid in seen_uids:
            continue

        seen_uids.add(item.uid)
        items.append(item)

    return items


def load_state(path: Path) -> set[str]:
    if not path.exists():
        return set()

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return set()

    if isinstance(data, list):
        return {str(value) for value in data}

    return set()


def save_state(path: Path, seen: Iterable[str]) -> None:
    payload = sorted(set(seen))
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def format_message(item: NewsItem) -> str:
    lines = [
        "Nuovo annuncio vendite Cenacolo",
        f"Titolo: {item.title}",
        f"Data: {item.date or 'n/d'}",
        f"Link: {item.link or 'n/d'}",
    ]
    return "\n".join(lines)


def send_telegram(text: str, timeout: int) -> None:
    token = os.getenv("TG_BOT_TOKEN")
    chat_id = os.getenv("TG_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError("TG_BOT_TOKEN e TG_CHAT_ID sono richiesti per Telegram")

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    response = requests.post(
        url,
        json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        timeout=timeout,
    )
    response.raise_for_status()


def main() -> int:
    parser = argparse.ArgumentParser(description="Monitor annunci vendite biglietti Cenacolo")
    parser.add_argument("--news-url", default=DEFAULT_NEWS_URL)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--state-file", default=DEFAULT_STATE_FILE)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--notify", choices=["stdout", "telegram"], default="stdout")
    parser.add_argument(
        "--no-save",
        action="store_true",
        help="non salvare lo stato dei post già visti",
    )
    parser.add_argument(
        "--show-all",
        action="store_true",
        help="mostra anche annunci già visti",
    )
    args = parser.parse_args()

    state_path = Path(args.state_file)
    previously_seen = load_state(state_path)

    try:
        posts = fetch_posts_api(args.base_url, args.limit, args.timeout)
    except Exception:
        posts = fetch_posts_html(args.news_url, args.timeout)

    matches = [post for post in posts if text_matches_sale(post)]
    if not matches:
        print("Nessun annuncio vendite trovato.")
        return 0

    if args.show_all:
        to_notify = matches
    else:
        to_notify = [post for post in matches if post.uid not in previously_seen]

    if not to_notify:
        print("Nessun nuovo annuncio vendite.")
        return 0

    for post in to_notify:
        message = format_message(post)
        if args.notify == "telegram":
            send_telegram(message, timeout=args.timeout)
        else:
            print(message)
            print("-" * 60)

    if not args.no_save:
        updated_seen = previously_seen.union(post.uid for post in matches)
        save_state(state_path, updated_seen)

    return 0


if __name__ == "__main__":
    sys.exit(main())
