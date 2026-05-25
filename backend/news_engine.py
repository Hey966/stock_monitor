from __future__ import annotations

import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from typing import Any


POSITIVE_WORDS = [
    "利多", "買超", "調升", "成長", "創高", "接單", "急單", "需求", "AI", "伺服器", "強勁", "看好", "突破", "擴產", "獲利", "營收增",
]
NEGATIVE_WORDS = [
    "利空", "賣超", "調降", "衰退", "下修", "虧損", "裁員", "跌破", "停工", "延遲", "違約", "調查", "風險", "警示", "營收減",
]


def _score_title(title: str) -> tuple[str, int, str]:
    pos = sum(1 for w in POSITIVE_WORDS if w.lower() in title.lower())
    neg = sum(1 for w in NEGATIVE_WORDS if w.lower() in title.lower())
    if pos > neg:
        return "positive", min(12, 3 + pos * 3), "命中利多關鍵字"
    if neg > pos:
        return "negative", max(-18, -4 - neg * 5), "命中利空關鍵字"
    return "neutral", 0, "未偵測明顯多空字詞"


def _clean_google_title(title: str) -> str:
    return re.sub(r"\s+-\s+[^-]+$", "", title or "").strip()


def fetch_google_news(name: str, limit: int = 8) -> list[dict[str, Any]]:
    query = urllib.parse.quote(f"{name} 股票")
    url = f"https://news.google.com/rss/search?q={query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=8) as res:
        xml_text = res.read()
    root = ET.fromstring(xml_text)
    items: list[dict[str, Any]] = []
    for item in root.findall("./channel/item")[:limit]:
        title = _clean_google_title(item.findtext("title") or "")
        link = item.findtext("link") or ""
        published = item.findtext("pubDate") or ""
        sentiment, score, reason = _score_title(title)
        items.append({
            "source": "Google News",
            "title": title,
            "link": link,
            "time": published,
            "sentiment": sentiment,
            "score": score,
            "reason": reason,
        })
    return items


def fetch_finnhub_news(symbol: str, limit: int = 5) -> list[dict[str, Any]]:
    token = os.getenv("FINNHUB_API_KEY", "")
    if not token or not symbol:
        return []
    to_day = date.today()
    from_day = to_day - timedelta(days=2)
    params = urllib.parse.urlencode({
        "symbol": symbol,
        "from": from_day.isoformat(),
        "to": to_day.isoformat(),
        "token": token,
    })
    url = f"https://finnhub.io/api/v1/company-news?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            import json
            data = json.loads(res.read().decode("utf-8"))
    except Exception:
        return []
    items: list[dict[str, Any]] = []
    for row in (data or [])[:limit]:
        title = row.get("headline") or ""
        sentiment, score, reason = _score_title(title)
        items.append({
            "source": "Finnhub",
            "title": title,
            "link": row.get("url") or "",
            "time": row.get("datetime"),
            "sentiment": sentiment,
            "score": score,
            "reason": reason,
        })
    return items


def get_news_payload(code: str, name: str, symbol: str | None = None) -> dict[str, Any]:
    google_items = fetch_google_news(name)
    finnhub_items = fetch_finnhub_news(symbol or "")
    items = google_items + finnhub_items
    news_score = sum(int(item.get("score") or 0) for item in items)
    news_score = max(-30, min(30, news_score))
    if news_score >= 10:
        summary = "新聞偏多，當作技術面加分輔助。"
        sentiment = "positive"
    elif news_score <= -10:
        summary = "新聞偏空，當沖需降低出手分數。"
        sentiment = "negative"
    else:
        summary = "新聞中性，主要仍看量價與K線。"
        sentiment = "neutral"
    return {
        "code": code,
        "name": name,
        "symbol": symbol,
        "newsScore": news_score,
        "sentiment": sentiment,
        "summary": summary,
        "total": len(items),
        "items": items[:12],
    }
