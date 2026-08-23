// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type {
    IBricksPageTransferFile,
    IParsedEnvelope,
    ISchemaFileInput,
    IUseSchemaFileTransferReturn,
    TSchemaFileReadResult,
} from '../types/composables';

// Utils
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';
import { validateDeviceSet } from '../../../common/utils/bricks/devices';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * Recognizes a page transfer envelope.
 *
 * A bare schema (the files written before the device set appeared) does not count
 * as an envelope and is still accepted: breaking the files people have already
 * saved by a change of format is not allowed.
 *
 * @param raw - The parsed JSON of the file.
 * @returns The envelope, or `null` when it is not one.
 */
function readEnvelope(raw: unknown): IParsedEnvelope | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return null;
    }

    const record = raw as Record<string, unknown>;

    if (record.version !== 1 || typeof record.schema !== 'object' || record.schema === null) {
        return null;
    }

    // The absence of the field and an explicit `null` are different things, and
    // substituting the second for the first is not allowed: `null` means "the source
    // inherited the set of the project" and strips the target page of its own set,
    // while an envelope with no such field simply says nothing about a set. The
    // package always writes its own files with the field
    const hasViewportConfig = Object.hasOwn(record, 'viewportConfig');

    return {
        version: 1,
        schema: record.schema as IBricksSchema,
        viewportConfig: hasViewportConfig
            ? ((record.viewportConfig ?? null) as TBricksPageDeviceSet | null)
            : undefined,
    };
}

/**
 * Transferring a page schema through a file: downloading the JSON and reading the
 * picked file with the structure validated and the read/parse errors reported.
 *
 * The schema arrives as an argument instead of being taken from the canvas store:
 * the composable works in the page list, where there is no canvas at all — the
 * schema to be exported is brought there by a point request for the full page.
 *
 * The composable stores no error: it hands over the outcome of the read, and every
 * consumer shows it in its own place. A shared error field would drop the message
 * from the creation modal into the details panel and the other way round.
 */
export function useSchemaFileTransfer(): IUseSchemaFileTransferReturn {
    const { t } = useI18n();

    const fileInputRef = ref<HTMLInputElement | null>(null);

    /**
     * Assembles the JSON transfer file of a page and downloads it.
     *
     * What is written is an envelope carrying the schema and the device set: the
     * keys of `props.responsive` in the schema refer to the set of the page, and a
     * file without it would describe a layout there is nothing to restore with.
     *
     * @param schema - Page schema.
     * @param filename - The name of the file together with its extension.
     * @param viewportConfig - The device set of the page, or `null`.
     */
    function downloadSchema(
        schema: IBricksSchema,
        filename: string,
        viewportConfig: TBricksPageDeviceSet | null
    ): void {
        const payload: IBricksPageTransferFile = { version: 1, schema, viewportConfig };
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Opens the system dialog for picking a JSON file.
     */
    function openFilePicker(): void {
        fileInputRef.value?.click();
    }

    /**
     * Reads the picked JSON file, parses it and validates the schema.
     *
     * @param input - The file input holding what the person picked.
     * @returns The outcome of the read, or `null` when no file was picked.
     */
    async function readSelectedFile(
        input: ISchemaFileInput | null
    ): Promise<TSchemaFileReadResult | null> {
        const file = input?.files?.[0];

        if (!input || !file) {
            return null;
        }

        // The reset happens on every outcome (a success, an early return, a refused
        // read) — otherwise picking the same file again after a rejected import
        // would raise no change event, and the button would look broken
        try {
            if (!file.name.endsWith('.json')) {
                return { status: 'error', message: t('bricks.schema.importErrorFileType') };
            }

            let text: string;

            try {
                text = await file.text();
            } catch {
                return { status: 'error', message: t('bricks.schema.importErrorRead') };
            }

            return parseSchemaText(text, file.name);
        } finally {
            input.value = '';
        }
    }

    /**
     * Parses the text of the file into a schema and checks the contract of the
     * component graph.
     *
     * @param text - The content of the file.
     * @param filename - The file name for the metadata of the pick.
     * @returns The outcome of the parsing.
     */
    function parseSchemaText(text: string, filename: string): TSchemaFileReadResult {
        let raw: unknown;

        try {
            raw = JSON.parse(text);
        } catch {
            return { status: 'error', message: t('bricks.schema.importErrorParse') };
        }

        const envelope = readEnvelope(raw);
        const schema = envelope ? envelope.schema : (raw as IBricksSchema);

        if (!schema || !Array.isArray(schema.components)) {
            return { status: 'error', message: t('bricks.schema.importErrorInvalid') };
        }

        const contractErrors = validateSchemaComponentGraph(schema.components);

        if (contractErrors.length > 0) {
            return {
                status: 'error',
                message: t('bricks.schema.importErrorStructure', { detail: contractErrors[0] }),
            };
        }

        // `undefined` rather than `null`: a legacy schema and an envelope with no
        // field say nothing about a set, and the target page is obliged to keep its
        // own
        let viewportConfig = envelope?.viewportConfig;

        if (envelope?.viewportConfig) {
            const validation = validateDeviceSet(envelope.viewportConfig);

            if (!validation.ok) {
                return {
                    status: 'error',
                    message: t('bricks.schema.importErrorDevices', {
                        detail: validation.errors[0],
                    }),
                };
            }

            // What travels on is the normalized set rather than the input of the
            // file: the validator trims the labels and keeps only the declared
            // fields, and that is what has to be written onto the page
            viewportConfig = validation.value;
        }

        return {
            status: 'success',
            file: {
                schema,
                filename,
                blocksCount: schema.components.length,
                kind: envelope ? 'envelope' : 'legacy',
                viewportConfig,
            },
        };
    }

    return { fileInputRef, openFilePicker, readSelectedFile, downloadSchema };
}
