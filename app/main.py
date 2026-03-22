from pprint import pprint

from app.data_sources.stock_provider import StockProvider, StockProviderError


def main() -> None:
    provider = StockProvider()

    try:
        stock_data = provider.get_stock_data("2330")
        pprint(stock_data.to_dict())

        history = provider.get_price_history("2330", period="1y", interval="1d")
        print(history.tail())
    except StockProviderError as exc:
        print(f"Error: {exc}")


if __name__ == "__main__":
    main()