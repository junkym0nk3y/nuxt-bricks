/**
 * Working with the value of the HTTP Cookie header (a string of RFC 6265 pairs).
 *
 * Used when proxying requests to an external backend (PROXY_URL): the bricks session
 * cookie is a secret of the builder and is not meant for an external service, while
 * the other cookies of the project are forwarded as they are.
 */

/**
 * Returns the value of the Cookie header without the pair of the given name.
 * The other pairs are kept in their original order; when no pairs are left after the
 * filtering it returns an empty string (the header is then not to be sent).
 *
 * @param cookieHeader - Source value of the Cookie header.
 * @param cookieName - Exact name of the cookie being cut out (case-sensitive).
 */
export function stripCookieByName(cookieHeader: string, cookieName: string): string {
    return cookieHeader
        .split(';')
        .map((pair) => pair.trim())
        .filter((pair) => {
            if (!pair) {
                return false;
            }

            const separatorIndex = pair.indexOf('=');
            const name = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex).trim();

            return name !== cookieName;
        })
        .join('; ');
}
