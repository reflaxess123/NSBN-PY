from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime
from decimal import Decimal
from .models import UserRole, CardState


# Схемы для пользователей
class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    role: UserRole
    createdAt: datetime
    
    class Config:
        from_attributes = True


# Схемы для аутентификации
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


# Схемы для контента
class ContentFileBase(BaseModel):
    webdavPath: str
    mainCategory: str
    subCategory: str
    lastFileHash: Optional[str] = None


class ContentFileCreate(ContentFileBase):
    pass


class ContentFileResponse(ContentFileBase):
    id: str
    createdAt: datetime
    updatedAt: datetime
    
    class Config:
        from_attributes = True


class ContentBlockBase(BaseModel):
    pathTitles: List[str]
    blockTitle: str
    blockLevel: int
    orderInFile: int
    textContent: Optional[str] = None
    codeContent: Optional[str] = None
    codeLanguage: Optional[str] = None
    isCodeFoldable: bool = False
    codeFoldTitle: Optional[str] = None
    extractedUrls: List[str] = []
    rawBlockContentHash: Optional[str] = None


class ContentBlockCreate(ContentBlockBase):
    fileId: str


class ContentBlockResponse(ContentBlockBase):
    id: str
    fileId: str
    createdAt: datetime
    updatedAt: datetime
    
    class Config:
        from_attributes = True


# Схемы для прогресса контента
class UserContentProgressBase(BaseModel):
    solvedCount: int = 0


class UserContentProgressCreate(UserContentProgressBase):
    userId: int
    blockId: str


class UserContentProgressResponse(UserContentProgressBase):
    id: str
    userId: int
    blockId: str
    createdAt: datetime
    updatedAt: datetime
    
    class Config:
        from_attributes = True


# Схемы для теоретических карточек
class TheoryCardBase(BaseModel):
    ankiGuid: str
    cardType: str
    deck: str
    category: str
    subCategory: Optional[str] = None
    questionBlock: str
    answerBlock: str
    tags: List[str] = []
    orderIndex: int = 0


class TheoryCardCreate(TheoryCardBase):
    pass


class TheoryCardResponse(TheoryCardBase):
    id: str
    createdAt: datetime
    updatedAt: datetime
    
    class Config:
        from_attributes = True


# Схемы для прогресса теории
class UserTheoryProgressBase(BaseModel):
    solvedCount: int = 0
    easeFactor: Decimal = Decimal("2.50")
    interval: int = 1
    dueDate: Optional[datetime] = None
    reviewCount: int = 0
    lapseCount: int = 0
    cardState: CardState = CardState.NEW
    learningStep: int = 0
    lastReviewDate: Optional[datetime] = None


class UserTheoryProgressCreate(UserTheoryProgressBase):
    userId: int
    cardId: str


class UserTheoryProgressResponse(UserTheoryProgressBase):
    id: str
    userId: int
    cardId: str
    createdAt: datetime
    updatedAt: datetime
    
    class Config:
        from_attributes = True


# Схемы для ответов API
class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str


# Схемы для статистики
class UserStatsResponse(BaseModel):
    totalBlocks: int
    completedBlocks: int
    totalCards: int
    completedCards: int
    categories: List[str]
    
    class Config:
        from_attributes = True 