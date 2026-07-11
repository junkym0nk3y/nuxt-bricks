/**
 * CJS-мост к js-xss. Пакет — CommonJS с перезаписью exports
 * (`module.exports = filterXSS` + свойства), поэтому named value-импорты
 * ненадёжны: `safeAttrValue` реэкспортируется динамическим циклом и невидим
 * для cjs-module-lexer (падает в production Node ESM), а `FilterXSS` теряется
 * в vite-node dev SSR (namespace externalized-модуля не разворачивает
 * module.exports). Единственный устойчивый в обоих мирах путь — default-импорт
 * с разворачиванием interop-обёрток до module.exports.
 */
import xssModule, {
    type EscapeHandler,
    type FilterXSS as FilterXSSInstance,
    type IFilterXSSOptions,
    type SafeAttrValueHandler,
} from 'xss';

/** Конструктор FilterXSS (значение достаём из module.exports, тип — из typings). */
type TFilterXSSConstructor = new (options?: IFilterXSSOptions) => FilterXSSInstance;

/** Значимые для санитайзеров члены module.exports js-xss. */
interface IXssRuntimeExports {
    FilterXSS: TFilterXSSConstructor;
    safeAttrValue: SafeAttrValueHandler;
    friendlyAttrValue: EscapeHandler;
}

/**
 * Разворачивает interop-обёртки default-импорта до module.exports js-xss —
 * функции `filterXSS` со свойствами. Node ESM отдаёт module.exports сразу,
 * vite-node (dev SSR) заворачивает его в namespace-объект с `default`.
 *
 * @param value - Default-импорт модуля xss.
 */
function unwrapModuleExports(value: unknown): unknown {
    let current = value;
    while (current !== null && typeof current === 'object' && 'default' in current) {
        current = (current as { default: unknown }).default;
    }
    return current;
}

/**
 * Проверяет, что развёрнутый module.exports содержит нужные члены.
 *
 * @param value - Кандидат module.exports.
 */
function isXssRuntimeExports(value: unknown): value is IXssRuntimeExports {
    return (
        typeof value === 'function' &&
        'FilterXSS' in value &&
        'safeAttrValue' in value &&
        'friendlyAttrValue' in value
    );
}

const xssExports = unwrapModuleExports(xssModule);

if (!isXssRuntimeExports(xssExports)) {
    throw new Error(
        '[nuxt-bricks] Unexpected "xss" module shape: FilterXSS/safeAttrValue/friendlyAttrValue is missing'
    );
}

export const FilterXSS = xssExports.FilterXSS;
export const safeAttrValue = xssExports.safeAttrValue;
/**
 * Декодирует значение атрибута ровно как это делает js-xss перед выдачей
 * (numeric/hex HTML-энтити, `&colon;`, коллапс control-chars). URL-политику
 * нужно применять к ЭТОЙ строке, иначе encoded `url&#40;…&#41;` проходит
 * raw-проверку, а js-xss декодирует его в живую внешнюю ссылку.
 */
export const friendlyAttrValue = xssExports.friendlyAttrValue;
