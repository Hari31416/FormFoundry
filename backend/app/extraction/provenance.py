"""Validate citations against evidence rather than conversation history."""

from __future__ import annotations

import re
from typing import Any


def quote_is_supported(quote: Any, evidence_text: str) -> bool:
    if not isinstance(quote, str):
        return False
    normalized_quote = " ".join(quote.casefold().split())
    # Older extractions included this context label in otherwise verbatim quotes.
    normalized_quote = re.sub(r"^user answer:\s*", "", normalized_quote).strip()
    normalized_evidence = " ".join(evidence_text.casefold().split())
    if not normalized_quote:
        return False
    return (
        re.search(rf"(?<!\w){re.escape(normalized_quote)}(?!\w)", normalized_evidence)
        is not None
    )


def source_refs_are_supported(refs: list[dict[str, Any]], evidence_text: str) -> bool:
    for ref in refs:
        quote = ref.get("source_quote")
        if quote_is_supported(quote, evidence_text):
            return True
        # Nested candidate entries may have been merged into one citation.
        if isinstance(quote, str) and " | " in quote:
            if all(
                quote_is_supported(part, evidence_text) for part in quote.split(" | ")
            ):
                return True
    return False
