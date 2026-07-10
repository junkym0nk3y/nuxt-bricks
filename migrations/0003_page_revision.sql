-- 0003_page_revision: optimistic locking страниц.
--
-- Колонка revision монотонно растёт на каждом UPDATE строки (инкремент делает
-- postgresStorageAdapter.updatePage). Клиент передаёт expectedRevision в
-- PUT/PATCH /api/bricks/:id; несовпадение → 409 REVISION_CONFLICT — параллельное
-- сохранение не перетирает чужие изменения молча.
ALTER TABLE bricks_pages ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
