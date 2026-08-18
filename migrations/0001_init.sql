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
    -- Свой набор устройств страницы: 2–4 записи
    -- { key, label, icon, width, aside, maxWidth?, minWidth? }, отсортированные
    -- по возрастанию width, с обязательными `mobile` в начале и `desktop` в конце.
    -- NULL — страница наследует набор проекта (опция модуля bricks.devices).
    -- Ширина устройства служит и листом канваса, и min-width его диапазона
    -- media-query, поэтому отдельного списка порогов в схеме нет.
    viewport_config JSONB,
    schema JSONB NOT NULL,
    published BOOLEAN DEFAULT false,
    -- Монотонный счётчик изменений строки (инкремент — в
    -- postgresStorageAdapter.updatePage). Клиент передаёт expectedRevision в
    -- PUT/PATCH /api/bricks/:id; несовпадение → 409 REVISION_CONFLICT, то есть
    -- параллельное сохранение не перетирает чужие изменения молча.
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Уникален полный АДРЕС страницы, а не одно имя: `pagename` уникален только
-- внутри своего `url_prefix`, поэтому `/blog/post` и `/news/post` — разные
-- страницы. Код адресует страницу этой же парой: URL редактора и превью, ключи
-- черновиков localStorage, SSR-payload, data sources и публичный lookup
-- (`common/utils/bricks/pageAddress.ts` — владелец сериализации).
--
-- ДВА partial-индекса, а не один `UNIQUE NULLS NOT DISTINCT (pagename, url_prefix)`:
-- второе — синтаксис PostgreSQL 15, и на 14 миграция падала бы, а обычный UNIQUE
-- по паре не годится совсем (NULL'ы считаются различными, и две страницы БЕЗ
-- префикса с одним именем заняли бы один корневой URL `/pagename`). Пара
-- индексов даёт ту же семантику «отсутствие префикса — это значение» на любой
-- живой версии и ровно повторяет две ветки адресного lookup'а в
-- postgresStorageAdapter: беспрефиксная ветка обслуживается меньшим индексом.
--
-- Нарушение любого из них приходит тем же SQLSTATE 23505, по которому адаптер и
-- различает конфликт адреса, — имя ограничения в детекте не участвует.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bricks_pages_address
    ON bricks_pages(pagename, url_prefix)
    WHERE url_prefix IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bricks_pages_address_bare
    ON bricks_pages(pagename)
    WHERE url_prefix IS NULL;

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
    -- Зеркало bricks_pages.viewport_config на момент снимка: набор устройств —
    -- часть состояния страницы, и откат к версии обязан вернуть ту раскладку,
    -- в которой её сохраняли. NULL у версий наследующих страниц и у тех, что
    -- сняты до появления колонки
    viewport_config JSONB,
    schema JSONB NOT NULL,
    published BOOLEAN NOT NULL DEFAULT false,
    page_updated_at TIMESTAMPTZ,          -- updated_at исходной строки на момент снапшота
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_page_versions_page_created
    ON bricks_page_versions(page_id, created_at DESC);

-- Пользователи database-auth (bricks.auth.mode = 'database').
-- Провижининг вручную: npm run bricks:hash -- --username <name> --role admin → SQL.
CREATE TABLE IF NOT EXISTS bricks_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- scrypt:N:r:p:saltB64:hashB64
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Роль в матрице прав: admin — удаление (страниц, версий, медиа, категорий)
    -- и управление учётками; editor — сохранение, публикация, загрузка;
    -- viewer — только чтение. Дефолт 'editor' относится к провижинингу через
    -- CLI без явной роли: самая ходовая учётка — редактор, а раздача admin по
    -- умолчанию сделала бы полные права наградой за невнимательность.
    role VARCHAR(32) NOT NULL DEFAULT 'editor'
        CONSTRAINT bricks_users_role_check CHECK (role IN ('admin', 'editor', 'viewer')),
    -- Отображаемое имя и фото профиля: правит их себе сам пользователь, логин
    -- при этом неизменяем. NULL — показывается логин и буквенная заглушка.
    display_name TEXT,
    avatar_url TEXT,
    -- Поколение учётных данных. Инкремент — единственный носитель отзыва
    -- сессий: смена пароля, деактивация и смена роли поднимают его в той же
    -- транзакции, что меняет состояние, и все прежние сессии перестают
    -- совпадать по auth_version мгновенно. Удаление строк bricks_sessions идёт
    -- следом как уборка, а не как механизм безопасности: отдельный DELETE мог
    -- бы отказать после успешной смены пароля и оставить украденную куку живой.
    auth_version INTEGER NOT NULL DEFAULT 1,
    -- Момент последнего УСПЕШНОГО входа; NULL — учётка не входила ни разу.
    -- Пишется той же операцией, что создаёт сессию, и под тем же условием
    -- (учётка активна, поколение совпадает с прочитанным до проверки пароля):
    -- запись до вставки сессии отметила бы вход, которого не случилось.
    -- Из bricks_sessions это не выводится: строки сессий уходят при выходе,
    -- отзыве прав, уборке просроченных и удалении учётки, поэтому «не входил ни
    -- разу» по их отсутствию было бы ложью о каждом, кто вышел.
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Регистронезависимая уникальность логина: rate limiter логина уже считает
-- `Admin` и `admin` одним ключом (buildRateLimitKey лоуэркейсит), а поиск по
-- username регистрозависим — без индекса это две учётки, делящие один бюджет
-- попыток. Логин канонизируется в нижний регистр на входе.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bricks_users_username_lower
    ON bricks_users(lower(username));

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
    -- Поколение учётных данных на момент входа. Сессия считается живой, только
    -- пока совпадает с bricks_users.auth_version: смена пароля/деактивация/смена
    -- роли отзывают её одним инкрементом, не полагаясь на успех DELETE.
    -- Та же колонка закрывает гонку «вход одновременно со сменой пароля»:
    -- проверка пароля идёт секунды (scrypt), и за это время состояние учётки
    -- могло измениться — вставка сессии условная, по совпадению поколения.
    auth_version INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_sessions_user_id ON bricks_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bricks_sessions_expires_at ON bricks_sessions(expires_at);

-- Категории медиа-галереи. Прежде набор был хардкодом в UI-константе, из-за чего
-- сервер принимал любую строку, а пользователь не мог завести свою категорию.
-- Теперь набор целиком заводит пользователь: предустановленных категорий нет,
-- неудаляемых нет, приёмника для файлов удалённой категории нет.
-- `slug` — то, что лежит в bricks_media.category и служит значением фильтра
-- галереи; считает его сервер nuxt-bricks транслитерацией подписи.
-- `label` — введённая пользователем подпись, переводить её нечем.
CREATE TABLE IF NOT EXISTS bricks_media_categories (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_media_categories_sort ON bricks_media_categories(sort_order, id);

-- Метаданные медиа-галереи
CREATE TABLE IF NOT EXISTS bricks_media (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    filename TEXT NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    size BIGINT NOT NULL,
    mime_type VARCHAR(255) NOT NULL DEFAULT 'image/png',
    -- FK на slug, а не на id: категория ездит по всему стеку строкой (фильтр
    -- галереи, multipart-поле загрузки, PATCH метаданных), и подстановка id
    -- заставила бы резолвить её в каждой из этих точек. ON UPDATE CASCADE —
    -- переименование slug'а не рассыпает ссылки; ON DELETE SET NULL — удаление
    -- категории оставляет файлы в медиатеке без категории (каскад снёс бы их
    -- вместе с категорией, а RESTRICT требовал бы приёмника, которого больше
    -- нет). NULL — файл без категории: он виден только в фильтре «Все».
    category VARCHAR(50)
        REFERENCES bricks_media_categories(slug) ON UPDATE CASCADE ON DELETE SET NULL,
    svg_content TEXT,
    -- Пиксельные размеры растра: нужны мета-тегам og:image:width/height — без них
    -- соцсеть при первом шеринге часто рисует мелкую карточку, не дожидаясь
    -- загрузки картинки. NULL — размеры неизвестны (svg, внешние URL), теги в
    -- этом случае не печатаются.
    width INTEGER,
    height INTEGER,
    -- Уменьшенные варианты растра для постепенной загрузки: preview (~480px) и
    -- mock (~32px) генерируются при каждой загрузке изображения. NULL — вариантов
    -- нет (svg, видео, внешние URL, файлы, загруженные до появления вариантов):
    -- потребитель в этом случае обязан сразу показывать полный файл, а не пустоту.
    preview_url TEXT,
    mock_url TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Уникальность url: без неё гонка «двое регистрируют один url» (импорт из
-- бакета, ретрай клиента) создавала дубликаты. createMedia дефолтного адаптера
-- идемпотентен — при unique_violation возвращает существующую запись
CREATE UNIQUE INDEX IF NOT EXISTS uq_bricks_media_url ON bricks_media(url);

CREATE INDEX IF NOT EXISTS idx_bricks_media_category ON bricks_media(category);
CREATE INDEX IF NOT EXISTS idx_bricks_media_uploaded_at ON bricks_media(uploaded_at DESC);
