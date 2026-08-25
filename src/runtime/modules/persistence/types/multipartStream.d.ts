/**
 * The types of the streaming multipart reader
 * (`server/utils/multipartStream.ts`).
 */
import type { Readable } from 'node:stream';
import type { IConcurrencyGate } from './concurrencyGate';

/**
 * The limits one multipart request is read under.
 *
 * Two independent ceilings, not one: the body limit counts EVERY byte that came
 * off the socket (the boundaries, the part headers, the epilogue), while the file
 * limit bounds a single part. With the body ceiling alone a form of thousands of
 * tiny fields or a pile of garbage behind the closing boundary would slip
 * through the per-part bound; with the per-part one alone the envelope would be
 * unbounded.
 */
export interface IMultipartReadLimits {
    /** Ceiling on the whole body, the envelope included. */
    maxBodyBytes: number;
    /** Ceiling on the bytes of a single file part. */
    maxFileBytes: number;
    /**
     * The ingress slot gate; the shared one by default. A gate of its own is what
     * lets a spec watch the slots without holding the endpoint's real ones.
     */
    gate?: IConcurrencyGate;
}

/** A text field of the form: read into memory in full (the fields are short). */
export interface IMultipartFieldPart {
    kind: 'field';
    name: string;
    value: string;
}

/**
 * A file part of the form. Its bytes are read ONCE — either as a stream or into a
 * buffer: the source is the network, and a second reader would get an empty
 * result rather than a copy.
 */
export interface IMultipartFilePart {
    kind: 'file';
    name: string;
    /** The client's file name (already stripped of any path); empty when none came. */
    filename: string;
    /** The declared Content-Type; undefined when the part carried none. */
    type: string | undefined;
    /** The bytes as they arrive off the socket. */
    chunks(): AsyncIterable<Uint8Array>;
    /** Reads the part to its end into a buffer; above `maxBytes` — a 413. */
    collect(maxBytes: number): Promise<Buffer>;
}

/** A part of the form: a text field or a file. */
export type TMultipartPart = IMultipartFieldPart | IMultipartFilePart;

/** The form handed to the reader's callback. */
export interface IMultipartForm {
    /**
     * The parts in the order they came on the wire. A file part must be consumed
     * (streamed or collected) before the next part is asked for: the parser
     * writes into its stream, and nobody reading it would stop the whole read.
     */
    parts: AsyncIterable<TMultipartPart>;
    /**
     * Aborted when the client goes away. Handed to storage so that a write in
     * flight stops instead of finishing an upload nobody will hear about.
     */
    signal: AbortSignal;
}

/**
 * The queue that carries the parser's parts to the consumer's loop.
 */
export interface IMultipartPartQueue {
    parts: AsyncIterable<TMultipartPart>;
    /**
     * Refuses the whole read: the first reason wins, and the part being consumed
     * right now stops instead of waiting for bytes that will never come.
     */
    fail: (error: unknown) => void;
}

/**
 * A part waiting in the queue, together with the stream it came on.
 *
 * The stream is kept beside the part rather than inside it because the queue has
 * to tell whether the part HANDED OVER was consumed — the parser has meanwhile
 * moved on and its idea of the current part is a different one.
 */
export interface IMultipartQueuedPart {
    part: TMultipartPart;
    /** The parser's stream for a file part; null for a text field. */
    stream: Readable | null;
}
