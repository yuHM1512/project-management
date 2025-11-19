"""
Script debug để kiểm tra mentions
Chạy: python debug_mentions.py
"""
import sys
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Thread, User, Project
import json

def debug_mentions():
    db: Session = SessionLocal()
    
    try:
        # 1. Kiểm tra thread có mentions null
        print("=" * 50)
        print("1. KIỂM TRA THREADS CÓ MENTIONS NULL")
        print("=" * 50)
        threads_with_mentions = db.query(Thread).filter(
            Thread.content.like('%@%')
        ).all()
        
        for thread in threads_with_mentions:
            print(f"\nThread ID: {thread.id}")
            print(f"Content: {thread.content}")
            print(f"Mentions (raw): {thread.mentions}")
            print(f"Mentions type: {type(thread.mentions)}")
            if thread.mentions:
                print(f"Mentions (parsed): {json.loads(thread.mentions) if isinstance(thread.mentions, str) else thread.mentions}")
            else:
                print("Mentions: NULL hoặc empty")
        
        # 2. Test parse mentions với content thực tế
        print("\n" + "=" * 50)
        print("2. TEST PARSE MENTIONS")
        print("=" * 50)
        
        # Import parse_mentions
        from routers.threads import parse_mentions
        
        test_content = "@L2006 test"
        project_id = 4  # Thay bằng project_id thực tế
        
        print(f"\nTest content: {test_content}")
        print(f"Project ID: {project_id}")
        
        mentions = parse_mentions(test_content, project_id, db)
        print(f"Parsed mentions: {mentions}")
        
        # 3. Kiểm tra users trong database
        print("\n" + "=" * 50)
        print("3. DANH SÁCH USERS TRONG DATABASE")
        print("=" * 50)
        all_users = db.query(User).filter(User.is_active == True).all()
        print(f"\nTổng số users active: {len(all_users)}")
        for user in all_users:
            print(f"  - ID: {user.id}, Username: '{user.username}', Full Name: '{user.full_name}'")
        
        # 4. Test match với "L2006"
        print("\n" + "=" * 50)
        print("4. TEST MATCH VỚI 'L2006'")
        print("=" * 50)
        mention_text = "L2006"
        mention_lower = mention_text.lower()
        print(f"Tìm user với mention: '{mention_text}' (lowercase: '{mention_lower}')")
        
        matched_users = []
        for user in all_users:
            # Exact match username
            if user.username and user.username.lower() == mention_lower:
                matched_users.append(user)
                print(f"  ✓ EXACT MATCH username: '{user.username}' (ID: {user.id})")
            # Exact match full_name
            elif user.full_name and user.full_name.lower() == mention_lower:
                matched_users.append(user)
                print(f"  ✓ EXACT MATCH full_name: '{user.full_name}' (ID: {user.id})")
            # Partial match
            elif user.username and mention_lower in user.username.lower():
                print(f"  ~ PARTIAL MATCH username: '{user.username}' (ID: {user.id})")
            elif user.full_name and mention_lower in user.full_name.lower():
                print(f"  ~ PARTIAL MATCH full_name: '{user.full_name}' (ID: {user.id})")
        
        if not matched_users:
            print("  ✗ Không tìm thấy user nào EXACT MATCH!")
            print(f"  Tìm kiếm gần đúng (partial):")
            for user in all_users:
                if user.username and "l2006" in user.username.lower():
                    print(f"    - Username: '{user.username}' (ID: {user.id})")
                if user.full_name and "l2006" in user.full_name.lower():
                    print(f"    - Full Name: '{user.full_name}' (ID: {user.id})")
        
        # 5. Kiểm tra notifications
        print("\n" + "=" * 50)
        print("5. KIỂM TRA NOTIFICATIONS")
        print("=" * 50)
        from models import Notification
        notifications = db.query(Notification).filter(
            Notification.type == "mentioned"
        ).order_by(Notification.created_at.desc()).limit(10).all()
        
        print(f"\nTổng số notifications 'mentioned': {len(notifications)}")
        for notif in notifications:
            print(f"  - ID: {notif.id}, User ID: {notif.user_id}, Thread ID: {notif.thread_id}")
            print(f"    Title: {notif.title}")
            print(f"    Created: {notif.created_at}")
        
        # 6. Test regex pattern
        print("\n" + "=" * 50)
        print("6. TEST REGEX PATTERN")
        print("=" * 50)
        import re
        test_contents = [
            "@L2006 test",
            "@L2006",
            "@user123",
            "@Nguyen Van A",
            "Hello @L2006 how are you?",
        ]
        
        pattern = r'@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)'
        for content in test_contents:
            matches = re.findall(pattern, content)
            print(f"Content: '{content}'")
            print(f"  Matches: {matches}")
        
    finally:
        db.close()

if __name__ == "__main__":
    debug_mentions()

