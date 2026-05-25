from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from datetime import date, timedelta
from typing import Any


FINMIND_URL = "https://api.finmindtrade.com/api/v4/data"


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _request_finmind(dataset: str, code: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    token = os.getenv("FINMIND_API_KEY", "")
    params = urllib.parse.urlencode({
        "dataset": dataset,
        "data_id": code,
        "start_date": start_date,
        "end_date": end_date,
    })
    req = urllib.request.Request(
        f"{FINMIND_URL}?{params}",
        headers={
            "User-Agent": "Mozilla/5.0",
            "Authorization": f"Bearer {token}" if token else "",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        payload = json.loads(res.read().decode("utf-8"))
    return payload.get("data") or []


def _institutional_score(rows: list[dict[str, Any]]) -> dict[str, Any]:
    foreign = 0.0
    investment = 0.0
    dealer = 0.0
    recent: list[dict[str, Any]] = []

    for row in rows[-80:]:
        name = str(row.get("name") or row.get("institutional_investors") or "")
        value = _num(row.get("buy_sell") or row.get("buy_sell_shares") or row.get("buy") or 0)
        recent.append({"date": row.get("date"), "name": name, "buySell": value})
        if "Foreign" in name or "外資" in name:
            foreign += value
        elif "Investment" in name or "投信" in name:
            investment += value
        elif "Dealer" in name or "自營" in name:
            dealer += value

    score = 0
    summary: list[str] = []
    risk: list[str] = []

    if foreign > 0:
        score += 12
        summary.append("外資偏多")
    elif foreign < 0:
        score -= 12
        risk.append("外資偏空")

    if investment > 0:
        score += 14
        summary.append("投信偏多")
    elif investment < 0:
        score -= 14
        risk.append("投信偏空")

    if dealer > 0:
        score += 6
        summary.append("自營商偏多")
    elif dealer < 0:
        score -= 6
        risk.append("自營商偏空")

    if foreign > 0 and investment > 0 and dealer > 0:
        score += 10
        summary.append("三大法人同步買超")
    if foreign < 0 and investment < 0 and dealer < 0:
        score -= 10
        risk.append("三大法人同步賣超")

    return {
        "foreign": round(foreign, 2),
        "investment": round(investment, 2),
        "dealer": round(dealer, 2),
        "score": max(-40, min(40, score)),
        "summary": summary or ["法人籌碼中性"],
        "risk": risk or ["暫無明顯法人風險"],
        "recent": recent[-20:],
    }


def get_chips_payload(code: str) -> dict[str, Any]:
    end = date.today()
    start = end - timedelta(days=14)
    start_s = start.isoformat()
    end_s = end.isoformat()

    institutional_rows: list[dict[str, Any]] = []
    try:
        institutional_rows = _request_finmind(
            "TaiwanStockInstitutionalInvestorsBuySell",
            code,
            start_s,
            end_s,
        )
    except Exception as exc:
        return {
            "code": code,
            "chipScore": 0,
            "summary": ["FinMind籌碼資料暫時讀取失敗"],
            "risk": [str(exc)],
            "foreign": 0,
            "investment": 0,
            "dealer": 0,
            "daytradeRatio": None,
            "marginRatio": None,
            "recent": [],
        }

    inst = _institutional_score(institutional_rows)
    chip_score = inst["score"]
    if chip_score >= 18:
        status = "法人籌碼偏多"
    elif chip_score <= -18:
        status = "法人籌碼偏空"
    else:
        status = "法人籌碼中性"

    return {
        "code": code,
        "chipScore": chip_score,
        "status": status,
        "foreign": inst["foreign"],
        "investment": inst["investment"],
        "dealer": inst["dealer"],
        "summary": inst["summary"],
        "risk": inst["risk"],
        "daytradeRatio": None,
        "marginRatio": None,
        "recent": inst["recent"],
        "source": "FinMind",
        "range": {"start": start_s, "end": end_s},
    }
