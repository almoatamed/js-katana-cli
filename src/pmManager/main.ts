import { Command } from "commander";
import { addCommands } from "./commands.js";
import logger from "./logger.js";

process.on("uncaughtException", error => {
    logger.fatal(error);
});

process.on("uncaughtExceptionMonitor", error => {
    logger.fatal(error);
});

process.on("unhandledRejection", error => {
    logger.fatal(error);
});
export const pmCommand = async (command: Command) => {
    addCommands(command);
};
