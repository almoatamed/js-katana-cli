import axios from "axios";
import fs from "fs";
import path from "path";
import url from "url";
import os from "os";
import { projectRoot, readJSON, storeJSON } from "./fs.js";
import { loadingSpinner, default as Logger, default as logger } from "./logger.js";
import { getOctokitClient } from "./octokit.js";
import { readAnswerTo } from "./prompt.js";
import { compareVersions, parseUtilityVersion, type Version } from "./utility.js";
import { sys } from "typescript";

export const orgNameToApiLink = (repoName: string) => `https://api.github.com/orgs/${repoName}`;
export const repoNameToApiLink = (repoName: string) => `https://api.github.com/repos/${repoName}`;

export const getTokenForRepo = async (repoName: string) => {
    let githubPersonalAccessToken = "";

    let tryCount = 0;

    while (true) {
        tryCount += 1;
        if (tryCount >= 3) {
            Logger.fatal("Maximum try count exceeded");
        }

        githubPersonalAccessToken = await readAnswerTo(
            "Please provide your classic personal github access token (you can create one at https://github.com/settings/tokens)\n\n Token:",
        );

        logger.log("Verifying Token...");

        try {
            await axios({
                method: "GET",
                url: repoNameToApiLink(repoName),
                headers: {
                    Authorization: `Bearer ${githubPersonalAccessToken}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });

            break;
        } catch (error: any) {
            if (error?.status == 401) {
                logger.error("Provided token have no access to this repository");
            }
            if (error?.status == 404) {
                logger.error("repository does not exist");
            }
            Logger.error("\nInvalid Github Access Token, Please Make sure that the token is valid.\n");
            continue;
        }
    }
    return githubPersonalAccessToken;
};

const cliCacheDir = path.join(os.homedir(), ".ki");
fs.mkdirSync(cliCacheDir, { recursive: true });
export const tokensJsonPath = path.join(cliCacheDir, "tokenCache.ignore.json");
export const relativeUtilsJsonPath = path.join(cliCacheDir, "relativeUtils.ignore.json");
export type TokensStore = {
    [projectRoot: string]: {
        token: string;
        orgName: string;
        utilsRelativePath?: string;
    };
};
if (!fs.existsSync(tokensJsonPath)) {
    fs.writeFileSync(tokensJsonPath, JSON.stringify({}));
}

if (!fs.existsSync(relativeUtilsJsonPath)) {
    fs.writeFileSync(relativeUtilsJsonPath, JSON.stringify({}));
}
export const getTokensJson = () => readJSON<TokensStore>(tokensJsonPath);

export type RelativeUtilsPathsJson = {
    [projectPath: string]:
        | {
              relativeUtilsPath: string;
          }
        | undefined;
};
export const getRelativeUtilsPathsJson = () => readJSON<RelativeUtilsPathsJson>(relativeUtilsJsonPath);
export const storeRelativeUtilsPath = async (path: string) => {
    const relativeUtils = await getRelativeUtilsPathsJson();

    const record = relativeUtils[projectRoot];

    if (record) {
        if (record.relativeUtilsPath != path) {
            record.relativeUtilsPath = path;
            await storeJSON(relativeUtilsJsonPath, {
                ...relativeUtils,
                [projectRoot]: record,
            });
        }
    } else {
        await storeJSON<RelativeUtilsPathsJson>(relativeUtilsJsonPath, {
            ...relativeUtils,
            [projectRoot]: {
                relativeUtilsPath: path,
            },
        });
    }
};

export async function checkIfRepositoryExistsInOrg(org: string, repo: string) {
    try {
        const octokit = await getOctokitClient(org);
        await octokit.repos.get({
            owner: org,
            repo: repo,
        });
        Logger.log(`Repository "${repo}" already exists in the organization "${org}".`);
        return true;
    } catch (error: any) {
        if (error.status === 404) {
            Logger.log(`Repository "${repo}" does not exist in the organization "${org}".`);
            return false;
        } else {
            Logger.fatal("Error checking repository:", error);
            return false;
        }
    }
}

export async function createRepositoryInOrg(org: string, repo: string, publicRepo: boolean) {
    logger.log("creating repository");
    const octokit = await getOctokitClient(org);
    const exists = await checkIfRepositoryExistsInOrg(org, repo);
    if (!exists) {
        loadingSpinner.text = "creating repo...";
        loadingSpinner.start();

        try {
            const response = await octokit.repos.createInOrg({
                org: org,
                name: repo,
                description: "This is a description of the new repository",
                visibility: publicRepo ? "public" : "private", // Set to true if you want to create a private repository
                autoInit: true,
            });
            loadingSpinner.stop();

            Logger.success("Repository created successfully in the organization:", response.data?.html_url);
        } catch (error) {
            Logger.fatal("Error creating repository:", error);
        }
        loadingSpinner.stop();
    }
}

export async function listBranches(owner: string, repo: string, kill = false) {
    const octokit = await getOctokitClient(owner);
    try {
        const { data: branches } = await octokit.repos.listBranches({
            owner,
            repo,
        });

        return branches;
    } catch (error: any) {
        if (error.status >= 500) {
            logger.fatal(`Error listing branches: ${error.message}`);
        }
        if (kill) {
            logger.fatal(`Error listing branches: ${error.message}`);
        }
        return [];
    }
}

const cachedVersions: {
    [utility: string]: Version[];
} = {};
export async function getUtilityVersions(owner: string, utility: string, useCache = false) {
    if (cachedVersions[utility] && useCache) {
        return cachedVersions[utility];
    }
    const branches = await listBranches(owner, utility);
    if (branches) {
        const versionsBranches = branches
            .map(b => parseUtilityVersion(b.name))
            .filter(v => !!v)
            .sort((a, b) => {
                const left = a as Version;
                const right = b as Version;

                if (compareVersions(left, ">", right)) {
                    return 1;
                } else if (compareVersions(left, "<", right)) {
                    return -1;
                }

                return 0;
            });
        cachedVersions[utility] = versionsBranches;
        return versionsBranches;
    }
    cachedVersions[utility] = [];
    return [];
}

export async function createBranchIfNotExists(owner: string, repo: string, branch: string, baseBranch = "main") {
    const octokit = await getOctokitClient(owner);
    try {
        // Check if the branch exists
        await octokit.repos.getBranch({
            owner,
            repo,
            branch,
        });
        logger.log(`Branch ${branch} already exists.`);
    } catch (error: any) {
        if (error.status === 404) {
            // Branch does not exist, create it from the base branch
            const { data: baseBranchData } = await octokit.repos.getBranch({
                owner,
                repo,
                branch: baseBranch,
            });

            await octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branch}`,
                sha: baseBranchData.commit.sha,
            });

            logger.log(`Branch ${branch} created from ${baseBranch}.`);
        } else {
            throw error;
        }
    }
}

// works
export async function deleteFileFromRepo(owner: string, repo: string, filePath: string, branch: string) {
    try {
        const octokit = await getOctokitClient(owner);
        const { data: file } = await octokit.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: branch,
        });

        await octokit.repos.deleteFile({
            owner,
            repo,
            path: filePath,
            message: `Delete ${filePath}`,
            sha: (file as any).sha,
            branch,
        });

        logger.log(`Deleted file: ${filePath}`);
    } catch (error) {
        logger.fatal(`Error deleting file ${filePath}:`, error);
    }
}

// works but no need for it
export async function listFilesInRepo(owner: string, repo: string, branch: string, repoPath = "") {
    try {
        const octokit = await getOctokitClient(owner);
        const { data: contents } = await octokit.repos.getContent({
            owner,
            repo,
            path: repoPath,
            ref: branch,
        });

        let files: string[] = [];

        for (const item of contents as any[]) {
            if (item.type === "file") {
                files.push(item.path);
            } else if (item.type === "dir") {
                files = files.concat(await listFilesInRepo(owner, repo, branch, item.path));
            }
        }

        return files;
    } catch (error: any) {
        if (error.status === 404) {
            return [];
        }
        throw error;
    }
}

// dont use
export async function uploadFileToRepo(
    owner: string,
    repo: string,
    fileContent: string,
    branch: string,
    repoPath: string,
) {
    const octokit = await getOctokitClient(owner);
    try {
        // Check if the file already exists in the repo
        const { data: existingFile } = await octokit.repos.getContent({
            owner,
            repo,
            path: repoPath,
            ref: branch,
        });
        logger.log("existing file sha", (existingFile as any).sha);
        // Update the existing file
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: repoPath,
            message: `Update ${repoPath} version ${branch}`,
            content: fileContent,
            sha: (existingFile as any).sha as string,
            branch,
        });

        logger.log(`Updated file: ${repoPath}`);
        return;
    } catch (error: any) {
        if (error.status === 404) {
            // File does not exist, create a new one
            try {
                await octokit.repos.createOrUpdateFileContents({
                    owner,

                    repo,
                    path: repoPath,
                    message: `Add ${repoPath}`,
                    content: fileContent,
                    branch,
                });
            } catch (error) {
                logger.fatal("reupload for new file error", error);
            }

            logger.log(`Created new file: ${repoPath}`);
        } else {
            logger.fatal(`Error processing file ${repoPath}:`, error);
        }
    }
}

export async function deleteBranchOnFailure(owner: string, repo: string, branch: string) {
    try {
        const octokit = await getOctokitClient(owner);
        await octokit.git.deleteRef({
            owner,
            repo,
            ref: `heads/${branch}`,
        });
        logger.log(`Branch ${branch} deleted successfully.`);
    } catch (error) {
        logger.fatal(`Failed to delete branch ${branch}:`, error);
    }
}

// dont use
export async function forceUploadFileToRepo(
    owner: string,
    repo: string,
    filePath: string,
    content: string,
    branch: string,
) {
    try {
        let sha;
        const octokit = await getOctokitClient(owner);
        try {
            // Try to get the existing file to retrieve its SHA
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: filePath,
            });
            sha = (data as any).sha as string;

            // If the file exists, delete it
            await octokit.repos.deleteFile({
                owner,
                repo,
                path: filePath,
                message: `Delete existing file before force uploading: ${branch}`,
                sha,
            });

            logger.log(`Deleted existing file: ${filePath}`);
        } catch (error: any) {
            if (error.status !== 404) {
                throw error; // Re-throw errors that aren't 404
            }
            // If the file doesn't exist, proceed to upload as new
            logger.log(`File ${filePath} does not exist, uploading as a new file.`);
        }

        // Upload the file (as a new file or after deleting the old one)
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: filePath,
            message: `${content} ${branch}`,
            content: Buffer.from(content).toString("base64"), // Convert content to base64
            branch,
        });
    } catch (error) {
        logger.error("Error force uploading file:", error);
    }
}

// works
export const getFileFromRepo = async (owner: string, repo: string, repoFilePath: string, branch: string) => {
    try {
        const octokit = await getOctokitClient(owner);
        const { data: existingFile } = await octokit.repos.getContent({
            owner,
            repo,
            path: repoFilePath,
            ref: branch,
        });

        return existingFile;
    } catch (error: any) {
        if (error.status == 404) {
            return null;
        } else {
            await deleteBranchOnFailure(owner, repo, branch);
            logger.fatal(
                "Error occurred while loading file\nparameters:",
                {
                    owner,
                    repoFilePath,
                    repo,
                    branch,
                },
                "\n",
                error,
            );
            return null;
        }
    }
};

export type SingleGithubFile = {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    htmlUrl: string;
    gitUrl: string;
    downloadUrl: string;
    type: string;
    content: string;
    encoding: string;
    Links: {
        self: string;
        git: string;
        html: string;
    };
};
