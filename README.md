# Nareshka Learning Platform Backend (Python)

Это переписанная версия backend сервера платформы изучения программирования Nareshka на Python с использованием FastAPI.

## Технологии

- **FastAPI** - современный веб-фреймворк для создания API
- **SQLAlchemy** - ORM для работы с базой данных
- **PostgreSQL** - основная база данных
- **Redis** - для сессий и кеширования
- **Alembic** - для миграций базы данных
- **JWT** - для аутентификации
- **Pydantic** - для валидации данных

## Установка и запуск

### 1. Установка зависимостей

```bash
pip install -r requirements.txt
```

### 2. Настройка переменных окружения

Скопируйте `.env.example` в `.env` и настройте переменные:

```bash
cp .env.example .env
```

### 3. Инициализация базы данных

```bash
# Инициализация Alembic
alembic init alembic

# Создание первой миграции
alembic revision --autogenerate -m "Initial migration"

# Применение миграций
alembic upgrade head
```

### 4. Запуск сервера

```bash
# Режим разработки
python main.py

# или с помощью uvicorn
uvicorn main:app --host 0.0.0.0 --port 4000 --reload
```

## Структура проекта

```
├── app/
│   ├── __init__.py
│   ├── config.py          # Конфигурация приложения
│   ├── database.py        # Настройка подключения к БД
│   ├── models.py          # SQLAlchemy модели
│   ├── schemas.py         # Pydantic схемы
│   ├── auth.py           # Аутентификация и авторизация
│   └── routers/          # API роуты
│       ├── __init__.py
│       ├── auth.py       # Аутентификация
│       ├── content.py    # Контент и блоки
│       ├── theory.py     # Теоретические карточки
│       ├── stats.py      # Статистика
│       └── admin.py      # Администрирование
├── alembic/              # Миграции базы данных
├── main.py              # Основной файл приложения
├── requirements.txt     # Зависимости Python
├── .env                 # Переменные окружения
└── README.md           # Этот файл
```

## API Документация

После запуска сервера документация будет доступна по адресам:

- **Swagger UI**: http://localhost:4000/api-docs
- **ReDoc**: http://localhost:4000/api-redoc

## Основные эндпоинты

### Аутентификация

- `POST /auth/register` - Регистрация
- `POST /auth/login` - Вход (JWT)
- `POST /auth/login-simple` - Простой вход (сессии)
- `POST /auth/logout` - Выход
- `GET /auth/me` - Информация о пользователе
- `GET /auth/check` - Проверка аутентификации

### Общие

- `GET /` - Базовый endpoint
- `GET /api/profile` - Профиль пользователя
- `GET /health` - Проверка здоровья сервиса

## База данных

Проект использует те же модели данных, что и оригинальная версия:

- **User** - Пользователи
- **ContentFile** - Файлы контента
- **ContentBlock** - Блоки контента
- **UserContentProgress** - Прогресс по контенту
- **TheoryCard** - Теоретические карточки
- **UserTheoryProgress** - Прогресс по теории

## Команды для разработки

```bash
# Создание новой миграции
alembic revision --autogenerate -m "Описание изменений"

# Применение миграций
alembic upgrade head

# Откат миграции
alembic downgrade -1

# Запуск с перезагрузкой
uvicorn main:app --reload

# Форматирование кода
black .

# Проверка типов
mypy .
```

## Переменные окружения

| Переменная      | Описание                     | Пример                              |
| --------------- | ---------------------------- | ----------------------------------- |
| DATABASE_URL    | URL подключения к PostgreSQL | postgresql://user:pass@host:port/db |
| REDIS_URL       | URL подключения к Redis      | redis://user:pass@host:port/db      |
| SECRET_KEY      | Секретный ключ для JWT       | your-secret-key                     |
| DEBUG           | Режим отладки                | True/False                          |
| PORT            | Порт сервера                 | 4000                                |
| ALLOWED_ORIGINS | Разрешенные CORS домены      | ["http://localhost:3000"]           |

## Отличия от Node.js версии

1. **Фреймворк**: Express.js → FastAPI
2. **ORM**: Prisma → SQLAlchemy
3. **Валидация**: Joi/Zod → Pydantic
4. **Типизация**: TypeScript → Python с type hints
5. **Миграции**: Prisma Migrate → Alembic
6. **Документация**: Swagger → Автоматическая генерация через FastAPI

## Производительность

FastAPI обеспечивает высокую производительность благодаря:

- Асинхронной архитектуре
- Автоматической валидации и сериализации
- Встроенной поддержке типизации
- Оптимизированной работе с JSON

## Тестирование

```bash
# Установка зависимостей для тестов
pip install pytest pytest-asyncio httpx

# Запуск тестов
pytest
```
