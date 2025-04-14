import { execSync, type ExecSyncOptionsWithStringEncoding } from "child_process";
import logger from "./logger.js";;

const runCommand = (command: string, opts?: ExecSyncOptionsWithStringEncoding | undefined) => {
    logger.log("about to run command", command);
    return execSync(
        command,
        opts || {
            encoding: "utf-8",
        },
    );
};

const commandOnSystem = (command: string) => {
    try {
        runCommand(`${command} --version`);
        return true;
    } catch (_) {
        return false;
    }
};

export { commandOnSystem, runCommand };
