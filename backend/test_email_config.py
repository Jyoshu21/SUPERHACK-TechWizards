#!/usr/bin/env python3
"""Test script to verify email configuration"""

import os
from dotenv import load_dotenv

print("=" * 50)
print("Email Configuration Test")
print("=" * 50)

# Load .env file
print("\n1. Loading .env file...")
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
print(f"   Looking for .env at: {env_path}")
print(f"   .env exists: {os.path.exists(env_path)}")

load_dotenv(env_path)
print("   ✓ load_dotenv() called")

# Check environment variables
print("\n2. Checking environment variables:")
smtp_server = os.getenv('SMTP_SERVER', 'NOT_SET')
smtp_port = os.getenv('SMTP_PORT', 'NOT_SET')
sender_email = os.getenv('SENDER_EMAIL', 'NOT_SET')
sender_password = os.getenv('SENDER_PASSWORD', 'NOT_SET')

print(f"   SMTP_SERVER: '{smtp_server}'")
print(f"   SMTP_PORT: '{smtp_port}'")
print(f"   SENDER_EMAIL: '{sender_email}'")
print(f"   SENDER_PASSWORD: {'*' * len(sender_password) if sender_password != 'NOT_SET' else 'NOT_SET'} (length: {len(sender_password)})")

# Check if email is enabled
print("\n3. Email service status:")
if sender_email != 'NOT_SET' and sender_password != 'NOT_SET' and sender_email and sender_password:
    print("   ✅ Email service would be ENABLED")
    print(f"   Will send from: {sender_email}")
else:
    print("   ❌ Email service would be DISABLED")
    if sender_email == 'NOT_SET' or not sender_email:
        print("   Problem: SENDER_EMAIL not set")
    if sender_password == 'NOT_SET' or not sender_password:
        print("   Problem: SENDER_PASSWORD not set")

print("\n" + "=" * 50)
print("Test Complete")
print("=" * 50)

