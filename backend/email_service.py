# backend/email_service.py - Email notification service for high-risk changes

import os
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Dict, List


class EmailNotificationService:
    """Service to send email notifications for high-risk changes"""
    
    def __init__(self):
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.sender_email = os.getenv('SENDER_EMAIL', '')
        self.sender_password = os.getenv('SENDER_PASSWORD', '')
        self.enabled = bool(self.sender_email and self.sender_password)
        
    async def send_high_risk_notification(
        self,
        recipient_email: str,
        assessment: Dict,
        change_details: Dict
    ) -> bool:
        """
        Send email notification for high-risk change
        
        Args:
            recipient_email: Email address to send notification to
            assessment: AI risk assessment details
            change_details: Original change request details
            
        Returns:
            bool: True if email sent successfully, False otherwise
        """
        if not self.enabled:
            print("⚠️  Email notifications disabled: SENDER_EMAIL or SENDER_PASSWORD not configured")
            return False
            
        try:
            # Create email message
            message = MIMEMultipart('alternative')
            message['From'] = self.sender_email
            message['To'] = recipient_email
            message['Subject'] = f"🚨 HIGH RISK ALERT: {assessment.get('changeId', 'Unknown Change')}"
            
            # Create HTML email body
            html_body = self._create_html_email(assessment, change_details)
            
            # Attach HTML content
            html_part = MIMEText(html_body, 'html')
            message.attach(html_part)
            
            # Send email
            await aiosmtplib.send(
                message,
                hostname=self.smtp_server,
                port=self.smtp_port,
                start_tls=True,
                username=self.sender_email,
                password=self.sender_password,
                validate_certs=False  # Disable SSL certificate verification for macOS
            )
            
            print(f"✅ High-risk notification email sent to {recipient_email}")
            return True
            
        except Exception as e:
            print(f"❌ Failed to send email notification: {e}")
            return False
    
    def _create_html_email(self, assessment: Dict, change_details: Dict) -> str:
        """Create HTML email content"""
        
        risk_level = assessment.get('risk_level', 'UNKNOWN')
        risk_score = assessment.get('risk_score', 'N/A')
        change_id = assessment.get('changeId', 'Unknown')
        summary = assessment.get('summary', 'No summary available')
        recommendations = assessment.get('recommendations', [])
        confidence = assessment.get('confidence', 'N/A')
        
        # Risk level color
        risk_color = '#dc2626' if risk_level == 'HIGH' else '#ef4444' if risk_level == 'CRITICAL' else '#f59e0b'
        
        # Format recommendations as HTML list
        recs_html = ''.join([f"<li style='margin-bottom: 10px; line-height: 1.6;'>{rec}</li>" for rec in recommendations])
        
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px 20px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">🚨 HIGH RISK CHANGE DETECTED</h1>
        <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">AI Risk Radar Alert</p>
    </div>
    
    <div style="background: #f8fafc; padding: 30px 20px; border: 1px solid #e2e8f0;">
        <!-- Alert Box -->
        <div style="background: #fef2f2; border-left: 4px solid {risk_color}; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
            <p style="margin: 0; color: #991b1b; font-weight: bold; font-size: 16px;">
                ⚠️ IMMEDIATE ATTENTION REQUIRED
            </p>
            <p style="margin: 10px 0 0 0; color: #991b1b; font-size: 14px;">
                A change request has been flagged as <strong>{risk_level} RISK</strong> and requires your review before proceeding.
            </p>
        </div>
        
        <!-- Change Details -->
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                📋 Change Details
            </h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px 0; color: #64748b; font-weight: bold; width: 150px;">Change ID:</td>
                    <td style="padding: 10px 0; color: #1e293b;">{change_id}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Risk Level:</td>
                    <td style="padding: 10px 0;">
                        <span style="background: {risk_color}; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 12px;">
                            {risk_level}
                        </span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Safety Score:</td>
                    <td style="padding: 10px 0; color: #1e293b; font-weight: bold; font-size: 20px;">{risk_score}/10</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #64748b; font-weight: bold;">AI Confidence:</td>
                    <td style="padding: 10px 0; color: #1e293b;">{confidence}/10</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #64748b; font-weight: bold;">Timestamp:</td>
                    <td style="padding: 10px 0; color: #1e293b;">{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</td>
                </tr>
            </table>
        </div>
        
        <!-- AI Summary -->
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                🤖 AI Risk Assessment
            </h2>
            <p style="color: #475569; line-height: 1.8; margin: 0;">{summary}</p>
        </div>
        
        <!-- Recommendations -->
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                ✅ Recommended Actions
            </h2>
            <ol style="color: #475569; line-height: 1.8; padding-left: 20px; margin: 10px 0 0 0;">
                {recs_html}
            </ol>
        </div>
        
        <!-- Call to Action -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 20px; border-radius: 8px; text-align: center;">
            <p style="color: white; margin: 0 0 15px 0; font-size: 16px; font-weight: bold;">
                🔍 Review this change in AI Risk Radar
            </p>
            <a href="http://localhost:3000" style="display: inline-block; background: white; color: #2563eb; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                Open Dashboard
            </a>
        </div>
    </div>
    
    <div style="background: #1e293b; color: #94a3b8; padding: 20px; border-radius: 0 0 10px 10px; text-align: center; font-size: 12px;">
        <p style="margin: 0;">
            This is an automated notification from AI Risk Radar<br>
            Powered by AI-driven risk analysis
        </p>
        <p style="margin: 10px 0 0 0; opacity: 0.7;">
            © {datetime.now().year} AI Risk Radar. All rights reserved.
        </p>
    </div>
</body>
</html>
"""
        return html


# Global instance
email_service = EmailNotificationService()

