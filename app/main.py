from pprint import pprint

from app.config import settings
from app.services.line_messaging_service import (
    LineMessagingService,
    LineMessagingServiceError,
)
from app.services.stock_service import (
    StockAnalysisService,
    StockAnalysisServiceError,
)


def main() -> None:
    stock_service = StockAnalysisService()

    try:
        report = stock_service.analyze_stock("2330")

        print("=== Full Report ===")
        pprint(report.to_dict())

        print("\n=== Brief Report ===")
        brief_report = stock_service.build_brief_text_report_from_report(report)
        print(brief_report)

        if settings.LINE_CHANNEL_ACCESS_TOKEN and settings.LINE_TO_USER_ID:
            line_service = LineMessagingService(settings.LINE_CHANNEL_ACCESS_TOKEN)
            line_service.send_stock_report(
                to_user_id=settings.LINE_TO_USER_ID,
                report_text=brief_report,
            )
            print("\nLINE Messaging API 發送成功")
        else:
            print("\n未設定 LINE_CHANNEL_ACCESS_TOKEN 或 LINE_TO_USER_ID，略過 LINE 發送")

    except (StockAnalysisServiceError, LineMessagingServiceError) as exc:
        print(f"Error: {exc}")


if __name__ == "__main__":
    main()