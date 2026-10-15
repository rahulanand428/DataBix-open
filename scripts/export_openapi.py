"""Write the API's OpenAPI schema for frontend type generation.

    python -m scripts.export_openapi frontend/packages/sdk/openapi.json

Works without a database; the schema is generated from the route definitions.
"""

import json
import os
import sys

os.environ.setdefault("JWT_SECRET_KEY", "openapi-export-only-key-not-used-for-signing")

from main import app  # noqa: E402


def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else "openapi.json"
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(app.openapi(), handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()
