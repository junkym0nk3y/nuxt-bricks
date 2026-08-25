/**
 * The types of the default S3 publish adapter (`server/s3/*`).
 */

/**
 * The resolved configuration of the S3 storage.
 */
export interface IResolvedS3Config {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix: string;
    thumbnailsPrefix: string;
    avatarsPrefix: string;
}

/**
 * The raw configuration from runtimeConfig.bricksS3 (every field optional).
 */
export type TRawS3Config = Partial<IResolvedS3Config> | undefined;
