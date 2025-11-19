"""
Script để test debug endpoint
Chạy: python test_debug_endpoint.py
"""
import requests
import json

# Thay đổi token và URL nếu cần
BASE_URL = "http://localhost:8000"
TOKEN = None  # Sẽ lấy từ login hoặc nhập thủ công

def login_and_get_token(username: str, password: str):
    """Login và lấy token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": username, "password": password}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    else:
        print(f"Login failed: {response.status_code} - {response.text}")
        return None

def test_debug_parse_mentions(token: str, content: str, project_id: int):
    """Test debug endpoint"""
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    params = {
        "content": content,
        "project_id": project_id
    }
    
    url = f"{BASE_URL}/api/threads/debug/parse-mentions"
    
    print("=" * 60)
    print("TEST DEBUG PARSE MENTIONS")
    print("=" * 60)
    print(f"URL: {url}")
    print(f"Content: {content}")
    print(f"Project ID: {project_id}")
    print()
    
    response = requests.get(url, headers=headers, params=params)
    
    print(f"Status Code: {response.status_code}")
    print()
    
    if response.status_code == 200:
        data = response.json()
        print("Response:")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Parsed mentions: {data.get('parsed_mentions')}")
        print(f"Matched users count: {len(data.get('matched_users', []))}")
        if data.get('matched_users'):
            for user in data['matched_users']:
                print(f"  - User ID: {user['id']}, Username: {user['username']}, Full Name: {user['full_name']}")
        else:
            print("  ✗ No users matched!")
            print("\nAvailable users:")
            for user in data.get('all_users', [])[:10]:  # Show first 10
                print(f"  - ID: {user['id']}, Username: '{user['username']}', Full Name: '{user['full_name']}'")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    # Option 1: Login để lấy token tự động
    print("Option 1: Login để lấy token")
    username = input("Username: ").strip()
    password = input("Password: ").strip()
    
    token = login_and_get_token(username, password)
    
    if not token:
        print("\nOption 2: Nhập token thủ công")
        token = input("Token: ").strip()
    
    if token:
        # Test với các cases khác nhau
        test_cases = [
            ("@L2006 mention!", 4),
            ("@L2006", 4),
            ("Hello @L2006 how are you?", 4),
        ]
        
        for content, project_id in test_cases:
            test_debug_parse_mentions(token, content, project_id)
            print("\n")
    else:
        print("No token available!")

