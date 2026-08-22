/**
 * Types of the brick-file literal parser (`src/brick-literals.ts`): the language
 * of allowed values and the file being parsed.
 */

/**
 * A value allowed in brick-file metadata.
 *
 * The list is closed and matches what survives the JSON manifest and the Nuxt
 * payload: computed forms (an identifier, a call, a template with an
 * interpolation) are forbidden — their value is known only to module execution,
 * and the manifest is built without it.
 */
export type TBrickLiteralValue =
    | string
    | number
    | boolean
    | null
    | TBrickLiteralValue[]
    | { [key: string]: TBrickLiteralValue };

/** The file metadata is read from: the path for diagnostics and the source */
export interface IBrickSourceFile {
    /** Absolute path of the brick file */
    filePath: string;
    /** File contents — the position for an error message is computed from them */
    content: string;
}
