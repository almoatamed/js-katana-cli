import { execSync } from "child_process";
import { appPath } from "../../../../../utils/kiPaths.js";
import path from "path";

const createCommand = (program: import("commander").Command) => {
    program
        .command("migrate")
        .alias("m")
        .description("run prisma migrate")
        .action(() => {
            execSync(`npx prisma migrate dev --schema=${path.join(appPath, "prisma/mainSchema.prisma")} `, {
                cwd: appPath,
                stdio: "inherit",
            });
        });
};
export { createCommand };
