import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import init_db

if __name__ == "__main__":
    print("Initializing internship database to create new tables...")
    try:
        init_db()
        print("Done! roadmap_resources table should now exist if it didn't before.")
    except Exception as e:
        print(f"Error initializing database: {e}")
