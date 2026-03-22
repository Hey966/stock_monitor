from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any, Optional

import pandas as pd
import yfinance as yf

from app.logger import get_logger

logger = get_logger(__name__)


class StockProviderError(Exception):
    """Base exception for stock provider errors."""


class StockNotFoundError(StockProviderError):
    """Raised when the stock data cannot be found."""


class StockDataFetchError(StockProviderError):
    """Raised when stock data fetch fails."""


@dataclass
class StockData:
    """Normalized stock data for downstream analyzers."""

    symbol: str
    ticker: str
    company_name: Optional[str]

    currency: Optional[str]
    market_cap: Optional[float]
    current_price: Optional[float]
    previous_close: Optional[float]

    trailing_pe: Optional[float]
    forward_pe: Optional[float]
    dividend_yield: Optional[float]

    roe: Optional[float]
    gross_margin: Optional[float]
    operating_margin: Optional[float]
    profit_margin: Optional[float]
    debt_to_equity: Optional[float]
    current_ratio: Optional[float]
    quick_ratio: Optional[float]

    revenue_growth: Optional[float]
    earnings_growth: Optional[float]
    return_on_assets: Optional[float]

    fifty_two_week_high: Optional[float]
    fifty_two_week_low: Optional[float]

    regular_market_volume: Optional[float]
    average_volume: Optional[float]

    fetched_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class StockProvider:
    """
    Fetch stock data from Yahoo Finance via yfinance.

    Notes:
    - For Taiwan stocks, input like '2330' will be normalized to '2330.TW'.
    - Some fields may be missing depending on the market / Yahoo availability.
    """

    def __init__(self, default_taiwan_suffix: str = ".TW") -> None:
        self.default_taiwan_suffix = default_taiwan_suffix

    def get_stock_data(self, symbol: str) -> StockData:
        """
        Fetch normalized stock data.

        Args:
            symbol: Stock symbol, e.g. '2330', 'AAPL', 'MSFT', '2454.TW'

        Returns:
            StockData

        Raises:
            StockNotFoundError: If the stock does not exist or cannot be resolved.
            StockDataFetchError: If Yahoo Finance request fails.
        """
        normalized_symbol = self._normalize_symbol(symbol)
        logger.info("Fetching stock data for symbol=%s normalized=%s", symbol, normalized_symbol)

        try:
            ticker = yf.Ticker(normalized_symbol)
            info = ticker.info
        except Exception as exc:
            logger.exception("Failed to fetch stock data from Yahoo Finance: %s", exc)
            raise StockDataFetchError(f"Failed to fetch data for symbol '{normalized_symbol}'.") from exc

        if not info or self._is_invalid_info(info):
            logger.warning("Invalid or empty stock info returned for symbol=%s", normalized_symbol)
            raise StockNotFoundError(f"Stock '{normalized_symbol}' not found or unavailable.")

        stock_data = StockData(
            symbol=symbol,
            ticker=normalized_symbol,
            company_name=self._safe_get(info, "longName") or self._safe_get(info, "shortName"),
            currency=self._safe_get(info, "currency"),
            market_cap=self._to_float(self._safe_get(info, "marketCap")),
            current_price=self._extract_current_price(info),
            previous_close=self._to_float(self._safe_get(info, "previousClose")),
            trailing_pe=self._to_float(self._safe_get(info, "trailingPE")),
            forward_pe=self._to_float(self._safe_get(info, "forwardPE")),
            dividend_yield=self._normalize_ratio(self._safe_get(info, "dividendYield")),
            roe=self._normalize_ratio(self._safe_get(info, "returnOnEquity")),
            gross_margin=self._normalize_ratio(self._safe_get(info, "grossMargins")),
            operating_margin=self._normalize_ratio(self._safe_get(info, "operatingMargins")),
            profit_margin=self._normalize_ratio(self._safe_get(info, "profitMargins")),
            debt_to_equity=self._to_float(self._safe_get(info, "debtToEquity")),
            current_ratio=self._to_float(self._safe_get(info, "currentRatio")),
            quick_ratio=self._to_float(self._safe_get(info, "quickRatio")),
            revenue_growth=self._normalize_ratio(self._safe_get(info, "revenueGrowth")),
            earnings_growth=self._normalize_ratio(self._safe_get(info, "earningsGrowth")),
            return_on_assets=self._normalize_ratio(self._safe_get(info, "returnOnAssets")),
            fifty_two_week_high=self._to_float(self._safe_get(info, "fiftyTwoWeekHigh")),
            fifty_two_week_low=self._to_float(self._safe_get(info, "fiftyTwoWeekLow")),
            regular_market_volume=self._to_float(self._safe_get(info, "regularMarketVolume")),
            average_volume=self._to_float(self._safe_get(info, "averageVolume")),
            fetched_at=datetime.utcnow().isoformat(),
        )

        logger.info(
            "Stock data fetched successfully for ticker=%s company=%s",
            stock_data.ticker,
            stock_data.company_name,
        )
        return stock_data

    def get_price_history(
        self,
        symbol: str,
        period: str = "10y",
        interval: str = "1d",
        auto_adjust: bool = False,
    ) -> pd.DataFrame:
        """
        Fetch historical OHLCV data.

        Args:
            symbol: Stock symbol, e.g. '2330', 'AAPL'
            period: e.g. '1y', '5y', '10y'
            interval: e.g. '1d', '1wk', '1mo'
            auto_adjust: Whether to auto adjust prices

        Returns:
            pandas.DataFrame with OHLCV data

        Raises:
            StockNotFoundError
            StockDataFetchError
        """
        normalized_symbol = self._normalize_symbol(symbol)
        logger.info(
            "Fetching price history for symbol=%s normalized=%s period=%s interval=%s",
            symbol,
            normalized_symbol,
            period,
            interval,
        )

        try:
            history = yf.Ticker(normalized_symbol).history(
                period=period,
                interval=interval,
                auto_adjust=auto_adjust,
            )
        except Exception as exc:
            logger.exception("Failed to fetch price history: %s", exc)
            raise StockDataFetchError(
                f"Failed to fetch price history for symbol '{normalized_symbol}'."
            ) from exc

        if history is None or history.empty:
            logger.warning("Empty price history for symbol=%s", normalized_symbol)
            raise StockNotFoundError(
                f"Price history for stock '{normalized_symbol}' not found or unavailable."
            )

        logger.info(
            "Price history fetched successfully for ticker=%s rows=%s",
            normalized_symbol,
            len(history),
        )
        return history

    def _normalize_symbol(self, symbol: str) -> str:
        """
        Normalize ticker symbol.

        Rules:
        - If symbol already has '.', keep it as is.
        - If purely digits, assume Taiwan stock and append '.TW'.
        - Otherwise keep as is.
        """
        clean_symbol = symbol.strip().upper()

        if "." in clean_symbol:
            return clean_symbol

        if clean_symbol.isdigit():
            return f"{clean_symbol}{self.default_taiwan_suffix}"

        return clean_symbol

    @staticmethod
    def _safe_get(data: dict[str, Any], key: str) -> Any:
        return data.get(key)

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _normalize_ratio(value: Any) -> Optional[float]:
        """
        Convert decimal ratio to percentage.

        Example:
        0.356 -> 35.6
        """
        if value is None:
            return None
        try:
            return float(value) * 100
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _is_invalid_info(info: dict[str, Any]) -> bool:
        """
        Best-effort validation for Yahoo Finance info.
        """
        quote_type = info.get("quoteType")
        short_name = info.get("shortName")
        long_name = info.get("longName")
        symbol = info.get("symbol")

        return not any([quote_type, short_name, long_name, symbol])

    @staticmethod
    def _extract_current_price(info: dict[str, Any]) -> Optional[float]:
        """
        Try multiple Yahoo fields for current price because field availability varies.
        """
        price_candidates = [
            info.get("currentPrice"),
            info.get("regularMarketPrice"),
            info.get("navPrice"),
            info.get("previousClose"),
        ]

        for value in price_candidates:
            try:
                if value is not None:
                    return float(value)
            except (TypeError, ValueError):
                continue

        return None