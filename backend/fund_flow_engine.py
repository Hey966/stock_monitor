from __future__ import annotations

from typing import Any


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _clamp(value: float, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, int(round(value))))


def build_fund_flow_item(item: dict[str, Any]) -> dict[str, Any]:
    score = _num(item.get("score"))
    change = _num(item.get("change_rate"))
    volume_ratio = _num(item.get("volume_ratio"))
    close = _num(item.get("close"))
    high = _num(item.get("high"))
    low = _num(item.get("low"))
    pos = item.get("intraday_position")
    if pos is None and high and low and high > low:
        pos = (close - low) / (high - low)
    pos = _num(pos)

    buy_volume = _num(item.get("buy_volume"))
    sell_volume = _num(item.get("sell_volume"))
    if buy_volume or sell_volume:
        order_imbalance = (buy_volume - sell_volume) / max(buy_volume + sell_volume, 1)
    else:
        order_imbalance = 0.0

    fund_score = 40
    fund_score += min(volume_ratio * 10, 25)
    fund_score += min(max(change, -3) * 5, 18)
    fund_score += min(score / 10, 10)
    if pos >= 0.8:
        fund_score += 12
    elif pos <= 0.35:
        fund_score -= 10
    fund_score += order_imbalance * 15

    big_player_score = 35
    big_player_score += min(volume_ratio * 12, 30)
    big_player_score += 16 if pos >= 0.75 else -6 if pos <= 0.35 else 4
    big_player_score += 12 if score >= 80 else 6 if score >= 70 else 0
    big_player_score += order_imbalance * 20

    day_trade_risk = 25
    if change >= 4:
        day_trade_risk += 35
    elif change >= 2.5:
        day_trade_risk += 22
    elif change >= 1.2:
        day_trade_risk += 10
    if volume_ratio >= 3:
        day_trade_risk += 24
    elif volume_ratio >= 2:
        day_trade_risk += 15
    if pos <= 0.45 and change > 0:
        day_trade_risk += 18
    if order_imbalance < -0.2:
        day_trade_risk += 12

    fund_score = _clamp(fund_score)
    big_player_score = _clamp(big_player_score)
    day_trade_risk = _clamp(day_trade_risk)

    if fund_score >= 80:
        flow = "強資金流入"
    elif fund_score >= 65:
        flow = "資金偏多"
    elif fund_score >= 45:
        flow = "資金中性"
    else:
        flow = "資金轉弱"

    if big_player_score >= 80:
        chip = "主力積極"
    elif big_player_score >= 65:
        chip = "主力偏多"
    elif big_player_score >= 45:
        chip = "主力觀察"
    else:
        chip = "主力退潮"

    if day_trade_risk >= 75:
        intraday = "隔日沖高風險"
    elif day_trade_risk >= 55:
        intraday = "隔日沖觀察"
    else:
        intraday = "隔日沖風險低"

    alert = None
    if big_player_score >= 78 and fund_score >= 72 and day_trade_risk < 70:
        alert = "大戶進場警報"
    elif day_trade_risk >= 75:
        alert = "隔日沖風險警報"
    elif fund_score <= 35:
        alert = "資金退潮警報"

    return {
        **item,
        "fund_score": fund_score,
        "fund_flow": flow,
        "big_player_score": big_player_score,
        "chip_signal": chip,
        "day_trade_risk": day_trade_risk,
        "day_trade_signal": intraday,
        "order_imbalance": round(order_imbalance, 3),
        "alert": alert,
    }


def build_fund_flow_report(scan: dict[str, Any], limit: int = 20) -> dict[str, Any]:
    items = scan.get("items") or scan.get("top5") or []
    enriched = [build_fund_flow_item(item) for item in items]
    by_fund = sorted(enriched, key=lambda x: x.get("fund_score", 0), reverse=True)[:limit]
    by_big_player = sorted(enriched, key=lambda x: x.get("big_player_score", 0), reverse=True)[:limit]
    day_trade_watch = sorted(enriched, key=lambda x: x.get("day_trade_risk", 0), reverse=True)[:limit]
    alerts = [x for x in enriched if x.get("alert")]

    sectors: dict[str, dict[str, Any]] = {}
    for item in enriched:
        sector = str(item.get("sector") or "其他")
        row = sectors.setdefault(sector, {"sector": sector, "count": 0, "fund_sum": 0, "big_sum": 0, "risk_sum": 0, "top_codes": []})
        row["count"] += 1
        row["fund_sum"] += int(item.get("fund_score") or 0)
        row["big_sum"] += int(item.get("big_player_score") or 0)
        row["risk_sum"] += int(item.get("day_trade_risk") or 0)
        if len(row["top_codes"]) < 5:
            row["top_codes"].append(str(item.get("code")))

    sector_rank = []
    for row in sectors.values():
        count = max(row["count"], 1)
        sector_rank.append({
            "sector": row["sector"],
            "count": row["count"],
            "avg_fund_score": round(row["fund_sum"] / count, 2),
            "avg_big_player_score": round(row["big_sum"] / count, 2),
            "avg_day_trade_risk": round(row["risk_sum"] / count, 2),
            "top_codes": row["top_codes"],
        })
    sector_rank.sort(key=lambda x: (x["avg_fund_score"], x["avg_big_player_score"]), reverse=True)

    return {
        "ok": True,
        "version": "Fund Flow Engine v1",
        "source": "market_scan_estimated",
        "total": len(enriched),
        "fund_flow_top": by_fund,
        "big_player_top": by_big_player,
        "day_trade_watch": day_trade_watch,
        "sector_fund_rank": sector_rank,
        "alerts": alerts,
    }
