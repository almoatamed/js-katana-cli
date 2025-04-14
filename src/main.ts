import { program } from "commander";
import logger from "./pmManager/logger.js";
import { PackageDotJSONFile } from "./pmManager/project.js";
import url from "url";
import path from "path";
import { readJSON } from "./pmManager/fs.js";
import { runCommand } from "./pmManager/exec.js";
import { pmCommand } from "./pmManager/main.js";
import { maybeCreateKiDirAtHomeDir } from "./pmManager/storage/index.js";
import { createCommands } from "./commands/index.js";
const runCli = async () => {
    try {
        maybeCreateKiDirAtHomeDir();
        program.option("-v, --version").action(({ version }: { version: boolean }) => {
            if (version) {
                const currentDir = url.fileURLToPath(new url.URL("./.", import.meta.url));
                const kiPackageDotJsonFile = path.join(currentDir, "../package.json");
                const kiPackageDotJson: PackageDotJSONFile = readJSON(kiPackageDotJsonFile);
                logger.info(kiPackageDotJson.version);
                return;
            }
            program.help();
        });

        await pmCommand(
            program
                .command("package-manager")
                .alias("pm")
                .description(
                    "code block and package manager that is bi-directional, i.e. upload, download and always stay in sync read more on js-katana docs",
                ),
        );
        await createCommands(program);
        await program.parseAsync();
    } catch (error) {
        throw error;
    }
};
await runCli();
process.exit();
