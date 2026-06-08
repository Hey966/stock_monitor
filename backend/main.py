from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from datetime import date, timedelta
from statistics import mean
from typing import Any

import shioaji as sj
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from news_engine import get_news_payload
from chips_engine import get_chips_payload
from discord_engine import send_battle_report, send_discord_alert, send_grouped_alerts, send_radar_top5_alert
from fund_flow_engine import build_fund_flow_report
from performance_engine import get_module_performance, get_performance_logs, record_module_signals, update_module_results
from pro_engine import build_pro_analysis
from replay_engine import get_logs, get_stats, save_signal, update_results
from stx_query_engine import build_stx_query_response

load_dotenv()
SHIOAJI_API_KEY = os.getenv("SHIOAJI_API_KEY", "")
SHIOAJI_SECRET_KEY = os.getenv("SHIOAJI_SECRET_KEY", "")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
api: sj.Shioaji | None = None
LAST_RELOGIN_AT = 0.0

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


def login_shioaji(force: bool = False) -> None:
    global api, LAST_RELOGIN_AT
    if not SHIOAJI_API_KEY or not SHIOAJI_SECRET_KEY:
        print("Shioaji keys are not set.")
        return
    now = time.time()
    if force and now - LAST_RELOGIN_AT < 3:
        return
    LAST_RELOGIN_AT = now
    try:
        if api is not None:
            try:
                api.logout()
            except Exception:
                pass
        api = sj.Shioaji(simulation=True)
        api.login(api_key=SHIOAJI_API_KEY, secret_key=SHIOAJI_SECRET_KEY)
    except Exception as exc:
        print(f"Shioaji login failed: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global api
    api = sj.Shioaji(simulation=True)
    login_shioaji(force=True)
    yield
    if api is not None:
        try:
            api.logout()
        except Exception:
            pass


app = FastAPI(title="Stock Monitor Backend", version="0.9.2", lifespan=lifespan)
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


def _bool(v: Any) -> bool:
    return v is True or v == "true" or v == 1 or v == "1"


def get_stock_contract(code: str):
    if api is None:
        login_shioaji(force=True)
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


def _quote_from_snapshot(code: str, contract: Any) -> dict[str, Any]:
    if api is None:
        raise RuntimeError("Shioaji API is not initialized")
    snapshot = api.snapshots([contract])[0]
    raw = snapshot.__dict__.copy()
    close = pick_number(raw, "close")
    change_price = pick_number(raw, "change_price")
    change_rate = pick_number(raw, "change_rate")
    reference = pick_number(raw, "reference", "yesterday_close")
    if change_price is None and close is not None and reference:
        change_price = float(close) - float(reference)
    if change_rate is None and change_price is not None and reference:
        change_rate = float(change_price) / float(reference) * 100
    return dict(code=code, name=getattr(contract, "name", None), close=close, open=pick_number(raw, "open"), high=pick_number(raw, "high"), low=pick_number(raw, "low"), volume=pick_number(raw, "total_volume", "volume"), change_price=change_price, change_rate=change_rate, buy_price=pick_number(raw, "buy_price"), buy_volume=pick_number(raw, "buy_volume"), sell_price=pick_number(raw, "sell_price"), sell_volume=pick_number(raw, "sell_volume"), volume_ratio=pick_number(raw, "volume_ratio"), average_price=pick_number(raw, "average_price"), raw=raw)


def make_quote_payload(code: str) -> tuple[Any, dict[str, Any]]:
    contract = get_stock_contract(code)
    try:
        return contract, _quote_from_snapshot(code, contract)
    except Exception as first_exc:
        msg = str(first_exc)
        if "Session error" in msg or "SolClient" in msg or "send request" in msg or "not login" in msg.lower():
            login_shioaji(force=True)
            contract = get_stock_contract(code)
            try:
                return contract, _quote_from_snapshot(code, contract)
            except Exception as second_exc:
                raise HTTPException(status_code=502, detail=f"Failed to fetch quote from Shioaji after relogin: {second_exc}") from second_exc
        raise HTTPException(status_code=502, detail=f"Failed to fetch quote from Shioaji: {first_exc}") from first_exc


def fetch_kbar_rows(contract: Any, days: int = 5) -> tuple[list[KBarItem], date | None, date | None]:
    if api is None:
        login_shioaji(force=True)
    if api is None:
        raise HTTPException(status_code=503, detail="Shioaji API is not initialized")
    end = date.today()
    rows, used_start, used_end = [], None, None
    for lookback in [days, 7, 10]:
        start = end - timedelta(days=lookback - 1)
        try:
            rows = normalize_kbars(api.kbars(contract, start=start.isoformat(), end=end.isoformat()))
        except Exception as exc:
            if "Session error" in str(exc) or "SolClient" in str(exc):
                login_shioaji(force=True)
                rows = normalize_kbars(api.kbars(contract, start=start.isoformat(), end=end.isoformat()))
            else:
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


def _rule_score_from_pro(pro: dict[str, Any]) -> tuple[int, list[str]]:
    signals = pro.get("signals") or {}
    quote = pro.get("quote") or {}
    risks = pro.get("risks") or []
    traps = pro.get("traps") or []
    score = 50
    reasons: list[str] = []
    trap_block = _bool(signals.get("trap_block")) or bool(traps)
    close = _float(quote.get("close"))
    change_rate = _float(quote.get("change_rate"), 0)
    volume_ratio = _float(quote.get("volume_ratio"), 0)
    above_vwap = bool(signals.get("vwap") and close > _float(signals.get("vwap")))
    pullback = _bool(signals.get("pullback_hold_vwap"))
    distance = _float(signals.get("distance_to_vwap_pct"), 0)
    chg3 = _float(signals.get("last_3_bar_change_pct"), 0)
    red_k = _bool(signals.get("red_k"))
    rel_vol = _float(signals.get("relative_volume"), 0)
    orderbook = _float(signals.get("orderbook_imbalance"), 0)
    if trap_block:
        score -= 35; reasons.append("Trap或禁止追價")
    if above_vwap:
        score += 18; reasons.append("站上VWAP")
    else:
        score -= 18; reasons.append("未站上VWAP")
    if pullback:
        score += 24; reasons.append("回測不破")
    else:
        score -= 12; reasons.append("尚未完成回測不破")
    if distance >= 2.0 or chg3 >= 2.0:
        score -= 18; reasons.append("追價風險")
    if change_rate < 0:
        score -= 22; reasons.append("仍低於平盤")
    elif change_rate >= 0.5:
        score += 6; reasons.append("站上平盤")
    if 0 < volume_ratio < 1.0:
        score -= 12; reasons.append("量比不足")
    elif volume_ratio >= 1.3:
        score += 6; reasons.append("量比放大")
    if red_k: score += 5
    if rel_vol >= 1.25: score += 6
    if orderbook >= 0.25: score += 7
    elif orderbook <= -0.25: score -= 10
    if risks: score -= min(len(risks), 4) * 2
    return max(0, min(100, int(round(score)))), reasons


def _final_result(row: dict[str, Any]) -> tuple[str, str]:
    change_rate = _float(row.get("change_rate"), 0)
    volume_ratio = _float(row.get("volume_ratio"), 0)
    if row.get("trap"):
        return "Trap風險", "Trap Engine 阻擋。"
    if row.get("no_chase"):
        return "禁止追價", "急拉或離VWAP過遠，等待回測。"
    if change_rate < 0:
        return "反彈觀察", "仍低於平盤，不列入Discord前5。"
    if 0 < volume_ratio < 1.0:
        return "量能不足", "量比低於1，訊號不推播。"
    if row["rule_score"] < 60:
        return "禁止進場", "規則分析未達基本門檻。"
    if row["rule_score"] < 70:
        return "觀察", "規則分析未達進場門檻。"
    if row["rule_score"] >= 70 and row["pro_score"] >= 85 and row["group_score"] >= 60 and row["above_vwap"] and row["pullback_confirmed"]:
        return "可進場", "規則、Pro、族群與VWAP結構同步。"
    return "等待", "條件未完全同步。"


def _build_final_row(code: str, quote: dict[str, Any], pro: dict[str, Any], sector: str, group_score: int = 0) -> dict[str, Any]:
    signals = pro.get("signals") or {}
    pro_score = int(_float(pro.get("score"), scan_score(quote)))
    rule_score, rule_reasons = _rule_score_from_pro(pro)
    trap = _bool(signals.get("trap_block")) or bool(pro.get("traps"))
    no_chase = trap or _float(signals.get("distance_to_vwap_pct"), 0) >= 2 or _float(signals.get("last_3_bar_change_pct"), 0) >= 2
    above_vwap = bool(signals.get("vwap") and _float(quote.get("close")) > _float(signals.get("vwap")))
    pullback = _bool(signals.get("pullback_hold_vwap"))
    news_score = 0
    chip_score = 0
    row = {"code": code, "name": quote.get("name"), "sector": sector, "close": quote.get("close"), "open": quote.get("open"), "high": quote.get("high"), "low": quote.get("low"), "change_rate": quote.get("change_rate"), "volume_ratio": quote.get("volume_ratio"), "buy_volume": quote.get("buy_volume"), "sell_volume": quote.get("sell_volume"), "score": pro_score, "pro_score": pro_score, "rule_score": rule_score, "group_score": group_score, "news_score": news_score, "chip_score": chip_score, "trap": trap, "trap_block": trap, "no_chase": no_chase, "above_vwap": above_vwap, "pullback_confirmed": pullback, "mood": scan_mood(pro_score), "rule_reasons": rule_reasons, "pro_action": pro.get("action"), "risks": pro.get("risks", []), "traps": pro.get("traps", []), "signals": signals}
    raw_final_score = int(round(rule_score * 0.50 + pro_score * 0.25 + group_score * 0.15 + (news_score + chip_score) * 0.10))
    score_cap = 100
    if _float(quote.get("change_rate"), 0) < 0:
        score_cap = min(score_cap, 69)
    if 0 < _float(quote.get("volume_ratio"), 0) < 1.0:
        score_cap = min(score_cap, 79)
    if trap or no_chase:
        score_cap = min(score_cap, 59)
    row["score_cap"] = score_cap
    row["final_score"] = min(raw_final_score, score_cap)
    row["final_result"], row["final_reason"] = _final_result(row)
    return row


def build_market_scan(limit: int = 5, send: bool = False, record: bool = False) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    raw_rows: list[tuple[str, dict[str, Any], dict[str, Any], str]] = []
    for code in SCAN_UNIVERSE:
        try:
            contract, quote = make_quote_payload(code)
            try:
                kbars, _, _ = fetch_kbar_rows(contract, days=5)
                pro = build_pro_analysis(code=code, quote=quote, rows=kbars[-180:], market=market_payload_for(code))
            except Exception:
                pro = {"code": code, "name": quote.get("name"), "score": scan_score(quote), "signals": {}, "risks": ["K線或Pro資料不足"], "traps": [], "quote": {k: v for k, v in quote.items() if k != "raw"}}
            raw_rows.append((code, quote, pro, SECTOR_MAP.get(code, "其他")))
        except Exception as exc:
            errors.append({"code": code, "message": str(exc)[:160]})
    sector_scores: dict[str, int] = {}
    for sector in sorted({x[3] for x in raw_rows}):
        sector_items = [int(_float(x[2].get("score"), 0)) for x in raw_rows if x[3] == sector]
        sector_scores[sector] = int(round(mean(sector_items))) if sector_items else 0
    for code, quote, pro, sector in raw_rows:
        rows.append(_build_final_row(code, quote, pro, sector, sector_scores.get(sector, 0)))
    ranked = sorted(rows, key=lambda x: x["final_score"], reverse=True)
    candidates = [x for x in ranked if x.get("final_result") == "可進場"]
    for i, item in enumerate(ranked, 1):
        item["rank"] = i
        item["discord_pushed"] = item in candidates[:5]
    sector_map: dict[str, dict[str, Any]] = {}
    for item in ranked:
        row = sector_map.setdefault(item["sector"], {"sector": item["sector"], "count": 0, "score_sum": 0, "top_codes": []})
        row["count"] += 1
        row["score_sum"] += item["group_score"] or item["final_score"]
        if len(row["top_codes"]) < 5:
            row["top_codes"].append(item["code"])
    sectors = []
    for row in sector_map.values():
        row["avg_score"] = round(row["score_sum"] / max(row["count"], 1), 2)
        sectors.append(row)
    sectors.sort(key=lambda x: (x["avg_score"], x["count"]), reverse=True)
    recorded = record_module_signals("ai_pool", candidates[:5], reason="radar_final_top5", limit=5) if record and candidates else None
    sent = send_radar_top5_alert({"discord_top5": candidates[:5], "scanned": len(rows), "universe_size": len(SCAN_UNIVERSE), "strongest_sector": sectors[0] if sectors else None}) if send else None
    return {"ok": True, "version": "STX Final Radar v1.2", "universe_size": len(SCAN_UNIVERSE), "scanned": len(rows), "errors": errors, "top5": ranked[:limit], "items": ranked, "rankings": ranked, "final_rankings": ranked, "discord_top5": candidates[:5], "entry_candidates": candidates, "sectors": sectors[:5], "strongest_sector": sectors[0] if sectors else None, "recorded": recorded, "sent": sent}


def build_ai_pool(limit: int = 20, record: bool = False) -> dict[str, Any]:
    scan = build_market_scan(limit=max(limit, 10), record=record)
    items = scan.get("items", [])[:limit]
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in scan.get("items", []):
        groups.setdefault(str(item.get("sector") or "其他"), []).append(item)
    sector_rank = []
    for sector, sector_rows in groups.items():
        avg = round(sum(int(x.get("final_score") or x.get("score") or 0) for x in sector_rows) / max(len(sector_rows), 1), 2)
        sector_rank.append({"sector": sector, "avg_score": avg, "count": len(sector_rows), "items": sector_rows[:5]})
    sector_rank.sort(key=lambda x: (x["avg_score"], x["count"]), reverse=True)
    return {"ok": True, "version": "AI Pool v2", "pool_size": len(items), "top20": items, "sectors": sector_rank, "source": "final_market_scan", "recorded": scan.get("recorded")}


def build_breakout_alerts(limit: int = 20, min_score: int = 85, send: bool = False, record: bool = False) -> dict[str, Any]:
    scan = build_market_scan(limit=max(limit, 10), send=False, record=False)
    alerts = [x for x in scan.get("entry_candidates", []) if int(x.get("final_score") or 0) >= min_score][:limit]
    if send and alerts:
        send_radar_top5_alert({**scan, "discord_top5": alerts[:5]})
    recorded = record_module_signals("breakout", alerts, reason="api_breakout_final", limit=limit) if record else None
    return {"ok": True, "version": "Breakout Alert v2", "checked": scan.get("scanned", 0), "alert_count": len(alerts), "alerts": alerts, "sent": bool(send and alerts), "recorded": recorded}


def build_fund_flow(limit: int = 20, send: bool = False, record: bool = False) -> dict[str, Any]:
    scan = build_market_scan(limit=max(10, min(limit, 30)), send=False, record=False)
    report = build_fund_flow_report(scan, limit=limit)
    send_result = send_grouped_alerts(report.get("alerts", [])[:20], title="STX 資金流警報") if send else None
    report["sent"] = bool(send)
    report["send_result"] = send_result
    report["recorded"] = record_module_signals("fund_flow", report.get("alerts", []), reason="api_fund_flow", limit=limit) if record else None
    return report


def build_cron_run(limit: int = 20, send: bool = True) -> dict[str, Any]:
    scan = build_market_scan(limit=max(limit, 10), send=send, record=True)
    perf = get_module_performance()
    return {"ok": True, "version": "STX Scheduler v2", "limit": limit, "send": bool(send), "radar_top5": scan.get("discord_top5", []), "recorded": scan.get("recorded"), "sent": scan.get("sent"), "performance": {"total_signals": perf.get("total_signals"), "tracked_results": perf.get("tracked_results"), "github_path": perf.get("github_path")}}


@app.get("/")
def root():
    return {"status": "ok", "message": "Stock Monitor Backend is running"}


@app.get("/health")
def health():
    return {"ok": True, "logged_in": bool(api and api.stock_account), "version": "0.9.2"}


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
def discord_battle_report(limit: int = Query(10, ge=1, le=50)):
    try:
        scan = build_market_scan(limit=limit)
        stats = get_stats()
        return send_battle_report(scan, stats)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send Discord battle report: {exc}") from exc


@app.get("/api/cron-run")
def cron_run(limit: int = Query(20, ge=5, le=50), send: bool = Query(True)):
    try:
        return build_cron_run(limit=limit, send=send)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to run scheduler: {exc}") from exc


@app.get("/api/stx-query")
def stx_query(q: str = Query(...), limit: int = Query(5, ge=1, le=10)):
    try:
        scan = build_market_scan(limit=max(limit, 10))
        fund_report = build_fund_flow_report(scan, limit=20)
        return build_stx_query_response(q=q, scan=scan, fund_report=fund_report, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to run STX query: {exc}") from exc


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
def market_scan(limit: int = Query(5, ge=1, le=50), send: bool = Query(False), record: bool = Query(False), final: bool = Query(True)):
    try:
        return build_market_scan(limit=limit, send=send, record=record)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to run market scan: {exc}") from exc


@app.get("/api/ai-pool")
def ai_pool(limit: int = Query(20, ge=5, le=50), record: bool = Query(False)):
    try:
        return build_ai_pool(limit=limit, record=record)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to build AI pool: {exc}") from exc


@app.get("/api/breakout-alerts")
def breakout_alerts(limit: int = Query(20, ge=5, le=50), min_score: int = Query(85, ge=70, le=100), send: bool = Query(False), record: bool = Query(False)):
    try:
        return build_breakout_alerts(limit=limit, min_score=min_score, send=send, record=record)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to build breakout alerts: {exc}") from exc


@app.get("/api/fund-flow")
def fund_flow(limit: int = Query(20, ge=5, le=50), send: bool = Query(False), record: bool = Query(False)):
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
