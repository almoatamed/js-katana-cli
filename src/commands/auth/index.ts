import { hasPrisma } from "../../utils/hasPrisma/index.js";

const runSubCommandLine = (await import("./handle/index.js")).runSubCommandLine;

/**
 *
 * @param {import("commander").Command} program
 */
const createCommand = program => {
    if (!hasPrisma()) {
        return;
    }
    const command = program.command("auth").description("user authentication set of commands");
    runSubCommandLine(command);
};
export { createCommand };
