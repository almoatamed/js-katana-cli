import { execSync } from "child_process";
import { appPath } from "../kiPaths.js";
export const hasBun = () => {
    try {
        const result = execSync("which bun", {
            encoding: "utf-8",
            cwd: appPath,
        });
        return !!result;
    } catch (error) {
        return false;
    }
};

export const installBun = () => {
    if (!hasBun()) {
        execSync("sudo npm i -g bun", {
            stdio: "inherit",
            cwd: appPath,
        });
    }
};
