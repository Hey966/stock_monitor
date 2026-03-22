from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Optional

from app.analyzers.swot_analyzer import SWOTAnalyzer
from app.analyzers.valuation_analyzer import ValuationAnalyzer
from app.analyzers.value_trap_analyzer import ValueTrapAnalyzer
from app.data_sources.stock_provider import (
    StockDataFetchError,
    StockNotFoundError,
    StockProvider,
)
from app.logger import get_logger

logger = get_logger(__name__)


class StockAnalysisServiceError(Exception):
    """Base exception for stock analysis service."""


@dataclass
class StockAnalysisReport:
    """Complete stock analysis report."""

    stock_id: str
    company_name: Optional[str]

    stock_data: dict[str, Any]
    valuation: dict[str, Any]
    value_trap: dict[str, Any]
    swot: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class StockAnalysisService:
    """
    Orchestrates:
    1. Fetch stock data
    2. Run valuation analysis
    3. Run value trap analysis
    4. Run SWOT analysis
    """

    def __init__(
        self,
        stock_provider: Optional[StockProvider] = None,
        valuation_analyzer: Optional[ValuationAnalyzer] = None,
        value_trap_analyzer: Optional[ValueTrapAnalyzer] = None,
        swot_analyzer: Optional[SWOTAnalyzer] = None,
    ) -> None:
        self.stock_provider = stock_provider or StockProvider()
        self.valuation_analyzer = valuation_analyzer or ValuationAnalyzer()
        self.value_trap_analyzer = value_trap_analyzer or ValueTrapAnalyzer()
        self.swot_analyzer = swot_analyzer or SWOTAnalyzer()

    def analyze_stock(self, stock_id: str) -> StockAnalysisReport:
        """
        Analyze a stock and return a complete report.

        Args:
            stock_id: Stock symbol, e.g. '2330', 'AAPL'

        Returns:
            StockAnalysisReport

        Raises:
            StockAnalysisServiceError
        """
        logger.info("Start full stock analysis for stock_id=%s", stock_id)

        try:
            stock_data_obj = self.stock_provider.get_stock_data(stock_id)
            stock_data = stock_data_obj.to_dict()

            valuation_result_obj = self.valuation_analyzer.analyze(stock_data)
            valuation_result = valuation_result_obj.to_dict()

            value_trap_result_obj = self.value_trap_analyzer.analyze(
                stock_data=stock_data,
                valuation_result=valuation_result,
            )
            value_trap_result = value_trap_result_obj.to_dict()

            swot_result_obj = self.swot_analyzer.analyze(
                stock_data=stock_data,
                valuation_result=valuation_result,
                value_trap_result=value_trap_result,
            )
            swot_result = swot_result_obj.to_dict()

            report = StockAnalysisReport(
                stock_id=stock_id,
                company_name=stock_data.get("company_name"),
                stock_data=stock_data,
                valuation=valuation_result,
                value_trap=value_trap_result,
                swot=swot_result,
            )

            logger.info(
                "Full stock analysis completed for stock_id=%s company=%s",
                stock_id,
                report.company_name,
            )
            return report

        except (StockNotFoundError, StockDataFetchError) as exc:
            logger.exception("Stock analysis failed for stock_id=%s: %s", stock_id, exc)
            raise StockAnalysisServiceError(
                f"Failed to analyze stock '{stock_id}': {exc}"
            ) from exc
        except Exception as exc:
            logger.exception("Unexpected error during stock analysis for %s: %s", stock_id, exc)
            raise StockAnalysisServiceError(
                f"Unexpected error during stock analysis for '{stock_id}'."
            ) from exc

    def build_brief_text_report_from_report(self, report: StockAnalysisReport) -> str:

        valuation = report.valuation
        value_trap = report.value_trap
        swot = report.swot

        strengths = swot.get("strengths", [])
        weaknesses = swot.get("weaknesses", [])
        opportunities = swot.get("opportunities", [])
        threats = swot.get("threats", [])

        lines = [
            f"📊 {report.company_name or report.stock_id} ({report.stock_id})",
            "",
            f"估值區間：{valuation.get('final_zone', '未知')}",
            f"估值摘要：{valuation.get('summary', '無')}",
            "",
            f"價值陷阱：{'是' if value_trap.get('is_value_trap') else '否'}",
            f"風險等級：{value_trap.get('risk_level', '未知')}",
            f"陷阱摘要：{value_trap.get('summary', '無')}",
            "",
            "【優勢】",
        ]

        lines.extend([f"- {item}" for item in strengths[:3]])
        lines.append("")
        lines.append("【劣勢】")
        lines.extend([f"- {item}" for item in weaknesses[:3]])
        lines.append("")
        lines.append("【機會】")
        lines.extend([f"- {item}" for item in opportunities[:3]])
        lines.append("")
        lines.append("【威脅】")
        lines.extend([f"- {item}" for item in threats[:3]])

        return "\n".join(lines)