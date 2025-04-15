import fs from "fs";
import { decryptStringWithPassword, encryptStringWithPassword } from "../crypto.js";
import Logger from "../logger.js";
import { fileNameToPath } from "./index.js";

export const encryptAndSaveFileToStorage = async (name: string, contents: string, password: string) => {
    const encrypted = encryptStringWithPassword(contents, password);
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    await fs.writeFileSync(path, encrypted);
};

export const retrieveEncryptedFileFromStorage = async (name: string, password: string) => {
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    const fileDoesNotExist = !(await fs.existsSync(path));

    if (fileDoesNotExist) {
        return null;
    }

    try {
        const encryptedContents = await fs.readFileSync(path, "utf-8");
        return decryptStringWithPassword(encryptedContents, password);
    } catch (err) {
        Logger.error("failed to decrypt file: ", name, ":", err);
        return null;
    }
};

export const isStoredAsEncrypted = async (name: string) => {
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    return await fs.existsSync(path);
};
