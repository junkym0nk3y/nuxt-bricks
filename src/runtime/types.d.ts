export * from './modules/common/types/index';

declare module './modules/common/utils/routing/generate-bricks-json.mjs' {
    export default function generateBricksJson(isPlayground?: boolean): Promise<void>;
}
