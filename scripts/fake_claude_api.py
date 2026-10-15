"""Local stand-in for the Claude Messages API, for demos and UI tests only.

    python -m scripts.fake_claude_api --port 18765
    # then run the API with ASSISTANT_ENABLED=true ANTHROPIC_BASE_URL=http://127.0.0.1:18765 ANTHROPIC_API_KEY=stub

It plays a scripted analyst: it calls the assistant's real tools (so they run
against the real database) and writes its answer from the tool results it
receives. It is not a language model; never use it in production.
"""

import argparse
import json
import re
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from itertools import count
from typing import Any

_ids = count(1)


def _shift(iso: str, **delta: int) -> str:
    return (date.fromisoformat(iso) - timedelta(**delta)).isoformat()


def _number(value: float) -> str:
    return f"{value:,.0f}"


def _text_of(message: dict[str, Any]) -> str:
    content = message["content"]
    if isinstance(content, str):
        return content
    return " ".join(block.get("text", "") for block in content if block.get("type") == "text")


def _results(messages: list[dict[str, Any]]) -> dict[str, Any]:
    """Map tool name -> parsed result for every tool call in this turn."""
    names: dict[str, str] = {}
    found: dict[str, Any] = {}
    for message in messages:
        if not isinstance(message["content"], list):
            continue
        for block in message["content"]:
            if block.get("type") == "tool_use":
                names[block["id"]] = block["name"]
            if block.get("type") == "tool_result" and not block.get("is_error"):
                found[names.get(block["tool_use_id"], "?")] = json.loads(block["content"])
    return found


def _question(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message["role"] == "user" and isinstance(message["content"], str):
            return message["content"]
    return ""


def _symbol_in(question: str) -> str | None:
    match = re.search(r"\b([A-Z][A-Z0-9&-]{2,})\b", question)
    return match.group(1) if match else None


def plan(question: str, results: dict[str, Any]) -> list[tuple[str, dict[str, Any]]] | str:
    lower = question.lower()
    if "get_coverage" not in results:
        return [("get_coverage", {})]
    latest = results["get_coverage"]["latest_date"]
    symbol = _symbol_in(question)

    if "bank" in lower:
        if "search_symbols" not in results:
            return [("search_symbols", {"query": "bank", "limit": 5})]
        items = results["search_symbols"]["items"]
        lines = [f"- {item['symbol']} ({item['security_name']}): {_number(item['total_quantity'])} shares over {item['trading_days']} days" for item in items]
        return "These bank stocks have the most short selling across all available data:\n" + "\n".join(lines)

    if symbol:
        if "get_symbol_series" not in results:
            return [
                ("get_symbol_stats", {"symbol": symbol}),
                ("get_symbol_series", {"symbol": symbol, "date_from": _shift(latest, days=90), "date_to": latest}),
            ]
        stats = results.get("get_symbol_stats")
        points = results["get_symbol_series"]["items"]
        if not stats or not points:
            return f"I couldn't find short-selling data for {symbol} in the last three months."
        half = len(points) // 2 or 1
        first, second = points[:half], points[half:]
        first_avg = sum(p["quantity"] for p in first) / len(first)
        second_avg = sum(p["quantity"] for p in second) / max(1, len(second))
        direction = "risen" if second_avg > first_avg else "fallen"
        peak = max(points, key=lambda p: p["quantity"])
        return (
            f"{symbol} ({stats['security_name']}) was shorted on {len(points)} days in the three months to {latest}.\n"
            f"- Average per shorted day has {direction} from {_number(first_avg)} to {_number(second_avg)} shares between the first and second half of the period.\n"
            f"- The largest day was {peak['date']} with {_number(peak['quantity'])} shares.\n"
            f"- All-time, {symbol} totals {_number(stats['total_quantity'])} shares across {stats['trading_days']} days."
        )

    if "busiest" in lower or "biggest day" in lower:
        if "get_summary" not in results:
            return [("get_summary", {})]
        summary = results["get_summary"]
        peak = summary["peak_day"]
        top = summary["top_symbol"]
        return (
            f"The busiest day in the data was {peak['date']}, with {_number(peak['total_quantity'])} shares shorted.\n"
            f"- That is {peak['total_quantity'] / summary['average_daily_quantity']:.1f}× the average day ({_number(summary['average_daily_quantity'])} shares).\n"
            f"- Across all {summary['trading_days']} trading days, the most-shorted symbol is {top['symbol']} with {_number(top['total_quantity'])} shares."
        )

    if "get_top_symbols" not in results:
        return [("get_top_symbols", {"date_from": _shift(latest, days=30), "date_to": latest, "limit": 5})]
    items = results["get_top_symbols"]["items"]
    lines = [f"- {item['symbol']} ({item['security_name']}): {_number(item['total_quantity'])} shares" for item in items]
    return f"In the month to {latest}, these symbols were shorted the most:\n" + "\n".join(lines) + f"\n\n{items[0]['symbol']} leads by a wide margin."


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 - http.server API
        if not self.path.startswith("/v1/messages"):
            self.send_error(404)
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        messages = body["messages"]
        outcome = plan(_question(messages), _results(messages))
        if isinstance(outcome, str):
            content: list[dict[str, Any]] = [{"type": "text", "text": outcome}]
            stop_reason = "end_turn"
        else:
            content = [{"type": "text", "text": "Let me look that up."}] + [
                {"type": "tool_use", "id": f"toolu_stub_{next(_ids)}", "name": name, "input": tool_input}
                for name, tool_input in outcome
            ]
            stop_reason = "tool_use"
        payload = json.dumps(
            {
                "id": f"msg_stub_{next(_ids)}",
                "type": "message",
                "role": "assistant",
                "model": body.get("model", "stub"),
                "content": content,
                "stop_reason": stop_reason,
                "stop_sequence": None,
                "usage": {"input_tokens": 0, "output_tokens": 0},
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_: Any) -> None:
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=18765)
    args = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
