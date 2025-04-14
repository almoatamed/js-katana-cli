#!/usr/bin/env bun

import { program } from "commander";
import { addCommands } from "./commands.js";
import logger, { loadingSpinner } from "./logger.js";
import { maybeCreateKiDirAtHomeDir } from "./storage/index.js";
import { runCommand } from "./exec.js";

process.on("uncaughtException", error => {
    logger.fatal(error);
});

process.on("uncaughtExceptionMonitor", error => {
    logger.fatal(error);
});

process.on("unhandledRejection", error => {
    logger.fatal(error);
});
const parseAndRun = async () => {
    try {
        maybeCreateKiDirAtHomeDir();

        addCommands(program);
        await program.parseAsync();
        loadingSpinner.stop();
        console.log("\n\n");
    } catch (error) {
        throw error;
    } finally {
        runCommand("reset", {
            stdio: "inherit",
            encoding: "utf-8",
        });
    }
};

await parseAndRun();
process.exit();
