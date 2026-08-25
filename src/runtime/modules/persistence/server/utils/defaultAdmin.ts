/**
 * The default administrator of a fresh database: the seed of the
 * `migrations/0001_init.sql` migration.
 *
 * The account exists for the sake of the first login: the account creation endpoint
 * requires an active administrator's session, and before the first account nobody has
 * one. After that users are created from the interface, and no external provisioning is
 * needed.
 *
 * The hash here is the same string as in the migration's seed, and that is
 * deliberate duplication: Postgres has no scrypt, there is nothing to compute it
 * with in SQL, while the application needs to learn "the password is still the
 * default" without the scrypt check itself on every request — by comparing the hash
 * string. A divergence of the two copies is caught by
 * `test/server/authDefaultAdmin.spec.ts`: had they drifted apart, they would stop
 * recognizing the default, and the warning about changing the password would
 * silently disappear.
 *
 * A salt shared across every installation weakens nothing: the password is printed in
 * the README, and its secrecy rests not on the hash but on it being changed after the
 * first login — which is what the warning in the interface asks for.
 */

/**
 * The hash of the default password; a copy of the literal from the migration's seed.
 *
 * The username and the password themselves live in `common/constants/auth.ts` — the
 * builder's forms know them too, as they must refuse an attempt to set this
 * password for anyone. The hash stays here: only the session query needs it, and in a
 * browser it is useless.
 */
export const BRICKS_DEFAULT_ADMIN_PASSWORD_HASH =
    'scrypt:16384:8:5:6XrxNZW9pt/uBVzL5rbbBg==:/JPx8k7pL8qNKmXP7+B0l7gMG5NcvbaidG4s9dmz4RGgOPJBpCvKFoVXjpdQmZ4BNdn2Uy5zVjs5E6QYk4i1Uw==';
