export * from './modules/common/types/index';

declare module './modules/common/utils/routing/generate-stories-json.mjs' {
    export default function generateStoriesJson(isPlayground?: boolean): Promise<void>;
}
