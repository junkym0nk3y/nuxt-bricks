-- 0002_media_unique_url: уникальность bricks_media.url.
--
-- До индекса гонка «двое регистрируют один url» (импорт из бакета, ретрай
-- клиента) могла создать дубликаты записей. createMedia дефолтного адаптера
-- идемпотентен: при unique_violation возвращает существующую запись.
--
-- Существующие дубликаты схлопываются до новейшей записи (максимальный id) —
-- записи ссылаются на один и тот же файл хранилища, различаться могут только
-- метаданные, приоритет у последней.

DELETE FROM bricks_media duplicate
USING bricks_media survivor
WHERE duplicate.url = survivor.url
  AND duplicate.id < survivor.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bricks_media_url ON bricks_media(url);
