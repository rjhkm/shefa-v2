from __future__ import annotations

import csv
import math
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path


random.seed(20260823)
path = Path(__file__).resolve().parents[1] / "data" / "candles" / "XAUUSD - 15m.csv"
price = 3342.0
start = datetime(2026, 6, 1, tzinfo=UTC)
rows = []
for index in range(720):
    drift = math.sin(index / 33) * 0.85 + math.sin(index / 8) * 0.28 + random.gauss(0, 1.1)
    open_price = price
    close = max(1, open_price + drift)
    high = max(open_price, close) + abs(random.gauss(0.75, 0.4))
    low = min(open_price, close) - abs(random.gauss(0.75, 0.4))
    rows.append([start + timedelta(minutes=15 * index), open_price, high, low, close, random.randint(120, 780)])
    price = close

path.parent.mkdir(parents=True, exist_ok=True)
with path.open("w", newline="", encoding="utf-8") as file:
    writer = csv.writer(file)
    writer.writerow(["timestamp", "open", "high", "low", "close", "volume"])
    writer.writerows(rows)
print(path)
