from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongo_url: str = "mongodb://planeat:planeat123@mongodb:27017/planeat?authSource=admin"
    db_name: str = "planeat"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24
    cors_origins: str = "*"

    class Config:
        env_file = ".env"


settings = Settings()
