/**
 * Best-effort cleanup of what a failed write may have left in the bucket.
 *
 * Both cases share one rule: the cleanup NEVER replaces the original error — it
 * is that error the caller has to see, otherwise the user would learn about a
 * problem with the bucket instead of the problem with their own file. And both
 * need a waiting bound of their own, because the cleanup travels through the same
 * client with the same retries as the write that failed.
 */
import {
    AbortMultipartUploadCommand,
    DeleteObjectCommand,
    type S3Client,
} from '@aws-sdk/client-s3';

/**
 * The ceiling of a compensating request (ms). A bound of its own is needed
 * because the cleanup runs through the same client with the same retries: without
 * it the original upload error would only come back outward after the cleanup's
 * own silence windows.
 */
const S3_CLEANUP_TIMEOUT_MS = 10_000;

/**
 * Best-effort cleanup of an object whose write ended in an unknown outcome.
 *
 * A failed PUT does not prove the object is absent from the bucket: the response
 * could have been lost or hit a timeout after the write already happened. The
 * caller received no URL in the process, meaning it has nothing to delete the
 * object by and no link to it will ever appear — the cleanup is only possible
 * here. A waiting bound of its own is mandatory: without it the original upload
 * error would additionally wait through the cleanup's retries.
 *
 * @param client - The S3 client.
 * @param bucket - The storage bucket.
 * @param key - The key of the object that may have been written.
 */
export async function discardUnconfirmedObject(
    client: S3Client,
    bucket: string,
    key: string
): Promise<void> {
    try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
            abortSignal: AbortSignal.timeout(S3_CLEANUP_TIMEOUT_MS),
        });
    } catch (error: unknown) {
        // A failed cleanup does not replace the upload error: it is that error
        // that must go outward, otherwise the user would learn about a
        // problem with the bucket instead of the problem with their own file
        console.warn('[S3] Failed to discard object after a failed upload:', key, error);
    }
}

/**
 * Best-effort abort of a multipart upload that was begun and will not finish.
 *
 * Mandatory rather than optional: the parts already uploaded stay in the bucket
 * and are billed, and a multipart upload does not expire by itself — only an
 * explicit abort (or a bucket lifecycle rule) removes them.
 *
 * @param client - The S3 client.
 * @param bucket - The storage bucket.
 * @param key - The key the upload was begun for.
 * @param uploadId - The identifier of the multipart upload.
 */
export async function discardStagedUpload(
    client: S3Client,
    bucket: string,
    key: string,
    uploadId: string
): Promise<void> {
    try {
        await client.send(
            new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
            // A bound of its own, and never the caller's signal: that one is
            // already aborted whenever the client is what went away
            { abortSignal: AbortSignal.timeout(S3_CLEANUP_TIMEOUT_MS) }
        );
    } catch (error: unknown) {
        // A failed abort does not replace the upload error: it is that error the
        // caller has to see. What stays behind is unfinished parts, and only a
        // bucket lifecycle rule can collect them
        console.warn('[S3] Failed to abort a multipart upload:', key, error);
    }
}
