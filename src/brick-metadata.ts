/**
 * Build-time parsing of brick-file metadata: `category`, `description`, `values`
 * and `slots` are read straight from the `export const brick` declaration,
 * without executing the module.
 *
 * Why parsing and not an import: the manifest is produced in the Nuxt process (the
 * `build:before` hook and the dev watcher), outside the Vite module graph, and a
 * brick file drags a `.vue` component along — executing it there would mean
 * standing up a compile pipeline of our own just to read four fields. Parsing the
 * source yields the same values more cheaply —
 * but only for literals, which is why computed forms are rejected with an
 * explicit build error: a silently substituted "default value" would diverge
 * from what the developer sees in the file. It also keeps the manifest hash over
 * the file contents honest — metadata moved out into an imported constant would
 * go unnoticed by it.
 *
 * Exactly four fields are read. The rest (`dataSources` with their functions
 * first of all) are not parsed at all: they are needed by the runtime, which
 * imports the module anyway.
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
/** Name of the export the brick component metadata lives in */
const BRICK_EXPORT_NAME = 'brick';

/** Category of a brick whose `category` field is not set */
const DEFAULT_CATEGORY = 'Common';

/** The metadata fields that travel into the manifest */
const CATEGORY_FIELD = 'category';
const DESCRIPTION_FIELD = 'description';
const VALUES_FIELD = 'values';
const SLOTS_FIELD = 'slots';
// #endregion

// #region Methods
/**
 * Finds the object literal of the `export const brick` declaration.
 *
 * Exactly one form is supported — a direct local declaration through `const`.
 * A re-export and `export { brick }` from another module are deliberately
 * unsupported: the value would then live outside the parsed file, while the
 * manifest hash is computed over that file.
 *
 * @param source - File being parsed.
 * @param program - The parsed program.
 * @returns Object literal of the metadata.
 */
function findBrickInitializer(source: IBrickSourceFile, program: Program): ObjectExpression {
    for (const statement of program.body) {
        if (
            statement.type !== 'ExportNamedDeclaration' ||
            statement.declaration?.type !== 'VariableDeclaration' ||
            // With `let`/`var` the parser reads the declaration site, while a
            // reassignment further down the file changes what the runtime sees
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
                    'a declaration without a value'
                );
            }

            const initializer = unwrapStaticExpression(declarator.init);

            if (initializer.type !== 'ObjectExpression') {
                throw createBrickSourceError(
                    source,
                    initializer.start,
                    BRICK_EXPORT_NAME,
                    'an object literal is expected'
                );
            }

            return initializer;
        }
    }

    throw new Error(
        `[nuxt-bricks] ${source.filePath}: a brick file must declare \`export const ${BRICK_EXPORT_NAME} = { … }\``
    );
}

/**
 * Lays the top level of the metadata out by field name.
 *
 * The top level is checked in full rather than only at the four fields that are
 * needed: a spread or a computed key can add or shadow any of them, and the
 * parsed value would then diverge from the actual one. Field values are not read
 * while doing so — `dataSources` with its functions must pass without an error.
 *
 * @param source - File being parsed.
 * @param node - Object literal of the metadata.
 * @returns Properties by name; a repeated name is shadowed by the last one, as
 *   in JS.
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
                'spread is forbidden: it can shadow metadata fields'
            );
        }

        properties.set(readPropertyName(source, property, BRICK_EXPORT_NAME), property);
    }

    return properties;
}

/**
 * Reads a string metadata field.
 *
 * @param source - File being parsed.
 * @param properties - Top-level properties by name.
 * @param name - Field name.
 * @returns Value of the field, or `undefined` when the field is absent.
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
        throw createBrickSourceError(source, property.start, path, 'a string is expected');
    }

    return value;
}

/**
 * Checks the top-level shape of `values`: a record "prop name → object".
 *
 * The shape is not checked any deeper — that is the job of the property editors,
 * not of the manifest; the parser only has to prove that the value is
 * serializable and has the expected structure.
 *
 * @param value - The parsed value of the field.
 * @returns Whether it is a record of property definitions.
 */
function isBrickValuesRecord(value: unknown): value is Record<string, IBrickValues> {
    return isLiteralRecord(value) && Object.values(value).every(isLiteralRecord);
}

/**
 * Assembles one slot definition out of the object form.
 *
 * @param source - File being parsed.
 * @param name - Slot name.
 * @param definition - The parsed definition.
 * @param offset - Node offset for the error message.
 * @param path - Path to the definition.
 * @returns Normalized slot definition.
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
        throw createBrickSourceError(source, offset, `${path}.label`, 'a string is expected');
    }

    if (description !== undefined && typeof description !== 'string') {
        throw createBrickSourceError(source, offset, `${path}.description`, 'a string is expected');
    }

    if (allowMultiple !== undefined && typeof allowMultiple !== 'boolean') {
        throw createBrickSourceError(
            source,
            offset,
            `${path}.allowMultiple`,
            'a boolean is expected'
        );
    }

    return {
        name,
        label: label ?? name,
        description,
        allowMultiple: allowMultiple ?? true,
    };
}

/**
 * Normalizes both ways of writing slots into a single list of definitions.
 *
 * Normalization happens here rather than in the builder: the ready shape is what
 * travels into the manifest, so at runtime there is nobody left to take the raw
 * spellings apart.
 *
 * @param source - File being parsed.
 * @param properties - Top-level properties by name.
 * @returns Slot definitions, or `undefined` when the brick has no slots.
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
                    'a slot name or an object with a name field is expected'
                );
            }

            return toSlotDefinition(source, slot.name, slot, offset, slotPath);
        });

        return definitions.length > 0 ? definitions : undefined;
    }

    if (!isLiteralRecord(value)) {
        throw createBrickSourceError(
            source,
            offset,
            path,
            'a list or an object of slots is expected'
        );
    }

    const definitions = Object.entries(value).map(([name, definition]) => {
        const slotPath = `${path}.${name}`;

        if (!isLiteralRecord(definition)) {
            throw createBrickSourceError(source, offset, slotPath, 'an object is expected');
        }

        return toSlotDefinition(source, name, definition, offset, slotPath);
    });

    return definitions.length > 0 ? definitions : undefined;
}

/**
 * Extracts the metadata of a brick file from its source.
 *
 * @param filePath - Absolute path of the brick file (for error messages).
 * @param content - Contents of the brick file.
 * @returns Metadata for the manifest entry.
 */
export function extractBrickMetadata(filePath: string, content: string): IBrickMetadata {
    const source: IBrickSourceFile = { filePath, content };
    const parsed = parseSync(filePath, content, { lang: 'ts' });

    if (parsed.errors.length > 0) {
        const [{ message, labels }] = parsed.errors;

        // The position comes from the first error label: without it a syntax
        // error message would differ from the rest, which do carry a place in
        // the file
        throw createBrickSourceError(source, labels[0]?.start ?? 0, BRICK_EXPORT_NAME, message);
    }

    const node = findBrickInitializer(source, parsed.program);
    const properties = readMetadataProperties(source, node);
    const valuesProperty = properties.get(VALUES_FIELD);

    if (!valuesProperty) {
        throw new Error(
            `[nuxt-bricks] ${filePath}: a brick file must declare \`${VALUES_FIELD}\` (an empty object when it has no editable properties)`
        );
    }

    const valuesPath = `${BRICK_EXPORT_NAME}.${VALUES_FIELD}`;
    const values = readStaticLiteral(source, valuesProperty.value, valuesPath);

    if (!isBrickValuesRecord(values)) {
        throw createBrickSourceError(
            source,
            valuesProperty.start,
            valuesPath,
            'an object of the form "property name → its description" is expected'
        );
    }

    return {
        // An empty string would mean a category without a name: such an entry has
        // neither a heading in the library nor an address in the category filter
        category: readStringField(source, properties, CATEGORY_FIELD) || DEFAULT_CATEGORY,
        description: readStringField(source, properties, DESCRIPTION_FIELD),
        values,
        slots: readSlots(source, properties),
    };
}
// #endregion
