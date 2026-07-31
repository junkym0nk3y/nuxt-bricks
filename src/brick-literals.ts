/**
 * Язык литералов brick-файла: разбор значений, которые разрешено записывать в
 * метаданные, и диагностика с точным местом в файле.
 *
 * Список форм закрытый, потому что метаданные читаются разбором исходника, а не
 * исполнением модуля (см. `src/brick-metadata.ts`): значение вычисляемой формы
 * здесь попросту неизвестно, и подставить вместо него «что-нибудь» значило бы
 * записать в манифест не то, что видит разработчик в файле.
 */
import { type Expression, type ObjectExpression, type ObjectProperty } from 'oxc-parser';
import type { IBrickSourceFile, TBrickLiteralValue } from './types/brickLiterals';

// #region Constants
/**
 * Ключ, запрещённый на любой глубине метаданных: в объекте JS он меняет
 * прототип, а в JSON и Nuxt payload читается как обычное поле — сохранить
 * значение без искажения нельзя ни в одном из представлений.
 */
const FORBIDDEN_LITERAL_KEY = '__proto__';
// #endregion

// #region Methods
/**
 * Строит позицию `строка:колонка` по смещению в исходнике.
 *
 * Нужна сообщению об ошибке: oxc отдаёт узлы со смещениями, а разработчику
 * нужна строка, по которой он найдёт место в редакторе.
 *
 * @param content - Исходник brick-файла.
 * @param offset - Смещение узла от начала файла.
 * @returns Позиция в виде `строка:колонка`.
 */
function formatPosition(content: string, offset: number): string {
    const before = content.slice(0, offset);
    const line = before.split('\n').length;
    const column = offset - (before.lastIndexOf('\n') + 1) + 1;

    return `${line}:${column}`;
}

/**
 * Собирает ошибку разбора с местом в файле и путём до поля.
 *
 * @param source - Разбираемый файл.
 * @param offset - Смещение проблемного узла.
 * @param path - Путь до поля вида `brick.values.headline.default`.
 * @param detail - Что именно не так.
 * @returns Ошибка сборки.
 */
export function createBrickSourceError(
    source: IBrickSourceFile,
    offset: number,
    path: string,
    detail: string
): Error {
    return new Error(
        `[nuxt-bricks] ${source.filePath}:${formatPosition(source.content, offset)} — ${path}: ${detail}`
    );
}

/**
 * Снимает обёртки, не меняющие значение: скобки, `as` и `satisfies`.
 *
 * @param expression - Разбираемое выражение.
 * @returns Выражение без обёрток.
 */
export function unwrapStaticExpression(expression: Expression): Expression {
    let current = expression;

    while (
        current.type === 'ParenthesizedExpression' ||
        current.type === 'TSAsExpression' ||
        current.type === 'TSSatisfiesExpression' ||
        current.type === 'TSNonNullExpression'
    ) {
        current = current.expression;
    }

    return current;
}

/**
 * Читает имя свойства объекта.
 *
 * Вычисляемый ключ запрещён: его значение известно только исполнению, а
 * shorthand-запись (`{ name }`) отсекается общим правилом «только литералы» —
 * её значение всегда идентификатор.
 *
 * `__proto__` запрещается здесь, а не у вызывающих: в объектном литерале это не
 * обычное поле, а установка прототипа, поэтому исполненный модуль показал бы
 * унаследованные значения (`brick.category`, `brick.dataSources`) там, где
 * разбор видит их отсутствие.
 *
 * @param source - Разбираемый файл.
 * @param property - Свойство объектного литерала.
 * @param path - Путь до объекта-родителя.
 * @returns Имя свойства.
 */
export function readPropertyName(
    source: IBrickSourceFile,
    property: ObjectProperty,
    path: string
): string {
    if (property.computed) {
        throw createBrickSourceError(source, property.start, path, 'вычисляемый ключ запрещён');
    }

    const name = readKeyName(source, property, path);

    if (name === FORBIDDEN_LITERAL_KEY) {
        throw createBrickSourceError(
            source,
            property.start,
            `${path}.${name}`,
            'ключ подменяет прототип и не переживает сериализацию'
        );
    }

    return name;
}

/**
 * Читает имя ключа свойства без проверок допустимости.
 *
 * @param source - Разбираемый файл.
 * @param property - Свойство объектного литерала.
 * @param path - Путь до объекта-родителя.
 * @returns Имя ключа.
 */
function readKeyName(source: IBrickSourceFile, property: ObjectProperty, path: string): string {
    if (property.key.type === 'Identifier') {
        return property.key.name;
    }

    if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
        return property.key.value;
    }

    throw createBrickSourceError(
        source,
        property.start,
        path,
        'ключом может быть только имя или строковый литерал'
    );
}

/**
 * Пропускает только числа, которые дойдут до рантайма без искажения.
 *
 * Манифест едет через JSON, а тот не умеет ни бесконечностей, ни `-0`:
 * `1e999` записался бы как `null`, а `-0` вернулся бы обычным нулём. Тихо
 * подменённое значение по умолчанию хуже отказа сборки — его никто не заметит.
 *
 * @param source - Разбираемый файл.
 * @param value - Прочитанное число.
 * @param offset - Смещение узла для сообщения об ошибке.
 * @param path - Путь до поля.
 * @returns То же число, если оно представимо в манифесте.
 */
function readNumber(source: IBrickSourceFile, value: number, offset: number, path: string): number {
    if (!Number.isFinite(value)) {
        throw createBrickSourceError(source, offset, path, 'число вне диапазона JSON');
    }

    if (Object.is(value, -0)) {
        throw createBrickSourceError(source, offset, path, 'сериализация не сохраняет -0');
    }

    return value;
}

/**
 * Читает литеральное значение выражения.
 *
 * @param source - Разбираемый файл.
 * @param expression - Разбираемое выражение.
 * @param path - Путь до поля для сообщения об ошибке.
 * @returns Значение выражения.
 */
export function readStaticLiteral(
    source: IBrickSourceFile,
    expression: Expression,
    path: string
): TBrickLiteralValue {
    const node = unwrapStaticExpression(expression);

    if (node.type === 'Literal') {
        if ('regex' in node || typeof node.value === 'bigint') {
            throw createBrickSourceError(
                source,
                node.start,
                path,
                'допустимы строка, число, boolean и null'
            );
        }

        if (typeof node.value === 'number') {
            return readNumber(source, node.value, node.start, path);
        }

        return node.value;
    }

    // Шаблон без подстановок — та же строка, записанная иначе
    if (node.type === 'TemplateLiteral') {
        if (node.expressions.length > 0) {
            throw createBrickSourceError(
                source,
                node.start,
                path,
                'подстановка в шаблонной строке запрещена'
            );
        }

        return node.quasis[0]?.value.cooked ?? '';
    }

    // Отрицательные числа приходят унарным минусом, а не литералом
    if (node.type === 'UnaryExpression') {
        const argument = unwrapStaticExpression(node.argument);
        const isSigned = node.operator === '-' || node.operator === '+';

        if (!isSigned || argument.type !== 'Literal' || typeof argument.value !== 'number') {
            throw createBrickSourceError(
                source,
                node.start,
                path,
                'вычисляемое значение запрещено'
            );
        }

        return readNumber(
            source,
            node.operator === '-' ? -argument.value : argument.value,
            node.start,
            path
        );
    }

    if (node.type === 'ArrayExpression') {
        return node.elements.map((element, index) => {
            const elementPath = `${path}[${index}]`;

            if (element === null) {
                throw createBrickSourceError(source, node.start, elementPath, 'пропуск запрещён');
            }

            if (element.type === 'SpreadElement') {
                throw createBrickSourceError(source, element.start, elementPath, 'spread запрещён');
            }

            return readStaticLiteral(source, element, elementPath);
        });
    }

    if (node.type === 'ObjectExpression') {
        return readLiteralRecord(source, node, path);
    }

    throw createBrickSourceError(source, node.start, path, 'ожидается литерал');
}

/**
 * Читает объектный литерал в обычный объект.
 *
 * @param source - Разбираемый файл.
 * @param node - Объектный литерал.
 * @param path - Путь до объекта.
 * @returns Значения свойств по именам.
 */
function readLiteralRecord(
    source: IBrickSourceFile,
    node: ObjectExpression,
    path: string
): Record<string, TBrickLiteralValue> {
    const record: Record<string, TBrickLiteralValue> = {};

    for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
            throw createBrickSourceError(source, property.start, path, 'spread запрещён');
        }

        const name = readPropertyName(source, property, path);
        const propertyPath = `${path}.${name}`;

        if (property.method || property.kind !== 'init') {
            throw createBrickSourceError(source, property.start, propertyPath, 'ожидается литерал');
        }

        record[name] = readStaticLiteral(source, property.value, propertyPath);
    }

    return record;
}

/**
 * Проверяет, что значение — обычный объект, а не массив или примитив.
 *
 * @param value - Разобранное значение.
 * @returns Признак объекта.
 */
export function isLiteralRecord(value: unknown): value is Record<string, TBrickLiteralValue> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
// #endregion
