"""
Timezone utilities — Fix #4

All services use get_user_today() instead of date.today().
date.today() returns the server's date (UTC in Docker).
After midnight UTC (5:30 AM IST), Indian users would get the wrong date.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def get_user_today(user_timezone: str = "Asia/Kolkata") -> date:
    """
    Returns today's date in the user's local timezone.
    Falls back to Asia/Kolkata if the timezone string is invalid.
    """
    try:
        tz = ZoneInfo(user_timezone)
    except (ZoneInfoNotFoundError, KeyError):
        tz = ZoneInfo("Asia/Kolkata")
    return datetime.now(tz).date()


def get_user_now(user_timezone: str = "Asia/Kolkata") -> datetime:
    """Returns current datetime in the user's local timezone."""
    try:
        tz = ZoneInfo(user_timezone)
    except (ZoneInfoNotFoundError, KeyError):
        tz = ZoneInfo("Asia/Kolkata")
    return datetime.now(tz)
