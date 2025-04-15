import { InvalidArgumentError } from "commander";

import path from "path";
import { srcPath } from "../../utils/kiPaths.js";
import { projectRoot } from "../../pmManager/fs.js";
import logger from "../../pmManager/logger.js";

import fs from "fs"

const createCommand = (program: import("commander").Command) => {
    program
        .command("create-routers-dir-alias")
        .alias("rda+")
        .description("use it to a routers directory alias")
        .argument("<directory>", `source routers directory relative path e.g "A/someRoutes"`)
        .argument(
            "<alias>",
            `where to put the alias, it must be relative to the routers directory and not in the source routers directory e.g. /B/someRoutesAlias`,
        )
        .option("-r, --recursive", "Create the alias path recursively", false)
        .action(
            /**
             *
             * @param {string} directory
             * @param {string} alias
             */
            async (directory: string, alias: string, options) => {
                const routerConfig = (await import(path.join(projectRoot, "server/config/routing/index.ts")))
                    .routerConfig;

                const routerDirPath = path.join(srcPath, routerConfig.getRouterDirectory());
                const sourceRouterDirectory = directory;

                if (!sourceRouterDirectory || typeof sourceRouterDirectory != "string") {
                    throw new InvalidArgumentError("Please Provide the routers directory name as in 'my/routes'");
                }

                if (sourceRouterDirectory.startsWith("./")) {
                    throw new InvalidArgumentError(
                        "the source routers directory must be relative to routers directory: " + routerDirPath,
                    );
                }
                const fullSourceRouterDirectory = path.join(routerDirPath, sourceRouterDirectory);

                if (!alias || typeof alias != "string") {
                    throw new InvalidArgumentError("Please Provide the alias name as in 'my/new/alias'");
                }

                if (!alias.endsWith(routerConfig.getDirectoryAliasSuffix())) {
                    alias += routerConfig.getDirectoryAliasSuffix();
                }

                if (alias.startsWith("./")) {
                    throw new InvalidArgumentError(
                        "the source routers directory must be relative to routers directory: " + routerDirPath,
                    );
                } else {
                    alias = path.join(routerDirPath, alias);
                }

                if (fs.existsSync(alias)) {
                    throw new InvalidArgumentError(`Alias ${alias} already exists, please check it`);
                }

                if (!fs.existsSync(fullSourceRouterDirectory)) {
                    throw new InvalidArgumentError(
                        `${fullSourceRouterDirectory} does not exists, please make sure its valid`,
                    );
                }

                const stats = fs.statSync(fullSourceRouterDirectory);
                if (!stats.isDirectory()) {
                    throw new InvalidArgumentError(
                        `${fullSourceRouterDirectory} is not a directory, please make sure its valid`,
                    );
                }

                if (alias.match(RegExp(`${fullSourceRouterDirectory}(?:$|\\/)`))) {
                    return logger.error(
                        `Can not create alias ${alias} within ${directory}, this will cause infinite loop.`,
                    );
                }

                if (options.recursive) {
                    fs.mkdirSync(path.dirname(alias), { recursive: true });
                }

                if (!fs.existsSync(path.dirname(alias))) {
                    return logger.error(
                        "the target directory does not exists, use -r if you want to make the directory recursively",
                    );
                }
                fs.writeFileSync(alias, `export default "${directory}"`);
            },
        );
};
export { createCommand };
