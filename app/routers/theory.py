from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_
from typing import Optional, List
import logging
from pydantic import BaseModel
from datetime import datetime

from ..database import get_db
from ..models import TheoryCard, UserTheoryProgress, User
from ..schemas import TheoryCardResponse
from ..auth import get_current_user_from_session, get_current_user_from_session_required

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/theory", tags=["Theory"])

# Pydantic models для запросов
class ProgressAction(BaseModel):
    action: str  # "increment" или "decrement"

class ReviewRating(BaseModel):
    rating: str  # "again", "hard", "good", "easy"


@router.get("/cards")
async def get_theory_cards(
    request: Request,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1, description="Номер страницы"),
    limit: int = Query(10, ge=1, le=100, description="Количество карточек на странице"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    subCategory: Optional[str] = Query(None, description="Фильтр по подкатегории"),
    deck: Optional[str] = Query(None, description="Поиск по названию колоды"),
    sortBy: str = Query("orderIndex", description="Поле для сортировки"),
    sortOrder: str = Query("asc", description="Порядок сортировки"),
    q: Optional[str] = Query(None, description="Полнотекстовый поиск"),
    onlyUnstudied: bool = Query(False, description="Показывать только неизученные карточки")
):
    """Получение списка теоретических карточек с пагинацией и фильтрацией"""
    
    # Проверяем аутентификацию
    user = get_current_user_from_session(request, db)
    is_authenticated = user is not None
    user_id = user.id if user else None
    
    # Рассчитываем offset
    offset = (page - 1) * limit
    
    # Строим базовый запрос
    query = db.query(TheoryCard)
    
    # Применяем фильтры
    if category:
        query = query.filter(func.lower(TheoryCard.category) == func.lower(category))
    
    if subCategory:
        query = query.filter(func.lower(TheoryCard.subCategory) == func.lower(subCategory))
    
    if deck:
        query = query.filter(TheoryCard.deck.ilike(f"%{deck}%"))
    
    # Полнотекстовый поиск
    if q and q.strip():
        search_term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                TheoryCard.questionBlock.ilike(search_term),
                TheoryCard.answerBlock.ilike(search_term),
                TheoryCard.category.ilike(search_term),
                TheoryCard.subCategory.ilike(search_term)
            )
        )
    
    # Фильтрация только неизученных карточек
    if onlyUnstudied and is_authenticated and user_id:
        # Исключаем карточки, которые уже изучались
        studied_card_ids = db.query(UserTheoryProgress.cardId).filter(
            UserTheoryProgress.userId == user_id,
            UserTheoryProgress.solvedCount > 0
        ).subquery()
        
        query = query.filter(~TheoryCard.id.in_(studied_card_ids))
    
    # Применяем сортировку
    if sortBy == "createdAt":
        order_field = TheoryCard.createdAt
    elif sortBy == "updatedAt":
        order_field = TheoryCard.updatedAt
    elif sortBy == "orderIndex":
        order_field = TheoryCard.orderIndex
    else:
        order_field = TheoryCard.orderIndex
    
    if sortOrder == "desc":
        query = query.order_by(desc(order_field))
    else:
        query = query.order_by(asc(order_field))
    
    # Получаем общее количество для пагинации
    total_count = query.count()
    
    # Применяем пагинацию
    cards = query.offset(offset).limit(limit).all()
    
    # Если пользователь авторизован, получаем прогресс
    cards_with_progress = []
    for card in cards:
        card_data = {
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
        
        if is_authenticated:
            progress = db.query(UserTheoryProgress).filter(
                UserTheoryProgress.userId == user_id,
                UserTheoryProgress.cardId == card.id
            ).first()
            
            if progress:
                card_data["progress"] = {
                    "solvedCount": progress.solvedCount,
                    "easeFactor": float(progress.easeFactor),
                    "interval": progress.interval,
                    "dueDate": progress.dueDate,
                    "reviewCount": progress.reviewCount,
                    "lapseCount": progress.lapseCount,
                    "cardState": progress.cardState,
                    "learningStep": progress.learningStep,
                    "lastReviewDate": progress.lastReviewDate
                }
            else:
                card_data["progress"] = None
        
        cards_with_progress.append(card_data)
    
    # Подсчитываем страницы
    total_pages = (total_count + limit - 1) // limit
    
    return {
        "cards": cards_with_progress,
        "pagination": {
            "page": page,
            "limit": limit,
            "totalCount": total_count,
            "totalPages": total_pages,
            "hasNextPage": page < total_pages,
            "hasPrevPage": page > 1
        }
    }


@router.get("/categories")
async def get_theory_categories(db: Session = Depends(get_db)):
    """Получение списка всех категорий теории"""
    
    try:
        # Получаем группированные данные как в Node.js
        categories_data = db.query(
            TheoryCard.category,
            TheoryCard.subCategory,
            func.count(TheoryCard.id).label('count')
        ).group_by(TheoryCard.category, TheoryCard.subCategory).all()
        
        # Группируем по основным категориям
        grouped_categories = {}
        
        for category, sub_category, count in categories_data:
            if category not in grouped_categories:
                grouped_categories[category] = {
                    "name": category,
                    "subCategories": [],
                    "totalCards": 0
                }
            
            if sub_category:
                grouped_categories[category]["subCategories"].append({
                    "name": sub_category,
                    "cardCount": count
                })
            
            grouped_categories[category]["totalCards"] += count
        
        # Сортируем результат
        result = []
        for cat_name in sorted(grouped_categories.keys()):
            cat_data = grouped_categories[cat_name]
            cat_data["subCategories"].sort(key=lambda x: x["name"])
            result.append(cat_data)
        
        # Возвращаем массив напрямую как в Node.js
        return result
        
    except Exception as e:
        logger.error(f"Error getting theory categories: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/categories/{category}/subcategories")
async def get_theory_subcategories(category: str, db: Session = Depends(get_db)):
    """Получение подкатегорий для указанной категории"""
    
    try:
        subcategories = db.query(
            TheoryCard.subCategory,
            func.count(TheoryCard.id).label('count')
        ).filter(
            func.lower(TheoryCard.category) == func.lower(category),
            TheoryCard.subCategory.isnot(None)
        ).group_by(TheoryCard.subCategory).all()
        
        return {
            "subcategories": [
                {
                    "name": subcategory,
                    "count": count
                }
                for subcategory, count in subcategories if subcategory
            ]
        }
        
    except Exception as e:
        logger.error(f"Error getting theory subcategories: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/cards/{card_id}")
async def get_theory_card(
    card_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Получение конкретной карточки по ID"""
    
    card = db.query(TheoryCard).filter(TheoryCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    # Проверяем аутентификацию для прогресса
    user = get_current_user_from_session(request, db)
    
    card_data = {
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
    
    if user:
        progress = db.query(UserTheoryProgress).filter(
            UserTheoryProgress.userId == user.id,
            UserTheoryProgress.cardId == card.id
        ).first()
        
        if progress:
            card_data["progress"] = {
                "solvedCount": progress.solvedCount,
                "easeFactor": float(progress.easeFactor),
                "interval": progress.interval,
                "dueDate": progress.dueDate,
                "reviewCount": progress.reviewCount,
                "lapseCount": progress.lapseCount,
                "cardState": progress.cardState,
                "learningStep": progress.learningStep,
                "lastReviewDate": progress.lastReviewDate
            }
        else:
            card_data["progress"] = None
    
    return card_data 


@router.patch("/cards/{card_id}/progress")
async def update_theory_card_progress(
    card_id: str,
    request: Request,
    action_data: ProgressAction,
    db: Session = Depends(get_db)
):
    """Обновление прогресса пользователя по карточке"""
    
    # Получаем пользователя (обязательно авторизованного)
    user = get_current_user_from_session_required(request, db)
    user_id = user.id
    
    action = action_data.action
    if action not in ["increment", "decrement"]:
        raise HTTPException(
            status_code=400, 
            detail="Invalid action. Must be 'increment' or 'decrement'"
        )
    
    try:
        # Проверяем, существует ли карточка
        card = db.query(TheoryCard).filter(TheoryCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Theory card not found")
        
        # Ищем или создаем прогресс
        progress = db.query(UserTheoryProgress).filter(
            UserTheoryProgress.userId == user_id,
            UserTheoryProgress.cardId == card_id
        ).first()
        
        if action == "increment":
            if progress:
                progress.solvedCount += 1
            else:
                from uuid import uuid4
                progress = UserTheoryProgress(
                    id=str(uuid4()),
                    userId=user_id,
                    cardId=card_id,
                    solvedCount=1
                )
                db.add(progress)
        else:  # decrement
            if progress and progress.solvedCount > 0:
                progress.solvedCount -= 1
            elif not progress:
                from uuid import uuid4
                progress = UserTheoryProgress(
                    id=str(uuid4()),
                    userId=user_id,
                    cardId=card_id,
                    solvedCount=0
                )
                db.add(progress)
        
        db.commit()
        db.refresh(progress)
        
        return {
            "userId": progress.userId,
            "cardId": progress.cardId,
            "solvedCount": progress.solvedCount
        }
        
    except Exception as e:
        logger.error(f"Error updating progress for card {card_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update theory progress")


@router.post("/cards/{card_id}/review")
async def review_theory_card(
    card_id: str,
    request: Request,
    review_data: ReviewRating,
    db: Session = Depends(get_db)
):
    """Повторение карточки с интервальным алгоритмом"""
    
    # Получаем пользователя (обязательно авторизованного)
    user = get_current_user_from_session_required(request, db)
    user_id = user.id
    
    rating = review_data.rating
    valid_ratings = ["again", "hard", "good", "easy"]
    if rating not in valid_ratings:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rating. Must be one of: {', '.join(valid_ratings)}"
        )
    
    try:
        # Проверяем, существует ли карточка
        card = db.query(TheoryCard).filter(TheoryCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Theory card not found")
        
        # Простая реализация интервального повторения
        # В реальном проекте здесь был бы более сложный алгоритм
        progress = db.query(UserTheoryProgress).filter(
            UserTheoryProgress.userId == user_id,
            UserTheoryProgress.cardId == card_id
        ).first()
        
        if not progress:
            from uuid import uuid4
            progress = UserTheoryProgress(
                id=str(uuid4()),
                userId=user_id,
                cardId=card_id,
                reviewCount=0,
                easeFactor=2.5
            )
            db.add(progress)
        
        # Обновляем прогресс на основе рейтинга
        progress.reviewCount += 1
        progress.lastReviewDate = datetime.utcnow()
        
        if rating == "again":
            progress.lapseCount += 1
            progress.interval = 1
            progress.cardState = "LEARNING"
        elif rating == "hard":
            progress.easeFactor = max(1.3, progress.easeFactor - 0.15)
            progress.interval = max(1, int(progress.interval * 1.2))
            progress.cardState = "REVIEW"
        elif rating == "good":
            progress.interval = max(1, int(progress.interval * progress.easeFactor))
            progress.cardState = "REVIEW"
        elif rating == "easy":
            progress.easeFactor = min(2.5, progress.easeFactor + 0.15)
            progress.interval = max(1, int(progress.interval * progress.easeFactor * 1.3))
            progress.cardState = "REVIEW"
        
        # Устанавливаем дату следующего повторения
        from datetime import timedelta
        progress.dueDate = datetime.utcnow() + timedelta(days=progress.interval)
        
        db.commit()
        db.refresh(progress)
        
        return {
            "success": True,
            "nextReviewDate": progress.dueDate,
            "interval": progress.interval,
            "easeFactor": float(progress.easeFactor),
            "cardState": progress.cardState
        }
        
    except Exception as e:
        logger.error(f"Error reviewing card {card_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to process card review")


@router.get("/cards/{card_id}/stats")
async def get_theory_card_stats(
    card_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Получение статистики карточки"""
    
    # Получаем пользователя (обязательно авторизованного)
    user = get_current_user_from_session_required(request, db)
    user_id = user.id
    
    try:
        # Проверяем, существует ли карточка
        card = db.query(TheoryCard).filter(TheoryCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Theory card not found")
        
        progress = db.query(UserTheoryProgress).filter(
            UserTheoryProgress.userId == user_id,
            UserTheoryProgress.cardId == card_id
        ).first()
        
        if not progress:
            return {
                "cardId": card_id,
                "reviewCount": 0,
                "lapseCount": 0,
                "easeFactor": 2.5,
                "interval": 1,
                "cardState": "NEW",
                "lastReviewDate": None,
                "dueDate": None
            }
        
        return {
            "cardId": card_id,
            "reviewCount": progress.reviewCount,
            "lapseCount": progress.lapseCount,
            "easeFactor": float(progress.easeFactor),
            "interval": progress.interval,
            "cardState": progress.cardState,
            "lastReviewDate": progress.lastReviewDate,
            "dueDate": progress.dueDate
        }
        
    except Exception as e:
        logger.error(f"Error getting card stats {card_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch card statistics")


@router.post("/cards/{card_id}/reset")
async def reset_theory_card_progress(
    card_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Сброс прогресса карточки"""
    
    # Получаем пользователя (обязательно авторизованного)
    user = get_current_user_from_session_required(request, db)
    user_id = user.id
    
    try:
        # Проверяем, существует ли карточка
        card = db.query(TheoryCard).filter(TheoryCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Theory card not found")
        
        # Удаляем прогресс
        db.query(UserTheoryProgress).filter(
            UserTheoryProgress.userId == user_id,
            UserTheoryProgress.cardId == card_id
        ).delete()
        
        db.commit()
        
        return {"message": "Card progress reset successfully"}
        
    except Exception as e:
        logger.error(f"Error resetting card {card_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to reset card progress")


@router.get("/cards/{card_id}/intervals")
async def get_theory_card_intervals(
    card_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Получение вариантов интервалов повторения"""
    
    # Получаем пользователя (обязательно авторизованного)
    user = get_current_user_from_session_required(request, db)
    user_id = user.id
    
    try:
        # Проверяем, существует ли карточка
        card = db.query(TheoryCard).filter(TheoryCard.id == card_id).first()
        if not card:
            raise HTTPException(status_code=404, detail="Theory card not found")
        
        progress = db.query(UserTheoryProgress).filter(
            UserTheoryProgress.userId == user_id,
            UserTheoryProgress.cardId == card_id
        ).first()
        
        # Рассчитываем интервалы для разных оценок
        current_interval = progress.interval if progress else 1
        current_ease = float(progress.easeFactor) if progress else 2.5
        
        intervals = {
            "again": 1,  # Сбросить
            "hard": max(1, int(current_interval * 1.2)),
            "good": max(1, int(current_interval * current_ease)),
            "easy": max(1, int(current_interval * current_ease * 1.3))
        }
        
        return intervals
        
    except Exception as e:
        logger.error(f"Error getting intervals for card {card_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch review intervals")


@router.get("/cards/due")
async def get_due_theory_cards(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(10, ge=1, le=100, description="Количество карточек")
):
    """Получение карточек к повторению"""
    
    # Получаем пользователя (обязательно авторизованного)
    user = get_current_user_from_session_required(request, db)
    user_id = user.id
    
    try:
        # Получаем карточки к повторению
        current_time = datetime.utcnow()
        
        due_progress = db.query(UserTheoryProgress).filter(
            UserTheoryProgress.userId == user_id,
            UserTheoryProgress.dueDate <= current_time
        ).limit(limit).all()
        
        # Получаем карточки
        card_ids = [p.cardId for p in due_progress]
        cards = db.query(TheoryCard).filter(TheoryCard.id.in_(card_ids)).all() if card_ids else []
        
        # Также добавляем новые карточки если нужно
        if len(cards) < limit:
            new_card_limit = limit - len(cards)
            studied_card_ids = db.query(UserTheoryProgress.cardId).filter(
                UserTheoryProgress.userId == user_id
            ).subquery()
            
            new_cards = db.query(TheoryCard).filter(
                ~TheoryCard.id.in_(studied_card_ids)
            ).limit(new_card_limit).all()
            
            cards.extend(new_cards)
        
        # Формируем ответ
        cards_with_progress = []
        for card in cards:
            progress = next((p for p in due_progress if p.cardId == card.id), None)
            
            card_data = {
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
            
            if progress:
                card_data["progress"] = {
                    "solvedCount": progress.solvedCount,
                    "easeFactor": float(progress.easeFactor),
                    "interval": progress.interval,
                    "dueDate": progress.dueDate,
                    "reviewCount": progress.reviewCount,
                    "lapseCount": progress.lapseCount,
                    "cardState": progress.cardState,
                    "learningStep": progress.learningStep,
                    "lastReviewDate": progress.lastReviewDate
                }
            else:
                card_data["progress"] = None
            
            cards_with_progress.append(card_data)
        
        return {
            "cards": cards_with_progress,
            "totalDue": len(cards_with_progress)
        }
        
    except Exception as e:
        logger.error(f"Error getting due cards: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch due cards")


@router.get("/stats")
async def get_theory_stats_overview(
    request: Request,
    db: Session = Depends(get_db)
):
    """Получение общей статистики по карточкам"""
    
    # Получаем пользователя (обязательно авторизованного)
    user = get_current_user_from_session_required(request, db)
    user_id = user.id
    
    try:
        # Подсчитываем карточки по состояниям
        total_cards = db.query(TheoryCard).count()
        
        progress_stats = db.query(UserTheoryProgress).filter(
            UserTheoryProgress.userId == user_id
        ).all()
        
        new_count = total_cards - len(progress_stats)
        learning_count = len([p for p in progress_stats if p.cardState == "LEARNING"])
        review_count = len([p for p in progress_stats if p.cardState == "REVIEW"])
        
        return {
            "new": new_count,
            "learning": learning_count,
            "review": review_count,
            "total": total_cards
        }
        
    except Exception as e:
        logger.error(f"Error getting theory stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch card statistics") 