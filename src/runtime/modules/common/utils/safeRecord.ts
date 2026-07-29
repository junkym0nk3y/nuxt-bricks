/**
 * Доступ к объектам по ключу, пришедшему извне (схема страницы, brick-файл,
 * ответ data source). Для таких ключей `obj[key]` небезопасен: имена членов
 * `Object.prototype` (`__proto__`, `constructor`, `toString`, `hasOwnProperty`)
 * читаются как существующие значения, поэтому проверка «уже есть» ложно
 * срабатывает, а запись в мнимую корзину уходит в глобальный прототип.
 *
 * `Object.prototype.hasOwnProperty.call` вместо `Object.hasOwn` — по привычке к
 * широкой совместимости, а не по необходимости: фактический JS-пол проекта —
 * `safari 16` (дефолтный `build.target` Vite 7, см. `.browserslistrc`), так что
 * `Object.hasOwn` (Safari 15.4) прошёл бы. Прежнее обоснование «в
 * `.browserslistrc` есть `ios_saf 11`» неверно: этот файл читает только
 * autoprefixer и на JS не влияет. Менять форму записи не на что —
 * поведение идентично.
 */

// #region Constants
/**
 * Единственный ключ, который нельзя внести в обычный объект: присваивание
 * вызывает сеттер прототипа, а own-свойство с таким именем не переживает
 * сериализацию Nuxt payload (devalue бросает «Cannot stringify objects with
 * __proto__ keys»). Ключи-контейнеры такого ограничения не имеют — там `Map`.
 */
const PROTO_KEY = '__proto__';
// #endregion

/**
 * Проверяет наличие собственного (не унаследованного) ключа.
 *
 * @param target - Объект произвольной формы.
 * @param key - Ключ из недоверенного источника.
 * @returns true, если ключ объявлен в самом объекте.
 */
export function hasOwnKey(target: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Читает значение по внешнему ключу, не поднимаясь в прототип.
 *
 * @param target - Словарь-объект.
 * @param key - Ключ из недоверенного источника.
 * @returns Значение либо undefined, если own-ключа нет.
 */
export function readOwnKey<TValue>(
    target: Record<string, TValue>,
    key: string
): TValue | undefined {
    return hasOwnKey(target, key) ? target[key] : undefined;
}

/**
 * Собирает обычный объект из пар «ключ — значение» так, что специальные имена
 * становятся own-свойствами, а не членами прототипа. `__proto__` отбрасывается:
 * представить его в объекте, переживающем payload, невозможно (см. PROTO_KEY).
 *
 * @param entries - Пары ключ/значение с ключами из недоверенного источника.
 * @returns Объект с own-свойствами по всем ключам, кроме `__proto__`.
 */
export function toSafeRecord<TValue>(entries: Iterable<[string, TValue]>): Record<string, TValue> {
    return Object.fromEntries(Array.from(entries).filter(([key]) => key !== PROTO_KEY)) as Record<
        string,
        TValue
    >;
}
