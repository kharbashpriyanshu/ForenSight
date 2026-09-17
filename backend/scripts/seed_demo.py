import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.db.database import SessionLocal, engine, Base
from app.models.domain import User, InvestigationCase
from app.core.security import get_password_hash, verify_password

DEMO_USERS = [
    {
        "username": "admin",
        "password": "forensight_admin",
        "role": "ADMIN",
        "case_title": "Recruiter Demonstration Case"
    },
    {
        "username": "user_a",
        "password": "forensight_user_a",
        "role": "INVESTIGATOR",
        "case_title": "Case Alpha (User A)"
    },
    {
        "username": "user_b",
        "password": "forensight_user_b",
        "role": "INVESTIGATOR",
        "case_title": "Case Beta (User B)"
    }
]

def seed_identities(db: Session) -> None:
    """
    Idempotent seeding for development & demonstration identities.
    Updates invalid/outdated password hashes and creates missing demo users.
    Preserves all existing cases, evidence, and audit records.
    """
    for item in DEMO_USERS:
        username = item["username"]
        plain_password = item["password"]
        role = item["role"]
        
        user = db.query(User).filter(User.username == username).first()
        
        if not user:
            user = User(
                username=username,
                hashed_password=get_password_hash(plain_password),
                role=role
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"[DEMO SEED] Created user: {username} (Role: {role})")
        else:
            # Check if password needs updating (e.g. legacy 'fake' placeholder)
            needs_password_update = False
            try:
                if not verify_password(plain_password, user.hashed_password):
                    needs_password_update = True
            except Exception:
                # Any hash format error (e.g. UnknownHashError for 'fake')
                needs_password_update = True
                
            if needs_password_update or user.role != role:
                user.hashed_password = get_password_hash(plain_password)
                user.role = role
                db.commit()
                db.refresh(user)
                print(f"[DEMO SEED] Updated credentials/role for user: {username} (Role: {role})")
            else:
                print(f"[DEMO SEED] User {username} is up to date (Role: {role})")

        # Ensure demo case exists for user
        demo_case = db.query(InvestigationCase).filter(InvestigationCase.user_id == user.id).first()
        if not demo_case:
            demo_case = InvestigationCase(
                title=item["case_title"],
                user_id=user.id,
                status="Open"
            )
            db.add(demo_case)
            db.commit()
            db.refresh(demo_case)
            print(f"[DEMO SEED] Created demo case for {username}: {demo_case.case_identifier} ({demo_case.title})")
        else:
            print(f"[DEMO SEED] User {username} already has case: {demo_case.case_identifier} ({demo_case.title})")

def main() -> None:
    print("=== ForenSight Idempotent Demo Seeding ===")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_identities(db)
        print("=== Demo Seeding Complete ===")
    finally:
        db.close()

if __name__ == "__main__":
    main()
