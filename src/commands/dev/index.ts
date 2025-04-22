import { execSync } from "child_process";
import { appPath } from "../../utils/kiPaths.js";
import { installBun } from "../../utils/bun/index.js";
import fs from "fs";
import path from "path";
const createCommand = (program: import("commander").Command) => {
    program
        .command("dev")
        .description("use it to run in dev mode")
        .action(async () => {
            installBun();
            const nodemonConfigFullPath = path.join(appPath, "nodemon.json");
            if (!fs.existsSync(nodemonConfigFullPath)) {
                fs.writeFileSync(
                    nodemonConfigFullPath,
                    JSON.stringify({
                        ignore: [
                            "*.json",
                            "notes/*",
                            "prisma/*",
                            "nginx/*",
                            ".vscode/*",
                            "node_modules/*",
                            "JsDoc/*",
                            "public/*",
                            "assets/*",
                        ],
                        watch: ["server"],
                        ext: ".ts,.js",
                        exec: "bun ./server/index.ts",
                    }),
                );
            }
            execSync("bunx nodemon", {
                stdio: "inherit",
                cwd: appPath,
            });
            process.exit(0);
        });
};
export { createCommand };
