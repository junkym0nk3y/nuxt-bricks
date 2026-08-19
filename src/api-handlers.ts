/**
 * Манифест Nitro-ручек /api/bricks/** (persistence, auth, health, builder-поверхность:
 * библиотека компонентов, media proxy, page thumbnail, шаблоны страниц).
 *
 * Роуты модуля не автосканируются — module.ts регистрирует каждую запись
 * через addServerHandler (file — путь от runtimeDir без расширения).
 * Порядок важен для одинаковой специфичности: статические пути и /versions
 * идут до generic /api/bricks/:id.
 */
import type { IBricksApiHandler } from './types/apiHandlers';

export const BRICKS_API_HANDLERS: IBricksApiHandler[] = [
    { route: '/api/bricks', method: 'get', file: 'server/api/bricks/index.get' },
    { route: '/api/bricks', method: 'post', file: 'server/api/bricks/index.post' },
    {
        route: '/api/bricks/auth/login',
        method: 'post',
        file: 'server/api/bricks/auth/login.post',
    },
    {
        route: '/api/bricks/auth/logout',
        method: 'post',
        file: 'server/api/bricks/auth/logout.post',
    },
    {
        route: '/api/bricks/auth/me',
        method: 'get',
        file: 'server/api/bricks/auth/me.get',
    },
    {
        // Остаток пути, а не `:pagename`: страницу опознаёт полный адрес
        // (`<urlPrefix>/<pagename>`), и у него переменное число сегментов
        route: '/api/bricks/public/pages/**:address',
        method: 'get',
        file: 'server/api/bricks/public/pages/[...address].get',
        isPublic: true,
    },
    {
        route: '/api/bricks/health',
        method: 'get',
        file: 'server/api/bricks/health/index.get',
        isPublic: true,
    },
    {
        route: '/api/bricks/health/ready',
        method: 'get',
        file: 'server/api/bricks/health/ready.get',
        isPublic: true,
    },
    {
        // Открыта для GET/HEAD auth-матрицей (routeProtection.ts): манифест —
        // только имена, категории и пути brick-файлов
        route: '/api/bricks/components',
        method: 'get',
        file: 'server/api/bricks/components.get',
    },
    {
        route: '/api/bricks/media',
        method: 'get',
        file: 'server/api/bricks/media/index.get',
    },
    {
        route: '/api/bricks/media/s3-proxy',
        method: 'post',
        file: 'server/api/bricks/media/s3-proxy.post',
    },
    {
        route: '/api/bricks/media/s3-page-thumbnail',
        method: 'post',
        file: 'server/api/bricks/media/s3-page-thumbnail.post',
    },
    {
        route: '/api/bricks/media/upload',
        method: 'post',
        file: 'server/api/bricks/media/upload.post',
    },
    {
        // До generic /api/bricks/media/:id — та же причина, что и у categories
        route: '/api/bricks/media/import',
        method: 'post',
        file: 'server/api/bricks/media/import.post',
    },
    {
        // До generic /api/bricks/media/:id: у DELETE специфичность та же, и
        // `categories` иначе уехал бы в разбор id
        route: '/api/bricks/media/categories',
        method: 'get',
        file: 'server/api/bricks/media/categories/index.get',
    },
    {
        route: '/api/bricks/media/categories',
        method: 'post',
        file: 'server/api/bricks/media/categories/index.post',
    },
    {
        route: '/api/bricks/media/categories/:slug',
        method: 'delete',
        file: 'server/api/bricks/media/categories/[slug].delete',
    },
    {
        route: '/api/bricks/media/:id',
        method: 'patch',
        file: 'server/api/bricks/media/[id].patch',
    },
    {
        route: '/api/bricks/media/:id',
        method: 'delete',
        file: 'server/api/bricks/media/[id].delete',
    },
    {
        route: '/api/bricks/users',
        method: 'get',
        file: 'server/api/bricks/users/index.get',
    },
    {
        route: '/api/bricks/users',
        method: 'post',
        file: 'server/api/bricks/users/index.post',
    },
    {
        // Ручки своего профиля идут ДО параметрических: `me` — не число, и в
        // разборе `:id` этот путь получил бы 400 вместо своей ручки. Роутер
        // предпочитает статический сегмент параметру сам, но порядок манифеста —
        // единственное, что видно при чтении
        route: '/api/bricks/users/me',
        method: 'patch',
        file: 'server/api/bricks/users/me.patch',
    },
    {
        route: '/api/bricks/users/me/password',
        method: 'post',
        file: 'server/api/bricks/users/me/password.post',
    },
    {
        route: '/api/bricks/users/me/avatar',
        method: 'post',
        file: 'server/api/bricks/users/me/avatar.post',
    },
    {
        route: '/api/bricks/users/me/avatar',
        method: 'delete',
        file: 'server/api/bricks/users/me/avatar.delete',
    },
    {
        // До generic /api/bricks/users/:id — специфичность у POST та же, и
        // `password` иначе уехал бы в разбор id
        route: '/api/bricks/users/:id/password',
        method: 'post',
        file: 'server/api/bricks/users/[id]/password.post',
    },
    {
        route: '/api/bricks/users/:id',
        method: 'patch',
        file: 'server/api/bricks/users/[id].patch',
    },
    {
        route: '/api/bricks/users/:id',
        method: 'delete',
        file: 'server/api/bricks/users/[id].delete',
    },
    {
        // Весь блок шаблонов — до generic /api/bricks/:id: специфичность у пары
        // «метод + один сегмент» та же, и `templates` иначе уехал бы в разбор id
        route: '/api/bricks/templates',
        method: 'get',
        file: 'server/api/bricks/templates/index.get',
    },
    {
        route: '/api/bricks/templates',
        method: 'post',
        file: 'server/api/bricks/templates/index.post',
    },
    {
        route: '/api/bricks/templates/:id',
        method: 'get',
        file: 'server/api/bricks/templates/[id].get',
    },
    {
        route: '/api/bricks/templates/:id',
        method: 'patch',
        file: 'server/api/bricks/templates/[id].patch',
    },
    {
        route: '/api/bricks/templates/:id',
        method: 'delete',
        file: 'server/api/bricks/templates/[id].delete',
    },
    {
        route: '/api/bricks/:id/versions',
        method: 'get',
        file: 'server/api/bricks/[id]/versions/index.get',
    },
    {
        route: '/api/bricks/:id/versions/:versionId',
        method: 'get',
        file: 'server/api/bricks/[id]/versions/[versionId].get',
    },
    {
        route: '/api/bricks/:id/versions/:versionId/restore',
        method: 'post',
        file: 'server/api/bricks/[id]/versions/[versionId]/restore.post',
    },
    { route: '/api/bricks/:id', method: 'get', file: 'server/api/bricks/[id].get' },
    { route: '/api/bricks/:id', method: 'put', file: 'server/api/bricks/[id].put' },
    { route: '/api/bricks/:id', method: 'patch', file: 'server/api/bricks/[id].patch' },
    { route: '/api/bricks/:id', method: 'delete', file: 'server/api/bricks/[id].delete' },
];
