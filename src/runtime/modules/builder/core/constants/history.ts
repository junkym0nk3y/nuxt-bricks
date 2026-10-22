/**
 * Highest number of snapshots the undo history keeps.
 *
 * A snapshot is a whole serialized schema, so the ceiling bounds memory rather than
 * the number of moves: fifty steps back is far more than an editing session walks,
 * while fifty copies of a large page still cost little.
 */
export const MAX_HISTORY_ENTRIES = 50;
