import uuid
from pydantic import BaseModel, EmailStr, field_validator
import re


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    user_type: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        return v

    @field_validator("user_type")
    @classmethod
    def valid_user_type(cls, v: str) -> str:
        allowed = {"student", "student_intern"}
        if v not in allowed:
            raise ValueError(f"user_type must be one of: {', '.join(allowed)}")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    onboarding_complete: bool
    onboarding_step: int


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
