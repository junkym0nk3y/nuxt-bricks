/**
 * The cookie of the interface theme, shared by the dashboard and the editor.
 *
 * A cookie rather than the state of the application: the `bricks-dark` class is
 * obliged to land on the `body` in the FIRST frame — a cookie is read on the server,
 * and a dark surface does not flash light during the hydration. Shared by both
 * surfaces on purpose: moving between them must not switch the theme, and that is
 * exactly why the name lives in `core` — a copy in either surface would let the two
 * drift apart into two themes silently.
 */
export const DARK_MODE_COOKIE = 'bricks-dark-mode';

/** A year of cookie life: a person picks a theme once */
export const DARK_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
