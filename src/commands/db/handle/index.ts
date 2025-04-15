import { Command } from "commander";

import { createCommands } from "./commands/index.js"

const runSubCommandLine = (program: Command) => {
    program.name("db").description("set of database commands.").version("1.0.0");

    createCommands(program);
};

export { runSubCommandLine };
