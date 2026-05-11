import sqlite3
import os
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("INTERN_DATABASE_URL", "sqlite:///./intern.db")
if db_url.startswith("sqlite:///"):
    db_path = db_url.replace("sqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(intern_personal)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "gender" not in columns:
            print("Adding gender column...")
            cursor.execute("ALTER TABLE intern_personal ADD COLUMN gender VARCHAR")
            print("Column added.")
        else:
            print("Column already exists.")
            
        conn.commit()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()
else:
    print("Not using SQLite, manual migration needed or use Alembic.")
