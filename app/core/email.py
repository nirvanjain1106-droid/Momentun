"""
Email utility module.
- Development: logs emails to console (no SMTP required)
- Production: sends via SMTP (configure SMTP_* env vars)
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body_html: str) -> bool:
    """
    Send an email. Returns True on success, False on failure.
    In development, logs to console instead of sending.
    """
    if not settings.SMTP_HOST or settings.APP_ENV == "development":
        logger.info(
            "email_sent_dev_mode",
            extra={"to": to, "subject": subject},
        )
        logger.info(f"  To: {to}")
        logger.info(f"  Subject: {subject}")
        logger.info(f"  Body:\n{body_html}")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, to, msg.as_string())

        logger.info("email_sent", extra={"to": to, "subject": subject})
        return True
    except Exception:
        logger.exception("email_send_failed", extra={"to": to, "subject": subject})
        return False


def send_verification_email(email: str, token: str) -> bool:
    """Send an email verification link."""
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    body = f"""
    <h2>Verify your Momentum account</h2>
    <p>Click the link below to verify your email address:</p>
    <p><a href="{verify_url}">{verify_url}</a></p>
    <p>This link expires in {settings.EMAIL_VERIFICATION_EXPIRE_HOURS} hours.</p>
    <p>If you didn't create this account, ignore this email.</p>
    """
    return send_email(email, "Verify your Momentum account", body)


def send_password_reset_email(email: str, token: str) -> bool:
    """Send a password reset link."""
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    body = f"""
    <h2>Reset your password</h2>
    <p>Click the link below to reset your password:</p>
    <p><a href="{reset_url}">{reset_url}</a></p>
    <p>This link expires in {settings.PASSWORD_RESET_EXPIRE_MINUTES} minutes.</p>
    <p>If you didn't request this, ignore this email.</p>
    """
    return send_email(email, "Reset your Momentum password", body)
