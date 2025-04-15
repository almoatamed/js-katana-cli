import { hasPrisma } from "../../utils/hasPrisma/index.js";

import { runSubCommandLine } from "./handle/index.js";

const createCommand = (program: import("commander").Command) => {
    if(!hasPrisma()){
        return 
    }
    const dbCommand = program.command("database").alias("db").description("database set of commands");
    runSubCommandLine(dbCommand);
};
export { createCommand };
