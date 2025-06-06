FROM python:3.11-slim

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Установка Poetry
RUN pip install poetry

# Настройка Poetry - НЕ создавать виртуальную среду в контейнере
ENV POETRY_NO_INTERACTION=1 \
    POETRY_VENV_IN_PROJECT=false \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_CACHE_DIR=/tmp/poetry_cache

# Создание рабочей директории
WORKDIR /app

# Копирование файлов зависимостей
COPY pyproject.toml poetry.lock ./

# Установка зависимостей через Poetry прямо в систему
RUN poetry install --without dev && rm -rf $POETRY_CACHE_DIR

# Копирование исходного кода
COPY . .

# Создание пользователя для безопасности
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

# Открытие порта
EXPOSE 4000

# Команда запуска с тестом конфигурации и миграциями
CMD ["sh", "-c", "python test_config.py && alembic upgrade head && python main.py"]