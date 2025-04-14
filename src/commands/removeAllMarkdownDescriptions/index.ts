import fs from "fs";
import path from "path";
import { srcPath } from "../../utils/kiPaths.js";
import { projectRoot } from "../../pmManager/fs.js";

const removeMarkdownDescriptions = (currentDir: string, descriptionRegex: RegExp) => {
    const directoryContent = fs.readdirSync(currentDir);
    for (const item of directoryContent) {
        const itemFullPath = path.join(currentDir, item);
        const itemStats = fs.statSync(itemFullPath);
        if (itemStats.isDirectory()) {
            removeMarkdownDescriptions(itemFullPath, descriptionRegex);
        } else {
            if (item.match(descriptionRegex)) {
                fs.rmSync(itemFullPath);
            }
        }
    }
};

const createCommand = (program: import("commander").Command) => {
    program
        .command("removeAllMdRoutersDescriptors")
        .alias("rmrmd")
        .description("use it to remove all markdown descriptions file for routers")
        .action(async () => {
            const routerConfig = (await import(path.join(projectRoot, "server/config/routing/index.ts"))).routerConfig;

            const routerFullDirectoryPath = path.join(srcPath, routerConfig.getRouterDirectory());
            const descriptionRegex = RegExp(routerConfig.getDescriptionSuffixRegx());
            removeMarkdownDescriptions(routerFullDirectoryPath, descriptionRegex);

            process.exit(0);
        });
};
export { createCommand };
