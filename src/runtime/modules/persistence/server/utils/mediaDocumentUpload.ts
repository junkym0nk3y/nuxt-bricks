/**
 * The upload of a document into the media library: the check of its content, the
 * object in storage with the `attachment` disposition, the parameters of its record.
 *
 * Kept out of the upload endpoint, which owns the reading of the form and the choice
 * between the kinds of files; what happens to a document once it is collected is its
 * own story with its own reasons.
 */

// #region Imports
import { randomUUID } from 'crypto';
import type { IResolvedMediaConfig, IUploadedFilePart } from '../../types/media';
import type {
    IMediaOrchestrationDeps,
    IRegisterUploadedMediaParams,
} from '../../types/mediaOrchestration';
import { buildAttachmentContentDisposition } from './contentDisposition';
import { getFileExtension } from './imageProcessing';
import { validateDocumentUpload } from './mediaProcessing';
import { uploadMediaFiles } from './mediaOrchestration';
// #endregion

/**
 * The name a document is downloaded under: the uploaded name with the extension of the
 * format the content was recognized as. A DOCX uploaded as `brief.xlsx` is stored as
 * DOCX, and downloading it as `.xlsx` would hand the content to the wrong application.
 *
 * @param filename - The name from the upload form.
 * @param extension - Extension of the recognized format.
 * @returns The name for `Content-Disposition`.
 */
function toDownloadFilename(filename: string, extension: string): string {
    const currentExtension = getFileExtension(filename);

    if (currentExtension === extension) {
        return filename;
    }

    const stem = currentExtension ? filename.slice(0, -(currentExtension.length + 1)) : filename;

    return `${stem}.${extension}`;
}

/**
 * Validates a collected document and puts it into storage with the `attachment`
 * disposition under its original name.
 *
 * A document is stored as it arrived: no sharp, no variants, no dimensions. The
 * disposition is what makes a link on a landing download the file under the name the
 * editor uploaded rather than under the `<uuid>.pdf` of its key.
 *
 * @param file - The collected file part.
 * @param config - Resolved media settings (the document ceiling).
 * @param deps - The persistence adapters.
 * @returns The parameters of the future record (the category is set by the caller).
 */
export async function uploadMediaDocument(
    file: IUploadedFilePart,
    config: IResolvedMediaConfig,
    deps: IMediaOrchestrationDeps
): Promise<IRegisterUploadedMediaParams> {
    const validated = validateDocumentUpload(
        file,
        config.maxDocumentUploadSizeBytes,
        config.maxDocumentUploadSizeMb
    );
    const storedFilename = `${randomUUID()}.${validated.targetExtension}`;
    const displayFilename = file.filename || storedFilename;
    const files = await uploadMediaFiles(deps, {
        buffer: validated.buffer,
        mimeType: validated.mimeType,
        storedFilename,
        contentDisposition: buildAttachmentContentDisposition(
            toDownloadFilename(displayFilename, validated.targetExtension)
        ),
    });

    return {
        uploaded: files.uploaded,
        mimeType: validated.mimeType,
        displayFilename,
        category: null,
        svgContent: null,
        width: null,
        height: null,
    };
}
