import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 4321;
const BACKEND_PORT = 4322;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;

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
        baseURL: APP_ORIGIN,
        httpCredentials: {
            username: 'e2e-admin',
            password: 'e2e-password',
        },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
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
    ],
});
