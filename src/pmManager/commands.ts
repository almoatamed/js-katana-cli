import type { Command } from "commander";
import { deleteBranchOnFailure, getUtilityVersions } from "./github.js";
import { getUtilityByName, getProjectContext, updatePackageDotJson, type PackageDotJSONFile } from "./project.js";

import { clearCachedItems, listCachedItems } from "./cache.js";

import { initNewUtility } from "./init.js";
import logger, { loadingSpinner } from "./logger.js";
import {
    addConfigToProjectPackageFile,
    checkAllUtilities,
    checkUtility,
    hideUtilityInProject,
    removeUtilityFromProject,
    revealUtilityInProject,
} from "./project.js";
import { pullAllUtilities, pullUtility } from "./pull.js";
import { pushUtility, pushAllUtilities } from "./push.js";
import { parseUtilityVersion, processUtilityIdentifierInput, type Version } from "./utility.js";

import path from "path";
import url from "url";
import { readJSON } from "./fs.js";

const addConfigCommandToProgram = (program: Command) =>
    program.command("config").action(async () => {
        addConfigToProjectPackageFile(await getProjectContext());
    });

const addListToProgram = (program: Command) =>
    program.command("list").action(async () => {
        if ((await getProjectContext()).utilities.length === 0) {
            console.warn("no tool found!.");
            return;
        }

        for (const config of (await getProjectContext()).utilities) {
            logger.log("Tool found: ", config.configFile.name);
        }
    });

const addInitCommand = (program: Command) =>
    program
        .command("init <name>")
        .option("-d, --description <description>")
        .action(async (p, { description = "" }) => {
            await initNewUtility(p, description.trim());
        });

const addRemoveUtilityCommand = (program: Command) =>
    program.command("remove <name>").action(async p => {
        await removeUtilityFromProject(await getProjectContext(), p);
    });

const addPushUtilityCommand = (program: Command) =>
    program.command("push [name]").action(async (utilityName?: string) => {
        loadingSpinner.start();

        if (utilityName) {
            logger.log("pushing single");
            await pushUtility({
                context: await getProjectContext(),
                inputUtilityName: utilityName,
                mainDep: true,
            });
            updatePackageDotJson();
            loadingSpinner.stop();
            return;
        }

        await pushAllUtilities(await getProjectContext());
        updatePackageDotJson();
        loadingSpinner.stop();
    });

const addHideCommand = (program: Command) =>
    program.command("hide <name>").action(async name => {
        await hideUtilityInProject(await getProjectContext(), name);
    });

const addRevealCommand = (program: Command) =>
    program.command("reveal <name>").action(async name => {
        await revealUtilityInProject(await getProjectContext(), name);
    });

const addCheckCommand = (program: Command) =>
    program.command("check [name]").action(async (name?: string) => {
        if (name) {
            await checkUtility(await getProjectContext(), name);
            return;
        }

        await checkAllUtilities(await getProjectContext());
    });

const addDeleteBranchVersion = (program: Command) =>
    program.command("delete-version <utilityName> <version>").action(async (input, version: string) => {
        const { owner, repo } = await processUtilityIdentifierInput(input);

        if (!parseUtilityVersion(version)) {
            logger.fatal(`${version} is not a valid version`);
            return;
        }

        const utilityAvailableVersions = await getUtilityVersions(owner, repo);
        const foundVersion = utilityAvailableVersions.find((v: Version) => (v as Version).version == version);
        if (!foundVersion) {
            logger.fatal("Version is not found");
            return;
        }
        await deleteBranchOnFailure(owner, repo, version);
    });

const addPullCommand = (program: Command) =>
    program
        .command("pull [name]")
        .option("-k, --keep-excess-utilities")
        .option("-v, --version <version>")
        .option("-f, --force", "if there is valid update it will overwrite current changes")
        .action(
            async (
                name: string | undefined,
                options: {
                    version?: string;
                    keepExcessUtilities: boolean;
                    force: boolean;
                },
            ) => {
                const { version } = options;

                if (version && !parseUtilityVersion(version)) {
                    logger.fatal(`${version} is not a valid version`);
                    return;
                }

                if (name) {
                    const { repo } = await processUtilityIdentifierInput(name);
                    const packageDotJSONFile = (await getProjectContext()).packageFile;
                    let updatePolicy: "major" | "minor" | "fixed" | "batch" = "minor";
                    if (packageDotJSONFile.ki.dependencies[repo]) {
                        updatePolicy = packageDotJSONFile.ki.dependencies[repo].updatePolicy;
                    }
                    await pullUtility({
                        mainDep: true,
                        context: await getProjectContext(),
                        inputUtilityName: name,
                        version: version,
                        force: options.force,
                        updatePolicy: version ? "fixed" : updatePolicy,
                    });
                    updatePackageDotJson();
                    return;
                }

                await pullAllUtilities({ keepExcessUtilities: !!options.keepExcessUtilities });
                updatePackageDotJson();
            },
        );

const addListUtilityVersions = (program: Command) => {
    program.command("list-versions <utilityName>").action(async (utilityName: string) => {
        const { owner, repo } = await processUtilityIdentifierInput(utilityName);
        const util = await getUtilityByName(repo);

        if (!util) {
            logger.fatal("Utility not found");
            return;
        }

        const versions = await getUtilityVersions(owner, util.configFile.name);

        const foundVersion = versions.find((v: Version) => (v as Version).version == util.configFile.version);

        if (!foundVersion) {
            logger.success("current version is not found remotely: ", util.configFile.version);
        } else if (!versions.length) {
            logger.warning("\nthis utility has no releases.");
        }

        for (const version of versions as Version[]) {
            logger.log(version.version == util.configFile.version ? `[${version.version}]` : `${version.version}`);
        }
    });
};

const addCacheCommands = (program: Command) =>
    program
        .command("cache [action]")
        .description("cache control command")
        .action(async (action: "list" | "clear" | string = "list") => {
            if (action === "clear") {
                await clearCachedItems();
                return;
            }

            await listCachedItems();
        });

export const addCommands = (program: Command) => {
    addInitCommand(program);
    addListToProgram(program);
    addRemoveUtilityCommand(program);
    addPushUtilityCommand(program);
    addPullCommand(program);
    addHideCommand(program);
    addRevealCommand(program);
    addCheckCommand(program);
    addListUtilityVersions(program);
    addDeleteBranchVersion(program);
    addConfigCommandToProgram(program);
    addCacheCommands(program);

    return program;
};
