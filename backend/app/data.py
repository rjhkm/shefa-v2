from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


FILE_PATTERN = re.compile(r"^(?P<pair>.+?)\s+-\s+(?P<timeframe>[^.]+)\.csv$", re.IGNORECASE)
TIMEFRAME_MINUTES = {
    "1m": 1,
    "3m": 3,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "45m": 45,
    "1h": 60,
    "2h": 120,
    "4h": 240,
    "1d": 1440,
}
TIMEFRAME_ALIASES = {
    "M1": "1m",
    "M3": "3m",
    "M5": "5m",
    "M15": "15m",
    "M30": "30m",
    "M45": "45m",
    "H1": "1h",
    "H2": "2h",
    "H4": "4h",
    "D1": "1d",
}


def normalize_timeframe(value: str) -> str:
    compact = value.strip().upper()
    if compact in TIMEFRAME_ALIASES:
        return TIMEFRAME_ALIASES[compact]
    if compact.isdigit():
        return f"{int(compact)}m"
    return value.strip().lower()


class CandleDataError(ValueError):
    pass


@dataclass(frozen=True)
class DatasetRef:
    pair: str
    timeframe: str
    path: Path


class CandleRepository:
    def __init__(self, root: Path):
        self.root = root

    def discover(self) -> list[DatasetRef]:
        self.root.mkdir(parents=True, exist_ok=True)
        result: list[DatasetRef] = []
        for path in sorted(self.root.glob("*.csv")):
            match = FILE_PATTERN.match(path.name)
            if match:
                result.append(
                    DatasetRef(
                        pair=match.group("pair").strip().upper(),
                        timeframe=normalize_timeframe(match.group("timeframe")),
                        path=path,
                    )
                )
        return result

    def catalog(self) -> dict[str, list[str]]:
        result: dict[str, list[str]] = {}
        for item in self.discover():
            result.setdefault(item.pair, []).append(item.timeframe)
        for pair in result:
            result[pair] = sorted(
                set(result[pair]), key=lambda tf: TIMEFRAME_MINUTES.get(tf, 10**9)
            )
        return result

    def load(
        self, pair: str, timeframe: str, source_timezone: str | None = None
    ) -> tuple[pd.DataFrame, dict]:
        match = next(
            (
                item
                for item in self.discover()
                if item.pair == pair.upper() and item.timeframe == normalize_timeframe(timeframe)
            ),
            None,
        )
        if not match:
            raise CandleDataError(f"No candle file found for {pair} - {timeframe}")

        raw_bytes = match.path.read_bytes()
        encoding = "utf-16" if raw_bytes.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
        first_line = raw_bytes.decode(encoding).splitlines()[0] if raw_bytes else ""
        first_fields = [field.strip().lower() for field in first_line.split(",")]
        has_header = {"open", "high", "low", "close"}.issubset(first_fields)
        if has_header:
            frame = pd.read_csv(match.path, encoding=encoding)
        else:
            column_count = len(first_fields)
            if column_count < 5:
                raise CandleDataError("Headerless candle files must contain at least timestamp and OHLC columns")
            names = ["timestamp", "open", "high", "low", "close"]
            if column_count >= 6:
                names.append("volume")
            names.extend(f"extra_{index}" for index in range(column_count - len(names)))
            frame = pd.read_csv(match.path, encoding=encoding, header=None, names=names)
        frame.columns = [str(column).strip().lower() for column in frame.columns]
        aliases = {"date": "timestamp", "time": "timestamp", "datetime": "timestamp"}
        for source, target in aliases.items():
            if source in frame.columns and target not in frame.columns:
                frame = frame.rename(columns={source: target})

        required = ["timestamp", "open", "high", "low", "close"]
        missing = [column for column in required if column not in frame.columns]
        if missing:
            raise CandleDataError(f"Missing required columns: {', '.join(missing)}")

        frame = frame[[*required, *(["volume"] if "volume" in frame.columns else [])]].copy()
        timestamp_samples = frame["timestamp"].astype(str).head(20)
        has_explicit_timezone = timestamp_samples.str.contains(r"(?:Z|[+-]\d{2}:?\d{2})$", regex=True).all()
        if has_explicit_timezone:
            frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True, errors="coerce")
        else:
            parsed = pd.to_datetime(frame["timestamp"], errors="coerce")
            timezone = source_timezone or "UTC"
            try:
                frame["timestamp"] = parsed.dt.tz_localize(
                    timezone, ambiguous="raise", nonexistent="raise"
                ).dt.tz_convert("UTC")
            except (TypeError, ValueError) as error:
                raise CandleDataError(
                    f"Could not localize timestamps with timezone '{timezone}': {error}"
                ) from error
        if frame["timestamp"].isna().any():
            bad = frame.index[frame["timestamp"].isna()].tolist()[:5]
            raise CandleDataError(f"Unparseable timestamps at CSV rows: {bad}")

        for column in ["open", "high", "low", "close", "volume"]:
            if column in frame.columns:
                frame[column] = pd.to_numeric(frame[column], errors="coerce")
        if frame[["open", "high", "low", "close"]].isna().any().any():
            raise CandleDataError("OHLC columns contain missing or non-numeric values")
        if not np.isfinite(frame[["open", "high", "low", "close"]].to_numpy()).all():
            raise CandleDataError("OHLC columns contain non-finite values")
        if (frame[["open", "high", "low", "close"]] <= 0).any().any():
            raise CandleDataError("OHLC prices must be greater than zero")

        invalid = (frame["high"] < frame[["open", "close", "low"]].max(axis=1)) | (
            frame["low"] > frame[["open", "close", "high"]].min(axis=1)
        )
        if invalid.any():
            rows = (frame.index[invalid] + 2).tolist()[:5]
            raise CandleDataError(f"Invalid OHLC relationships at CSV rows: {rows}")
        if "volume" in frame and ((frame["volume"] < 0) | ~np.isfinite(frame["volume"].fillna(0))).any():
            raise CandleDataError("Volume must be non-negative when supplied")

        frame = frame.sort_values("timestamp", kind="stable").reset_index(drop=True)
        duplicates = int(frame["timestamp"].duplicated().sum())
        if duplicates:
            raise CandleDataError(f"Found {duplicates} duplicate timestamps; fix the CSV before use")

        warnings: list[str] = []
        if not has_explicit_timezone and not source_timezone:
            warnings.append(
                "Timezone-naive timestamps were assumed to be UTC; set the broker export timezone to confirm"
            )
        expected_minutes = TIMEFRAME_MINUTES.get(normalize_timeframe(timeframe))
        gap_count = 0
        market_closure_count = 0
        if expected_minutes and len(frame) > 1:
            expected = pd.to_timedelta(int(expected_minutes), unit="min")
            gaps = frame["timestamp"].diff().iloc[1:]
            discontinuities = gaps > expected
            scheduled_closures = discontinuities & (
                (gaps <= expected + pd.to_timedelta(90, unit="min"))
                | (gaps >= pd.to_timedelta(24, unit="h"))
            )
            market_closure_count = int(scheduled_closures.sum())
            gap_count = int((discontinuities & ~scheduled_closures).sum())
            if gap_count:
                warnings.append(
                    f"{gap_count} unexpected data gaps detected after excluding likely market closures; candles were not fabricated"
                )

        return frame, {
            "file_name": match.path.name,
            "dataset_hash": hashlib.sha256(raw_bytes).hexdigest(),
            "row_count": len(frame),
            "encoding": encoding,
            "source_format": "headered" if has_header else "MetaTrader-style headerless",
            "gap_count": gap_count,
            "market_closure_count": market_closure_count,
            "source_timezone": source_timezone or ("embedded" if has_explicit_timezone else "UTC (unconfirmed)"),
            "warnings": warnings,
        }
