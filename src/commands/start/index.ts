import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { loadTsConfig } from "../../utils/loadTsConfig/index.js";
import logger from "../../pmManager/logger.js";
import { appPath } from "../../utils/kiPaths.js";
import { hasBun } from "../../utils/bun/index.js";

const createCommand = (program: import("commander").Command) => {
    program
        .command("start")
        .description("use it to run production build mode")
        .action(async () => {
            const ts = loadTsConfig();
            const buildIndexRelativePath = path.join(ts.compilerOptions.outDir || "dist", "index.js");
            if (!fs.existsSync(path.join(appPath, buildIndexRelativePath))) {
                logger.error("There is not build, build the project with 'rest b'");
                return;
            }
            const bun = hasBun()
            if (bun) {
                execSync(`bun --no-warnings ${buildIndexRelativePath}`, {
                    stdio: "inherit",
                    cwd: appPath,
                });
            } else {
                execSync(`node --no-warnings ${buildIndexRelativePath}`, {
                    stdio: "inherit",
                    cwd: appPath,
                });
            }

            process.exit(0);
        });
};
export { createCommand };
