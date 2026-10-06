import argparse
from pathlib import Path

from ingestion.short_selling import DEFAULT_SHORT_SELLING_CSV
from services.short_selling_service import ShortSellingService


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest the short-selling CSV")
    parser.add_argument("--csv", type=Path, default=DEFAULT_SHORT_SELLING_CSV)
    parser.add_argument("--chunk-size", type=int, default=1_000)
    args = parser.parse_args()

    result = ShortSellingService().ingest_csv(args.csv, chunk_size=args.chunk_size)
    print(
        f"Processed {result.mongo_rows} rows from {result.source_file}; "
        f"inserted {result.postgres_rows} new PostgreSQL rows; "
        f"skipped {result.skipped_rows} rows with a dash quantity."
    )


if __name__ == "__main__":
    main()
