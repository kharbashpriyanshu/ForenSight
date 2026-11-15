import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.db.database import SessionLocal, engine, Base
from app.models.domain import User
from app.core.security import get_password_hash, verify_password

def init_db(db: Session) -> None:
    users_to_seed = [
        ("admin", "forensight_admin", "ADMIN"),
        ("demo_instructor", "forensight_demo_instructor", "INVESTIGATOR"),
    ]
    for username, plain_pass, role in users_to_seed:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            user = User(
                username=username,
                hashed_password=get_password_hash(plain_pass),
                role=role
            )
            db.add(user)
            db.commit()
            print(f"Created user: {username} ({role})")
        else:
            if not verify_password(plain_pass, user.hashed_password):
                user.hashed_password = get_password_hash(plain_pass)
                user.auth_failed_attempts = 0
                user.auth_locked_until = None
                db.commit()
                print(f"Updated password hash for user: {username}")
            else:
                print(f"User {username} already exists and verified")

def main() -> None:
    db = SessionLocal()
    init_db(db)

if __name__ == "__main__":
    main()
