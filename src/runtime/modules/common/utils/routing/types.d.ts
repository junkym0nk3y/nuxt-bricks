export interface IBrickObject {
    name: string;
    category: string;
    brickPath: string;
}

export interface IBrickRoute {
    components: Array<{
        name: string;
        brickPath: string;
    }>;
}

export interface IBricksManifest {
    bricks: IBrickObject[];
    hash: string;
}
