"""CLI entrypoint for seeding or resetting the FS-DEMO-001 instructor demonstration case."""

import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.services.instructor_demo import (
    DEMO_CASE_IDENTIFIER,
    DEMO_PASSWORD,
    DEMO_USERNAME,
    reset_instructor_demo,
    seed_instructor_demo,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Idempotently seed or reset the ForenSight instructor demonstration case (FS-DEMO-001)."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Safely remove only FS-DEMO-001 and re-seed it from scratch (preserves all other cases/users).",
    )
    parser.add_argument(
        "--reset-only",
        action="store_true",
        help="Safely remove only FS-DEMO-001 without re-seeding (preserves all other cases/users).",
    )
    args = parser.parse_args()

    if settings.ENVIRONMENT.strip().lower() in {"production", "prod"}:
        raise SystemExit("Refusing to seed or reset development demonstration data in production.")

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if args.reset_only:
            res = reset_instructor_demo(db)
            print(f"[INSTRUCTOR DEMO] Reset complete: {res}")
            return

        res = seed_instructor_demo(db, reset=args.reset)
        print("=== ForenSight Instructor Demonstration Ready ===")
        print(f"Status:          {res.get('status')}")
        print(f"Case Identifier: {DEMO_CASE_IDENTIFIER}")
        print(f"Demo Account:    {DEMO_USERNAME} / {DEMO_PASSWORD} (INVESTIGATOR, dev/demo only)")
        print(f"Evidence Items:  {res.get('evidence_count')}")
        if "reportlab_available" in res:
            print(f"ReportLab PDF:   {res.get('reportlab_available')}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

