from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # База данных
    database_url: str
    
    # Redis
    redis_url: str
    
    # JWT и безопасность
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    
    # Сервер
    port: int = 4000
    host: str = "0.0.0.0"
    debug: bool = True
    
    # WebDAV
    webdav_url: str
    webdav_username: str
    webdav_password: str
    
    # CORS
    allowed_origins: List[str] = [
        "https://nareshka.site",
        "https://v2.nareshka.site", 
        "http://localhost:5173"
    ]
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings() 