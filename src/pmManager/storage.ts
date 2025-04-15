import fs from "fs";
import path from "path";

import { chunkArr } from "./array.js";
import { decryptStringWithPassword, encryptStringWithPassword } from "./crypto.js";
import logger from "./logger.js";;
import { CPU_COUNT, HOME_DIR_PATH } from "./os.js";

const KI_DIR_NAME = ".ki";

const getKiDirPath = () => path.join(HOME_DIR_PATH, KI_DIR_NAME);

export const maybeCreateKiDirAtHomeDir = () => {
    const storePath = getKiDirPath();

    if (!fs.existsSync(storePath)) {
        fs.mkdirSync(storePath);
    }
};

const fileNameToPath = (fileName: string) => path.join(getKiDirPath(), fileName);

export const saveToFileStorage = async (name: string, content: string): Promise<void> => {
    const filepath = fileNameToPath(name);
    fs.writeFileSync(filepath, content, {
        encoding: "utf-8",
    });
};

export const getFileFromStorage = async (name: string): Promise<Buffer> => {
    const filepath = fileNameToPath(name);
    return  fs.readFileSync(filepath);
};

export const areFilesStored = async (...filesNames: string[]): Promise<Record<string, boolean>> => {
    const chunkedPaths = chunkArr(filesNames, CPU_COUNT * 4);

    const result: Record<string, boolean> = {};

    for (const paths of chunkedPaths) {
        await Promise.all(
            paths.map(async fileName => {
                const fileFullPath = fileNameToPath(fileName);
                result[fileName] = await fs.existsSync(fileFullPath);
            }),
        );
    }

    return result;
};

export const isFileStored = async (name: string): Promise<boolean> => {
    return fs.existsSync(fileNameToPath(name));
};

export const getStoredFileNames = async () => {
    const kiDirPath = getKiDirPath();
    return fs.readdirSync(kiDirPath);
};

export const removeFilesFromStorage = async (...names: string[]): Promise<void> => {
    const paths = names.map(fileNameToPath);
    const chunkedPaths = chunkArr(paths, CPU_COUNT * 4);

    for (const paths of chunkedPaths) {
        await Promise.all(paths.map(async p => fs.rmSync(p)));
    }
};

export const encryptAndSaveFileToStorage = async (name: string, contents: string, password: string) => {
    const encrypted = encryptStringWithPassword(contents, password);
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    await fs.writeFileSync(path, encrypted);
};

export const retrieveEncryptedFileFromStorage = async (name: string, password: string) => {
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    const fileDoesNotExist = !(fs.existsSync(path));

    if (fileDoesNotExist) {
        return null;
    }

    try {
        const encryptedContents = await fs.readFileSync(path, "utf-8");
        return decryptStringWithPassword(encryptedContents, password);
    } catch (err) {
        logger.error("failed to decrypt file: ", name, ":", err);
        return null;
    }
};

export const isStoredAsEncrypted = async (name: string) => {
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    return fs.existsSync(path);
};
