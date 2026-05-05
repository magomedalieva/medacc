import os


os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("MEDIA_STORAGE_PATH", "C:/MedAccData/media")
os.environ.setdefault("IMPORT_SOURCE_PATH", "C:/MedAccData/imports")
os.environ.setdefault("ADMIN_ALLOWED_EMAILS", "admin@example.com")
