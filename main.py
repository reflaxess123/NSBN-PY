from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import uvicorn

from app.config import settings
from app.database import get_db
from app.models import User
from app.auth import get_current_user_from_session
from app.routers import auth, theory, content, stats, admin

# Создание приложения FastAPI ////
app = FastAPI(
    title="Nareshka Learning Platform API",
    description="API для платформы изучения программирования",
    version="2.0.0",
    docs_url="/api-docs",
    redoc_url="/api-redoc"
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Подключение роутеров
app.include_router(auth.router)
app.include_router(theory.router)
app.include_router(content.router)
app.include_router(stats.router)
app.include_router(admin.router)

@app.get("/")
async def root():
    """Базовый endpoint"""
    return {"message": "Hello World! Nareshka API v2.0 на Python"}


@app.get("/api/profile")
async def get_profile(request: Request, db: Session = Depends(get_db)):
    """Получение профиля пользователя"""
    user = get_current_user_from_session(request, db)
    if not user:
        return JSONResponse(
            status_code=401,
            content={"message": "Not authenticated"}
        )
    
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "createdAt": user.createdAt.isoformat()
    }


@app.get("/health")
async def health_check():
    """Проверка здоровья сервиса"""
    return {"status": "healthy", "version": "2.0.0"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    ) 