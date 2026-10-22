/**
 * The storage layer's domain errors.
 *
 * The adapters (the default Postgres one and custom IStorageAdapter
 * implementations) throw these classes instead of driver errors — the handlers map
 * them onto HTTP statuses with a machine-readable `data.code` (see handlerHelpers;
 * the codes are PAGE_CONFLICT_CODES in common/constants/publish.ts and
 * BRICKS_API_ERROR_CODES in common/constants/apiErrors.ts). The classes are
 * re-exported from `nuxt-bricks/persistence` for custom adapters.
 */

/**
 * The write was rejected FOR CERTAIN: storage answered with a refusal, and not a
 * single half of the operation was committed.
 *
 * The marker is needed by the owner of the external side effects — the media
 * orchestration: files already uploaded into the bucket may only be deleted under
 * this guarantee. Everything else (a dropped connection, a transport timeout, a 5xx
 * from an external backend) means an UNKNOWN outcome: the response could have failed
 * to arrive after the commit already happened, and the compensation would leave a row
 * in the database pointing at a deleted object. That is why the default is the
 * opposite one — an error without this marker is treated as undetermined.
 *
 * The marker is set by whoever knows which operation exactly was rejected, and it is
 * done by a positive list rather than by indirect signs: a driver error carrying a
 * SQLSTATE proves nothing — `08007 transaction_resolution_unknown` and
 * `40003 statement_completion_unknown` mean the opposite outright.
 *
 * The class is part of the IStorageAdapter contract: a custom adapter reports the
 * same fact with it (re-exported from `nuxt-bricks/persistence`).
 */
export class BricksStorageWriteRejectedError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = 'BricksStorageWriteRejectedError';
    }
}

/**
 * The query was never sent to the database: the pool could not even be assembled
 * (no connection string, the driver did not load).
 *
 * An internal error of the default Postgres adapter — unlike its neighbors, it is
 * NOT re-exported from `nuxt-bricks/persistence`. It lives here because this is the
 * file of the layer's error classes, and it is needed where telling "the SQL never
 * left" from "it left and there is no answer" matters: the former has a determined
 * outcome. It does not carry the rejected-write marker itself — the shared `query`
 * serves reads too, to which such a guarantee means nothing; the translation is done
 * by the adapter, which knows its own operation.
 */
export class BricksPostgresQueryNotStartedError extends Error {
    constructor(cause: unknown) {
        super('Query was never sent to the database', { cause });
        this.name = 'BricksPostgresQueryNotStartedError';
    }
}

/**
 * There is no category with that slug in the media library.
 *
 * Thrown both by the early check (`assertKnownMediaCategory`) and by the database's
 * FK itself, should the category be deleted between the check and the write — the
 * answer must be the same in both cases. Inherits the marker of a definite
 * refusal: the FK rejects the write outright, so the file uploaded before it is safe
 * to delete.
 */
export class BricksUnknownMediaCategoryError extends BricksStorageWriteRejectedError {
    readonly category: string;

    constructor(category: string, cause?: unknown) {
        super(`Unknown media category: ${category}`, cause);
        this.name = 'BricksUnknownMediaCategoryError';
        this.category = category;
    }
}

/**
 * An ADDRESS uniqueness conflict: a page at this address already exists.
 * Thrown from createPage/updatePage on a violation of the unique constraint — on a
 * race of two simultaneous requests included (the pre-check does not catch it).
 *
 * A marker error: no particular address is passed into it. The violation comes from
 * the database as a SQLSTATE code, and which half of the pair caused it is not
 * visible from the payload: on a PATCH of one field the other half sits in the stored
 * row. The former variant with a mandatory pagename string made the callers
 * substitute an empty string, and the error message ended up reading
 * `pagename ""`.
 *
 * The wire code of the response (`PAGENAME_CONFLICT`) is kept: it is part of the
 * external contract and renaming it would break custom backends to no benefit.
 */
export class BricksPageAddressConflictError extends Error {
    constructor() {
        super('Page with this address already exists');
        this.name = 'BricksPageAddressConflictError';
    }
}

/**
 * A template name uniqueness conflict: a template with that label already exists.
 * Thrown from createTemplate/updateTemplate on a violation of the unique constraint —
 * on a race of two simultaneous requests included.
 *
 * A marker error, like the page address conflict: no particular name is passed into
 * it. The client needs the fact alone (the hint goes under the form's field), and it
 * knows the name anyway — it sent it itself.
 */
export class BricksTemplateNameConflictError extends Error {
    constructor() {
        super('Template with this name already exists');
        this.name = 'BricksTemplateNameConflictError';
    }
}

/**
 * An optimistic locking conflict: the page was changed after the client read the
 * `expectedRevision` it passed. Thrown from updatePage when the precondition did not
 * match the row's current revision.
 */
export class BricksRevisionConflictError extends Error {
    readonly pageId: number;

    constructor(pageId: number) {
        super('Page was modified by another request (revision mismatch)');
        this.name = 'BricksRevisionConflictError';
        this.pageId = pageId;
    }
}

/**
 * The query was stopped by the server-side time limit: the database canceled it
 * itself and freed the connection. The rollback of the CANCELED statement is
 * guaranteed in the process, so the handler returns a refusal rather than the
 * "outcome unknown" of a client-side abort.
 *
 * The class deliberately does NOT carry the rejected-write marker: any query could
 * have been canceled, a read included. Rereading a row after a uniqueness conflict,
 * for one, runs when the record already exists, and its timeout says nothing about
 * the record's absence — the marker here would permit deleting the file from under a
 * live row. The guarantee is given by whoever knows which statement was canceled:
 * the adapter wraps only a refusal of the insert itself into the marker.
 *
 * The driver error is kept in `cause`: it is never handed outward (the PostgreSQL
 * text would carry SQL details), but it is needed in the server log.
 */
export class BricksStatementTimeoutError extends Error {
    constructor(cause?: unknown) {
        super('Query was canceled by the server statement timeout', { cause });
        this.name = 'BricksStatementTimeoutError';
    }
}
