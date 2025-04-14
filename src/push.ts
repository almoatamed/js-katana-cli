import { chunkArr } from "./array.js";
import { deleteBranchOnFailure, getFileFromRepo, getUtilityVersions, type SingleGithubFile } from "./github.js";
import logger from "./logger.js";;
import { CPU_COUNT } from "./os.js";
import { checkUtility, projectContext, type ProjectContext } from "./project.js";
import { getToken } from "./tokens.js";
import {
    collectDependenciesList,
    compareVersions,
    isUtilityNameValid,
    parseUtilityVersion,
    parseVersionOrExit,
    processUtilityIdentifierInput,
} from "./utility.js";

import { Octokit } from "@octokit/rest";
import { readFile } from "fs-extra";
import path from "path";
import { collectFilePathsIn } from "./fs.js";

export const uploadDirOcto = async (
    orgName: string,
    repoName: string,
    token: string,
    branch: string,
    directoryFullPath: string,
) => {
    // There are other ways to authenticate, check https://developer.github.com/v3/#authentication
    const octo = new Octokit({
        auth: token,
    });
    // For this, I was working on a organization repos, but it works for common repos also (replace org for owner)
    const ORGANIZATION = orgName;
    const REPO = repoName;
    logger.log("listing repos for org", ORGANIZATION);
    const repos = await octo.repos.listForOrg({
        org: ORGANIZATION,
        type: "all",
        perPage: 10e4,
    });
    logger.log(
        "looking for repo",
        repoName,
        "in",
        repos.data.map((repo: any) => repo.name).filter(r => r.startsWith("rest")),
    );
    if (!repos.data.map((repo: any) => repo.name).includes(REPO)) {
        logger.log("creating repo since its not found");
        await createRepo(octo, ORGANIZATION, REPO);
    }
    /**
     * my-local-folder has files on its root, and subdirectories with files
     */
    logger.log("uploading to repo");
    await uploadToRepo(octo, directoryFullPath, ORGANIZATION, REPO, branch);
};

const createRepo = async (octo: Octokit, org: string, name: string) => {
    await octo.repos.createInOrg({ org, name, autoInit: true });
};

const uploadToRepo = async (octo: Octokit, coursePath: string, org: string, repo: string, branch: string) => {
    // gets commit's AND its tree's SHA
    logger.log("getting current commit");
    const currentCommit = await getCurrentCommit(octo, org, repo);
    logger.log("collect file paths");
    const filesPaths = await collectFilePathsIn(coursePath);
    logger.log("creating blobs");
    const filesBlobs = await Promise.all(filesPaths.map(createBlobForFile(octo, org, repo)));
    logger.log("calculating relative paths");
    const pathsForBlobs = filesPaths.map(fullPath => path.relative(coursePath, fullPath));
    logger.log("creating tree");
    const newTree = await createNewTree(octo, org, repo, filesBlobs, pathsForBlobs, currentCommit.treeSha);
    logger.log("creating new commit");
    const commitMessage = `branch: ${branch}`;
    const newCommit = await createNewCommit(octo, org, repo, commitMessage, newTree.sha, currentCommit.commitSha);
    logger.log("setting branch to commit");

    await octo.git.createRef({
        owner: org,
        repo,
        ref: `refs/heads/${branch}`,
        sha: newCommit.sha,
    });
};

const getCurrentCommit = async (octo: Octokit, org: string, repo: string, branch: string = "main") => {
    const { data: refData } = await octo.git.getRef({
        owner: org,
        repo,
        ref: `heads/${branch}`,
    });
    const commitSha = refData.object.sha;
    const { data: commitData } = await octo.git.getCommit({
        owner: org,
        repo,
        commit_sha: commitSha,
    });
    return {
        commitSha,
        treeSha: commitData.tree.sha,
    };
};

// Notice that readFile's utf8 is typed differently from Github's utf-8
const getFileAsUTF8 = (filePath: string) => readFile(filePath, "utf8");

const createBlobForFile = (octo: Octokit, org: string, repo: string) => async (filePath: string) => {
    const content = await getFileAsUTF8(filePath);
    const blobData = await octo.git.createBlob({
        owner: org,
        repo,
        content,
        encoding: "utf-8",
    });
    return blobData.data;
};

const createNewTree = async (
    octo: Octokit,
    owner: string,
    repo: string,
    blobs: any[],
    paths: string[],
    parentTreeSha: string,
) => {
    // My custom config. Could be taken as parameters
    const tree = blobs.map(({ sha }, index) => ({
        path: paths[index],
        mode: `100644`,
        type: `blob`,
        sha,
    })) as any[];
    const { data } = await octo.git.createTree({
        owner,
        repo,
        tree,
        baseTree: parentTreeSha,
    });
    return data;
};

const createNewCommit = async (
    octo: Octokit,
    org: string,
    repo: string,
    message: string,
    currentTreeSha: string,
    currentCommitSha: string,
) =>
    (
        await octo.git.createCommit({
            owner: org,
            repo,
            message,
            tree: currentTreeSha,
            parents: [currentCommitSha],
        })
    ).data;

const setBranchToCommit = async (
    octo: Octokit,
    org: string,
    repo: string,
    branch: string = `main`,
    commitSha: string,
) =>
    await octo.git.updateRef({
        owner: org,
        repo,
        ref: `refs/heads/${branch}`,
        sha: commitSha,
        force: true,
    });

export const pushUtility = async ({
    mainDep,
    context,
    inputUtilityName,
}: {
    context: ProjectContext;
    inputUtilityName: string;
    mainDep: boolean;
}) => {
    /**
     * - make sure utility actually exists --
     * - validate version number --
     * - validate utility name --
     * - check if remote repo exists
     *   - if so --
     *     - create the remote repo and --
     *     - push content --
     *   - if not --
     *     - pull remote utility branches --
     *     - get the latest branch number --
     *       - sort branches --
     *       - get latest --
     *
     *     - compare versions --
     *       - if current greater than remote push baby push --
     *       - if current equals the remote --
     *         - if hash's are equal prompt "up to date" --
     *         - if hash's are not equal prompt "did you update the version code? if not update the version code and try again." --
     *         - exit --
     *       - if current less than remote prompt that you are not up to date remote version is greater --
     *
     */

    const validName = isUtilityNameValid(inputUtilityName);
    if (!validName) {
        logger.fatal("Provided Utility Name is not valid", inputUtilityName);
    }

    logger.log("processing identifier");
    const {
        owner,
        repo,
        utilityCurrentOwnerDifferentFromProvided,
        utilityExistsOnProject,
        utilityParentDirRelativePath,
    } = await processUtilityIdentifierInput(inputUtilityName);

    const utilityName = repo;

    logger.log("listing all utilities");
    const utils = context.utilities;

    logger.log("looking for utility.js");
    const util = utils.find(u => u.configFile.name == utilityName);

    if (!util) {
        logger.fatal('utility named "', utilityName, '" is not found');
        return;
    }

    logger.log("updating utility hash");
    const hash = await checkUtility(context, util.configFile.name);
    util.configFile.hash = hash.currentHash;

    if (util.configFile.private) {
        logger.warning(`this utility ${utilityName} is private it cannot be uploaded`);
        return;
    }

    if (!parseUtilityVersion(util.configFile.version)) {
        logger.fatal(`${util.configFile.version} is not a valid version`);
        return;
    }

    if (!isUtilityNameValid(util.configFile.name)) {
        logger.fatal(`"${util.configFile.name}" is not a valid name.`);
        return;
    }

    const token = await getToken(owner);

    logger.log("collecting utility versions");
    let utilityVersions = await getUtilityVersions(owner, util.configFile.name);

    const lastVersion = utilityVersions.at(-1);

    const push = async () => {
        logger.log("pushing...");
        try {
            // upload the file as a block to a new branch
            await uploadDirOcto(owner, util.configFile.name, token, util.configFile.version, util.path);
        } catch (error) {
            console.error(error);
            await deleteBranchOnFailure(owner, util.configFile.name, util.configFile.version);
        }
    };

    if (lastVersion) {
        const utilVersion = parseVersionOrExit(util.configFile.version);

        if (compareVersions(lastVersion, "<", utilVersion)) {
            await push();
        } else if (compareVersions(lastVersion, ">", utilVersion)) {
            logger.log(
                `utility ${utilityName} remote version (${lastVersion.version}) is greater than the local version ${util.configFile.version}`,
            );
        } else {
            const lastRemoteConfigFile = (await getFileFromRepo(
                owner,
                util.configFile.name,
                "utils.json",
                lastVersion.version,
            )) as SingleGithubFile | null;
            if (!lastRemoteConfigFile) {
                logger.error("Error loading utility config file from remote source for utility (file not found)", {
                    utility: lastVersion.version,
                    name: util.configFile.name,
                });
                await push();
            } else {
                const remoteUtilConfig: typeof util.configFile = JSON.parse(
                    Buffer.from(lastRemoteConfigFile.content, "base64").toString("utf-8"),
                );

                if (remoteUtilConfig.hash != util.configFile.hash) {
                    logger.warning(
                        `utility: ${util.configFile.name} ,` +
                            "remote content last version equalt local, but the content is different are you sure you updated the version?",
                    );
                } else {
                    logger.success(`utility ${util.configFile.name} is up to date: ${util.configFile.version}`);
                }
            }
        }
    } else {
        await push();
    }

    if (mainDep) {
        projectContext.packageFile.verde.dependencies[repo] = {
            owner: owner,
            repo: repo,
            updatePolicy: projectContext.packageFile.verde.dependencies[repo]?.updatePolicy || "minor",
            version: util.configFile.version as any,
        };
    }
};

export const pushAllUtilities = async (context: ProjectContext) => {
    const chunked = chunkArr(context.utilities, CPU_COUNT * 2);

    const allDependencies = await collectDependenciesList(
        projectContext,
        projectContext.packageFile.verde.dependencies,
    );

    const excessUtilities = projectContext.utilities.filter(u => {
        return !allDependencies[u.configFile.name];
    });

    for (const chunk of chunked) {
        await Promise.all(
            chunk.map(u =>
                pushUtility({
                    context: projectContext,
                    inputUtilityName: u.configFile.name,
                    mainDep:
                        !!projectContext.packageFile.verde.dependencies[u.configFile.name] ||
                        !!excessUtilities.find(u => u.configFile.name == u.configFile.name),
                }),
            ),
        );
    }
};
