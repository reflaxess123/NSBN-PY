"""
Утилитарные функции для приложения
"""
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
import logging
import re

logger = logging.getLogger(__name__)

# Регулярное выражение для валидации email
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')


def validate_email(email: str) -> bool:
    """Валидация email адреса"""
    return bool(EMAIL_REGEX.match(email))


def validate_password(password: str, min_length: int = 8) -> tuple[bool, Optional[str]]:
    """
    Валидация пароля
    Возвращает (is_valid, error_message)
    """
    if len(password) < min_length:
        return False, f"Password must be at least {min_length} characters long"
    
    if not re.search(r'[A-Za-z]', password):
        return False, "Password must contain at least one letter"
    
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    
    return True, None


def handle_db_error(db: Session, error: Exception, operation: str = "database operation"):
    """
    Обработка ошибок базы данных
    """
    logger.error(f"Database error during {operation}: {error}")
    
    try:
        db.rollback()
    except Exception as rollback_error:
        logger.error(f"Failed to rollback transaction: {rollback_error}")
    
    if isinstance(error, SQLAlchemyError):
        raise HTTPException(
            status_code=500,
            detail=f"Database error occurred during {operation}"
        )
    else:
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


def safe_db_operation(db: Session, operation_func, operation_name: str = "operation"):
    """
    Безопасное выполнение операции с базой данных
    """
    try:
        return operation_func()
    except Exception as e:
        handle_db_error(db, e, operation_name)


def log_user_action(user_id: int, action: str, details: dict = None):
    """
    Логирование действий пользователя
    """
    log_data = {
        "user_id": user_id,
        "action": action,
        "details": details or {}
    }
    logger.info(f"User action: {log_data}") 