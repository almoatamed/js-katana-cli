import { execSync } from "child_process";
import path from "path";
import { appPath } from "../../../../../utils/kiPaths.js";

const createCommand = (program: import("commander").Command) => {
    program
        .command("migrate-generate")
        .alias("m+")
        .description("generate main schema & run prisma migrate")
        .action(async () => {
            await import("../generateMainSchema.js");
            execSync(`npx prisma migrate dev --schema=${path.join(appPath, "prisma/mainSchema.prisma")}`, {
                cwd: appPath,
                stdio: "inherit",
            });
        });
};
export { createCommand };
