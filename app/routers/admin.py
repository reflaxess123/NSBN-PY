from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_
from typing import Optional, List
import logging
from pydantic import BaseModel, EmailStr
from datetime import datetime

from ..database import get_db
from ..models import User, ContentFile, ContentBlock, TheoryCard, UserContentProgress, UserTheoryProgress
from ..auth import require_admin, get_password_hash

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin"])

# Pydantic models для запросов
class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "USER"

class UpdateUserRequest(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None

class CreateContentFileRequest(BaseModel):
    webdavPath: str
    mainCategory: str
    subCategory: str

class UpdateContentFileRequest(BaseModel):
    webdavPath: Optional[str] = None
    mainCategory: Optional[str] = None
    subCategory: Optional[str] = None

class CreateContentBlockRequest(BaseModel):
    fileId: str
    pathTitles: list
    blockTitle: str
    blockLevel: int
    orderInFile: int
    textContent: Optional[str] = None
    codeContent: Optional[str] = None
    codeLanguage: Optional[str] = None
    isCodeFoldable: bool = False
    codeFoldTitle: Optional[str] = None
    extractedUrls: list = []

class CreateTheoryCardRequest(BaseModel):
    ankiGuid: Optional[str] = None
    cardType: str
    deck: str
    category: str
    subCategory: Optional[str] = None
    questionBlock: str
    answerBlock: str
    tags: list = []
    orderIndex: int = 0

class UpdateTheoryCardRequest(BaseModel):
    ankiGuid: Optional[str] = None
    cardType: Optional[str] = None
    deck: Optional[str] = None
    category: Optional[str] = None
    subCategory: Optional[str] = None
    questionBlock: Optional[str] = None
    answerBlock: Optional[str] = None
    tags: Optional[list] = None
    orderIndex: Optional[int] = None

class UpdateContentBlockRequest(BaseModel):
    fileId: Optional[str] = None
    pathTitles: Optional[list] = None
    blockTitle: Optional[str] = None
    blockLevel: Optional[int] = None
    orderInFile: Optional[int] = None
    textContent: Optional[str] = None
    codeContent: Optional[str] = None
    codeLanguage: Optional[str] = None
    isCodeFoldable: Optional[bool] = None
    codeFoldTitle: Optional[str] = None
    extractedUrls: Optional[list] = None

class BulkDeleteRequest(BaseModel):
    ids: List[str]


@router.get("/stats")
async def get_admin_stats(
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Получение общей статистики системы"""
    
    try:
        # Статистика пользователей
        users_stats = db.query(User.role, func.count(User.id)).group_by(User.role).all()
        total_users = db.query(User).count()
        
        users_by_role = {"admin": 0, "user": 0, "guest": 0}
        for role, count in users_stats:
            users_by_role[role.lower()] = count
        
        # Статистика контента
        total_files = db.query(ContentFile).count()
        total_blocks = db.query(ContentBlock).count()
        total_theory_cards = db.query(TheoryCard).count()
        
        # Статистика прогресса
        total_content_progress = db.query(UserContentProgress).count()
        total_theory_progress = db.query(UserTheoryProgress).count()
        
        return {
            "users": {
                "total": total_users,
                "admins": users_by_role["admin"],
                "regularUsers": users_by_role["user"],
                "guests": users_by_role["guest"]
            },
            "content": {
                "totalFiles": total_files,
                "totalBlocks": total_blocks,
                "totalTheoryCards": total_theory_cards
            },
            "progress": {
                "totalContentProgress": total_content_progress,
                "totalTheoryProgress": total_theory_progress
            }
        }
        
    except Exception as e:
        logger.error(f"Admin stats error: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/users")
async def get_admin_users(
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
    page: int = Query(1, ge=1, description="Номер страницы"),
    limit: int = Query(20, ge=1, le=100, description="Количество пользователей на странице"),
    role: Optional[str] = Query(None, description="Фильтр по роли"),
    search: Optional[str] = Query(None, description="Поиск по email")
):
    """Получение списка всех пользователей"""
    
    try:
        skip = (page - 1) * limit
        
        # Строим запрос
        query = db.query(User)
        
        if role:
            query = query.filter(User.role == role)
        
        if search:
            query = query.filter(User.email.ilike(f"%{search}%"))
        
        # Получаем общее количество
        total = query.count()
        
        # Получаем пользователей с подсчетом прогресса
        users = query.order_by(desc(User.createdAt)).offset(skip).limit(limit).all()
        
        # Добавляем подсчет прогресса для каждого пользователя
        users_with_progress = []
        for user in users:
            content_progress_count = db.query(UserContentProgress).filter(
                UserContentProgress.userId == user.id
            ).count()
            
            theory_progress_count = db.query(UserTheoryProgress).filter(
                UserTheoryProgress.userId == user.id
            ).count()
            
            users_with_progress.append({
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "createdAt": user.createdAt,
                "updatedAt": user.updatedAt,
                "_count": {
                    "progress": content_progress_count,
                    "theoryProgress": theory_progress_count
                }
            })
        
        return {
            "users": users_with_progress,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": (total + limit - 1) // limit
            }
        }
        
    except Exception as e:
        logger.error(f"Admin users list error: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post("/users")
async def create_admin_user(
    user_data: CreateUserRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Создание нового пользователя"""
    
    try:
        if len(user_data.password) < 6:
            raise HTTPException(
                status_code=400,
                detail="Пароль должен содержать минимум 6 символов"
            )
        
        # Проверяем, не существует ли уже пользователь с таким email
        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(
                status_code=409,
                detail="Пользователь с таким email уже существует"
            )
        
        # Хешируем пароль
        hashed_password = get_password_hash(user_data.password)
        
        # Создаем пользователя
        new_user = User(
            email=user_data.email,
            password=hashed_password,
            role=user_data.role
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        return {
            "id": new_user.id,
            "email": new_user.email,
            "role": new_user.role,
            "createdAt": new_user.createdAt
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin create user error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.put("/users/{user_id}")
async def update_admin_user(
    user_id: int,
    user_data: UpdateUserRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Обновление пользователя"""
    
    try:
        # Находим пользователя
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Проверяем email если он изменяется
        if user_data.email and user_data.email != user.email:
            existing_user = db.query(User).filter(User.email == user_data.email).first()
            if existing_user:
                raise HTTPException(
                    status_code=409,
                    detail="Email уже используется другим пользователем"
                )
            user.email = user_data.email
        
        # Обновляем роль
        if user_data.role:
            user.role = user_data.role
        
        # Обновляем пароль
        if user_data.password:
            if len(user_data.password) < 6:
                raise HTTPException(
                    status_code=400,
                    detail="Пароль должен содержать минимум 6 символов"
                )
            user.password = get_password_hash(user_data.password)
        
        db.commit()
        db.refresh(user)
        
        return {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "updatedAt": user.updatedAt
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin update user error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.delete("/users/{user_id}")
async def delete_admin_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Удаление пользователя"""
    
    try:
        # Запрещаем удалять самого себя
        if user_id == admin_user.id:
            raise HTTPException(
                status_code=400,
                detail="Нельзя удалить самого себя"
            )
        
        # Находим и удаляем пользователя
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        db.delete(user)
        db.commit()
        
        return {"message": "Пользователь успешно удален"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin delete user error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/content/stats")
async def get_admin_content_stats(
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Получение детальной статистики по контенту"""
    
    try:
        # Статистика по категориям контента
        content_by_category = db.query(
            ContentFile.mainCategory,
            func.count(ContentFile.id).label('files_count')
        ).group_by(ContentFile.mainCategory).all()
        
        # Статистика по блокам в категориях
        blocks_by_category = db.query(
            ContentFile.mainCategory,
            func.count(ContentBlock.id).label('blocks_count')
        ).join(ContentBlock, ContentFile.id == ContentBlock.fileId).group_by(
            ContentFile.mainCategory
        ).all()
        
        # Статистика прогресса по категориям
        progress_by_category = db.query(
            ContentFile.mainCategory,
            func.count(UserContentProgress.id).label('progress_count')
        ).join(
            ContentBlock, ContentFile.id == ContentBlock.fileId
        ).join(
            UserContentProgress, ContentBlock.id == UserContentProgress.blockId
        ).group_by(ContentFile.mainCategory).all()
        
        return {
            "categoriesStats": {
                "filesByCategory": [{"category": cat, "count": count} for cat, count in content_by_category],
                "blocksByCategory": [{"category": cat, "count": count} for cat, count in blocks_by_category],
                "progressByCategory": [{"category": cat, "count": count} for cat, count in progress_by_category]
            }
        }
        
    except Exception as e:
        logger.error(f"Admin content stats error: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/content/files")
async def get_admin_content_files(
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    """Получение списка файлов контента для админки"""
    
    try:
        skip = (page - 1) * limit
        
        query = db.query(ContentFile)
        
        if category:
            query = query.filter(ContentFile.mainCategory.ilike(f"%{category}%"))
        
        if search:
            query = query.filter(ContentFile.webdavPath.ilike(f"%{search}%"))
        
        total = query.count()
        files = query.order_by(desc(ContentFile.createdAt)).offset(skip).limit(limit).all()
        
        # Добавляем подсчет блоков для каждого файла
        files_with_blocks = []
        for file in files:
            blocks_count = db.query(ContentBlock).filter(ContentBlock.fileId == file.id).count()
            files_with_blocks.append({
                "id": file.id,
                "webdavPath": file.webdavPath,
                "mainCategory": file.mainCategory,
                "subCategory": file.subCategory,
                "createdAt": file.createdAt,
                "updatedAt": file.updatedAt,
                "blocksCount": blocks_count
            })
        
        return {
            "files": files_with_blocks,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": (total + limit - 1) // limit
            }
        }
        
    except Exception as e:
        logger.error(f"Admin content files error: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/content/blocks")
async def get_admin_content_blocks(
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    fileId: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    """Получение списка блоков контента для админки"""
    
    try:
        skip = (page - 1) * limit
        
        query = db.query(ContentBlock).join(ContentFile)
        
        if fileId:
            query = query.filter(ContentBlock.fileId == fileId)
        
        if search:
            query = query.filter(ContentBlock.blockTitle.ilike(f"%{search}%"))
        
        total = query.count()
        blocks = query.order_by(desc(ContentBlock.createdAt)).offset(skip).limit(limit).all()
        
        return {
            "blocks": [
                {
                    "id": block.id,
                    "fileId": block.fileId,
                    "blockTitle": block.blockTitle,
                    "blockLevel": block.blockLevel,
                    "orderInFile": block.orderInFile,
                    "createdAt": block.createdAt,
                    "updatedAt": block.updatedAt,
                    "file": {
                        "webdavPath": block.file.webdavPath,
                        "mainCategory": block.file.mainCategory,
                        "subCategory": block.file.subCategory
                    }
                }
                for block in blocks
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": (total + limit - 1) // limit
            }
        }
        
    except Exception as e:
        logger.error(f"Admin content blocks error: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.get("/theory/cards")
async def get_admin_theory_cards(
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    """Получение списка карточек теории для админки"""
    
    try:
        skip = (page - 1) * limit
        
        query = db.query(TheoryCard)
        
        if category:
            query = query.filter(TheoryCard.category.ilike(f"%{category}%"))
        
        if search:
            query = query.filter(
                or_(
                    TheoryCard.questionBlock.ilike(f"%{search}%"),
                    TheoryCard.answerBlock.ilike(f"%{search}%")
                )
            )
        
        total = query.count()
        cards = query.order_by(desc(TheoryCard.createdAt)).offset(skip).limit(limit).all()
        
        return {
            "cards": [
                {
                    "id": card.id,
                    "ankiGuid": card.ankiGuid,
                    "cardType": card.cardType,
                    "deck": card.deck,
                    "category": card.category,
                    "subCategory": card.subCategory,
                    "questionBlock": card.questionBlock[:100] + "..." if len(card.questionBlock) > 100 else card.questionBlock,
                    "tags": card.tags,
                    "orderIndex": card.orderIndex,
                    "createdAt": card.createdAt,
                    "updatedAt": card.updatedAt
                }
                for card in cards
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": (total + limit - 1) // limit
            }
        }
        
    except Exception as e:
        logger.error(f"Admin theory cards error: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.delete("/content/files/{file_id}")
async def delete_admin_content_file(
    file_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Удаление файла контента"""
    
    try:
        file = db.query(ContentFile).filter(ContentFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="Файл не найден")
        
        db.delete(file)
        db.commit()
        
        return {"message": "Файл успешно удален"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin delete content file error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post("/content/files")
async def create_admin_content_file(
    file_data: CreateContentFileRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Создание нового файла контента"""
    
    try:
        # Проверяем, не существует ли уже файл с таким путем
        existing_file = db.query(ContentFile).filter(ContentFile.webdavPath == file_data.webdavPath).first()
        if existing_file:
            raise HTTPException(
                status_code=409,
                detail="Файл с таким webdavPath уже существует"
            )
        
        from uuid import uuid4
        new_file = ContentFile(
            id=str(uuid4()),
            webdavPath=file_data.webdavPath,
            mainCategory=file_data.mainCategory,
            subCategory=file_data.subCategory
        )
        
        db.add(new_file)
        db.commit()
        db.refresh(new_file)
        
        # Добавляем подсчет блоков
        blocks_count = db.query(ContentBlock).filter(ContentBlock.fileId == new_file.id).count()
        
        return {
            "id": new_file.id,
            "webdavPath": new_file.webdavPath,
            "mainCategory": new_file.mainCategory,
            "subCategory": new_file.subCategory,
            "createdAt": new_file.createdAt,
            "updatedAt": new_file.updatedAt,
            "blocksCount": blocks_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin create content file error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.put("/content/files/{file_id}")
async def update_admin_content_file(
    file_id: str,
    file_data: UpdateContentFileRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Обновление файла контента"""
    
    try:
        file = db.query(ContentFile).filter(ContentFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="Файл не найден")
        
        # Проверяем webdavPath если он изменяется
        if file_data.webdavPath and file_data.webdavPath != file.webdavPath:
            existing_file = db.query(ContentFile).filter(ContentFile.webdavPath == file_data.webdavPath).first()
            if existing_file:
                raise HTTPException(
                    status_code=409,
                    detail="webdavPath уже используется другим файлом"
                )
            file.webdavPath = file_data.webdavPath
        
        if file_data.mainCategory:
            file.mainCategory = file_data.mainCategory
        
        if file_data.subCategory:
            file.subCategory = file_data.subCategory
        
        db.commit()
        db.refresh(file)
        
        # Добавляем подсчет блоков
        blocks_count = db.query(ContentBlock).filter(ContentBlock.fileId == file.id).count()
        
        return {
            "id": file.id,
            "webdavPath": file.webdavPath,
            "mainCategory": file.mainCategory,
            "subCategory": file.subCategory,
            "createdAt": file.createdAt,
            "updatedAt": file.updatedAt,
            "blocksCount": blocks_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin update content file error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post("/content/blocks")
async def create_admin_content_block(
    block_data: CreateContentBlockRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Создание нового блока контента"""
    
    try:
        # Проверяем, существует ли файл
        file = db.query(ContentFile).filter(ContentFile.id == block_data.fileId).first()
        if not file:
            raise HTTPException(status_code=404, detail="Файл не найден")
        
        from uuid import uuid4
        new_block = ContentBlock(
            id=str(uuid4()),
            fileId=block_data.fileId,
            pathTitles=block_data.pathTitles,
            blockTitle=block_data.blockTitle,
            blockLevel=block_data.blockLevel,
            orderInFile=block_data.orderInFile,
            textContent=block_data.textContent,
            codeContent=block_data.codeContent,
            codeLanguage=block_data.codeLanguage,
            isCodeFoldable=block_data.isCodeFoldable,
            codeFoldTitle=block_data.codeFoldTitle,
            extractedUrls=block_data.extractedUrls
        )
        
        db.add(new_block)
        db.commit()
        db.refresh(new_block)
        
        return {
            "id": new_block.id,
            "fileId": new_block.fileId,
            "pathTitles": new_block.pathTitles,
            "blockTitle": new_block.blockTitle,
            "blockLevel": new_block.blockLevel,
            "orderInFile": new_block.orderInFile,
            "textContent": new_block.textContent,
            "codeContent": new_block.codeContent,
            "codeLanguage": new_block.codeLanguage,
            "isCodeFoldable": new_block.isCodeFoldable,
            "codeFoldTitle": new_block.codeFoldTitle,
            "extractedUrls": new_block.extractedUrls,
            "createdAt": new_block.createdAt,
            "updatedAt": new_block.updatedAt
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin create content block error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.put("/content/blocks/{block_id}")
async def update_admin_content_block(
    block_id: str,
    block_data: UpdateContentBlockRequest,  # Используем UpdateContentBlockRequest
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Обновление блока контента"""
    
    try:
        block = db.query(ContentBlock).filter(ContentBlock.id == block_id).first()
        if not block:
            raise HTTPException(status_code=404, detail="Блок не найден")
        
        # Проверяем, существует ли файл если fileId изменился
        if block_data.fileId and block_data.fileId != block.fileId:
            file = db.query(ContentFile).filter(ContentFile.id == block_data.fileId).first()
            if not file:
                raise HTTPException(status_code=404, detail="Файл не найден")
            block.fileId = block_data.fileId
        
        if block_data.pathTitles is not None:
            block.pathTitles = block_data.pathTitles
        if block_data.blockTitle:
            block.blockTitle = block_data.blockTitle
        if block_data.blockLevel is not None:
            block.blockLevel = block_data.blockLevel
        if block_data.orderInFile is not None:
            block.orderInFile = block_data.orderInFile
        if block_data.textContent is not None:
            block.textContent = block_data.textContent
        if block_data.codeContent is not None:
            block.codeContent = block_data.codeContent
        if block_data.codeLanguage is not None:
            block.codeLanguage = block_data.codeLanguage
        if block_data.isCodeFoldable is not None:
            block.isCodeFoldable = block_data.isCodeFoldable
        if block_data.codeFoldTitle is not None:
            block.codeFoldTitle = block_data.codeFoldTitle
        if block_data.extractedUrls is not None:
            block.extractedUrls = block_data.extractedUrls
        
        db.commit()
        db.refresh(block)
        
        return {
            "id": block.id,
            "fileId": block.fileId,
            "pathTitles": block.pathTitles,
            "blockTitle": block.blockTitle,
            "blockLevel": block.blockLevel,
            "orderInFile": block.orderInFile,
            "textContent": block.textContent,
            "codeContent": block.codeContent,
            "codeLanguage": block.codeLanguage,
            "isCodeFoldable": block.isCodeFoldable,
            "codeFoldTitle": block.codeFoldTitle,
            "extractedUrls": block.extractedUrls,
            "createdAt": block.createdAt,
            "updatedAt": block.updatedAt
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin update content block error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.delete("/content/blocks/{block_id}")
async def delete_admin_content_block(
    block_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Удаление блока контента"""
    
    try:
        block = db.query(ContentBlock).filter(ContentBlock.id == block_id).first()
        if not block:
            raise HTTPException(status_code=404, detail="Блок не найден")
        
        db.delete(block)
        db.commit()
        
        return {"message": "Блок успешно удален"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin delete content block error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post("/theory/cards")
async def create_admin_theory_card(
    card_data: CreateTheoryCardRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Создание новой карточки теории"""
    
    try:
        from uuid import uuid4
        
        # Генерируем ankiGuid если не передан
        anki_guid = card_data.ankiGuid or f"card_{uuid4().hex[:16]}"
        
        new_card = TheoryCard(
            id=str(uuid4()),
            ankiGuid=anki_guid,
            cardType=card_data.cardType,
            deck=card_data.deck,
            category=card_data.category,
            subCategory=card_data.subCategory,
            questionBlock=card_data.questionBlock,
            answerBlock=card_data.answerBlock,
            tags=card_data.tags,
            orderIndex=card_data.orderIndex
        )
        
        db.add(new_card)
        db.commit()
        db.refresh(new_card)
        
        return {
            "id": new_card.id,
            "ankiGuid": new_card.ankiGuid,
            "cardType": new_card.cardType,
            "deck": new_card.deck,
            "category": new_card.category,
            "subCategory": new_card.subCategory,
            "questionBlock": new_card.questionBlock,
            "answerBlock": new_card.answerBlock,
            "tags": new_card.tags,
            "orderIndex": new_card.orderIndex,
            "createdAt": new_card.createdAt,
            "updatedAt": new_card.updatedAt
        }
        
    except Exception as e:
        logger.error(f"Admin create theory card error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.put("/theory/cards/{card_id}")
async def update_admin_theory_card(
    card_id: str,
    card_data: UpdateTheoryCardRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Обновление карточки теории"""
    
    try:
        card = db.query(TheoryCard).filter(TheoryCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Карточка не найдена")
        
        if card_data.ankiGuid:
            card.ankiGuid = card_data.ankiGuid
        if card_data.cardType:
            card.cardType = card_data.cardType
        if card_data.deck:
            card.deck = card_data.deck
        if card_data.category:
            card.category = card_data.category
        if card_data.subCategory is not None:
            card.subCategory = card_data.subCategory
        if card_data.questionBlock:
            card.questionBlock = card_data.questionBlock
        if card_data.answerBlock:
            card.answerBlock = card_data.answerBlock
        if card_data.tags is not None:
            card.tags = card_data.tags
        if card_data.orderIndex is not None:
            card.orderIndex = card_data.orderIndex
        
        db.commit()
        db.refresh(card)
        
        return {
            "id": card.id,
            "ankiGuid": card.ankiGuid,
            "cardType": card.cardType,
            "deck": card.deck,
            "category": card.category,
            "subCategory": card.subCategory,
            "questionBlock": card.questionBlock,
            "answerBlock": card.answerBlock,
            "tags": card.tags,
            "orderIndex": card.orderIndex,
            "createdAt": card.createdAt,
            "updatedAt": card.updatedAt
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin update theory card error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.delete("/theory/cards/{card_id}")
async def delete_admin_theory_card(
    card_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Удаление карточки теории"""
    
    try:
        card = db.query(TheoryCard).filter(TheoryCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Карточка не найдена")
        
        db.delete(card)
        db.commit()
        
        return {"message": "Карточка успешно удалена"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin delete theory card error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.delete("/content/bulk-delete")
async def bulk_delete_content(
    delete_data: BulkDeleteRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Массовое удаление контента"""
    
    try:
        deleted_count = 0
        
        for item_id in delete_data.ids:
            # Пытаемся удалить как файл
            file = db.query(ContentFile).filter(ContentFile.id == item_id).first()
            if file:
                db.delete(file)
                deleted_count += 1
                continue
            
            # Пытаемся удалить как блок
            block = db.query(ContentBlock).filter(ContentBlock.id == item_id).first()
            if block:
                db.delete(block)
                deleted_count += 1
        
        db.commit()
        
        return {
            "message": f"Успешно удалено {deleted_count} элементов",
            "deletedCount": deleted_count
        }
        
    except Exception as e:
        logger.error(f"Admin bulk delete content error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.delete("/theory/bulk-delete")
async def bulk_delete_theory(
    delete_data: BulkDeleteRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Массовое удаление карточек теории"""
    
    try:
        deleted_count = db.query(TheoryCard).filter(TheoryCard.id.in_(delete_data.ids)).count()
        db.query(TheoryCard).filter(TheoryCard.id.in_(delete_data.ids)).delete(synchronize_session=False)
        db.commit()
        
        return {
            "message": f"Успешно удалено {deleted_count} карточек",
            "deletedCount": deleted_count
        }
        
    except Exception as e:
        logger.error(f"Admin bulk delete theory error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера") 