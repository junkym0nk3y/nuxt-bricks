-- 0005: namespaced-функция триггера updated_at.
-- Forward-миграция для БД, созданных прежней редакцией 0001: та выполняла
-- CREATE OR REPLACE FUNCTION update_updated_at_column() в shared schema и
-- могла перезаписать одноимённую функцию host-приложения. Текущая 0001 сразу
-- создаёт namespaced-функцию — на свежей БД миграция идемпотентно пересоздаёт
-- то же самое.

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

-- Старая update_updated_at_column() сознательно НЕ удаляется:
-- невозможно отличить копию, созданную прежней 0001, от собственной функции
-- host-приложения — в т.ч. ещё не привязанной к триггерам, которую условный
-- DROP удалил бы молча. Осиротевшую bricks-копию оператор при желании убирает
-- вручную: DROP FUNCTION update_updated_at_column();
