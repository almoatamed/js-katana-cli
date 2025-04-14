import { existsSync, statSync } from "fs-extra";
import path from "path";
import { projectRoot } from "./fs.js";
import { getFileFromRepo, type SingleGithubFile } from "./github.js";
import logger from "./logger.js";;
import { getDefaultOwner, readOwnerName } from "./owner.js";
import {
    projectContext,
    selectUtilityByName,
    utilityConfigFileName,
    type DependencyDescription,
    type ProjectContext,
} from "./project.js";
import { readAnswerTo, requestPermsToRun } from "./prompt.js";
import { ownerUtilityMatchRegex, utilityNameValidationRegex, utilityVersionValidationRegex } from "./regex.js";

export type UtilityFile = { name: string } & {
    version: string;
    deps: Record<string, DependencyDescription>;
    hash: string;
    private: boolean;
    publicRepo: boolean;
    description: string;
    owner: string;
};

export const getRemoteVersionConfigFile = async (owner: string, repo: string, version: string) => {
    const lastRemoteConfigFile = (await getFileFromRepo(
        owner,
        repo,
        utilityConfigFileName,
        version,
    )) as SingleGithubFile | null;
    if (!lastRemoteConfigFile) {
        logger.error("Error loading utility config file from remote source for utility (file not found)", {
            version: version,
            owner: owner,
            repo: repo,
        });
        return null;
    } else {
        const remoteUtilConfig: UtilityFile = JSON.parse(
            Buffer.from(lastRemoteConfigFile.content, "base64").toString("utf-8"),
        );
        return remoteUtilConfig;
    }
};

export const parseUtilityFileFromBuffer = (buff: Buffer) => {
    const parsed = JSON.parse(buff.toString("utf-8"));
    return parsed as UtilityFile;
};

export type Version = {
    version: string;
    major: number;
    minor: number;
    patch: number;
    combined: number;
};

export const parseUtilityVersion = (raw: string): Version | null => {
    if (!raw.match(utilityVersionValidationRegex)) {
        return null;
    }

    const numbers = raw
        .split(".")
        .map(n => Number(n))
        .filter(e => !Number.isNaN(e));

    if (numbers.length !== 3) {
        return null;
    }

    return {
        version: raw,
        major: numbers[0],
        minor: numbers[1],
        patch: numbers[2],
        combined: Number(numbers.join("")),
    };
};

export const compareVersions = (v1: Version, op: "==" | ">" | "<" | ">=" | "<=", v2: Version) => {
    if (op == "<") {
        if (v1.major != v2.major) {
            return v1.major < v2.major;
        }
        if (v1.minor != v2.minor) {
            return v1.minor < v2.minor;
        }
        return v1.patch < v2.patch;
    }

    if (op == "<=") {
        if (v1.major != v2.major) {
            return v1.major <= v2.major;
        }
        if (v1.minor != v2.minor) {
            return v1.minor <= v2.minor;
        }
        return v1.patch <= v2.patch;
    }

    if (op == "==") {
        return v1.version == v2.version;
    }

    if (op == ">=") {
        if (v1.major != v2.major) {
            return v1.major >= v2.major;
        }
        if (v1.minor != v2.minor) {
            return v1.minor >= v2.minor;
        }
        return v1.patch >= v2.patch;
    }

    if (v1.major != v2.major) {
        return v1.major > v2.major;
    } else if (v1.minor != v2.minor) {
        return v1.minor > v2.minor;
    }

    return v1.patch > v2.patch;
};
export const isUtilityNameValid = (name: string) => {
    return name.match(utilityNameValidationRegex);
};

export const parseVersionOrExit = (v: string): Version => {
    const parsed = parseUtilityVersion(v);
    if (!parsed) {
        logger.fatal(`${v} is not a valid version.`);
    }
    return parsed as Version;
};

export type UtilityDescription = {
    configFile: UtilityFile;
    path: string;
    files: string[];
};
const processedUtilityIdentifierInputs: {
    [identifier: string]: {
        owner: string;
        repo: string;
        utilityCurrentOwnerDifferentFromProvided: boolean;
        utilityExistsOnProject: boolean;
        utilityParentDirRelativePath: string;
        utilityDirName: string;
    };
} = {};
export const processUtilityIdentifierInput = async (input: string) => {
    if (processedUtilityIdentifierInputs[input]) {
        return processedUtilityIdentifierInputs[input];
    }
    let owner: string;
    let repo: string;
    let utilityExistsOnProject: boolean = false;
    let utilityCurrentOwnerDifferentFromProvided: boolean = false;
    const ownerAndRepoMatch = input.match(ownerUtilityMatchRegex);
    let specifiedOwner = false;
    if (ownerAndRepoMatch) {
        owner = ownerAndRepoMatch[1];
        repo = ownerAndRepoMatch[2];
        specifiedOwner = true;
        const utility = selectUtilityByName(projectContext, repo);
        if (utility) {
            utilityExistsOnProject = true;
            if (utility.configFile.owner != owner) {
                utilityCurrentOwnerDifferentFromProvided = true;
                const overrideOwner = await requestPermsToRun(
                    `utility ${repo} exists on the system with different owner "${utility.configFile.owner}" than the one you entered "${owner}" do you want to override it and use the owner you inputted`,
                );
                if (!overrideOwner) {
                    utilityCurrentOwnerDifferentFromProvided = false;
                    owner = utility.configFile.owner;
                }
            }
        }
    } else if (input.match(utilityNameValidationRegex)) {
        repo = input;

        const utility = selectUtilityByName(projectContext, repo);
        if (utility) {
            owner = utility.configFile.owner;
            if (!owner) {
                logger.fatal(
                    "utility ",
                    utility.configFile.name,
                    " has no specified owner.",
                    "please go to ",
                    path.join(utility.path, utilityConfigFileName),
                    "and add owner",
                );
            }
            utilityExistsOnProject = true;
        } else {
            const defaultOwner = getDefaultOwner();
            if (defaultOwner) {
                logger.log("using default owner in package.json:", defaultOwner);
                owner = defaultOwner;
            } else {
                owner = await readOwnerName({ doNotCheckIfOwnerExists: true });
            }
        }
    } else {
        logger.fatal(
            "invalid utility identifier, it should be in the form of <utility name> or <owner name>/<utility name>",
        );
        process.exit(1);
    }
    let utilityParentDirRelativePath: string;
    let utilityDirName: string;

    const utility = selectUtilityByName(projectContext, repo);

    const group = projectContext.packageFile.ki.grouping.find(g => repo.startsWith(g.prefix));
    if (utility) {
        utilityParentDirRelativePath = path.dirname(utility.path).slice(projectRoot.length);
        utilityDirName = path.basename(utility.path);
    } else {
        if (group) {
            if (!specifiedOwner) {
                owner = group.owner;
            }
            utilityParentDirRelativePath = group.installationDestination;
            if (group.removePrefixOnPull) {
                utilityDirName = repo.slice(group.prefix.length);
            } else {
                utilityDirName = repo;
            }
        } else {
            if (projectContext.packageFile.ki.defaultInstallationPath) {
                utilityParentDirRelativePath = projectContext.packageFile.ki.defaultInstallationPath;
            } else {
                utilityParentDirRelativePath = await readInstallationPath();
            }
            utilityDirName = repo;
        }
    }

    const installationFullPath = path.join(projectRoot, utilityParentDirRelativePath);

    if (!existsSync(installationFullPath)) {
        logger.fatal("Specified Installation path does not exist");
    }
    if (!statSync(installationFullPath).isDirectory()) {
        logger.fatal("Specified Installation path is not a directory");
    }

    const result = {
        owner,
        repo,
        utilityCurrentOwnerDifferentFromProvided,
        utilityExistsOnProject,
        utilityParentDirRelativePath,
        utilityDirName,
    };
    processedUtilityIdentifierInputs[input] = result;
    return result;
};

const readInstallationPath = async () => {
    const answer = await readAnswerTo("where do you want to install this utility.js");
    return answer;
};

export const collectDependenciesList = async (
    context: ProjectContext,
    dependencyList: {
        [utility: string]: DependencyDescription;
    },
) => {
    let deps: {
        [utility: string]: DependencyDescription;
    } = {};
    for (const dep in dependencyList) {
        deps[dep] = dependencyList[dep];

        const utility = selectUtilityByName(context, dep);
        if (utility) {
            deps = {
                ...deps,
                ...(await collectDependenciesList(
                    context,
                    Object.fromEntries(
                        Object.entries(utility.configFile.deps).filter(([name, subDep]) => {
                            return dep != name;
                        }),
                    ),
                )),
            };
        }
    }
    return deps;
};
