#!/usr/bin/env python3

import psycopg2
from app.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_database_connection():
    """Проверка подключения к базе данных и просмотр таблиц"""
    
    # Парсим URL базы данных
    db_url = settings.database_url
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    
    logger.info(f"Подключаемся к базе данных: {db_url}")
    
    try:
        # Подключение к базе данных
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        logger.info("✅ Подключение к базе данных успешно!")
        
        # Получаем список всех схем
        cursor.execute("""
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY schema_name;
        """)
        
        schemas = cursor.fetchall()
        logger.info(f"📋 Найдено схем: {[s[0] for s in schemas]}")
        
        # Проверяем все таблицы во всех схемах
        cursor.execute("""
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY table_schema, table_name;
        """)
        
        all_tables = cursor.fetchall()
        logger.info(f"📋 Всего таблиц во всех схемах: {len(all_tables)}")
        
        # Ищем таблицы с данными
        tables_with_data = []
        
        for schema, table_name in all_tables:
            try:
                if schema == 'public':
                    query = f'SELECT COUNT(*) FROM "{table_name}"'
                else:
                    query = f'SELECT COUNT(*) FROM "{schema}"."{table_name}"'
                    
                cursor.execute(query)
                count = cursor.fetchone()[0]
                
                full_name = f"{schema}.{table_name}" if schema != 'public' else table_name
                logger.info(f"  📄 {full_name} - {count} записей")
                
                if count > 0:
                    tables_with_data.append((full_name, count))
                    
                    # Если в таблице есть данные, покажем примеры
                    if 'user' in table_name.lower():
                        try:
                            cursor.execute(f'{query.replace("COUNT(*)", "id, email")} LIMIT 3')
                            users = cursor.fetchall()
                            logger.info(f"    👥 Пользователи: {users}")
                        except:
                            try:
                                cursor.execute(f'{query.replace("COUNT(*)", "*")} LIMIT 1')
                                sample = cursor.fetchall()
                                logger.info(f"    📝 Пример данных: {sample}")
                            except:
                                pass
                    
                    # Покажем структуру таблицы
                    cursor.execute("""
                        SELECT column_name, data_type 
                        FROM information_schema.columns 
                        WHERE table_schema = %s AND table_name = %s 
                        ORDER BY ordinal_position
                    """, (schema, table_name))
                    columns = cursor.fetchall()
                    logger.info(f"    📝 Колонки: {[col[0] for col in columns[:10]]}")
                    
            except Exception as e:
                logger.warning(f"    ❌ Ошибка при работе с таблицей {schema}.{table_name}: {e}")
        
        logger.info(f"\n🎯 Таблицы с данными: {len(tables_with_data)}")
        for table_name, count in tables_with_data:
            logger.info(f"  ✅ {table_name}: {count} записей")
            
        # Специальный поиск пользователей
        logger.info(f"\n🔍 Поиск пользователей по всей базе...")
        for schema, table_name in all_tables:
            if 'user' in table_name.lower():
                try:
                    full_table = f'"{schema}"."{table_name}"' if schema != 'public' else f'"{table_name}"'
                    cursor.execute(f'SELECT COUNT(*) FROM {full_table}')
                    count = cursor.fetchone()[0]
                    if count > 0:
                        logger.info(f"  🔥 НАЙДЕНЫ ПОЛЬЗОВАТЕЛИ в {schema}.{table_name}: {count} записей!")
                        cursor.execute(f'SELECT * FROM {full_table} LIMIT 2')
                        users = cursor.fetchall()
                        logger.info(f"    Примеры: {users}")
                except:
                    pass
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"❌ Ошибка подключения к базе данных: {e}")

if __name__ == "__main__":
    check_database_connection() 