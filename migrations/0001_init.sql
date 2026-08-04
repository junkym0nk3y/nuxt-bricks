-- 0001_init: схема дефолтного Postgres-адаптера nuxt-bricks.
--
-- Применение: `npm run bricks:migrate` / `npx bricks-migrate migrate` (см.
-- src/cli/bricks-migrate.mjs). Файл один и описывает КОНЕЧНУЮ схему: проект не
-- опубликован, потребитель базы один, обратная совместимость не поддерживается —
-- поэтому изменения вносятся сюда, а не новой forward-миграцией, и применяются к
-- живой БД руками с пересчётом строки реестра bricks_schema_migrations.
--
-- Каждый стейтмент идемпотентен: файл применяется и через CLI, и напрямую
-- docker-compose initdb на пустом volume.

-- Страницы билдера
CREATE TABLE IF NOT EXISTS bricks_pages (
    id SERIAL PRIMARY KEY,
    pagename VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    keywords TEXT,
    social_image TEXT,
    layout VARCHAR(100) DEFAULT 'default',
    background_color VARCHAR(50),
    url_prefix VARCHAR(255),
    subdomain VARCHAR(255),
    thumbnail_url TEXT,
    schema JSONB NOT NULL,
    published BOOLEAN DEFAULT false,
    -- Монотонный счётчик изменений строки (инкремент — в
    -- postgresStorageAdapter.updatePage). Клиент передаёт expectedRevision в
    -- PUT/PATCH /api/bricks/:id; несовпадение → 409 REVISION_CONFLICT, то есть
    -- параллельное сохранение не перетирает чужие изменения молча.
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Уникально ИМЯ, а не полный адрес: страницу опознают по одному `pagename` и
    -- редактор (`<builderPrefix>/:pagename`), и ключи черновиков localStorage, и
    -- публичный lookup. Пара `(pagename, url_prefix)` разрешила бы `/blog/post`
    -- рядом с `/news/post`, но обе страницы претендовали бы на один URL
    -- редактора и один ключ черновика — то есть БД стала бы шире, чем код умеет
    -- адресовать. Расширять уникальность до адреса можно только вместе с
    -- переводом этих трёх мест на адресную идентичность.
    CONSTRAINT uq_bricks_pages_pagename UNIQUE (pagename)
);

CREATE INDEX IF NOT EXISTS idx_bricks_pages_pagename ON bricks_pages(pagename);
CREATE INDEX IF NOT EXISTS idx_bricks_pages_published ON bricks_pages(published);
CREATE INDEX IF NOT EXISTS idx_bricks_pages_layout ON bricks_pages(layout);
CREATE INDEX IF NOT EXISTS idx_bricks_pages_subdomain ON bricks_pages(subdomain);
CREATE INDEX IF NOT EXISTS idx_bricks_pages_created_at ON bricks_pages(created_at DESC);

-- Функция автообновления updated_at. Namespaced намеренно: shared schema может
-- содержать одноимённую функцию host-приложения, и CREATE OR REPLACE
-- update_updated_at_column() перезаписал бы её.
CREATE OR REPLACE FUNCTION bricks_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_bricks_pages_updated_at ON bricks_pages;
CREATE TRIGGER update_bricks_pages_updated_at
    BEFORE UPDATE ON bricks_pages
    FOR EACH ROW
    EXECUTE FUNCTION bricks_update_updated_at_column();

-- История версий страниц: снапшот прежней строки bricks_pages при каждом
-- сохранении, меняющем schema (см. postgresStorageAdapter.updatePage).
-- Глубина истории — bricks.versionsLimit / NUXT_BRICKS_VERSIONS_LIMIT (0 — выкл).
CREATE TABLE IF NOT EXISTS bricks_page_versions (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES bricks_pages(id) ON DELETE CASCADE,
    pagename VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    keywords TEXT,
    social_image TEXT,
    layout VARCHAR(100),
    background_color VARCHAR(50),
    url_prefix VARCHAR(255),
    subdomain VARCHAR(255),
    -- Кадр канваса на момент снимка: снимок снимается ПОСЛЕ сохранения, поэтому
    -- thumbnail_url страницы — это кадр того состояния, которое снапшот и
    -- сохраняет. NULL — снимка нет и не появится, UI рисует плейсхолдер
    thumbnail_url TEXT,
    schema JSONB NOT NULL,
    published BOOLEAN NOT NULL DEFAULT false,
    page_updated_at TIMESTAMPTZ,          -- updated_at исходной строки на момент снапшота
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_page_versions_page_created
    ON bricks_page_versions(page_id, created_at DESC);

-- Пользователи database-auth (bricks.auth.mode = 'database').
-- Провижининг вручную: npm run bricks:hash -- <password> --username <name> → INSERT.
CREATE TABLE IF NOT EXISTS bricks_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- scrypt:N:r:p:saltB64:hashB64
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_bricks_users_updated_at ON bricks_users;
CREATE TRIGGER update_bricks_users_updated_at
    BEFORE UPDATE ON bricks_users
    FOR EACH ROW
    EXECUTE FUNCTION bricks_update_updated_at_column();

-- Cookie-сессии database-auth (в БД — только SHA-256 hex токена)
CREATE TABLE IF NOT EXISTS bricks_sessions (
    id SERIAL PRIMARY KEY,
    token_hash CHAR(64) UNIQUE NOT NULL,  -- sha256 hex
    user_id INTEGER NOT NULL REFERENCES bricks_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_sessions_user_id ON bricks_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bricks_sessions_expires_at ON bricks_sessions(expires_at);

-- Метаданные медиа-галереи
CREATE TABLE IF NOT EXISTS bricks_media (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    filename TEXT NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    size BIGINT NOT NULL,
    mime_type VARCHAR(255) NOT NULL DEFAULT 'image/png',
    category VARCHAR(50) NOT NULL DEFAULT 'other',
    svg_content TEXT,
    -- Пиксельные размеры растра: нужны мета-тегам og:image:width/height — без них
    -- соцсеть при первом шеринге часто рисует мелкую карточку, не дожидаясь
    -- загрузки картинки. NULL — размеры неизвестны (svg, внешние URL), теги в
    -- этом случае не печатаются.
    width INTEGER,
    height INTEGER,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Уникальность url: без неё гонка «двое регистрируют один url» (импорт из
-- бакета, ретрай клиента) создавала дубликаты. createMedia дефолтного адаптера
-- идемпотентен — при unique_violation возвращает существующую запись
CREATE UNIQUE INDEX IF NOT EXISTS uq_bricks_media_url ON bricks_media(url);

CREATE INDEX IF NOT EXISTS idx_bricks_media_category ON bricks_media(category);
CREATE INDEX IF NOT EXISTS idx_bricks_media_uploaded_at ON bricks_media(uploaded_at DESC);
