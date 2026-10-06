import os

os.environ.setdefault("JWT_SECRET_KEY", "pytest-only-signing-secret-not-for-deployment-32-bytes")
