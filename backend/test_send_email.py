#!/usr/bin/env python3
"""Test script to send a sample email"""

import os
import asyncio
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from dotenv import load_dotenv

async def send_test_email():
    print("=" * 60)
    print("EMAIL SEND TEST")
    print("=" * 60)
    
    # Load environment variables
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    print(f"\n1. Loading .env from: {env_path}")
    load_dotenv(env_path)
    
    # Get config
    smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    sender_email = os.getenv('SENDER_EMAIL', '')
    sender_password = os.getenv('SENDER_PASSWORD', '')
    recipient_email = 'sambangiraju2001@gmail.com'
    
    print(f"\n2. Email Configuration:")
    print(f"   SMTP Server: {smtp_server}:{smtp_port}")
    print(f"   From: {sender_email}")
    print(f"   To: {recipient_email}")
    print(f"   Password: {'*' * len(sender_password)} (length: {len(sender_password)})")
    
    if not sender_email or not sender_password:
        print("\n❌ ERROR: SENDER_EMAIL or SENDER_PASSWORD not configured!")
        print("   Please check your .env file")
        return False
    
    print(f"\n3. Creating email message...")
    
    # Create email
    message = MIMEMultipart('alternative')
    message['From'] = sender_email
    message['To'] = recipient_email
    message['Subject'] = f"🧪 AI Risk Radar - Test Email [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]"
    
    # HTML body
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px 20px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">🧪 Test Email</h1>
        <p style="margin: 10px 0 0 0; font-size: 14px;">AI Risk Radar Email System Test</p>
    </div>
    
    <div style="background: #f8fafc; padding: 30px 20px; border: 1px solid #e2e8f0;">
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #1e293b; margin-top: 0;">✅ Email System Working!</h2>
            <p style="color: #475569; line-height: 1.6;">
                This is a test email from your AI Risk Radar system. If you're seeing this, 
                your email configuration is working correctly!
            </p>
            <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px; background: #f1f5f9; border-radius: 4px;">
                        <strong>Timestamp:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
                    </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                    <td style="padding: 10px; background: #f1f5f9; border-radius: 4px;">
                        <strong>Sent from:</strong> {sender_email}
                    </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                    <td style="padding: 10px; background: #f1f5f9; border-radius: 4px;">
                        <strong>SMTP Server:</strong> {smtp_server}:{smtp_port}
                    </td>
                </tr>
            </table>
        </div>
        
        <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px;">
            <p style="margin: 0; color: #1e40af; font-weight: bold;">
                🎉 Configuration Successful
            </p>
            <p style="margin: 10px 0 0 0; color: #1e40af; font-size: 14px;">
                Your AI Risk Radar system can now send email notifications for high-risk changes.
            </p>
        </div>
    </div>
    
    <div style="background: #1e293b; color: #94a3b8; padding: 20px; border-radius: 0 0 10px 10px; text-align: center; font-size: 12px;">
        <p style="margin: 0;">AI Risk Radar - Email System Test</p>
    </div>
</body>
</html>
"""
    
    html_part = MIMEText(html_body, 'html')
    message.attach(html_part)
    
    print("   ✓ Email message created")
    
    # Send email
    print(f"\n4. Attempting to send email...")
    print(f"   Connecting to {smtp_server}:{smtp_port}...")
    
    try:
        await aiosmtplib.send(
            message,
            hostname=smtp_server,
            port=smtp_port,
            start_tls=True,
            username=sender_email,
            password=sender_password,
            timeout=30,
            validate_certs=False  # Disable SSL certificate verification for macOS
        )
        
        print(f"\n✅ SUCCESS! Test email sent to {recipient_email}")
        print(f"\n📧 Check your inbox at {recipient_email}")
        print("   (Also check spam/junk folder if you don't see it)")
        return True
        
    except Exception as e:
        print(f"\n❌ FAILED to send email!")
        print(f"   Error: {str(e)}")
        print(f"\n   Troubleshooting:")
        print(f"   1. Check if your Gmail App Password is correct")
        print(f"   2. Make sure 2-Step Verification is enabled in Gmail")
        print(f"   3. Generate a new App Password at: https://myaccount.google.com/apppasswords")
        print(f"   4. Check your internet connection")
        return False

if __name__ == "__main__":
    print("\n🚀 Starting email test...")
    result = asyncio.run(send_test_email())
    print("\n" + "=" * 60)
    if result:
        print("✅ TEST PASSED")
    else:
        print("❌ TEST FAILED")
    print("=" * 60 + "\n")

