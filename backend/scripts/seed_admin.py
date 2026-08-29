import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.db.database import SessionLocal, engine, Base
from app.models.domain import User
from app.core.security import get_password_hash

def init_db(db: Session) -> None:
    user = db.query(User).filter(User.username == "admin").first()
    if not user:
        user = User(
            username="admin",
            hashed_password=get_password_hash("forensight_admin"),
            role="ADMIN"
        )
        db.add(user)
        db.commit()
        print("Admin user created (admin / forensight_admin)")
    else:
        print("Admin user already exists")

def main() -> None:
    db = SessionLocal()
    init_db(db)

if __name__ == "__main__":
    main()
