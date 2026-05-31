from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Any

import shioaji as sj
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from news_engine import get_news_payload
from chips_engine import get_chips_payload
from discord_engine import send_battle_report, send_discord_alert
from fund_flow_engine import build_fund_flow_report
from performance_engine import (
    get_module_performance,
    get_performance_logs,
    record_module_signals,
    update_module_results,
)
from pro_engine import build_pro_analysis
from replay_engine import get_logs, get_stats, save_signal, update_results

load_dotenv()
SHIOAJI_API_KEY = os.getenv("SHIOAJI_API_KEY", "")
SHIOAJI_SECRET_KEY = os.getenv("SHIOAJI_SECRET_KEY", "")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
api: sj.Shioaji | None = None

SCAN_UNIVERSE = [
    "2330", "2317", "2454", "2382", "2308", "3037", "3231", "3017", "3324", "3661",
    "3443", "3711", "2376", "2356", "2324", "2379", "2368", "8046", "5347", "6215",
    "1513", "1514", "1605", "1609", "2615", "2609", "2618", "2409", "3481", "2344",
]

SECTOR_MAP = {
    "2330": "半導體", "2454": "半導體", "3037": "半導體", "2379": "半導體", "3443": "半導體",
    "3661": "半導體", "2344": "半導體", "8046": "半導體", "5347": "半導體", "3711": "半導體",
    "2317": "AI伺服器", "2382": "AI伺服器", "3231": "AI伺服器", "3017": "AI散熱", "3324": "AI散熱",
    "2376": "電腦週邊", "2356": "電腦週邊", "2324": "電腦週邊", "2368": "PCB", "6215": "PCB",
    "2308": "重電", "1513": "重電", "1514": "重電", "1605": "電線電纜", "1609": "電線電纜",
    "2615": "航運", "2609": "航運", "2618": "航運", "2409": "面板", "3481": "面板",
}

class QuoteResponse(BaseModel):
    code: str
    name: str | None = None
    close: float | None = None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    volume: int | None = None
    change_price: float | None = None
    change_rate: float | None = None
    buy_price: float | None = None
    buy_volume: int | None = None
    sell_price: float | None = None
    sell_volume: int | None = None
    volume_ratio: float | None = None
    average_price: float | None = None
    raw: dict[str, Any]

class KBarItem(BaseModel):
    ts: str
    open: float
    high: float
    low: float
    close: float
    volume: int | float

class KBarsResponse(BaseModel):
    code: str
    interval: str
    items: list[KBarItem]
    count: int
    start: str | None = None
    end: str | None = None
    message: str | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global api
    api = sj.Shioaji(simulation=True)
    if SHIOAJI_API_KEY and SHIOAJI_SECRET_KEY:
        api.login(api_key=SHIOAJI_API_KEY, secret_key=SHIOAJI_SECRET_KEY)
    else:
        print("Shioaji keys are not set.")
    yield
    if api is not None:
        api.logout()

app = FastAPI(title="Stock Monitor Backend", version="0.8.6", lifespan=lifespan)
origins = [x.strip() for x in CORS_ORIGINS.split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins if origins else ["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def pick_number(raw: dict[str, Any], *keys: str):
    for key in keys:
        if raw.get(key) is not None:
            return raw.get(key)
    return None

def _float(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default

def get_stock_contract(code: str):
    if api is None:
        raise HTTPException(status_code=503, detail="Shioaji API is not initialized")
    try:
        return api.Contracts.Stocks[code]
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Cannot find stock code: {code}") from exc

def normalize_kbars(kbars: Any) -> list[KBarItem]:
    rows = []
    for ts, o, h, l, c, v in zip(getattr(kbars, "ts", []), getattr(kbars, "Open", []), getattr(kbars, "High", []), getattr(kbars, "Low", []), getattr(kbars, "Close", []), getattr(kbars, "Volume", []), strict=False):
        rows.append(KBarItem(ts=str(ts), open=float(o), high=float(h), low=float(l), close=float(c), volume=float(v)))
    return rows

def make_quote_payload(code: str) -> tuple[Any, dict[str, Any]]:
    if api is None:
        raise HTTPException(status_code=503, detail="Shioaji API is not initialized")
    contract = get_stock_contract(code)
    try:
        snapshot = api.snapshots([contract])[0]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch quote from Shioaji: {exc}") from exc
    raw = snapshot.__dict__.copy()
    close = pick_number(raw, "close")
    change_price = pick_number(raw, "change_price")
    change_rate = pick_number(raw, "change_rate")
    reference = pick_number(raw, "reference", "yesterday_close")
    if change_price is None and close is not None and reference:
        change_price = float(close) - float(reference)
    if change_rate is None and change_price is not None and reference:
        change_rate = float(change_price) / float(reference) * 100
    payload = dict(code=code, name=getattr(contract, "name", None), close=close, open=pick_number(raw, "open"), high=pick_number(raw, "high"), low=pick_number(raw, "low"), volume=pick_number(raw, "total_volume", "volume"), change_price=change_price, change_rate=change_rate, buy_price=pick_number(raw, "buy_price"), buy_volume=pick_number(raw, "buy_volume"), sell_price=pick_number(raw, "sell_price"), sell_volume=pick_number(raw, "sell_volume"), volume_ratio=pick_number(raw, "volume_ratio"), average_price=pick_number(raw, "average_price"), raw=raw)
    return contract, payload

def fetch_kbar_rows(contract: Any, days: int = 5) -> tuple[list[KBarItem], date | None, date | None]:
    if api is None:
        raise HTTPException(status_code=503, detail="Shioaji API is not initialized")
    end = date.today()
    rows, used_start, used_end = [], None, None
    for lookback in [days, 7, 10]:
        start = end - timedelta(days=lookback - 1)
        try:
            rows = normalize_kbars(api.kbars(contract, start=start.isoformat(), end=end.isoformat()))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch kbars from Shioaji: {exc}") from exc
        if len(rows) >= 3:
            used_start, used_end = start, end
            break
    return rows, used_start, used_end

def market_payload_for(code: str) -> dict[str, Any] | None:
    if code == "2330":
        return None
    try:
        _, market_quote = make_quote_payload("2330")
        return {k: v for k, v in market_quote.items() if k != "raw"}
    except Exception:
        return None

def scan_score(quote: dict[str, Any]) -> int:
    score = 50
    change = _float(quote.get("change_rate"))
    vol_ratio = _float(quote.get("volume_ratio"))
    close = _float(quote.get("close"))
    open_ = _float(quote.get("open"))
    high = _float(quote.get("high"))
    low = _float(quote.get("low"))
    avg = _float(quote.get("average_price"))
    buy = _float(quote.get("buy_volume"))
    sell = _float(quote.get("sell_volume"))
    if change > 0:
        score += min(change * 6, 20)
    else:
        score += max(change * 6, -20)
    if vol_ratio >= 2:
        score += 16
    elif vol_ratio >= 1.3:
        score += 9
    elif 0 < vol_ratio < 0.8:
        score -= 8
    if avg and close > avg:
        score += 10
    elif avg and close < avg:
        score -= 10
    if open_ and close > open_:
        score += 8
    elif open_ and close < open_:
        score -= 8
    if high and low and high > low:
        pos = (close - low) / (high - low)
        if pos >= 0.75:
            score += 8
        elif pos <= 0.35:
            score -= 8
    if buy or sell:
        imb = (buy - sell) / max(buy + sell, 1)
        if imb >= 0.25:
            score += 8
        elif imb <= -0.25:
            score -= 10
    if change >= 4:
        score -= 10
    return max(0, min(100, int(round(score))))

def scan_mood(score: int) -> str:
    if score >= 85:
        return "強勢攻擊"
    if score >= 75:
        return "強勢觀察"
    if score >= 65:
        return "偏多觀察"
    if score >= 50:
        return "中性"
    return "轉弱"

def build_market_scan(limit: int = 5) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for code in SCAN_UNIVERSE:
        try:
            _, quote = make_quote_payload(code)
            score = scan_score(quote)
            sector = SECTOR_MAP.get(code, "其他")
            close = _float(quote.get("close"))
            high = _float(quote.get("high"))
            low = _float(quote.get("low"))
            intraday_position = None
            if high and low and high > low:
                intraday_position = round((close - low) / (high - low), 3)
            items.append({
                "code": code,
                "name": quote.get("name"),
                "sector": sector,
                "score": score,
                "mood": scan_mood(score),
                "close": quote.get("close"),
                "open": quote.get("open"),
                "high": quote.get("high"),
                "low": quote.get("low"),
                "change_rate": quote.get("change_rate"),
                "volume_ratio": quote.get("volume_ratio"),
                "buy_volume": quote.get("buy_volume"),
                "sell_volume": quote.get("sell_volume"),
                "intraday_position": intraday_position,
            })
        except Exception as exc:
            errors.append({"code": code, "message": str(exc)[:120]})
    ranked = sorted(items, key=lambda x: x["score"], reverse=True)
    sector_map: dict[str, dict[str, Any]] = {}
    for item in ranked:
        row = sector_map.setdefault(item["sector"], {"sector": item["sector"], "count": 0, "score_sum": 0, "top_codes": []})
        row["count"] += 1
        row["score_sum"] += item["score"]
        if len(row["top_codes"]) < 5:
            row["top_codes"].append(item["code"])
    sectors = []
    for row in sector_map.values():
        row["avg_score"] = round(row["score_sum"] / max(row["count"], 1), 2)
        sectors.append(row)
    sectors.sort(key=lambda x: (x["avg_score"], x["count"]), reverse=True)
    return {"ok": True, "universe_size": len(SCAN_UNIVERSE), "scanned": len(items), "errors": errors, "top5": ranked[:limit], "items": ranked, "sectors": sectors[:5], "strongest_sector": sectors[0] if sectors else None}

def build_ai_pool(limit: int = 20, record: bool = False) -> dict[str, Any]:
    scan = build_market_scan(limit=max(limit, 10))
    items = scan.get("items", [])[:limit]
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in scan.get("items", []):
        groups.setdefault(str(item.get("sector") or "其他"), []).append(item)
    sector_rank = []
    for sector, rows in groups.items():
        avg = round(sum(int(x.get("score") or 0) for x in rows) / max(len(rows), 1), 2)
        sector_rank.append({"sector": sector, "avg_score": avg, "count": len(rows), "items": rows[:5]})
    sector_rank.sort(key=lambda x: (x["avg_score"], x["count"]), reverse=True)
    recorded = record_module_signals("ai_pool", items, reason="api_ai_pool", limit=limit) if record else None
    return {"ok": True, "version": "AI Pool v1", "pool_size": len(items), "top20": items, "sectors": sector_rank, "source": "market_scan", "recorded": recorded}

def build_breakout_alerts(limit: int = 20, min_score: int = 85, send: bool = False, record: bool = False) -> dict[str, Any]:
    pool = build_ai_pool(limit=limit, record=False)
    alerts: list[dict[str, Any]] = []
    for item in pool.get("top20", []):
        score = int(item.get("score") or 0)
        change = _float(item.get("change_rate"))
        volume_ratio = _float(item.get("volume_ratio"))
        pos = item.get("intraday_position")
        near_high = pos is not None and _float(pos) >= 0.82
        controlled_gain = 0.8 <= change <= 4.0
        volume_breakout = volume_ratio >= 2.0
        if score >= min_score and controlled_gain and volume_breakout and near_high:
            reasons = ["分數達標", "量比放大", "價格接近日高", "漲幅未過熱"]
            alert = {**item, "alert_type": "breakout", "reasons": reasons}
            alerts.append(alert)
            if send:
                send_discord_alert({
                    "code": item.get("code"),
                    "score": score,
                    "title": "STX 突破警報",
                    "message": f"{item.get('name') or ''}｜{item.get('sector')}｜漲幅 {change:.2f}%｜量比 {volume_ratio:.2f}｜接近日高。",
                })
    recorded = record_module_signals("breakout", alerts, reason="api_breakout", limit=limit) if record else None
    return {"ok": True, "version": "Breakout Alert v1", "checked": len(pool.get("top20", [])), "alert_count": len(alerts), "alerts": alerts, "sent": bool(send), "recorded": recorded}

def build_fund_flow(limit: int = 20, send: bool = False, record: bool = False) -> dict[str, Any]:
    scan = build_market_scan(limit=max(10, min(limit, 30)))
    report = build_fund_flow_report(scan, limit=limit)
    if send:
        for item in report.get("alerts", [])[:8]:
            send_discord_alert({
                "code": item.get("code"),
                "score": item.get("fund_score"),
                "title": item.get("alert") or "STX 資金流警報",
                "message": f"{item.get('name') or ''}｜{item.get('sector')}｜資金 {item.get('fund_score')}｜主力 {item.get('big_player_score')}｜隔日沖風險 {item.get('day_trade_risk')}｜{item.get('chip_signal')}。",
            })
    report["sent"] = bool(send)
    report["recorded"] = record_module_signals("fund_flow", report.get("alerts", []), reason="api_fund_flow", limit=limit) if record else None
    return report

def build_cron_run(limit: int = 20, send: bool = True) -> dict[str, Any]:
    ai = build_ai_pool(limit=limit, record=True)
    breakout = build_breakout_alerts(limit=limit, min_score=85, send=send, record=True)
    fund = build_fund_flow(limit=limit, send=send, record=True)
    perf = get_module_performance()
    return {
        "ok": True,
        "version": "STX Scheduler v1",
        "limit": limit,
        "send": bool(send),
        "ai_pool": ai.get("recorded"),
        "breakout": {
            "alert_count": breakout.get("alert_count"),
            "recorded": breakout.get("recorded"),
            "sent": breakout.get("sent"),
        },
        "fund_flow": {
            "alert_count": len(fund.get("alerts", [])),
            "recorded": fund.get("recorded"),
            "sent": fund.get("sent"),
        },
        "performance": {
            "total_signals": perf.get("total_signals"),
            "tracked_results": perf.get("tracked_results"),
            "github_path": perf.get("github_path"),
        },
    }

@app.get("/")
def root():
    return {"status": "ok", "message": "Stock Monitor Backend is running"}

@app.get("/health")
def health():
    return {"ok": True, "logged_in": bool(api and api.stock_account)}

@app.get("/api/news")
def get_news(code: str = Query(...), name: str = Query(...), symbol: str | None = Query(None)):
    try:
        return get_news_payload(code=code, name=name, symbol=symbol)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch news: {exc}") from exc

@app.get("/api/chips")
def get_chips(code: str = Query(...)):
    try:
        return get_chips_payload(code=code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch chips: {exc}") from exc

@app.get("/api/discord-alert")
def discord_alert(code: str = Query(...), score: int = Query(...), title: str = Query("STX 警報"), message: str = Query("盤中警報觸發")):
    try:
        return send_discord_alert({"code": code, "score": score, "title": title, "message": message})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send discord alert: {exc}") from exc

@app.get("/api/discord-battle-report")
def discord_battle_report(limit: int = Query(10, ge=1, le=10)):
    try:
        scan = build_market_scan(limit=limit)
        stats = get_stats()
        return send_battle_report(scan, stats)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send Discord battle report: {exc}") from exc

@app.get("/api/cron-run")
def cron_run(limit: int = Query(20, ge=5, le=30), send: bool = Query(True)):
    try:
        return build_cron_run(limit=limit, send=send)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to run scheduler: {exc}") from exc

@app.get("/api/pro-analysis")
def get_pro_analysis(code: str = Query(...)):
    try:
        contract, quote = make_quote_payload(code)
        rows, _, _ = fetch_kbar_rows(contract, days=5)
        analysis = build_pro_analysis(code=code, quote=quote, rows=rows[-180:], market=market_payload_for(code))
        replay = save_signal(analysis)
        update_results(code, quote.get("close"))
        update_module_results(code, quote.get("close"))
        analysis["replay"] = replay
        return analysis
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to run pro analysis: {exc}") from exc

@app.get("/api/market-scan")
def market_scan(limit: int = Query(5, ge=1, le=10)):
    try:
        return build_market_scan(limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to run market scan: {exc}") from exc

@app.get("/api/ai-pool")
def ai_pool(limit: int = Query(20, ge=5, le=30), record: bool = Query(False)):
    try:
        return build_ai_pool(limit=limit, record=record)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to build AI pool: {exc}") from exc

@app.get("/api/breakout-alerts")
def breakout_alerts(limit: int = Query(20, ge=5, le=30), min_score: int = Query(85, ge=70, le=100), send: bool = Query(False), record: bool = Query(False)):
    try:
        return build_breakout_alerts(limit=limit, min_score=min_score, send=send, record=record)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to build breakout alerts: {exc}") from exc

@app.get("/api/fund-flow")
def fund_flow(limit: int = Query(20, ge=5, le=30), send: bool = Query(False), record: bool = Query(False)):
    try:
        return build_fund_flow(limit=limit, send=send, record=record)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to build fund flow report: {exc}") from exc

@app.get("/api/performance")
def performance():
    return get_module_performance()

@app.get("/api/performance-log")
def performance_log(limit: int = Query(200, ge=1, le=1000)):
    return get_performance_logs(limit=limit)

@app.get("/api/replay-log")
def replay_log(limit: int = Query(100, ge=1, le=500)):
    return get_logs(limit=limit)

@app.get("/api/replay-stats")
def replay_stats():
    return get_stats()

@app.get("/api/quote", response_model=QuoteResponse)
def get_quote(code: str = Query(...)):
    _, quote = make_quote_payload(code)
    update_results(code, quote.get("close"))
    update_module_results(code, quote.get("close"))
    return QuoteResponse(**quote)

@app.get("/api/kbars", response_model=KBarsResponse)
def get_kbars(code: str = Query(...), days: int = Query(5, ge=1, le=10)):
    contract = get_stock_contract(code)
    rows, used_start, used_end = fetch_kbar_rows(contract, days=days)
    if not rows:
        return KBarsResponse(code=code, interval="1m", items=[], count=0, message="No K-bar data returned.")
    latest = rows[-120:]
    return KBarsResponse(code=code, interval="1m", items=latest, count=len(latest), start=used_start.isoformat() if used_start else None, end=used_end.isoformat() if used_end else None, message="ok")