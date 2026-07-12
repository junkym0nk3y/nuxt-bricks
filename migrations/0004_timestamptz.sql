-- 0004_timestamptz: абсолютные даты → TIMESTAMPTZ (аудит A-07).
-- TIMESTAMP without time zone читается node-postgres в локальном TZ процесса:
-- одно и то же значение БД означало разные instants при разных TZ приложения
-- (сроки сессий, сортировка, расхождение реплик).
--
-- Существующие значения интерпретируются как UTC (дефолт docker-compose и
-- рекомендованный TZ). Если БД/приложение работали в другом timezone —
-- выполнить вручную ALTER ... USING <col> AT TIME ZONE '<ваш tz>' ДО
-- применения этой миграции (см. README «Production deployment»).

ALTER TABLE bricks_pages
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE bricks_page_versions
    ALTER COLUMN page_updated_at TYPE TIMESTAMPTZ USING page_updated_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE bricks_users
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE bricks_sessions
    ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN last_used_at TYPE TIMESTAMPTZ USING last_used_at AT TIME ZONE 'UTC';

ALTER TABLE bricks_media
    ALTER COLUMN uploaded_at TYPE TIMESTAMPTZ USING uploaded_at AT TIME ZONE 'UTC';

-- Реестр миграций создаёт CLI (bricks-migrate) — к моменту применения 0004
-- таблица гарантированно существует
ALTER TABLE bricks_schema_migrations
    ALTER COLUMN applied_at TYPE TIMESTAMPTZ USING applied_at AT TIME ZONE 'UTC';
