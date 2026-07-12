-- 0005: namespaced-функция триггера updated_at (аудит A-10).
-- Прежний CREATE OR REPLACE FUNCTION update_updated_at_column() в shared
-- schema мог перезаписать одноимённую функцию host-приложения.

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

DROP TRIGGER IF EXISTS update_bricks_users_updated_at ON bricks_users;
CREATE TRIGGER update_bricks_users_updated_at
    BEFORE UPDATE ON bricks_users
    FOR EACH ROW
    EXECUTE FUNCTION bricks_update_updated_at_column();

-- Старую общую функцию удаляем, только если от неё ничего не зависит:
-- host-приложение могло привязать к ней собственные триггеры
DO $$
BEGIN
    DROP FUNCTION IF EXISTS update_updated_at_column();
EXCEPTION
    WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'update_updated_at_column() оставлена: на неё ссылаются объекты вне nuxt-bricks';
END $$;
