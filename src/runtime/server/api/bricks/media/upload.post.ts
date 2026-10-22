import { randomUUID } from 'crypto';
import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    getFileExtension,
    isVideoFile,
} from '../../../../modules/persistence/server/utils/imageProcessing';
import {
    resolveMediaConfig,
    resolveRequestedOptimization,
} from '../../../../modules/persistence/server/utils/mediaConfig';
import {
    validateAndOptimizeImage,
    validateVideoUpload,
} from '../../../../modules/persistence/server/utils/mediaProcessing';
import {
    discardUnregisteredMediaFile,
    registerUploadedMedia,
    uploadMediaFiles,
} from '../../../../modules/persistence/server/utils/mediaOrchestration';
import { buildMediaVariantFilename } from '../../../../modules/persistence/server/utils/mediaVariants';
import { toMediaHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
    withMultipartParts,
} from '../../../../modules/persistence/server/utils/multipartStream';
import { validateMediaCategory } from '../../../../modules/persistence/server/utils/mediaPayloadValidation';
import { assertKnownMediaCategory } from '../../../../modules/persistence/server/utils/mediaCategoryRules';
import { sanitizeSvgMarkup } from '../../../../modules/common/utils/sanitize/sanitizeSvg';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../utils/requestRateLimiter';
import type {
    IStorageAdapter,
    IPublishAdapter,
} from '../../../../modules/persistence/types/adapters';
import type {
    IMultipartFilePart,
    IMultipartForm,
} from '../../../../modules/persistence/types/multipartStream';
import type { IRegisterUploadedMediaParams } from '../../../../modules/persistence/types/mediaOrchestration';
import type {
    IPreparedUpload,
    IResolvedMediaConfig,
    IUploadedFilePart,
    IUploadMediaVariant,
    IValidatedImage,
    TMediaVariant,
} from '../../../../modules/persistence/types/media';
import type { IBricksMediaOptimization } from '../../../../modules/common/types/media';

/** Limit of uploads from one IP per minute */
const UPLOADS_PER_MINUTE = 30;
const uploadRateLimiter = createFixedWindowRateLimiter({
    limit: UPLOADS_PER_MINUTE,
    windowMs: 60_000,
});

/**
 * How many bytes of a video's head are enough to name its container. Every
 * signature the sniffing knows sits inside the first twelve.
 */
const VIDEO_SNIFF_BYTES = 12;

/**
 * Reads the optimization overrides out of the form's fields and merges them over
 * the config defaults.
 *
 * The parameters arrive with the form rather than from the config, because they
 * are picked in a popover on every upload; the config stays the source of the
 * defaults. Parsing, default substitution and the bounds are kept by
 * `resolveRequestedOptimization` — all that is left here is pulling out the
 * strings, because telling "the field was absent" from "something unusable
 * arrived" is the duty of whoever applies the bounds.
 *
 * @param fields - The form's text fields.
 * @param fallback - Parameters from the config.
 * @returns The effective optimization parameters.
 */
function resolveUploadOptimization(
    fields: Map<string, string>,
    fallback: IBricksMediaOptimization
): IBricksMediaOptimization {
    return resolveRequestedOptimization(
        {
            format: fields.get('format'),
            quality: fields.get('quality'),
            maxWidth: fields.get('maxWidth'),
        },
        fallback
    );
}

/**
 * The category chosen for the upload.
 *
 * An empty form field and an absent field are one and the same: an upload with no
 * category chosen, and the file stays without one.
 *
 * @param fields - The form's text fields.
 * @returns The validated slug, or null.
 */
function resolveUploadCategory(fields: Map<string, string>): string | null {
    const raw = fields.get('category');

    return raw ? validateMediaCategory(raw) : null;
}

/**
 * Completes the variants with object names next to the full file.
 *
 * @param variants - Ready bytes of the variants.
 * @param storedFilename - Object name of the full file.
 * @returns The variants carrying object names.
 */
function withVariantFilenames(
    variants: IValidatedImage['variants'],
    storedFilename: string
): Partial<Record<TMediaVariant, IUploadMediaVariant>> {
    const result: Partial<Record<TMediaVariant, IUploadMediaVariant>> = {};

    for (const [variant, image] of Object.entries(variants) as [
        TMediaVariant,
        NonNullable<IValidatedImage['variants'][TMediaVariant]>,
    ][]) {
        result[variant] = {
            buffer: image.buffer,
            mimeType: image.mimeType,
            storedFilename: buildMediaVariantFilename(storedFilename, variant, image.extension),
        };
    }

    return result;
}

/**
 * Validates a file and prepares it for upload: an image optimized into the chosen
 * format plus the downscaled variants, an SVG as sanitized markup for the preview.
 *
 * A video does not come here: it is not processed at all and travels to storage as
 * a stream, without ever being assembled in memory.
 *
 * @param file - The collected file part.
 * @param config - Resolved media settings (limits, optimization).
 * @param optimization - Effective optimization parameters (config plus form).
 * @returns Buffer, MIME type, extension, svgContent, dimensions and variants.
 */
export async function prepareUpload(
    file: IUploadedFilePart,
    config: IResolvedMediaConfig,
    optimization: IBricksMediaOptimization = config.optimization
): Promise<IPreparedUpload> {
    const validated = await validateAndOptimizeImage(
        file,
        config.maxUploadSizeBytes,
        config.maxUploadSizeMb,
        optimization
    );

    if (!validated.isSvg) {
        return {
            buffer: validated.optimizedBuffer,
            mimeType: validated.mimeType,
            targetExtension: validated.targetExtension,
            svgContent: null,
            width: validated.width,
            height: validated.height,
            variants: validated.variants,
        };
    }

    // An inline SVG is untrusted input: one and the same sanitized buffer goes
    // into the database and into the bucket (previously the original, unchecked
    // one flew to S3)
    const sanitizedSvg = sanitizeSvgMarkup(validated.optimizedBuffer.toString('utf8'));

    return {
        buffer: Buffer.from(sanitizedSvg, 'utf8'),
        mimeType: validated.mimeType,
        targetExtension: validated.targetExtension,
        svgContent: sanitizedSvg,
        width: null,
        height: null,
        variants: {},
    };
}

/**
 * Opens a video part: takes just enough of the head to name the container and
 * gives back a body that starts with those very bytes.
 *
 * The head has to be READ to be sniffed, and the same bytes still have to reach
 * storage — hence the two halves of the result rather than a peek. The ceiling is
 * checked as the bytes flow: `Content-Length` may be absent or lie, and by the
 * time a buffered check could run the file would already be in memory whole.
 *
 * @param part - The file part of the form.
 * @param config - Resolved media settings (the video ceiling).
 * @returns The head and the whole body, the head included.
 */
async function openVideoBody(
    part: IMultipartFilePart,
    config: IResolvedMediaConfig
): Promise<{ head: Buffer; body: AsyncIterable<Uint8Array> }> {
    const chunks = part.chunks()[Symbol.asyncIterator]();
    const headChunks: Uint8Array[] = [];
    let headBytes = 0;

    // A chunk carries no promised size: the head may arrive one byte at a time
    while (headBytes < VIDEO_SNIFF_BYTES) {
        const step = await chunks.next();

        if (step.done) {
            break;
        }

        headChunks.push(step.value);
        headBytes += step.value.byteLength;
    }

    const head = Buffer.concat(headChunks);

    async function* body(): AsyncGenerator<Uint8Array> {
        let total = 0;

        for (let chunk: Uint8Array | undefined = head; chunk; ) {
            total += chunk.byteLength;

            if (total > config.maxVideoUploadSizeBytes) {
                throw createError({
                    statusCode: 413,
                    message: `Video is too large. Maximum allowed size is ${Math.floor(config.maxVideoUploadSizeMb)}MB`,
                });
            }

            if (chunk.byteLength > 0) {
                yield chunk;
            }

            const step = await chunks.next();

            chunk = step.done ? undefined : step.value;
        }
    }

    return { head, body: body() };
}

/**
 * Sends a video into the publication storage as a stream and returns what has to
 * be registered for it.
 *
 * The container is decided by the head, so a file that is not a video is refused
 * before a single byte reaches the bucket — the previous reader learned it only
 * after the whole hundred megabytes had been received.
 *
 * @param part - The file part of the form.
 * @param signal - The signal of the client going away.
 * @param config - Resolved media settings.
 * @param publish - The publication storage adapter.
 * @returns The parameters of the future record.
 */
async function uploadVideoStream(
    part: IMultipartFilePart,
    signal: AbortSignal,
    config: IResolvedMediaConfig,
    publish: IPublishAdapter
): Promise<IRegisterUploadedMediaParams> {
    const { head, body } = await openVideoBody(part, config);
    const validated = validateVideoUpload(part, head);
    const storedFilename = `${randomUUID()}.${validated.targetExtension}`;
    const uploaded = await publish.uploadFileStream({
        key: publish.buildFileKey('media', storedFilename),
        mimeType: validated.mimeType,
        body,
        maxBytes: config.maxVideoUploadSizeBytes,
        signal,
    });

    return {
        uploaded,
        mimeType: validated.mimeType,
        displayFilename: part.filename || storedFilename,
        category: null,
        svgContent: null,
        width: null,
        height: null,
    };
}

/**
 * Reads the form and gets the file into storage: a video as a stream while the
 * request is still arriving, everything else as bytes through sharp.
 *
 * The parts are taken in the order they came on the wire, and the fields are
 * whatever came with them — the order is not dictated. A field ahead of the file
 * is worth more than one behind it, though: only then can a category be checked
 * BEFORE the upload is paid for. A category that turns up unknown afterwards is
 * refused by the record's own foreign key, and the definite refusal takes the
 * uploaded file down with it.
 *
 * What the tolerance costs, counted rather than waved away: a late field that
 * turns out unusable is discovered when the bytes are already in the bucket, so
 * the request pays the whole upload plus a deletion — a best-effort one, that is,
 * one that may leave an orphan behind — and it pays it while still holding an
 * ingress slot. Refusing every field behind the file would trade that for
 * refusing forms whose only sin is the order of their parts; with a rate limit in
 * front of the endpoint, this is the cheaper side.
 *
 * @param form - The streaming form.
 * @param config - Resolved media settings.
 * @param storage - The metadata storage adapter.
 * @param publish - The publication storage adapter.
 * @returns The parameters of the future record.
 */
async function readMediaUploadForm(
    form: IMultipartForm,
    config: IResolvedMediaConfig,
    storage: IStorageAdapter,
    publish: IPublishAdapter
): Promise<IRegisterUploadedMediaParams> {
    const fields = new Map<string, string>();
    let streamed: IRegisterUploadedMediaParams | null = null;
    let collected: IUploadedFilePart | null = null;

    try {
        for await (const part of form.parts) {
            if (part.kind === 'field') {
                fields.set(part.name, part.value);
                continue;
            }

            if (part.name !== 'file' || streamed || collected) {
                throw createError({
                    statusCode: 400,
                    message: 'Unexpected file field in the upload form',
                });
            }

            if (!isVideoFile(part.type, getFileExtension(part.filename))) {
                collected = {
                    name: part.name,
                    filename: part.filename,
                    type: part.type,
                    // The image ceiling rather than the endpoint's: a picture is
                    // refused at its own limit instead of being received up to the
                    // video one and thrown away afterwards
                    data: await part.collect(config.maxUploadSizeBytes),
                };
                continue;
            }

            const earlyCategory = resolveUploadCategory(fields);

            if (earlyCategory) {
                await assertKnownMediaCategory(storage, earlyCategory);
            }

            streamed = await uploadVideoStream(part, form.signal, config, publish);
        }

        const category = resolveUploadCategory(fields);

        if (streamed) {
            return { ...streamed, category };
        }

        if (!collected || collected.data.length === 0) {
            throw createError({
                statusCode: 400,
                message: 'Invalid file data',
            });
        }

        // Before the file is processed: there is no point spending sharp and an
        // upload into the bucket on input that has nowhere to be recorded anyway.
        // This check does not close the race with the deletion of a category —
        // that one is caught by the database FK after the upload
        if (category) {
            await assertKnownMediaCategory(storage, category);
        }

        const prepared = await prepareUpload(
            collected,
            config,
            resolveUploadOptimization(fields, config.optimization)
        );
        const storedFilename = `${randomUUID()}.${prepared.targetExtension}`;
        const files = await uploadMediaFiles(
            { storage, publish },
            {
                buffer: prepared.buffer,
                mimeType: prepared.mimeType,
                storedFilename,
                variants: withVariantFilenames(prepared.variants, storedFilename),
            }
        );

        return {
            uploaded: files.uploaded,
            mimeType: prepared.mimeType,
            displayFilename: collected.filename || storedFilename,
            category,
            svgContent: prepared.svgContent,
            width: prepared.width,
            height: prepared.height,
            previewUrl: files.previewUrl,
            mockUrl: files.mockUrl,
        };
    } catch (error: unknown) {
        // The video is already in the bucket, and the record will never be
        // created: a broken tail of the form, a limit of the parser or a field
        // behind the file that turned out to be garbage refused what came next.
        // Nothing references the object and nothing ever will — the rule that
        // KEEPS a file starts one step later, at the registration, where an
        // unknown outcome may mean a record already exists
        if (streamed) {
            await discardUnregisteredMediaFile(publish, streamed.uploaded.url);
        }

        throw error;
    }
}

/**
 * POST /api/bricks/media/upload — the upload of media in one request: the file
 * into the publication storage plus the metadata record in the database.
 *
 * The two writes are not one transaction, and what happens to the file when the
 * second one fails depends on WHAT is known about its outcome — a guaranteed
 * refusal is compensated by deleting the file, an unknown outcome is retried once
 * and then keeps the file. The rule and the defect behind it live with
 * `registerUploadedMedia`; do not restate it here.
 *
 * Ingress control: a rate limit by IP, the form is read as a STREAM under a
 * ceiling on the whole body and on a single part, and within the shared slot gate
 * of forms read at the same time — the per-minute limit does not bound the number
 * of SIMULTANEOUS uploads. A video goes to storage in pieces: it needs no
 * processing, so buffering it served nothing but the memory peak. An image is
 * collected in memory, because sharp works over bytes anyway. The content of the
 * file is confirmed by magic bytes — for a video by the head, before the upload
 * starts; for an image by the `validate*` helpers, which also check the size
 * ceiling of each type.
 *
 * Multipart fields: `file` (mandatory), `category` (optional — an absent field
 * and an empty value both mean a file with no category, `null`),
 * `format` / `quality` / `maxWidth` (optional — they override the
 * `bricks.media.optimization` defaults for this upload).
 */
export default defineEventHandler(async (event) => {
    try {
        assertWithinRateLimit(event, uploadRateLimiter, 'Too many media uploads');

        const config = resolveMediaConfig();
        const maxFileBytes = Math.max(config.maxUploadSizeBytes, config.maxVideoUploadSizeBytes);
        const storage = useBricksStorageAdapter();
        const publish = useBricksPublishAdapter();
        // Reading the form and getting the file into storage happens INSIDE the
        // callback: the ingress slot is held exactly as long as it runs. The
        // registration is deliberately outside — a database write must not occupy
        // the entrance while the next uploader waits for a slot
        const prepared = await withMultipartParts(
            event,
            {
                maxBodyBytes: maxFileBytes + MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
                maxFileBytes,
            },
            (form) => readMediaUploadForm(form, config, storage, publish)
        );

        return await registerUploadedMedia({ storage, publish }, prepared);
    } catch (error: unknown) {
        toMediaHttpError(error, 'Failed to upload media file');
    }
});
