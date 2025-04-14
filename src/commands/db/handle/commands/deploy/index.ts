import { execSync } from "child_process";
import { appPath } from "../../../../../utils/kiPaths.js";
import path from "path";
import { prismaGenerate } from "../prismaGenerate/index.js";

const createCommand = (program: import("commander").Command) => {
    program
        .command("deploy")
        .alias("d")
        .description("run prisma migrate deploy")
        .action(async () => {
            await import("../generateMainSchema.js");
            execSync(`npx prisma migrate deploy --schema=${path.join(appPath, "prisma/mainSchema.prisma")}`, {
                cwd: appPath,
                stdio: "inherit",
            });
            prismaGenerate();
        });
};
export { createCommand };
