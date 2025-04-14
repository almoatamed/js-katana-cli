import fs from "fs";
import path from "path";
import { hashBuffersWithSha256 } from "./crypto.js";
import { collectFilePathsIn, isStoredOnDisk, readFiles, storeJSON } from "./fs.js";
import logger from "./logger.js";;
import { projectContext, utilityConfigFileName } from "./project.js";
import { requestPermsToRun } from "./prompt.js";
import { processUtilityIdentifierInput, type UtilityFile } from "./utility.js";

export const initNewUtility = async (name: string, description: string) => {
    const context = projectContext;
    const { owner, repo: utilityName } = await processUtilityIdentifierInput(name);


    if (await isStoredOnDisk(utilityConfigFileName)) {
        logger.fatal("directory already managed by verde!.");
        return;
    }

    if (context.utilitiesInCwd.length) {
        logger.fatal(
            "this directory contains sub utilities",
            "\n",
            context.utilitiesInCwd.map(u => `${u.configFile.name}: ${u.path}`).join("\n"),
        );
        return;
    }

    const { utilities } = context;
    const nameNotAvailable = utilities.some(u => u.configFile.name === name);

    if (nameNotAvailable) {
        console.error("name taken by a different utility.");
        return;
    }

    const paths = await collectFilePathsIn(".");

    const sortedPaths = paths
        .slice(0)
        .sort()
        .filter(p => path.basename(p) !== utilityConfigFileName);

    const files = await readFiles(sortedPaths);
    const hash = hashBuffersWithSha256(files);

    if(!fs.existsSync("README.md")){
        fs.writeFileSync("README.md", `# ${utilityName}`)
    }

    await storeJSON<UtilityFile>(utilityConfigFileName, {
        name: utilityName,
        deps: {},
        publicRepo: await requestPermsToRun("Is this utility repo public"),
        private: false,
        hash,
        owner: owner,
        version: "0.1.0",
        description: description,
    });
};
