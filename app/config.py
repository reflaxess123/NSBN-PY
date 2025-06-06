from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings
import json


# Константы для валидации
MAX_EMAIL_LENGTH = 255
MAX_PASSWORD_LENGTH = 255
MIN_PASSWORD_LENGTH = 8
SESSION_EXPIRE_HOURS = 24


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
    webdav_url: str = ""
    webdav_username: str = ""
    webdav_password: str = ""
    
    # CORS
    allowed_origins: List[str] = [
        "https://nareshka.site",
        "https://v2.nareshka.site", 
        "http://localhost:5173"
    ]
    
    @field_validator('allowed_origins', mode='before')
    @classmethod
    def parse_allowed_origins(cls, v):
        """Парсинг allowed_origins из строки или списка"""
        if isinstance(v, str):
            try:
                # Пытаемся парсить как JSON
                return json.loads(v)
            except json.JSONDecodeError:
                # Если не JSON, разделяем по запятым
                return [origin.strip() for origin in v.split(',') if origin.strip()]
        return v
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings() 