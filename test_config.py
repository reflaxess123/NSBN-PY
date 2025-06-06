#!/usr/bin/env python3
"""
Тест конфигурации перед запуском миграций
"""
import os
import sys

def test_config():
    """Тестируем загрузку конфигурации"""
    try:
        # Устанавливаем минимальные значения для тестирования
        required_vars = {
            'DATABASE_URL': 'postgresql://test:test@localhost:5432/test',
            'REDIS_URL': 'redis://localhost:6379/0',
            'SECRET_KEY': 'test-secret-key'
        }
        
        for key, default_value in required_vars.items():
            if key not in os.environ:
                print(f"⚠️  {key} not found in environment, using default for testing")
                os.environ[key] = default_value
        
        # Пытаемся загрузить конфигурацию
        from app.config import settings
        
        print("✅ Configuration loaded successfully!")
        print(f"📊 Database URL: {settings.database_url}")
        print(f"📊 Redis URL: {settings.redis_url}")
        print(f"📊 Debug mode: {settings.debug}")
        print(f"📊 Allowed origins string: {settings.allowed_origins_str}")
        print(f"📊 Parsed allowed origins: {settings.allowed_origins}")
        print(f"📊 Port: {settings.port}")
        
        return True
        
    except Exception as e:
        print(f"❌ Configuration error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_config()
    sys.exit(0 if success else 1) 