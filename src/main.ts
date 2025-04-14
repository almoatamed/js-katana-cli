#!/usr/bin/env bun

import { program } from "commander";
import { addCommands } from "./commands.js";
import logger, { loadingSpinner } from "./logger.js";;
import { maybeCreateVerdeDirAtHomeDir } from "./storage/index.js";

process.on("uncaughtException", error=>{
    logger.fatal(error)
})

process.on("uncaughtExceptionMonitor", error=>{
    logger.fatal(error)
})


process.on("unhandledRejection", error=>{
    logger.fatal(error)
})
const parseAndRun = async () => {
    maybeCreateVerdeDirAtHomeDir();

    addCommands(program);
    await program.parseAsync();
    loadingSpinner.stop();
    console.log("\n\n");
};

await parseAndRun();
process.exit();
