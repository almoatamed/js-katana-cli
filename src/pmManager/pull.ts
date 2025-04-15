import { rmSync } from "fs";
import path from "path";
import { chunkArr } from "./array.js";
import { downloadUtility } from "./downloadUtility.js";
import { projectRoot, readJSON } from "./fs.js";
import { getUtilityVersions } from "./github.js";
import logger from "./logger.js";;
import { CPU_COUNT } from "./os.js";
import {
    assembleProjectContext,
    checkUtility,
    getProjectContext,
    selectUtilityByName,
    utilityConfigFileName,
    type DependencyDescription,
    type ProjectContext,
} from "./project.js";
import {
    collectDependenciesList,
    compareVersions,
    getRemoteVersionConfigFile,
    parseVersionOrExit,
    processUtilityIdentifierInput,
    type UtilityFile,
    type Version,
} from "./utility.js";

let processedDependencies: string[] = [];
export const processDependencies = async (
    deps: { [utilityName: string]: DependencyDescription },
    mainDependencies: boolean,
) => {
    const chunks = chunkArr(Object.entries(deps), CPU_COUNT * 4);
    for (const chunk of chunks) {
        await Promise.all(
            chunk.map(async ([utilityName, dependencyDescription]) => {
                if (processedDependencies.includes(utilityName)) {
                    return;
                }
                processedDependencies.push(utilityName);
                await pullUtility({
                    context: await getProjectContext(),
                    inputUtilityName: `${dependencyDescription.owner}/${dependencyDescription.repo}`,
                    mainDep: mainDependencies,
                    version: dependencyDescription.version,
                    updatePolicy: dependencyDescription.updatePolicy,
                });
            }),
        );
    }
};

export const pullUtility = async ({
    context,
    inputUtilityName,
    version,
    updatePolicy = "minor",
    mainDep,
}: {
    context: ProjectContext;
    inputUtilityName: string;
    version?: string;
    mainDep: boolean;
    force?: boolean; 
    updatePolicy?: "major" | "minor" | "batch" | "fixed";
}) => {
    /**
     *  - check if the utility has remote version
     *    - if not prompt that this utility does not exist remotely
     *  - if there is version passed
     *    - check if the version exists remotely
     *    - if not prompt and exit
     *
     *   - specify required versoin either lts or specified
     *
     *  - check if the utility exists locally
     *  - if it does
     *    - compare versions of local to remote
     *      - if version specified
     *        - specified version != current
     *          - pull specified version into prompted utils dir path
     *      - else
     *        - if local greater
     *          - prompt you are up to date and exit
     *        - if local lower
     *          - pull specified version into prompted utils dir path
     *        - if local equals remote
     *          - prompt you are up to date and exit
     *  - if not
     *    - pull specified version into prompted utils dir path
     *
     */
    
    const {
        owner,
        repo,
        utilityCurrentOwnerDifferentFromProvided,
        utilityExistsOnProject,
        utilityParentDirRelativePath,
        utilityDirName,
    } = await processUtilityIdentifierInput(inputUtilityName);

    const versions = await getUtilityVersions(owner, repo, true);
    if (!versions.length || !versions.at(-1)) {
        logger.error("Remote Utility is not detected, and have no versions", inputUtilityName);
        return;
    }
    logger.log("Latest Version for util", `${repo}/${owner}`, versions?.at(-1)?.version);

    const utilityName = repo;
    const util = selectUtilityByName(context, utilityName);
    if(util){
        if(util.configFile.private){
            logger.log("utility.js",inputUtilityName," exists on project and it is private")
            return
        }
        logger.log("utility.js", inputUtilityName, "exists on the project at" , util?.path," with version",util?.configFile?.version )
    }
    const updateDependencyOnPackageDotJson = async (selectedVersion: Version) => {
        if (!mainDep) {
            return;
        }
        (await getProjectContext()).packageFile.ki.dependencies[utilityName] = {
            owner,
            repo,
            updatePolicy: updatePolicy,
            version: selectedVersion.version as any,
        };
    };

    const processDeps = async () => {
        const utilityFullPath = path.join(projectRoot, utilityParentDirRelativePath, utilityDirName);
        
        const utilityConfigFile = readJSON<UtilityFile>(path.join(utilityFullPath, utilityConfigFileName));
        if (utilityConfigFile) {
            await processDependencies(utilityConfigFile.deps, false);
        }
    };
    const pull = async (selectedVersion: Version) => {
        logger.log("Pulling utility.js", inputUtilityName, "with version", selectedVersion.version, ", and update policy is", updatePolicy)
        await downloadUtility(
            owner,
            utilityName,
            selectedVersion.version,
            utilityParentDirRelativePath,
            utilityDirName,
        );
        await processDeps();
        await updateDependencyOnPackageDotJson(selectedVersion);
    };

    const upToDate = async (selectedVersion: Version) => {
        logger.success("utility.js", utilityName, "Up to date" );
        await processDeps();
        await updateDependencyOnPackageDotJson(selectedVersion);
        return;
    };

    const targetVersion: Version = parseVersionOrExit(
        version || util?.configFile.version || (versions.at(-1)?.version as string),
    );

    if (!util || (utilityExistsOnProject && utilityCurrentOwnerDifferentFromProvided)) {
        logger.log("utility ", inputUtilityName, "does not exist on the project and will be pulled with version", targetVersion.version)
        await pull(targetVersion);
        return;
    }

    const utilVersion = parseVersionOrExit(util.configFile.version);

    if (
        !versions.find(v => {
            return v.version == utilVersion.version;
        })
    ) {
        logger.warning(
            "utility ",
            util.configFile.name,
            "at",
            util.path,
            "current version",
            util.configFile.version,
            "does not exist remotely, please push",
        );
        return;
    }

    const checkResult = await checkUtility(await getProjectContext(), util.configFile.name);
    util.configFile.hash = checkResult.currentHash;

    // const remoteConfigFileForCurrentVersion = await getRemoteVersionConfigFile(
    //     owner,
    //     repo,
    //     util.configFile.version,
    // );
    // if (remoteConfigFileForCurrentVersion) {
    //     if (remoteConfigFileForCurrentVersion.hash != util.configFile.hash) {
    //         logger.warning(
    //             "utility ",
    //             util.configFile.name,
    //             "at",
    //             util.path,
    //             "which has the lasted version of", 
    //             versions.at(-1)?.version, 
    //             "and locurrent version",
    //             util.configFile.version,
    //             "local hash does not math remote hash, please make sure to check then update the version and push",
    //         );
    //         return;
    //     }
    // }

    if (updatePolicy == "fixed") {
        const version = targetVersion.version;
        const foundVersion = versions.find(v => v.version == version);
        if (!foundVersion) {
            logger.fatal("Specified version", version, "is not found remotely");
            return;
        }
        const selectedVersion = foundVersion;
        logger.log("requesting specific version", version);

        if (!compareVersions(selectedVersion, "==", utilVersion)) {
            return await pull(selectedVersion);
        } else {
            return upToDate(selectedVersion);
        }
    } else {
        let selectedVersion: Version = targetVersion as Version;
        if (updatePolicy == "major" || !util) {
            selectedVersion = versions.at(-1) as Version;
        } else if (updatePolicy == "minor") {
            const latestMinorVersion = (versions
                .filter(v => {
                    return v.major <= targetVersion.major;
                })
                .at(-1) || versions.at(-1)) as Version;
            logger.log("selecting minor version for", inputUtilityName, "with version", latestMinorVersion)
            selectedVersion = latestMinorVersion;
        } else if (updatePolicy == "batch") {
            const lastBatchVersion = (versions
                .filter(v => {
                    return (
                        (v.major == targetVersion.major && v.minor <= targetVersion.minor) ||
                        v.major < targetVersion.major
                    );
                })
                .at(-1) || versions.at(-1)) as Version;
            selectedVersion = lastBatchVersion;
        }

        if (compareVersions(selectedVersion, ">", utilVersion)) {
            await pull(selectedVersion);
        } else if (compareVersions(selectedVersion, "<", utilVersion)) {
            logger.warning("you local version is greater than remote latest, please push updates");
            return;
        } else {
            return upToDate(selectedVersion);
        }
    }
};

export const pullAllUtilities = async ({ keepExcessUtilities = false }: { keepExcessUtilities?: boolean, force?: boolean }) => {
    const packageDotJson = (await getProjectContext()).packageFile;
    const mainDependencies = packageDotJson.ki.dependencies;

    await processDependencies(mainDependencies, true);

    if (!keepExcessUtilities) {
        const updatedContext = await assembleProjectContext();
        const allDependencies = await collectDependenciesList(updatedContext, mainDependencies);
        const excess = updatedContext.utilities.filter(u => {
            return !allDependencies[u.configFile.name];
        });
        const chunkedExcess = chunkArr(excess, CPU_COUNT * 4);
        for (const excessChunk of chunkedExcess) {
            await Promise.all(
                excessChunk.map(async util => {
                    const versions = await getUtilityVersions(util.configFile.owner, util.configFile.name, true);
                    const foundVersion = versions.find(v => v.version == util.configFile.version);
                    if (!foundVersion) {
                        logger.warning(
                            "utility.js",
                            util.configFile.owner + "/" + util.configFile.name,
                            "is not registered on main dependencies, and its current version does not exists remotely, please push to register it, or remove it manually.",
                        );
                        return;
                    }
                    if (foundVersion) {
                        const remoteConfig = await getRemoteVersionConfigFile(
                            util.configFile.owner,
                            util.configFile.name,
                            foundVersion.version,
                        );
                        if (!remoteConfig) {
                            logger.warning(
                                "utility.js",
                                util.configFile.owner + "/" + util.configFile.name,
                                " version",
                                foundVersion.version,
                                " is not registered on main dependencies but",
                                "has corrupt remote origin,  since its config file not found, to fix please push or fix it manually.",
                            );
                            return;
                        }

                        const checkResult = await checkUtility(await getProjectContext(), util.configFile.name);
                        if (remoteConfig.hash != checkResult.currentHash) {
                            logger.warning(
                                "utility.js",
                                util.configFile.owner + "/" + util.configFile.name,
                                " version",
                                foundVersion.version,
                                " is not registered on main dependencies, ",
                                "its remote config hash does not match current hash, did you forgot to update its version and pushing after editing it?",
                            );
                            return;
                        }
                    }
                    logger.success(
                        "removing excess utility.js",
                        util.configFile.owner + "/" + util.configFile.name,
                        "at",
                        util.path,
                    );
                    rmSync(util.path, { recursive: true });
                }),
            );
        }
    }
};
