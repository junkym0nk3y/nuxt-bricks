/**
 * Build-time разбор метаданных brick-файла: `category`, `description`, `values`
 * и `slots` читаются прямо из объявления `export const brick`, без исполнения
 * модуля.
 *
 * Почему разбор, а не импорт: brick-файл тянет за собой `.vue`-компонент, то
 * есть исполнить его на build-time можно только через полноценный Vite-конвейер,
 * которого в prod-сборке нет. Разбор исходника даёт те же значения дешевле — но
 * только для литералов, поэтому вычисляемые формы запрещены явной ошибкой
 * сборки: тихо подставленное «значение по умолчанию» разошлось бы с тем, что
 * видит разработчик в файле. Заодно это делает честным хеш манифеста по
 * содержимому файла — метаданных, вынесенных в импортируемую константу, он бы
 * не заметил.
 *
 * Читаются ровно четыре поля. Остальные (в первую очередь `dataSources` с их
 * функциями) не разбираются вовсе: они нужны рантайму, который модуль всё равно
 * импортирует.
 */
import { parseSync, type ObjectExpression, type ObjectProperty, type Program } from 'oxc-parser';
import {
    createBrickSourceError,
    isLiteralRecord,
    readPropertyName,
    readStaticLiteral,
    unwrapStaticExpression,
} from './brick-literals';
import type { IComponentSlotDefinition } from './runtime/modules/common/types/brick';
import type { IBrickValues } from './runtime/modules/common/types/index';
import type { IBrickSourceFile, TBrickLiteralValue } from './types/brickLiterals';
import type { IBrickMetadata } from './types/brickMetadata';

// #region Constants
/** Имя экспорта, в котором живут метаданные brick-компонента. */
const BRICK_EXPORT_NAME = 'brick';

/** Категория брика, у которого поле `category` не задано. */
const DEFAULT_CATEGORY = 'Common';

/** Поля метаданных, которые уезжают в манифест. */
const CATEGORY_FIELD = 'category';
const DESCRIPTION_FIELD = 'description';
const VALUES_FIELD = 'values';
const SLOTS_FIELD = 'slots';
// #endregion

// #region Methods
/**
 * Находит объектный литерал объявления `export const brick`.
 *
 * Поддерживается ровно одна форма — прямое локальное объявление через `const`.
 * Ре-экспорт и `export { brick }` из другого модуля не поддерживаются намеренно:
 * значение тогда лежит вне разбираемого файла, а хеш манифеста считается по нему.
 *
 * @param source - Разбираемый файл.
 * @param program - Разобранная программа.
 * @returns Объектный литерал метаданных.
 */
function findBrickInitializer(source: IBrickSourceFile, program: Program): ObjectExpression {
    for (const statement of program.body) {
        if (
            statement.type !== 'ExportNamedDeclaration' ||
            statement.declaration?.type !== 'VariableDeclaration' ||
            // `let`/`var` разбор читает в точке объявления, а переприсваивание
            // ниже по файлу меняет то, что увидит рантайм
            statement.declaration.kind !== 'const'
        ) {
            continue;
        }

        for (const declarator of statement.declaration.declarations) {
            if (declarator.id.type !== 'Identifier' || declarator.id.name !== BRICK_EXPORT_NAME) {
                continue;
            }

            if (!declarator.init) {
                throw createBrickSourceError(
                    source,
                    declarator.start,
                    BRICK_EXPORT_NAME,
                    'объявление без значения'
                );
            }

            const initializer = unwrapStaticExpression(declarator.init);

            if (initializer.type !== 'ObjectExpression') {
                throw createBrickSourceError(
                    source,
                    initializer.start,
                    BRICK_EXPORT_NAME,
                    'ожидается объектный литерал'
                );
            }

            return initializer;
        }
    }

    throw new Error(
        `[nuxt-bricks] ${source.filePath}: brick-файл обязан объявлять \`export const ${BRICK_EXPORT_NAME} = { … }\``
    );
}

/**
 * Раскладывает верхний уровень метаданных по именам полей.
 *
 * Верхний уровень проверяется целиком, а не только у четырёх нужных полей:
 * spread или вычисляемый ключ могут добавить или перекрыть любое из них, и
 * тогда разобранное значение разошлось бы с фактическим. Значения полей при
 * этом не читаются — `dataSources` с функциями обязан пройти без ошибки.
 *
 * @param source - Разбираемый файл.
 * @param node - Объектный литерал метаданных.
 * @returns Свойства по именам; повтор имени перекрывается последним, как в JS.
 */
function readMetadataProperties(
    source: IBrickSourceFile,
    node: ObjectExpression
): Map<string, ObjectProperty> {
    const properties = new Map<string, ObjectProperty>();

    for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
            throw createBrickSourceError(
                source,
                property.start,
                BRICK_EXPORT_NAME,
                'spread запрещён: он может перекрыть поля метаданных'
            );
        }

        properties.set(readPropertyName(source, property, BRICK_EXPORT_NAME), property);
    }

    return properties;
}

/**
 * Читает строковое поле метаданных.
 *
 * @param source - Разбираемый файл.
 * @param properties - Свойства верхнего уровня по именам.
 * @param name - Имя поля.
 * @returns Значение поля или `undefined`, если поля нет.
 */
function readStringField(
    source: IBrickSourceFile,
    properties: Map<string, ObjectProperty>,
    name: string
): string | undefined {
    const property = properties.get(name);

    if (!property) {
        return undefined;
    }

    const path = `${BRICK_EXPORT_NAME}.${name}`;
    const value = readStaticLiteral(source, property.value, path);

    if (typeof value !== 'string') {
        throw createBrickSourceError(source, property.start, path, 'ожидается строка');
    }

    return value;
}

/**
 * Проверяет верхнеуровневую форму `values`: запись «имя пропа → объект».
 *
 * Глубже форма не проверяется — это задача редакторов свойств, а не манифеста;
 * от разбора требуется доказать, что значение сериализуемо и имеет ожидаемую
 * структуру.
 *
 * @param value - Разобранное значение поля.
 * @returns Признак записи определений свойств.
 */
function isBrickValuesRecord(value: unknown): value is Record<string, IBrickValues> {
    return isLiteralRecord(value) && Object.values(value).every(isLiteralRecord);
}

/**
 * Собирает одно определение слота из объектной формы.
 *
 * @param source - Разбираемый файл.
 * @param name - Имя слота.
 * @param definition - Разобранное определение.
 * @param offset - Смещение узла для сообщения об ошибке.
 * @param path - Путь до определения.
 * @returns Нормализованное определение слота.
 */
function toSlotDefinition(
    source: IBrickSourceFile,
    name: string,
    definition: Record<string, TBrickLiteralValue>,
    offset: number,
    path: string
): IComponentSlotDefinition {
    const { label, description, allowMultiple } = definition;

    if (label !== undefined && typeof label !== 'string') {
        throw createBrickSourceError(source, offset, `${path}.label`, 'ожидается строка');
    }

    if (description !== undefined && typeof description !== 'string') {
        throw createBrickSourceError(source, offset, `${path}.description`, 'ожидается строка');
    }

    if (allowMultiple !== undefined && typeof allowMultiple !== 'boolean') {
        throw createBrickSourceError(source, offset, `${path}.allowMultiple`, 'ожидается boolean');
    }

    return {
        name,
        label: label ?? name,
        description,
        allowMultiple: allowMultiple ?? true,
    };
}

/**
 * Нормализует обе формы записи слотов в один список определений.
 *
 * Нормализация делается здесь, а не в билдере: в манифест уезжает уже готовая
 * форма, поэтому разбирать сырые варианты записи в рантайме больше некому.
 *
 * @param source - Разбираемый файл.
 * @param properties - Свойства верхнего уровня по именам.
 * @returns Определения слотов или `undefined`, если слотов нет.
 */
function readSlots(
    source: IBrickSourceFile,
    properties: Map<string, ObjectProperty>
): IComponentSlotDefinition[] | undefined {
    const property = properties.get(SLOTS_FIELD);

    if (!property) {
        return undefined;
    }

    const path = `${BRICK_EXPORT_NAME}.${SLOTS_FIELD}`;
    const value = readStaticLiteral(source, property.value, path);
    const offset = property.start;

    if (Array.isArray(value)) {
        const definitions = value.map((slot, index) => {
            const slotPath = `${path}[${index}]`;

            if (typeof slot === 'string') {
                return { name: slot, label: slot, allowMultiple: true };
            }

            if (!isLiteralRecord(slot) || typeof slot.name !== 'string') {
                throw createBrickSourceError(
                    source,
                    offset,
                    slotPath,
                    'ожидается имя слота или объект с полем name'
                );
            }

            return toSlotDefinition(source, slot.name, slot, offset, slotPath);
        });

        return definitions.length > 0 ? definitions : undefined;
    }

    if (!isLiteralRecord(value)) {
        throw createBrickSourceError(source, offset, path, 'ожидается список или объект слотов');
    }

    const definitions = Object.entries(value).map(([name, definition]) => {
        const slotPath = `${path}.${name}`;

        if (!isLiteralRecord(definition)) {
            throw createBrickSourceError(source, offset, slotPath, 'ожидается объект');
        }

        return toSlotDefinition(source, name, definition, offset, slotPath);
    });

    return definitions.length > 0 ? definitions : undefined;
}

/**
 * Извлекает метаданные brick-файла из его исходника.
 *
 * @param filePath - Абсолютный путь brick-файла (для сообщений об ошибке).
 * @param content - Содержимое brick-файла.
 * @returns Метаданные для записи манифеста.
 */
export function extractBrickMetadata(filePath: string, content: string): IBrickMetadata {
    const source: IBrickSourceFile = { filePath, content };
    const parsed = parseSync(filePath, content, { lang: 'ts' });

    if (parsed.errors.length > 0) {
        const [{ message, labels }] = parsed.errors;

        // Позиция — из первой метки ошибки: без неё сообщение о синтаксической
        // ошибке отличалось бы от остальных, у которых место в файле есть
        throw createBrickSourceError(source, labels[0]?.start ?? 0, BRICK_EXPORT_NAME, message);
    }

    const node = findBrickInitializer(source, parsed.program);
    const properties = readMetadataProperties(source, node);
    const valuesProperty = properties.get(VALUES_FIELD);

    if (!valuesProperty) {
        throw new Error(
            `[nuxt-bricks] ${filePath}: brick-файл обязан объявлять \`${VALUES_FIELD}\` (пустой объект, если редактируемых свойств нет)`
        );
    }

    const valuesPath = `${BRICK_EXPORT_NAME}.${VALUES_FIELD}`;
    const values = readStaticLiteral(source, valuesProperty.value, valuesPath);

    if (!isBrickValuesRecord(values)) {
        throw createBrickSourceError(
            source,
            valuesProperty.start,
            valuesPath,
            'ожидается объект вида «имя свойства → его описание»'
        );
    }

    return {
        // Пустая строка значила бы категорию без имени: у такой записи нет ни
        // заголовка в библиотеке, ни адреса в фильтре по категории
        category: readStringField(source, properties, CATEGORY_FIELD) || DEFAULT_CATEGORY,
        description: readStringField(source, properties, DESCRIPTION_FIELD),
        values,
        slots: readSlots(source, properties),
    };
}
// #endregion
