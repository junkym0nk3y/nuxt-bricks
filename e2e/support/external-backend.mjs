import process from 'node:process';
import {
    BACKEND_BASE_PATH,
    createFakeExternalBackend,
} from '../../scripts/external-smoke-backend.mjs';

const PORT = 4322;
const HOST = '127.0.0.1';
const { server } = createFakeExternalBackend();

server.listen(PORT, HOST, () => {
    console.info(`[e2e-backend] listening on http://${HOST}:${PORT}${BACKEND_BASE_PATH}`);
});

function closeServer() {
    server.close(() => process.exit(0));
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
