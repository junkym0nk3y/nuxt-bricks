-- Схема БД для дефолтного Postgres-адаптера nuxt-bricks (см. modules/persistence/).
-- Применяется автоматически при первом старте контейнера из docker-compose.yml.
-- Описание схемы переедет в README на Шаге 8 (documents/refactor.md).

-- Страницы билдера
CREATE TABLE IF NOT EXISTS bricks_pages (
    id SERIAL PRIMARY KEY,
    pagename VARCHAR(255) UNIQUE NOT NULL,
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_pages_pagename ON bricks_pages(pagename);
CREATE INDEX IF NOT EXISTS idx_bricks_pages_published ON bricks_pages(published);
CREATE INDEX IF NOT EXISTS idx_bricks_pages_layout ON bricks_pages(layout);
CREATE INDEX IF NOT EXISTS idx_bricks_pages_subdomain ON bricks_pages(subdomain);
CREATE INDEX IF NOT EXISTS idx_bricks_pages_created_at ON bricks_pages(created_at DESC);

-- Функция автообновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bricks_pages_updated_at
    BEFORE UPDATE ON bricks_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Пользователи database-auth (bricks.auth.mode = 'database').
-- Провижининг вручную: npm run bricks:hash -- <password> --username <name> → INSERT.
CREATE TABLE IF NOT EXISTS bricks_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- scrypt:N:r:p:saltB64:hashB64
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER update_bricks_users_updated_at
    BEFORE UPDATE ON bricks_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Cookie-сессии database-auth (в БД — только SHA-256 hex токена)
CREATE TABLE IF NOT EXISTS bricks_sessions (
    id SERIAL PRIMARY KEY,
    token_hash CHAR(64) UNIQUE NOT NULL,  -- sha256 hex
    user_id INTEGER NOT NULL REFERENCES bricks_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW()
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
    uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_media_category ON bricks_media(category);
CREATE INDEX IF NOT EXISTS idx_bricks_media_uploaded_at ON bricks_media(uploaded_at DESC);
