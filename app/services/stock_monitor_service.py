from __future__ import annotations

from typing import Any

from app.config import settings
from app.logger import get_logger
from app.services import user_service
from app.services.line_messaging_service import push_text

logger = get_logger(__name__)


def _mock_price_data(symbol: str) -> dict[str, Any]:
    """
    暫時用假資料，先把整條流程打通。
    之後再替換成 data_sources/stock_provider.py 的真實資料來源。
    """
    mock_prices = {
        "2330": {"price": 980.0, "fair_value": 1020.0},
        "0050": {"price": 190.0, "fair_value": 185.0},
    }

    return mock_prices.get(
        symbol,
        {"price": 100.0, "fair_value": 110.0},
    )


def _analyze_symbol(symbol: str) -> dict[str, Any]:
    data = _mock_price_data(symbol)

    price = float(data["price"])
    fair_value = float(data["fair_value"])

    if price < fair_value * 0.95:
        signal = "BUY"
        reason = "目前價格低於估計合理價 95%"
    elif price > fair_value * 1.05:
        signal = "SELL"
        reason = "目前價格高於估計合理價 105%"
    else:
        signal = "HOLD"
        reason = "目前價格接近合理價"

    return {
        "symbol": symbol,
        "price": price,
        "fair_value": fair_value,
        "signal": signal,
        "reason": reason,
    }


def _build_message(result: dict[str, Any]) -> str:
    return (
        f"股票代號：{result['symbol']}\n"
        f"目前價格：{result['price']}\n"
        f"估計合理價：{result['fair_value']}\n"
        f"訊號：{result['signal']}\n"
        f"原因：{result['reason']}"
    )


def _should_notify(result: dict[str, Any]) -> bool:
    """
    先簡化：
    只有 BUY / SELL 才通知
    """
    return result["signal"] in {"BUY", "SELL"}


def run_monitor() -> list[dict[str, Any]]:
    """
    執行股票監控主流程
    """
    logger.info("Start stock monitor run")

    results: list[dict[str, Any]] = []

    for symbol in settings.monitor_symbols:
        try:
            result = _analyze_symbol(symbol)
            results.append(result)
            logger.info(
                f"Analyzed symbol={symbol}, signal={result['signal']}, "
                f"price={result['price']}, fair_value={result['fair_value']}"
            )
        except Exception as exc:
            logger.exception(f"Analyze failed for {symbol}: {exc}")
            results.append(
                {
                    "symbol": symbol,
                    "signal": "ERROR",
                    "reason": str(exc),
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
                    f"Notification sent. user_id={user_id}, symbol={result['symbol']}"
                )
            except Exception as exc:
                logger.error(
                    f"Failed to send notification to user_id={user_id}: {exc}"
                )

    logger.info("Stock monitor run finished")
    return results