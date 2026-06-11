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
