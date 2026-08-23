-- 0001_init: the schema of the default Postgres adapter of nuxt-bricks.
--
-- Applied with `npm run bricks:migrate` or `npx bricks-migrate migrate` (see
-- src/cli/bricks-migrate.mjs). There is a single file and it describes the FINAL schema:
-- the project is unpublished, the database has one consumer and backward compatibility
-- is not supported — so a change goes in here rather than into a new forward migration,
-- and is applied to a live database by hand with the row of the bricks_schema_migrations
-- registry recomputed.
--
-- Every statement is idempotent: the file is applied both through the CLI and directly
-- by the docker-compose initdb on an empty volume.

-- Builder pages
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
    -- The device set of this page: 2 to 4 records
    -- { key, label, icon, width, aside, maxWidth?, minWidth? }, sorted by ascending
    -- width, with a mandatory `mobile` first and `desktop` last.
    -- NULL means the page inherits the set of the project (the bricks.devices option of
    -- the module). The width of a device serves both as the sheet of the canvas and as
    -- the min-width of its media query range, which is why the schema carries no
    -- separate list of breakpoints.
    viewport_config JSONB,
    schema JSONB NOT NULL,
    published BOOLEAN DEFAULT false,
    -- A monotonic counter of changes of the row (the increment lives in
    -- postgresStorageAdapter.updatePage). The client sends expectedRevision in
    -- PUT/PATCH /api/bricks/:id; a mismatch answers 409 REVISION_CONFLICT, so a parallel
    -- save never overwrites someone else's changes silently.
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- What is unique is the full ADDRESS of a page, not the name alone: `pagename` is unique
-- only inside its own `url_prefix`, so `/blog/post` and `/news/post` are different pages.
-- The code addresses a page by that same pair: the URL of the editor and of the preview,
-- the localStorage draft keys, the SSR payload, the data sources and the public lookup
-- (`common/utils/bricks/pageAddress.ts` owns the serialization).
--
-- TWO partial indexes rather than one `UNIQUE NULLS NOT DISTINCT (pagename, url_prefix)`:
-- the latter is PostgreSQL 15 syntax and the migration would fail on 14, while a plain
-- UNIQUE over the pair does not fit at all (NULLs count as distinct, and two pages with
-- NO prefix sharing a name would take the same root URL `/pagename`). The pair of indexes
-- gives the same "an absent prefix is a value" semantics on any live version and repeats
-- exactly the two branches of the address lookup in postgresStorageAdapter: the
-- prefixless branch is served by the smaller index.
--
-- A violation of either arrives as the same SQLSTATE 23505 the adapter uses to tell an
-- address conflict apart — the name of the constraint takes no part in the detection.
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

-- The function that keeps updated_at fresh. Namespaced deliberately: a shared schema may
-- already hold a function of the same name belonging to the host application, and a
-- CREATE OR REPLACE update_updated_at_column() would overwrite it.
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

-- The version history of pages: a snapshot of the former bricks_pages row on every save
-- that changes the schema (see postgresStorageAdapter.updatePage). The depth of the
-- history is bricks.versionsLimit / NUXT_BRICKS_VERSIONS_LIMIT (0 turns it off).
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
    -- The canvas frame as of the snapshot: the frame is taken AFTER the save, so the
    -- thumbnail_url of the page is the frame of exactly the state the snapshot keeps.
    -- NULL means there is no frame and none will appear, and the UI draws a placeholder
    thumbnail_url TEXT,
    -- A mirror of bricks_pages.viewport_config as of the snapshot: the device set is
    -- part of the state of the page, and a rollback to a version has to bring back the
    -- layout the page was saved in. NULL on versions of inheriting pages and on those
    -- taken before the column existed
    viewport_config JSONB,
    schema JSONB NOT NULL,
    published BOOLEAN NOT NULL DEFAULT false,
    page_updated_at TIMESTAMPTZ,          -- updated_at of the source row as of the snapshot
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_page_versions_page_created
    ON bricks_page_versions(page_id, created_at DESC);

-- The users of the database auth (bricks.auth.mode = 'database').
-- The first account is created by this very migration (the seed at the end of the file);
-- the rest are created out of it, already from the interface.
CREATE TABLE IF NOT EXISTS bricks_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- scrypt:N:r:p:saltB64:hashB64
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- The role in the permission matrix: admin means deletion (of pages, versions, media
    -- and categories) plus account management; editor means saving, publishing and
    -- uploading; viewer means reading only. The 'editor' default belongs to provisioning
    -- through the CLI without an explicit role: the most common account is an editor,
    -- and handing out admin by default would make full rights a reward for inattention.
    role VARCHAR(32) NOT NULL DEFAULT 'editor'
        CONSTRAINT bricks_users_role_check CHECK (role IN ('admin', 'editor', 'viewer')),
    -- The display name and the profile photo: the user edits them for themselves, while
    -- the login stays immutable. NULL means the login and a letter placeholder are shown.
    display_name TEXT,
    avatar_url TEXT,
    -- The generation of the credentials. The increment is the only carrier of session
    -- revocation: a password change, a deactivation and a role change all raise it in
    -- the same transaction that changes the state, and every former session stops
    -- matching by auth_version instantly. Deleting the bricks_sessions rows follows as
    -- cleanup rather than as a security mechanism: a separate DELETE could fail after a
    -- successful password change and leave a stolen cookie alive.
    auth_version INTEGER NOT NULL DEFAULT 1,
    -- The moment of the last SUCCESSFUL sign-in; NULL means the account never signed in.
    -- It is written by the same operation that creates the session and under the same
    -- condition (the account is active and the generation matches the one read before
    -- the password check): writing it before the session is inserted would mark a
    -- sign-in that never happened. It cannot be derived from bricks_sessions: session
    -- rows leave on sign-out, on revocation, on the cleanup of expired ones and when an
    -- account is deleted, so "never signed in" read from their absence would be a lie
    -- about everyone who signed out.
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case-insensitive uniqueness of the login: the rate limiter of the sign-in already
-- counts `Admin` and `admin` as one key (buildRateLimitKey lowercases), while the lookup
-- by username is case-sensitive — without the index those are two accounts sharing a
-- single budget of attempts. The login is canonicalized to lower case on the way in.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bricks_users_username_lower
    ON bricks_users(lower(username));

DROP TRIGGER IF EXISTS update_bricks_users_updated_at ON bricks_users;
CREATE TRIGGER update_bricks_users_updated_at
    BEFORE UPDATE ON bricks_users
    FOR EACH ROW
    EXECUTE FUNCTION bricks_update_updated_at_column();

-- The cookie sessions of the database auth (the database holds the SHA-256 hex of the
-- token alone)
CREATE TABLE IF NOT EXISTS bricks_sessions (
    id SERIAL PRIMARY KEY,
    token_hash CHAR(64) UNIQUE NOT NULL,  -- sha256 hex
    user_id INTEGER NOT NULL REFERENCES bricks_users(id) ON DELETE CASCADE,
    -- The generation of the credentials as of the sign-in. A session counts as alive
    -- only while it matches bricks_users.auth_version: a password change, a deactivation
    -- or a role change revoke it by a single increment, without relying on a DELETE
    -- succeeding. The same column closes the "signing in while the password is being
    -- changed" race: checking a password takes seconds (scrypt), the state of the
    -- account may change meanwhile, and so the insert of the session is conditional on
    -- the generation still matching.
    auth_version INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_sessions_user_id ON bricks_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bricks_sessions_expires_at ON bricks_sessions(expires_at);

-- The categories of the media gallery. The set used to be hardcoded in a UI constant,
-- which left the server accepting any string while the user could not create a category
-- of their own. Now the set is created by the user entirely: there are no preset
-- categories, no undeletable ones and no receiver for the files of a deleted category.
-- `slug` is what lies in bricks_media.category and serves as the value of the gallery
-- filter; the nuxt-bricks server computes it by transliterating the label.
-- `label` is the label entered by the user, and there is nothing to translate it with.
CREATE TABLE IF NOT EXISTS bricks_media_categories (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_media_categories_sort ON bricks_media_categories(sort_order, id);

-- The metadata of the media gallery
CREATE TABLE IF NOT EXISTS bricks_media (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    filename TEXT NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    size BIGINT NOT NULL,
    mime_type VARCHAR(255) NOT NULL DEFAULT 'image/png',
    -- The FK points at the slug rather than at the id: the category travels the whole
    -- stack as a string (the gallery filter, the multipart field of the upload, the
    -- PATCH of the metadata), and putting an id there would force resolving it at every
    -- one of those points. ON UPDATE CASCADE means renaming a slug does not scatter the
    -- references; ON DELETE SET NULL means deleting a category leaves its files in the
    -- library with no category (a cascade would take them away together with the
    -- category, and RESTRICT would demand a receiver that no longer exists). NULL is a
    -- file with no category: it shows up under the "All" filter alone.
    category VARCHAR(50)
        REFERENCES bricks_media_categories(slug) ON UPDATE CASCADE ON DELETE SET NULL,
    svg_content TEXT,
    -- The pixel dimensions of a raster: the og:image:width/height meta tags need them —
    -- without those a social network often draws a small card on the first share instead
    -- of waiting for the picture to load. NULL means the dimensions are unknown (svg,
    -- external URLs), and the tags are then not printed at all.
    width INTEGER,
    height INTEGER,
    -- Downscaled variants of a raster for a progressive load: preview (~480px) and mock
    -- (~32px) are generated on every image upload. NULL means there are no variants
    -- (svg, video, external URLs, files uploaded before the variants existed), and the
    -- consumer then has to show the full file right away rather than emptiness.
    preview_url TEXT,
    mock_url TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uniqueness of the url: without it the "two register the same url" race (an import
-- from a bucket, a retry of the client) created duplicates. The createMedia of the
-- default adapter is idempotent — on a unique_violation it returns the existing record
CREATE UNIQUE INDEX IF NOT EXISTS uq_bricks_media_url ON bricks_media(url);

CREATE INDEX IF NOT EXISTS idx_bricks_media_category ON bricks_media(category);
CREATE INDEX IF NOT EXISTS idx_bricks_media_uploaded_at ON bricks_media(uploaded_at DESC);

-- Page templates: an imprint of a finished page, out of which new ones are born.
--
-- An imprint and NOT a source of inheritance: there is no link to the created pages, and
-- editing a template after the fact changes nothing in them. The opposite would require
-- versions of a template and conflict resolution while a page is edited — a price the
-- feature is not worth.
--
-- What goes into a template: the content (`schema`) and the appearance of the page
-- (`page_meta` — the layout, the background, the device set). The address (`pagename`,
-- `url_prefix`, `subdomain`), the SEO fields, the OG picture and the publication status
-- stay with the page: two pages out of one template would otherwise be born with the
-- same address, that is with a refusal of the unique address index.
--
-- `page_meta` is a single JSONB rather than three columns: the set of appearance fields
-- changes together with the shape of a page, and every such change would cost a
-- migration of both tables. The keys inside are the same camelCase the page fields carry
-- on the client (`layout`, `backgroundColor`, `viewportConfig`).
CREATE TABLE IF NOT EXISTS bricks_templates (
    id SERIAL PRIMARY KEY,
    -- The name is unique: it is what identifies a template in the list and in the choice
    -- of the source of a new page. Case is significant here (unlike the login of an
    -- account): a person tells "Landing" from "landing" by eye, and a lower-cased index
    -- would forbid a second label differing by a capital letter alone.
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    -- A preview file of its own, copied from the frame of the page when the template was
    -- created, rather than a reference to the frame of the page. The frames of a page
    -- live by its keep-list (the page plus its versions, see pageThumbnails.ts): a
    -- foreign reference to such a file is invisible to the cleanup, and the very first
    -- save of the page would leave the template with a broken picture. NULL means there
    -- is no frame (the page was never saved, the copy of the file failed): the card then
    -- draws a placeholder.
    thumbnail_url TEXT,
    schema JSONB NOT NULL,
    page_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- The grid of templates is sorted by the date of CREATION rather than of the update:
-- renaming a template must not throw its card to the front of the list.
CREATE INDEX IF NOT EXISTS idx_bricks_templates_created_at ON bricks_templates(created_at DESC);

DROP TRIGGER IF EXISTS update_bricks_templates_updated_at ON bricks_templates;
CREATE TRIGGER update_bricks_templates_updated_at
    BEFORE UPDATE ON bricks_templates
    FOR EACH ROW
    EXECUTE FUNCTION bricks_update_updated_at_column();

-- The default administrator of a fresh database: `admin` / `bricks-pass`.
--
-- The account is what makes the database mode openable at all: the endpoint that creates
-- accounts requires a session of an active administrator, and before the first account
-- nobody has a session — without the seed there is nowhere to take the first sign-in
-- from. Beyond that, users are created and edited from the interface, and no external
-- provisioning is needed.
--
-- The hash is written as a literal instead of being computed in place: Postgres has no
-- scrypt, and the `scrypt:N:r:p:saltB64:hashB64` format is parsed by the verify of the
-- application (src/runtime/server/utils/auth/passwords.ts). The salt is therefore the
-- same across installations — for a password printed in the README that weakens nothing.
-- The same string is duplicated by the BRICKS_DEFAULT_ADMIN_PASSWORD_HASH constant: by
-- it the application learns the password is still the default one and asks to change it.
-- A drift between the literal and the constant is caught by
-- test/server/authDefaultAdmin.spec.ts.
--
-- DO NOTHING rather than DO UPDATE: migrations are applied repeatedly (the registry, the
-- initdb, a manual run), and an update would bring the default password back to an
-- account that had already changed it.
--
-- An account that was DELETED is created again by the seed: DO NOTHING keeps quiet about
-- an existing row alone. Through bricks-migrate this cannot happen (the file is written
-- into the registry and is not executed twice), but running the file by hand is a
-- declared scenario, and after it the database again holds an active administrator with
-- a widely known password. Whoever removes the seeded account deliberately has to know:
-- either never run the file by hand again, or change the password right away.
INSERT INTO bricks_users (username, password_hash, role)
VALUES (
    'admin',
    'scrypt:16384:8:1:mQgIxUboEImrtO4oD16ruw==:pqKwvl8Mzrn56ggLzSKzGiYLw2tgDCFObpl/3Ajx5jlF3GVAxqgMAhmZjruEmxilY6xNiXRPuGu/GuujVznG7A==',
    'admin'
)
ON CONFLICT (lower(username)) DO NOTHING;
