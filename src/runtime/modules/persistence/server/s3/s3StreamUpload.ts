/**
 * Writing a stream into the bucket: the protocol is chosen by the size that
 * actually arrived.
 *
 * A separate module from the adapter itself because it is the only place that has
 * to know the shape of an S3 multipart upload — the part floor of 5 MiB, the
 * ceiling of 10 000 parts, the list of ETags a completion is made of. The adapter
 * only hands it a key, a stream and the ceiling the caller enforces.
 */
import {
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    PutObjectCommand,
    UploadPartCommand,
    type CompletedPart,
    type S3Client,
} from '@aws-sdk/client-s3';
import { discardStagedUpload, discardUnconfirmedObject } from './s3ObjectCleanup';
import type { IUploadFileStreamParams } from '../../types/adapters';
import type { IResolvedS3Config } from '../../types/s3PublishAdapter';

/**
 * The size of one part of a streaming upload.
 *
 * S3 refuses a part under 5 MiB (the last one excepted), so the value is that
 * floor with headroom. It is also the memory ONE streaming upload holds: the
 * parts go one after another, and the buffer is filled again rather than
 * allocated anew.
 */
const S3_MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;

/**
 * S3 admits at most 10 000 parts in one multipart upload.
 *
 * The default part size covers files of up to 80 GiB, but the file ceiling is the
 * consumer's setting: raised high enough, a fixed part size would run out of part
 * numbers in the middle of an upload. That is why the size is derived from the
 * ceiling the caller enforces.
 */
const S3_MULTIPART_MAX_PARTS = 10_000;

/**
 * The ceiling of one part's size.
 *
 * The buffer is memory held for as long as an upload is in flight, and the file
 * ceiling it is derived from has no upper bound of its own (`bricks.media`
 * accepts any positive number). Without this cap a configuration allowing, say,
 * the 5 TiB S3 admits would allocate half a gigabyte per upload BEFORE the first
 * byte arrives — for a tiny file too, and times the number of ingress slots.
 *
 * Past the cap it is the number of parts that binds instead: a file above 640 GiB
 * would run out of part numbers mid-upload. That is the trade chosen knowingly —
 * a media library holding such a file is not a case worth allocating for.
 */
const S3_MULTIPART_MAX_PART_SIZE_BYTES = 64 * 1024 * 1024;

/**
 * The part size of a streaming upload: enough for the caller's ceiling to fit into
 * the number of parts S3 admits, and never more than one part may cost in memory.
 *
 * @param maxBytes - The ceiling the caller enforces on the stream.
 * @returns The size of one part in bytes.
 */
export function resolveMultipartPartSize(maxBytes: number): number {
    return Math.min(
        S3_MULTIPART_MAX_PART_SIZE_BYTES,
        Math.max(S3_MULTIPART_PART_SIZE_BYTES, Math.ceil(maxBytes / S3_MULTIPART_MAX_PARTS))
    );
}

/**
 * Writes a stream into the bucket, choosing the protocol by the size that
 * actually arrived: a stream that fits into one part goes as a plain PutObject, a
 * longer one as a multipart upload.
 *
 * The parts go one after another on purpose. Sending them in parallel would
 * multiply the memory by the number of concurrent parts and would turn the
 * cleanup into a race, while the transfer is bounded by the incoming socket
 * anyway — the bytes are being received, not read from a disk.
 *
 * @param client - The S3 client.
 * @param config - The storage configuration.
 * @param params - The key, the MIME, the stream and its ceiling.
 * @returns How many bytes were written.
 */
export async function writeStreamToBucket(
    client: S3Client,
    config: IResolvedS3Config,
    params: IUploadFileStreamParams
): Promise<number> {
    const partSizeBytes = resolveMultipartPartSize(params.maxBytes);
    const partBuffer = Buffer.allocUnsafe(partSizeBytes);
    const parts: CompletedPart[] = [];
    let filled = 0;
    let total = 0;
    let uploadId: string | null = null;
    let objectMayExist = false;

    /**
     * Sends what the part buffer holds and remembers the part's ETag: the
     * completion of a multipart upload is the list of the parts with their tags.
     */
    async function sendPart(activeUploadId: string): Promise<void> {
        const partNumber = parts.length + 1;
        const response = await client.send(
            new UploadPartCommand({
                Bucket: config.bucket,
                Key: params.key,
                UploadId: activeUploadId,
                PartNumber: partNumber,
                Body: partBuffer.subarray(0, filled),
            }),
            { abortSignal: params.signal }
        );

        if (!response.ETag) {
            throw new Error(`[S3] Storage returned no ETag for part ${partNumber}`);
        }

        parts.push({ ETag: response.ETag, PartNumber: partNumber });
        filled = 0;
    }

    try {
        for await (const chunk of params.body) {
            let offset = 0;

            while (offset < chunk.byteLength) {
                // A full buffer is flushed only once MORE bytes have arrived:
                // until then the stream may be over, and a file of exactly one
                // part goes as a plain PutObject instead of a three-request
                // multipart upload. A part is never flushed half-full either — S3
                // refuses any part but the last under 5 MiB
                if (filled === partSizeBytes) {
                    if (!uploadId) {
                        const created = await client.send(
                            new CreateMultipartUploadCommand({
                                Bucket: config.bucket,
                                Key: params.key,
                                ContentType: params.mimeType,
                                ACL: 'public-read',
                            }),
                            { abortSignal: params.signal }
                        );

                        if (!created.UploadId) {
                            throw new Error('[S3] Storage returned no multipart upload id');
                        }

                        uploadId = created.UploadId;
                    }

                    await sendPart(uploadId);
                }

                const taken = Math.min(partSizeBytes - filled, chunk.byteLength - offset);

                partBuffer.set(chunk.subarray(offset, offset + taken), filled);
                filled += taken;
                offset += taken;
                total += taken;
            }
        }

        if (!uploadId) {
            objectMayExist = true;
            await client.send(
                new PutObjectCommand({
                    Bucket: config.bucket,
                    Key: params.key,
                    Body: partBuffer.subarray(0, filled),
                    ContentType: params.mimeType,
                    ACL: 'public-read',
                }),
                { abortSignal: params.signal }
            );

            return total;
        }

        // Whatever the buffer still holds becomes the last part — a full one
        // included, since the flush waits for the bytes that follow. Nothing is
        // left only for a stream that ended on a flush, and an empty part would be
        // refused
        if (filled > 0) {
            await sendPart(uploadId);
        }

        objectMayExist = true;
        await client.send(
            new CompleteMultipartUploadCommand({
                Bucket: config.bucket,
                Key: params.key,
                UploadId: uploadId,
                MultipartUpload: { Parts: parts },
            }),
            { abortSignal: params.signal }
        );

        return total;
    } catch (error: unknown) {
        // What may be left behind depends on how far the write got. Parts of an
        // unfinished multipart upload are billed until aborted; a PutObject or a
        // completion whose answer never arrived may have created the object,
        // which nothing will ever reference — the caller got no URL
        if (uploadId) {
            await discardStagedUpload(client, config.bucket, params.key, uploadId);
        }

        if (objectMayExist) {
            await discardUnconfirmedObject(client, config.bucket, params.key);
        }

        throw error;
    }
}
