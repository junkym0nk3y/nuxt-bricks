/**
 * The types of the ingress control over reading a request's body
 * (`server/utils/requestBodyLimits.ts`).
 */

/**
 * The budget of request bodies buffered at the same time.
 */
export interface IInflightBodyBudget {
    /**
     * Reserves room for a body; a 503 when there is none.
     *
     * @param bytes - The volume being reserved.
     * @returns The release of the reservation (idempotent).
     */
    reserve(bytes: number): () => void;
}

/**
 * A request body's reservation: the reading ceiling and the budget's release.
 */
export interface IBodyReservation {
    /** How many bytes we agree to read — no more than was reserved. */
    limitBytes: number;
    release: () => void;
}
