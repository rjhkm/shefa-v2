# Candle files

Place CSV files here using the convention `PAIR - TIMEFRAME.csv`, for example:

- `XAUUSD - M5.csv` or `XAUUSD - 5m.csv`
- `XAUUSD - M15.csv` or `XAUUSD - 15m.csv`
- `XAUUSD - H1.csv` or `XAUUSD - 1h.csv`

Required columns are `timestamp`, `open`, `high`, `low`, and `close`. `volume` is optional. UTF-8 headered files and UTF-16 MetaTrader-style headerless exports are both supported. Timestamps without a timezone are treated as UTC.
