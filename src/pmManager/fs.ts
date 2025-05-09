import fs from "fs";
import path from "path";
import logger from "./logger.js";;

export type CollectOpts = {
    configFilename: string;
    exclude: string[];
};

export type CollectResult = {
    dirname: string;
    dirPath: string;
    contents: string[];
};

const exlusions = ["node_modules"]

export const collectFilePathsIn = async (dir: string) => {
    const contents = await fs.readdirSync(dir);
    let results: string[] = [];

    for (const c of contents) {
        if (exlusions.some(e => c.startsWith(e))) {
            continue
        }
        const stats = fs.statSync(path.join(dir, c));

        if (stats.isDirectory()) {

            const gotten = await collectFilePathsIn(path.join(dir, c));
            results.push(...gotten);
            continue;
        }

        results.push(path.join(dir, c));
    }

    return results;
};

export const collectDirsWithFile = async (initialPath: string, opts: CollectOpts): Promise<CollectResult[]> => {
    const { exclude, configFilename } = opts;
    const basename = path.basename(initialPath);

    if (exclude.find(e => initialPath.includes(e))) {
        return [];
    }

    const pathStats = fs.statSync(initialPath);

    if (!pathStats.isDirectory()) {
        return [];
    }

    const contents = fs.readdirSync(initialPath);

    if (contents.find(x => x === configFilename)) {
        const fullContents = await collectFilePathsIn(initialPath);
        return [{ dirname: basename, contents: fullContents, dirPath: initialPath }];
    }

    let results: CollectResult[] = [];

    for (const c of contents) {
        try {
            const fullPath = path.join(initialPath, c);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                const gotten = await collectDirsWithFile(fullPath, opts);
                results = [...results, ...gotten];
            }
        } catch (error) {
            continue
        }
    }

    return results;
};

export const readFiles = async (paths: string[]) => await Promise.all(paths.map(f => fs.readFileSync(f, "utf-8")));

export const storeJSON = async <T>(nameOrPath: string, object: T) =>
    fs.writeFileSync(nameOrPath, JSON.stringify(object, null, 4));

export const isStoredOnDisk = async (nameOrPath: string) => fs.existsSync(nameOrPath);

export const readJSON = <T>(path: string) => {
    logger.log("reading json at", path)
    const contents = fs.readFileSync(path, "utf-8");
    return JSON.parse(contents) as T;
};

export async function isValidRelativePath(path: string) {
    return !!path.match(/^(?:[A-zA-Z\-][A-zA-Z0-9\-]*)(?:\/[A-zA-Z\-][A-zA-Z0-9\-]*)*\/?$/);
}

export const removeDir = async (p: string) => fs.rmdirSync(p, { recursive: true });

const findProjectRoot = async (currentDir = path.resolve(".")): Promise<string> => {
    const packagePath = path.join(currentDir, "package.json");

    if (fs.existsSync(packagePath)) {
        return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
        logger.fatal("No package.json file found in any parent directory.");
    }

    return findProjectRoot(parentDir);
};
export const projectRoot = await findProjectRoot();
logger.log("current project root", projectRoot);
export { findProjectRoot };
