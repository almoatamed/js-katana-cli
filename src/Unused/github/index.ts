import { Octokit } from "@octokit/rest";
import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import fs from "fs";
import path from "path";
import { commandOnSystem, runCommand } from "../../exec.js";
import { collectFilePathsIn } from "../../fs.js";
import {
    deleteFileFromRepo,
    deleteBranchOnFailure,
    forceUploadFileToRepo,
    getTokenForRepo,
    listFilesInRepo,
    repoNameToApiLink,
} from "../../github.js";
import logger, { loadingSpinner } from "../../logger.js";

// Helper to read directory contents recursively
export async function readDirectoryRecursive(dirPath: string) {
    const files = [] as string[];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...(await readDirectoryRecursive(fullPath)));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

// Create a new branch
async function createBranch(org: string, repo: string, branch: string, baseBranch: string, token: string) {
    const url = `https://api.github.com/repos/${org}/${repo}/git/refs`;
    const baseBranchRef = await axios.get(`${url}/heads/${baseBranch}`, {
        headers: { Authorization: `token ${token}` },
    });

    const response = await axios.post(
        url,
        {
            ref: `refs/heads/${branch}`,
            sha: baseBranchRef.data.object.sha,
        },
        { headers: { Authorization: `token ${token}` } },
    );

    return response.data.object.sha;
}

// Create a blob for each file
async function createBlob(org: string, repo: string, filePath: string, token: string) {
    try {
        const content = fs.readFileSync(filePath);
        const base64Content = content.toString("base64");

        const url = `https://api.github.com/repos/${org}/${repo}/git/blobs`;
        const response = await axios.post(
            url,
            {
                content: base64Content,
                encoding: "base64",
            },
            { headers: { Authorization: `token ${token}` } },
        );

        return response.data.sha;
    } catch (error: any) {
        logger.log("blob error", error.message);
        throw error;
    }
}

// Create a tree object
async function createTree(org: string, repo: string, files: string[], directoryPath: string, token: string) {
    const tree = await Promise.all(
        files.map(async filePath => {
            const fileSha = await createBlob(org, repo, filePath, token);
            const relativePath = path.relative(directoryPath, filePath).replace(/\\/g, "/");
            logger.log("createdBlob blob", {
                relativePath,
                fileSha,
            });
            return {
                path: relativePath,
                mode: "100644",
                type: "blob",
                sha: fileSha,
            };
        }),
    );

    const url = `https://api.github.com/repos/${org}/${repo}/git/trees`;
    const response = await axios.post(
        url,
        {
            tree,
        },
        { headers: { Authorization: `token ${token}` } },
    );

    return response.data.sha;
}

// Check if the repository is empty
async function isRepoEmpty(org: string, repo: string, token: string) {
    try {
        await axios.get(`https://api.github.com/repos/${org}/${repo}/git/refs/heads/main`, {
            headers: { Authorization: `token ${token}` },
        });
        return false;
    } catch (error: any) {
        if (error.response && (error.response.status === 404 || error.response.status === 409)) {
            return true; // No branches found, repository is empty
        }
        throw error;
    }
}

async function setupEmptyRepo(orgName: string, repoName: string, branch: string, token: string) {
    async function initializeRepo(orgName: string, repoName: string, branchName: string, token: string) {
        const octokit = new Octokit({ auth: token });

        // The file to add to the initial commit
        const filePath = "README.md";
        const fileContent = "# Initial Commit\nThis is the initial commit.";

        // Convert content to Base64
        const contentEncoded = Buffer.from(fileContent).toString("base64");

        try {
            // Step 1: Create a blob with the file content
            const { data: blobData } = await octokit.git.createBlob({
                owner: orgName,
                repo: repoName,
                content: contentEncoded,
                encoding: "base64",
            });

            logger.log(`Blob created with SHA: ${blobData.sha}`);

            // Step 2: Create a tree containing the blob
            const { data: treeData } = await octokit.git.createTree({
                owner: orgName,
                repo: repoName,
                tree: [
                    {
                        path: path.basename(filePath),
                        mode: "100644",
                        type: "blob",
                        sha: blobData.sha,
                    },
                ],
            });

            logger.log(`Tree created with SHA: ${treeData.sha}`);

            // Step 3: Create a commit with the tree
            const { data: commitData } = await octokit.git.createCommit({
                owner: orgName,
                repo: repoName,
                message: "Initial commit",
                tree: treeData.sha,
                parents: [], // No parent since it's the initial commit
            });

            logger.log(`Commit created with SHA: ${commitData.sha}`);

            // Step 4: Create the branch reference pointing to the new commit
            await octokit.git.createRef({
                owner: orgName,
                repo: repoName,
                ref: `refs/heads/${branchName}`,
                sha: commitData.sha,
            });

            logger.log(`Branch ${branchName} created with initial commit.`);
        } catch (error: any) {
            throw error;
        }
    }
    await initializeRepo(orgName, repoName, branch, token);
}

// Create a commit object
async function createCommit(
    org: string,
    repo: string,
    treeSha: string | undefined,
    parentSha: string | undefined,
    commitMessage: string,
    token: string,
) {
    const url = `https://api.github.com/repos/${org}/${repo}/git/commits`;
    const data = {
        message: commitMessage,
        tree: treeSha,
    } as any;

    if (parentSha) {
        data.parents = [parentSha];
    }

    const response = await axios.post(url, data, { headers: { Authorization: `token ${token}` } });

    return response.data.sha;
}

// Update branch to point to the new commit
async function updateBranch(org: string, repo: string, branch: string, commitSha: string, token: string) {
    const url = `https://api.github.com/repos/${org}/${repo}/git/refs/heads/${branch}`;
    await axios.patch(url, { sha: commitSha, force: true }, { headers: { Authorization: `token ${token}` } });
}
async function createBranchForInitialPush(
    org: string,
    repo: string,
    branch: string,
    commitSha: string,
    token: string,
) {
    const url = `https://api.github.com/repos/${org}/${repo}/git/refs`;
    const response = await axios.post(
        url,
        {
            ref: `refs/heads/${branch}`,
            sha: commitSha,
        },
        { headers: { Authorization: `token ${token}` } },
    );

    return response.data.object.sha;
}
// Main function to upload directory as a single commit
export async function uploadDirectory(
    org: string,
    repo: string,
    branch: string,
    baseBranch: string | undefined,
    directoryPath: string,
    token: string,
) {
    try {
        const repoEmpty = await isRepoEmpty(org, repo, token);
        if (repoEmpty) {
            await setupEmptyRepo(org, repo, branch, token);
        }
        logger.log("repos is empty", repoEmpty);
        let baseSha: string | undefined = undefined;
        if (!repoEmpty && baseBranch) {
            // If the repo is not empty, create a branch or reset it
            baseSha = await createBranch(org, repo, branch, baseBranch, token);
        }
        // Get all files in the directory
        const files = await readDirectoryRecursive(directoryPath);

        // Create a tree object with all files
        const treeSha = await createTree(org, repo, files, directoryPath, token);

        // Create a commit that points to the tree
        const commitSha = await createCommit(
            org,
            repo,
            treeSha,
            baseSha,
            `Add ${path.basename(directoryPath)} contents`,
            token,
        );
        if (repoEmpty) {
            logger.log("repo is empty");
            // If the repository is empty, create the initial branch
            await createBranchForInitialPush(org, repo, branch, commitSha, token);
        } else {
            // If the repository is not empty, force update the branch to point to the new commit
            await updateBranch(org, repo, branch, commitSha, token);
        }

        logger.log("Directory uploaded successfully as a single commit");
    } catch (error: any) {
        logger.error("Error during upload:", error.message, JSON.stringify(error, null, 4));
        throw new Error("Upload failed");
    }
}

export async function uploadDirectoryToRepo(
    owner: string,
    repo: string,
    localDir: string,
    branch: string,
    repoPath = "",
) {
    try {
        const filesToUpload: string[] = [];

        const files = await collectFilePathsIn(localDir);
        logger.log("going to upload files", files);
        let promises = [] as any[];
        for (const file of files) {
            const repoItemPath = file.slice(localDir.length + 1).replace(/\\/g, "/"); // Ensure repo path is Unix-style
            logger.log("uploading file", {
                file,
                localDir,
                owner,
                repo,
                repoItemPath,
            });
            const fileContent = fs.readFileSync(file, { encoding: "base64" });
            const promise = await forceUploadFileToRepo(owner, repo, file, fileContent, branch);
            promises.push(promise);
            if (promises.length > 6) {
                await Promise.all(promises.splice(0));
            }
        }

        const existingFiles = await listFilesInRepo(owner, repo, branch, repoPath);
        const filesToDelete = existingFiles.filter(file => !filesToUpload.includes(file));
        logger.log("files to delete", filesToDelete);
        const deletePromises = filesToDelete.map(file => deleteFileFromRepo(owner, repo, file, branch));
        await Promise.all(deletePromises);
    } catch (error) {
        await deleteBranchOnFailure(owner, repo, branch);
        logger.fatal("failed ot upload directory", error);
    }
}

export const getFilesWithGithubApi = async (fullRepoName: string, branch: string, newProjectPath: string) => {
    if (!commandOnSystem("tar")) {
        logger.fatal('please install "tar" extraction command line');
    }
    const githubPersonalAccessToken = await getTokenForRepo(fullRepoName);
    await downloadRepoFiles(fullRepoName, branch, githubPersonalAccessToken, newProjectPath);
};

const downloadRepoFiles = async (
    repoName: string,
    branch: string,
    githubPersonalAccessToken: string,
    newProjectPath: string,
) => {
    const tarExist = commandOnSystem("tar");
    if (!tarExist) {
        logger.fatal("Please install `tar` command line on your os to continue");
    }

    loadingSpinner.start();

    loadingSpinner.text = `Downloading: 0.00%`;

    const requestBody: AxiosRequestConfig<any> = {
        method: "GET",
        url: `${repoNameToApiLink(repoName)}/tarball/${branch}`,
        headers: {
            Authorization: `Bearer ${githubPersonalAccessToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
        responseType: "stream",
    };
    try {
        const { data, headers } = await axios(requestBody);

        return new Promise((resolve, reject) => {
            const newProjectFullPath = path.resolve(newProjectPath);
            const tarFullPath = path.resolve(path.join("./", "emptyTemplate.tar.gz"));
            const writer = fs.createWriteStream(tarFullPath);
            const contentLength: number | undefined = Number(headers["Content-Length"]) || undefined;
            let downloadedLength = 0;

            data.on("data", (chunk: any) => {
                if (contentLength) {
                    downloadedLength += chunk.length || 0;
                    loadingSpinner.text = `Downloading: ${((downloadedLength / contentLength) * 100).toFixed(2)}\%`;
                } else {
                    downloadedLength += chunk.length || 0;
                    loadingSpinner.text = `Downloading: ${(downloadedLength / 1000).toFixed(2)}kb`;
                }
            });

            data.pipe(writer);

            let error: any = null;

            writer.on("error", err => {
                error = err;
                writer.close();
                logger.error(error.message);

                reject(false);
            });

            writer.on("close", () => {
                if (!error) {
                    loadingSpinner.stop();
                    runCommand(`tar -xf ${tarFullPath} -C ${newProjectFullPath}`, {
                        stdio: "inherit",
                        encoding: "utf-8",
                    });

                    runCommand(`rm -rf ${tarFullPath}`, {
                        stdio: "inherit",
                        encoding: "utf-8",
                    });

                    const extractionPath = path.join(
                        newProjectFullPath,
                        Buffer.from(
                            runCommand(`ls`, {
                                encoding: "utf-8",
                                cwd: newProjectFullPath,
                            }),
                        )
                            .toString("utf-8")
                            .trim(),
                    );
                    runCommand(`mv ${extractionPath}/* ./.`, {
                        encoding: "utf-8",
                        cwd: newProjectFullPath,
                    });

                    runCommand(`mv ${path.join(extractionPath, "/.vscode")} .`, {
                        encoding: "utf-8",
                        cwd: newProjectFullPath,
                    });

                    runCommand(`rm -rf ${extractionPath}`, {
                        encoding: "utf-8",
                        cwd: newProjectFullPath,
                    });
                    resolve(true);
                }
            });
        });
    } catch (error: any) {
        logger.error("status", error?.response?.status, "Message", error?.message, "name", error?.name);
        logger.fatal("Error: Something went wrong");
    }
};
