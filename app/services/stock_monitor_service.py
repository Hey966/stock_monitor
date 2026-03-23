from __future__ import annotations

from typing import Any

from app.config import settings
from app.data_sources.stock_provider import (
    StockDataFetchError,
    StockNotFoundError,
    StockProvider,
)
from app.logger import get_logger
from app.services import user_service
from app.services.line_messaging_service import push_text

logger = get_logger(__name__)

provider = StockProvider()


def _estimate_fair_value(price: float, trailing_pe: float | None) -> tuple[float, str]:
    """
    Temporary valuation logic.

    Rules:
    - PE < 15: possibly undervalued -> fair value = price * 1.20
    - PE > 25: possibly overvalued -> fair value = price * 0.90
    - otherwise: fair value = price * 1.05
    """
    if trailing_pe is not None and trailing_pe < 15:
        return price * 1.20, "本益比偏低（可能低估）"

    if trailing_pe is not None and trailing_pe > 25:
        return price * 0.90, "本益比偏高（可能高估）"

    return price * 1.05, "本益比正常"


def _analyze_symbol(symbol: str) -> dict[str, Any]:
    stock_data = provider.get_stock_data(symbol)

    history = provider.get_price_history(symbol, period="3mo")
    history["MA20"] = history["Close"].rolling(window=20).mean()

    latest = history.iloc[-1]
    latest_close = float(latest["Close"])
    ma20 = float(latest["MA20"])

    company_name = stock_data.company_name or ""
    is_etf = "ETF" in company_name.upper()

    price = stock_data.current_price
    if price is None:
        logger.warning(
            "current_price missing from ticker.info for symbol=%s, fallback to history",
            symbol,
        )
        price = latest_close

    if is_etf:
        fair_value = price * 1.02
        valuation_reason = "ETF 不適用本益比，用保守估值"
    else:
        fair_value, valuation_reason = _estimate_fair_value(price, stock_data.trailing_pe)

    if price > ma20 and price < fair_value:
        signal = "BUY"
        signal_reason = "價格在 MA20 之上且低於合理價（上升趨勢）"
    elif price < ma20 and price > fair_value:
        signal = "SELL"
        signal_reason = "價格跌破 MA20 且高於合理價（轉弱）"
    else:
        signal = "HOLD"
        signal_reason = "趨勢與估值無明確訊號"

    return {
        "symbol": symbol,
        "ticker": stock_data.ticker,
        "company_name": stock_data.company_name,
        "price": round(price, 2),
        "ma20": round(ma20, 2),
        "fair_value": round(fair_value, 2),
        "signal": signal,
        "reason": signal_reason,
        "valuation_reason": valuation_reason,
        "trailing_pe": stock_data.trailing_pe,
        "forward_pe": stock_data.forward_pe,
        "roe": stock_data.roe,
        "dividend_yield": stock_data.dividend_yield,
        "market_cap": stock_data.market_cap,
        "currency": stock_data.currency,
        "fetched_at": stock_data.fetched_at,
    }


def _build_message(result: dict[str, Any]) -> str:
    company_name = result.get("company_name") or "N/A"
    trailing_pe = result.get("trailing_pe")
    roe = result.get("roe")
    dividend_yield = result.get("dividend_yield")
    ma20 = result.get("ma20")

    trailing_pe_text = (
        f"{trailing_pe:.2f}" if isinstance(trailing_pe, (int, float)) else "N/A"
    )
    roe_text = f"{roe:.2f}%" if isinstance(roe, (int, float)) else "N/A"
    dividend_text = (
        f"{dividend_yield:.2f}%"
        if isinstance(dividend_yield, (int, float))
        else "N/A"
    )
    ma20_text = f"{ma20:.2f}" if isinstance(ma20, (int, float)) else "N/A"

    return (
        f"股票代號：{result['symbol']}\n"
        f"公司名稱：{company_name}\n"
        f"目前價格：{result['price']}\n"
        f"MA20：{ma20_text}\n"
        f"估計合理價：{result['fair_value']}\n"
        f"訊號：{result['signal']}\n"
        f"判斷原因：{result['reason']}\n"
        f"估值說明：{result['valuation_reason']}\n"
        f"本益比 PE：{trailing_pe_text}\n"
        f"ROE：{roe_text}\n"
        f"殖利率：{dividend_text}"
    )


def _should_notify(result: dict[str, Any]) -> bool:
    """
    Only notify on BUY / SELL for now.
    """
    return result.get("signal") in {"BUY", "SELL"}


def run_monitor() -> list[dict[str, Any]]:
    """
    Execute stock monitoring workflow.
    """
    logger.info("Start stock monitor run")

    results: list[dict[str, Any]] = []

    for symbol in settings.monitor_symbols:
        try:
            result = _analyze_symbol(symbol)
            results.append(result)
            logger.info(
                "Analyzed symbol=%s signal=%s price=%s fair_value=%s",
                symbol,
                result["signal"],
                result["price"],
                result["fair_value"],
            )
        except (StockNotFoundError, StockDataFetchError, ValueError) as exc:
            logger.exception("Analyze failed for %s: %s", symbol, exc)
            results.append(
                {
                    "symbol": symbol,
                    "signal": "ERROR",
                    "reason": str(exc),
                }
            )
        except Exception as exc:
            logger.exception("Unexpected analyze error for %s: %s", symbol, exc)
            results.append(
                {
                    "symbol": symbol,
                    "signal": "ERROR",
                    "reason": f"Unexpected error: {exc}",
                }
            )

    users = user_service.get_all_users()

    for result in results:
        if not _should_notify(result):
            continue

        message = _build_message(result)

        for user_id in users:
            try:
                push_text(user_id, message)
                logger.info(
                    "Notification sent. user_id=%s symbol=%s",
                    user_id,
                    result["symbol"],
                )
            except Exception as exc:
                logger.error(
                    "Failed to send notification to user_id=%s: %s",
                    user_id,
                    exc,
                )

    logger.info("Stock monitor run finished")
    return results