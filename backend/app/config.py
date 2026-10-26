"""Application configuration loaded from environment variables."""
import os

from dotenv import load_dotenv

load_dotenv()


def _csv(value: str, default: list[str]) -> list[str]:
    items = [v.strip() for v in (value or "").split(",") if v.strip()]
    return items or default


class Config:
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "")
    MONGODB_URI: str = os.environ.get("MONGODB_URI", "mongomock://local")
    MONGODB_DB: str = os.environ.get("MONGODB_DB", "cohortly")

    CLASS_CODE: str = os.environ.get("CLASS_CODE", "CSE-3B")
    CLASS_NAME: str = os.environ.get("CLASS_NAME", "Class of 2027")

    STORAGE_DIR: str = os.environ.get("STORAGE_DIR", "./var/uploads")
    MAX_UPLOAD_MB: int = int(os.environ.get("MAX_UPLOAD_MB", "25") or 25)

    CORS_ORIGINS: list[str] = _csv(
        os.environ.get("CORS_ORIGINS", ""),
        ["http://localhost:5173", "http://127.0.0.1:5173"],
    )

    MAIL_HOST: str = os.environ.get("MAIL_HOST", "")
    MAIL_PORT: int = int(os.environ.get("MAIL_PORT", "587") or 587)
    MAIL_USERNAME: str = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD: str = os.environ.get("MAIL_PASSWORD", "")
    MAIL_FROM: str = os.environ.get("MAIL_FROM", "no-reply@example.edu")
    MAIL_USE_TLS: bool = os.environ.get("MAIL_USE_TLS", "true").lower() == "true"

    SESSION_TTL_DAYS: int = 30
    RESET_TTL_MINUTES: int = 30

    # Upload policy: allow-list of MIME types and hard size cap.
    ALLOWED_MIMES: set[str] = {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "text/plain",
        "text/markdown",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/octet-stream",  # only accepted for E2EE ciphertext blobs
    }
