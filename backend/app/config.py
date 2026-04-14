from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_name: str = "planeat"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24
    cors_origins: str = "http://localhost:3001"

    # MongoDB Settings
    mongo_password: str = "planeat123"
    mongo_url: str = ""

    @property
    def effective_mongo_url(self) -> str:
        if self.mongo_url:
            return self.mongo_url
        return f"mongodb://planeat:{self.mongo_password}@mongodb:27017/{self.db_name}?authSource=admin"

    # PDF Storage
    pdf_storage_path: str = "/app/pdf_storage"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Logging
    log_level: str = "INFO"

    # Public URL
    public_url: str = ""

    # SMTP Settings
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@planeat.com"

    class Config:
        env_file = ".env"


settings = Settings()
