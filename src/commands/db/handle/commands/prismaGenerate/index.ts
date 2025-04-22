import { execSync } from "child_process";
import path from "path";
import { appPath } from "../../../../../utils/kiPaths.js";
export const prismaGenerate = () => {
    execSync(`npx prisma generate --schema=${path.join(appPath, "prisma/mainSchema.prisma")}`, {
        cwd: appPath,
        stdio: "inherit",
    });
};
const createCommand = (program: import("commander").Command) => {
    program
        .command("prisma-generate")
        .alias("pg")
        .description("run prisma generate")
        .action(() => {
            prismaGenerate()
        });
};
export { createCommand };
