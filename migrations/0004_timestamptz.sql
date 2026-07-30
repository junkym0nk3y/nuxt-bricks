-- 0004_timestamptz: абсолютные даты → TIMESTAMPTZ.
-- TIMESTAMP without time zone читается node-postgres в локальном TZ процесса:
-- одно и то же значение БД означало разные instants при разных TZ приложения
-- (сроки сессий, сортировка, расхождение реплик).
--
-- Существующие значения интерпретируются как UTC (дефолт docker-compose и
-- рекомендованный TZ). Если БД/приложение работали в другом timezone —
-- выполнить вручную ALTER ... USING <col> AT TIME ZONE '<ваш tz>' ДО
-- применения этой миграции (см. README «Production deployment»).
--
-- Конверсия — под guard'ом по фактическому типу колонки:
-- 1. docker-compose initdb применяет файлы напрямую, без CLI — таблицы
--    реестра bricks_schema_migrations на пустом volume ещё нет;
-- 2. повторный прогон (initdb-БД, позже мигрируемая CLI с пустым реестром)
--    не должен конвертировать уже-TIMESTAMPTZ колонку заново: timestamptz
--    AT TIME ZONE 'UTC' с последующим cast сдвинул бы значения при не-UTC
--    session TZ.

DO $$
DECLARE
    target RECORD;
BEGIN
    FOR target IN
        SELECT *
        FROM (
            VALUES
                ('bricks_pages', 'created_at'),
                ('bricks_pages', 'updated_at'),
                ('bricks_page_versions', 'page_updated_at'),
                ('bricks_page_versions', 'created_at'),
                ('bricks_users', 'created_at'),
                ('bricks_users', 'updated_at'),
                ('bricks_sessions', 'expires_at'),
                ('bricks_sessions', 'created_at'),
                ('bricks_sessions', 'last_used_at'),
                ('bricks_media', 'uploaded_at'),
                -- Реестр миграций: создаётся CLI (актуальный — сразу с
                -- TIMESTAMPTZ); конвертируется только legacy-реестр
                ('bricks_schema_migrations', 'applied_at')
        ) AS t(table_name, column_name)
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = current_schema()
              AND c.table_name = target.table_name
              AND c.column_name = target.column_name
              AND c.data_type = 'timestamp without time zone'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
                target.table_name,
                target.column_name,
                target.column_name
            );
        END IF;
    END LOOP;
END $$;
