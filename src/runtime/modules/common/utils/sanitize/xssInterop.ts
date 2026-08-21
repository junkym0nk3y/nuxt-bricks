/**
 * The CJS bridge to js-xss. The package is CommonJS that overwrites its exports
 * (`module.exports = filterXSS` + properties), so named value imports are
 * unreliable: `safeAttrValue` is re-exported by a dynamic loop and is invisible to
 * cjs-module-lexer (which fails in production Node ESM), while `FilterXSS` gets lost
 * in vite-node dev SSR (the namespace of an externalized module does not unfold
 * module.exports). The one path that holds in both worlds is a default import with
 * the interop wrappers unwrapped down to module.exports.
 */
import xssModule, {
    type EscapeHandler,
    type FilterXSS as FilterXSSInstance,
    type IFilterXSSOptions,
    type SafeAttrValueHandler,
} from 'xss';

/** The FilterXSS constructor (the value is taken from module.exports, the type from the typings) */
type TFilterXSSConstructor = new (options?: IFilterXSSOptions) => FilterXSSInstance;

/** The members of the js-xss module.exports that matter to the sanitizers */
interface IXssRuntimeExports {
    FilterXSS: TFilterXSSConstructor;
    safeAttrValue: SafeAttrValueHandler;
    friendlyAttrValue: EscapeHandler;
}

/**
 * Unwraps the interop wrappers of the default import down to the js-xss
 * module.exports — the `filterXSS` function with its properties. Node ESM returns
 * module.exports right away, vite-node (dev SSR) wraps it into a namespace object
 * with a `default`.
 *
 * @param value - Default import of the xss module.
 */
function unwrapModuleExports(value: unknown): unknown {
    let current = value;
    while (current !== null && typeof current === 'object' && 'default' in current) {
        current = (current as { default: unknown }).default;
    }
    return current;
}

/**
 * Checks that the unwrapped module.exports carries the needed members.
 *
 * @param value - The module.exports candidate.
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
 * Decodes an attribute value exactly the way js-xss does before handing it out
 * (numeric/hex HTML entities, `&colon;`, the collapse of control chars). The URL
 * policy has to be applied to THAT string, otherwise the encoded `url&#40;…&#41;`
 * passes a raw check while js-xss decodes it into a live external reference.
 */
export const friendlyAttrValue = xssExports.friendlyAttrValue;
