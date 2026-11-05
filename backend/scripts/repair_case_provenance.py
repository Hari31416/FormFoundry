"""Re-resolve specific cases using validated provenance, without calling an LLM."""

from __future__ import annotations

import argparse
import asyncio
import logging

from app.cases.models import CaseFileRecord, CaseStatus
from app.db import dispose_engine, get_session_maker
from app.resolution.service import resolve_case_fields

logger = logging.getLogger(__name__)


async def repair_cases(case_ids: list[str]) -> None:
    try:
        for case_id in case_ids:
            async with get_session_maker()() as session:
                case = await session.get(CaseFileRecord, case_id)
                if case is None:
                    raise ValueError(f"Case not found: {case_id}")
                previous_status, previous_review = case.status, case.review_status
                await resolve_case_fields(session, case_id)
                if previous_status in {
                    CaseStatus.APPROVED,
                    CaseStatus.COMPLETED,
                    CaseStatus.ARTIFACT_GENERATING,
                }:
                    case.status, case.review_status = previous_status, previous_review
                await session.commit()
                logger.info("Repaired provenance for case %s", case_id)
    finally:
        await dispose_engine()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case_ids", nargs="+")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(repair_cases(args.case_ids))


if __name__ == "__main__":
    main()
