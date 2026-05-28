from backend.database import create_tables, get_db
from backend.auth.utils import hash_password

def seed():
    create_tables()
    db = get_db()
    
    # Create teams
    teams = ["Engineering", "HR", "Sales"]
    for team in teams:
        try:
            db.execute("INSERT INTO teams (name) VALUES (?)", (team,))
        except:
            pass
    
    # Create admin user (password: admin123)
    try:
        db.execute(
            "INSERT INTO users (email, password_hash, name, team_id, role) VALUES (?, ?, ?, ?, ?)",
            ("admin@cowork.ai", hash_password("admin123"), "Admin", 1, "admin")
        )
    except:
        pass
    
    # Create test users (password: test123)
    test_users = [
        ("dev@cowork.ai", "Dev User", 1),
        ("hr@cowork.ai", "HR User", 2),
        ("sales@cowork.ai", "Sales User", 3),
    ]
    for email, name, team_id in test_users:
        try:
            db.execute(
                "INSERT INTO users (email, password_hash, name, team_id, role) VALUES (?, ?, ?, ?, ?)",
                (email, hash_password("test123"), name, team_id, "member")
            )
        except:
            pass
    
    db.commit()
    db.close()
    print("Seeded: 3 teams, 4 users (admin@cowork.ai/admin123, dev/hr/sales@cowork.ai/test123)")

if __name__ == "__main__":
    seed()
