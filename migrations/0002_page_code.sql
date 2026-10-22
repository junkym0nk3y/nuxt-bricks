-- 0002_page_code: third-party code and the indexing switch of a page.
--
-- A forward migration rather than an edit of 0001_init: 0001 is already applied in a
-- production database of a consumer, and the bricks_schema_migrations registry keeps the
-- checksum of the file as applied — any edit of it, comments included, would stop every
-- later `bricks-migrate migrate` there on drift.
--
-- Every statement is idempotent, like in 0001: the file is applied both through the CLI
-- and directly by the docker-compose initdb on an empty volume, and the CLI runs it again
-- after initdb, which records nothing in the registry.

-- Raw HTML put at the end of <head> and at the end of <body> of the published page
-- (counters, tag managers, chat widgets). Stored and served as written, unsanitized:
-- whoever may edit a page may run code on its published address.
ALTER TABLE bricks_pages ADD COLUMN IF NOT EXISTS head_code TEXT;
ALTER TABLE bricks_pages ADD COLUMN IF NOT EXISTS body_end_code TEXT;

-- Asks search engines not to index the published page
-- (<meta name="robots" content="noindex">).
ALTER TABLE bricks_pages ADD COLUMN IF NOT EXISTS noindex BOOLEAN NOT NULL DEFAULT false;
