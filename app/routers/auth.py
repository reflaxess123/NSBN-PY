from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
import uuid
import logging

from ..database import get_db
from ..models import User
from ..schemas import UserCreate, UserLogin, UserResponse, MessageResponse
from ..auth import (
    get_password_hash,
    get_user_by_email,
    verify_password,
    create_session,
    delete_session,
    get_current_user_from_session
)
from ..config import settings

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register")
async def register(user: UserCreate, request: Request, response: Response, db: Session = Depends(get_db)):
    """Регистрация нового пользователя (точно как в Node.js версии)"""
    
    # Проверяем, существует ли пользователь
    existing_user = get_user_by_email(db, user.email)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User already exists"
        )
    
    try:
        # Создаем нового пользователя
        hashed_password = get_password_hash(user.password)
        db_user = User(
            email=user.email,
            password=hashed_password
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        # Создаем сессию для нового пользователя
        session_id = str(uuid.uuid4())
        create_session(db_user.id, session_id)
        
        # Устанавливаем cookie сессии
        response.set_cookie(
            key="session_id",
            value=session_id,
            httponly=True,
            max_age=24 * 60 * 60,  # 1 день
            samesite="none" if not settings.debug else "lax",
            secure=not settings.debug,
            path="/"
        )
        
        return {
            "message": "User registered successfully",
            "userId": db_user.id
        }
        
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@router.post("/login")
async def login(user_data: UserLogin, response: Response, db: Session = Depends(get_db)):
    """Вход пользователя (точно как в Node.js версии)"""
    
    try:
        logger.info(f"Attempting login for email: {user_data.email}")
        
        # Поиск пользователя
        user = get_user_by_email(db, user_data.email)
        if not user:
            logger.warning(f"User not found: {user_data.email}")
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials"
            )
        
        logger.info(f"User found: {user.id}, checking password...")
        
        # Проверка пароля
        password_valid = verify_password(user_data.password, user.password)
        logger.info(f"Password verification result: {password_valid}")
        
        if not password_valid:
            logger.warning(f"Invalid password for user: {user_data.email}")
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials"
            )
        
        logger.info(f"Login successful for user: {user.id}")
        
        # Создаем сессию
        session_id = str(uuid.uuid4())
        create_session(user.id, session_id)
        
        # Устанавливаем cookie сессии
        response.set_cookie(
            key="session_id",
            value=session_id,
            httponly=True,
            max_age=24 * 60 * 60,  # 1 день
            samesite="none" if not settings.debug else "lax", 
            secure=not settings.debug,
            path="/"
        )
        
        return {
            "message": "Login successful",
            "userId": user.id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Выход пользователя (точно как в Node.js версии)"""
    try:
        session_id = request.cookies.get("session_id")
        if session_id:
            delete_session(session_id)
        
        # Удаляем cookie
        response.delete_cookie(
            key="session_id",
            samesite="none" if not settings.debug else "lax",
            secure=not settings.debug,
            path="/"
        )
        
        return {"message": "Logout successful"}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Could not log out, please try again"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    request: Request,
    db: Session = Depends(get_db)
):
    """Получение информации о текущем пользователе"""
    user = get_current_user_from_session(request, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    return user


@router.get("/check")
async def check_auth(request: Request, db: Session = Depends(get_db)):
    """Проверка аутентификации пользователя"""
    user = get_current_user_from_session(request, db)
    if user:
        return {"authenticated": True, "user": {"id": user.id, "email": user.email, "role": user.role}}
    else:
        return {"authenticated": False}


# Отладочный эндпоинт для проверки пользователей
@router.get("/debug/users")
async def debug_users(db: Session = Depends(get_db)):
    """Отладочный эндпоинт для просмотра пользователей"""
    users = db.query(User).all()
    return {
        "total_users": len(users),
        "users": [{"id": u.id, "email": u.email} for u in users]
    } 