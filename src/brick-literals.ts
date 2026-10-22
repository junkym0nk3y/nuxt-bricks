/**
 * The literal language of a brick file: parsing of the values allowed in
 * metadata, and diagnostics with the exact place in the file.
 *
 * The list of forms is closed because metadata is read by parsing the source
 * rather than by executing the module (see `src/brick-metadata.ts`): the value
 * of a computed form is simply unknown here, and putting "something" in its
 * place would mean writing into the manifest not what the developer sees in the
 * file.
 */
import { type Expression, type ObjectExpression, type ObjectProperty } from 'oxc-parser';
import type { IBrickSourceFile, TBrickLiteralValue } from './types/brickLiterals';

// #region Constants
/**
 * A key forbidden at any depth of the metadata: in a JS object it changes the
 * prototype, while in JSON and the Nuxt payload it reads as an ordinary field —
 * the value cannot be preserved undistorted in either representation.
 */
const FORBIDDEN_LITERAL_KEY = '__proto__';
// #endregion

// #region Methods
/**
 * Builds a `line:column` position from an offset in the source.
 *
 * The error message needs it: oxc hands out nodes with offsets, while the
 * developer needs the line that takes them to the place in the editor.
 *
 * @param content - Source of the brick file.
 * @param offset - Node offset from the start of the file.
 * @returns Position in the `line:column` form.
 */
function formatPosition(content: string, offset: number): string {
    const before = content.slice(0, offset);
    const line = before.split('\n').length;
    const column = offset - (before.lastIndexOf('\n') + 1) + 1;

    return `${line}:${column}`;
}

/**
 * Assembles a parse error carrying the place in the file and the path to the
 * field.
 *
 * @param source - File being parsed.
 * @param offset - Offset of the offending node.
 * @param path - Path to the field, of the form `brick.values.headline.default`.
 * @param detail - What exactly is wrong.
 * @returns Build error.
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
 * Strips the wrappers that do not change the value: parentheses, `as` and
 * `satisfies`.
 *
 * @param expression - Expression being parsed.
 * @returns The expression without wrappers.
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
 * Reads the name of an object property.
 *
 * A computed key is forbidden: its value is known only to execution, and the
 * shorthand form (`{ name }`) is cut off by the general "literals only" rule —
 * its value is always an identifier.
 *
 * `__proto__` is rejected here rather than at the call sites: in an object
 * literal it is not an ordinary field but a prototype assignment, so an executed
 * module would show inherited values (`brick.category`, `brick.dataSources`)
 * where the parser sees them missing.
 *
 * @param source - File being parsed.
 * @param property - Property of the object literal.
 * @param path - Path to the parent object.
 * @returns Property name.
 */
export function readPropertyName(
    source: IBrickSourceFile,
    property: ObjectProperty,
    path: string
): string {
    if (property.computed) {
        throw createBrickSourceError(source, property.start, path, 'a computed key is forbidden');
    }

    const name = readKeyName(source, property, path);

    if (name === FORBIDDEN_LITERAL_KEY) {
        throw createBrickSourceError(
            source,
            property.start,
            `${path}.${name}`,
            'this key replaces the prototype and does not survive serialization'
        );
    }

    return name;
}

/**
 * Reads the key name of a property without any admissibility checks.
 *
 * @param source - File being parsed.
 * @param property - Property of the object literal.
 * @param path - Path to the parent object.
 * @returns Key name.
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
        'only a name or a string literal can be a key'
    );
}

/**
 * Lets through only the numbers that reach the runtime undistorted.
 *
 * The manifest travels as JSON, and JSON knows neither infinities nor `-0`:
 * `1e999` would be written as `null`, and `-0` would come back an ordinary zero.
 * A silently substituted default value is worse than a failed build — nobody
 * notices it.
 *
 * @param source - File being parsed.
 * @param value - The number that was read.
 * @param offset - Node offset for the error message.
 * @param path - Path to the field.
 * @returns The same number, if it is representable in the manifest.
 */
function readNumber(source: IBrickSourceFile, value: number, offset: number, path: string): number {
    if (!Number.isFinite(value)) {
        throw createBrickSourceError(source, offset, path, 'the number is outside the JSON range');
    }

    if (Object.is(value, -0)) {
        throw createBrickSourceError(source, offset, path, 'serialization does not preserve -0');
    }

    return value;
}

/**
 * Reads the literal value of an expression.
 *
 * @param source - File being parsed.
 * @param expression - Expression being parsed.
 * @param path - Path to the field, for the error message.
 * @returns Value of the expression.
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
                'a string, a number, a boolean and null are allowed'
            );
        }

        if (typeof node.value === 'number') {
            return readNumber(source, node.value, node.start, path);
        }

        return node.value;
    }

    // A template with no interpolations is the same string, written differently
    if (node.type === 'TemplateLiteral') {
        if (node.expressions.length > 0) {
            throw createBrickSourceError(
                source,
                node.start,
                path,
                'an interpolation in a template string is forbidden'
            );
        }

        return node.quasis[0]?.value.cooked ?? '';
    }

    // Negative numbers arrive as a unary minus, not as a literal
    if (node.type === 'UnaryExpression') {
        const argument = unwrapStaticExpression(node.argument);
        const isSigned = node.operator === '-' || node.operator === '+';

        if (!isSigned || argument.type !== 'Literal' || typeof argument.value !== 'number') {
            throw createBrickSourceError(source, node.start, path, 'a computed value is forbidden');
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
                throw createBrickSourceError(
                    source,
                    node.start,
                    elementPath,
                    'a hole is forbidden'
                );
            }

            if (element.type === 'SpreadElement') {
                throw createBrickSourceError(
                    source,
                    element.start,
                    elementPath,
                    'spread is forbidden'
                );
            }

            return readStaticLiteral(source, element, elementPath);
        });
    }

    if (node.type === 'ObjectExpression') {
        return readLiteralRecord(source, node, path);
    }

    throw createBrickSourceError(source, node.start, path, 'a literal is expected');
}

/**
 * Reads an object literal into a plain object.
 *
 * @param source - File being parsed.
 * @param node - The object literal.
 * @param path - Path to the object.
 * @returns Property values by name.
 */
function readLiteralRecord(
    source: IBrickSourceFile,
    node: ObjectExpression,
    path: string
): Record<string, TBrickLiteralValue> {
    const record: Record<string, TBrickLiteralValue> = {};

    for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
            throw createBrickSourceError(source, property.start, path, 'spread is forbidden');
        }

        const name = readPropertyName(source, property, path);
        const propertyPath = `${path}.${name}`;

        if (property.method || property.kind !== 'init') {
            throw createBrickSourceError(
                source,
                property.start,
                propertyPath,
                'a literal is expected'
            );
        }

        record[name] = readStaticLiteral(source, property.value, propertyPath);
    }

    return record;
}

/**
 * Checks that the value is a plain object rather than an array or a primitive.
 *
 * @param value - The parsed value.
 * @returns Whether it is an object.
 */
export function isLiteralRecord(value: unknown): value is Record<string, TBrickLiteralValue> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
// #endregion
