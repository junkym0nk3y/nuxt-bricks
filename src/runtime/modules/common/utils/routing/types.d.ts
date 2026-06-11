export interface IBrickObject {
    name: string;
    category: string;
    storyPath: string;
}

export interface IBrickRoute {
    components: Array<{
        name: string;
        storyPath: string;
    }>;
}

export interface IBricksManifest {
    stories: IBrickObject[];
    hash: string;
}
