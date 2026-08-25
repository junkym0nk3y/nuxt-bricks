/**
 * Recognizing the images of an imported schema by their host.
 */

/**
 * Hostnames whose absolute URLs count as images even with no file extension — signed
 * links and image proxies answer without one.
 *
 * The default is the storage of the module itself in its two usual homes. It is a default
 * and not the whole truth: a consumer keeps their bucket wherever they like, and the list
 * is theirs to replace through `bricks.media.imageHosts`. A hardcoded pair of clouds used
 * to be the entire answer here, so a bucket at any third provider made the resolver
 * decide the imported schema had no new images and skip the step in silence.
 */
export const DEFAULT_SCHEMA_IMAGE_HOSTS = ['storage.yandexcloud.net', 'amazonaws.com'];

/**
 * Whether the URL lives on a host declared to serve images.
 *
 * The match is on the hostname and on a label boundary, so `amazonaws.com` covers
 * `bucket.s3.amazonaws.com` but not `notamazonaws.com` — the previous substring pattern
 * matched anywhere in the URL, path included. A first label of `cdn` is recognized on top
 * of the list, because that is what the pattern recognized before and dropping it would
 * quietly narrow what an already configured installation finds.
 *
 * @param value - Absolute URL of the candidate.
 * @param imageHosts - Hostnames from the configuration.
 * @returns true when the host serves images.
 */
export function isImageHostUrl(value: string, imageHosts: readonly string[]): boolean {
    let hostname = '';

    try {
        hostname = new URL(value).hostname.toLowerCase();
    } catch {
        return false;
    }

    if (hostname.startsWith('cdn.')) {
        return true;
    }

    return imageHosts.some((host) => {
        const candidate = host.trim().toLowerCase();

        if (!candidate) {
            return false;
        }

        return hostname === candidate || hostname.endsWith(`.${candidate}`);
    });
}
