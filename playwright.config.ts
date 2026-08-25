import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 4321;
const BACKEND_PORT = 4322;
const AUTH_APP_PORT = 4323;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;
const AUTH_APP_ORIGIN = `http://127.0.0.1:${AUTH_APP_PORT}`;

/**
 * The specs of the login live in a fixture of their own: database auth needs a
 * second app, and the rest of the suite must keep running against the basic mode
 * it covers. The split is by file name so that both projects share one `testDir`.
 */
const AUTH_SPECS = '**/auth-*.spec.ts';

export default defineConfig({
    testDir: './e2e/specs',
    fullyParallel: false,
    workers: 1,
    timeout: 45_000,
    expect: {
        timeout: 10_000,
    },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            testIgnore: AUTH_SPECS,
            use: {
                ...devices['Desktop Chrome'],
                baseURL: APP_ORIGIN,
                // The basic mode authorizes every request, the API helpers included
                httpCredentials: {
                    username: 'e2e-admin',
                    password: 'e2e-password',
                },
            },
        },
        {
            // Database auth: no credentials on the transport at all, the session is
            // the cookie the spec earns by logging in through the form
            name: 'chromium-auth',
            testMatch: AUTH_SPECS,
            use: {
                ...devices['Desktop Chrome'],
                baseURL: AUTH_APP_ORIGIN,
            },
        },
    ],
    webServer: [
        {
            command: 'node ./e2e/support/external-backend.mjs',
            port: BACKEND_PORT,
            reuseExistingServer: false,
            timeout: 30_000,
        },
        {
            command: 'npm run test:e2e:dev',
            url: `${APP_ORIGIN}/api/bricks/health`,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                NUXT_BRICKS_BACKEND_URL: `${BACKEND_ORIGIN}/cms`,
                NUXT_BRICKS_BACKEND_TOKEN: 'e2e-backend-token',
                NUXT_BASIC_AUTH_USERNAME: 'e2e-admin',
                NUXT_BASIC_AUTH_PASSWORD: 'e2e-password',
            },
        },
        {
            command: 'npm run test:e2e:dev:auth',
            // The readiness is taken from the login page rather than from the health
            // endpoint: under database auth the protected paths answer before the
            // session exists, and a redirect is not a readiness signal
            url: `${AUTH_APP_ORIGIN}/bricks/bricks-login`,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
                // The pages and the media of this fixture live in the same fake
                // backend: its adapter is registered by the Nitro plugin of the
                // fixture, which reads these two variables. The names are the
                // fixture's own rather than `NUXT_BRICKS_BACKEND_*` — those belong to
                // the external mode, and the module warns that it ignores them as
                // soon as it sees one in `builtin`
                E2E_AUTH_BACKEND_URL: `${BACKEND_ORIGIN}/cms`,
                E2E_AUTH_BACKEND_TOKEN: 'e2e-backend-token',
                // Database auth refuses to start without a connection string, and the
                // middleware checks it before it ever reaches the adapter. Nothing
                // connects by this one: the accounts of the fixture live in memory
                NUXT_BRICKS_DATABASE_URL: 'postgres://e2e:e2e@127.0.0.1:5499/e2e-unused',
            },
        },
    ],
});
