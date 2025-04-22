import { projectRoot } from "./fs.js";
import logger from "./logger.js";
import { createCacheWriteStream } from "./storage/cache.js";
import { getToken } from "./tokens.js";

const axios = (await import("axios")).default;
const fs = (await import("fs-extra")).default;
const path = (await import("path")).default;

import { pipeline } from "stream";
import { promisify } from "util";

const pipelineAsync = promisify(pipeline);

import extract from "extract-zip";

export async function downloadRepoAsZip({
    owner,
    repo,
    branch,
    relativeInstallationDirectory,
    dirName,
}: {
    owner: string;
    repo: string;
    branch: string;
    dirName: string;
    relativeInstallationDirectory: string;
}) {
    const url = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
    const token = await getToken(owner);
    const zipPath = path.join(projectRoot, relativeInstallationDirectory, `${repo}.zip`);

    // Download the ZIP file
    const response = await axios({
        url,
        method: "GET",
        responseType: "stream",
        headers: {
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });

    // Save the ZIP file using pipeline (manages stream ending properly)
    await pipelineAsync(response.data, fs.createWriteStream(zipPath));

    // Once the file is downloaded and saved, continue with unzipping
    logger.log("Writing downloaded file to cache...");

    const cacheWriter = createCacheWriteStream(`${repo}Branch${branch}.zip`);
    for await (const chunk of fs.createReadStream(zipPath)) {
        cacheWriter.write(chunk);
    }
    cacheWriter.close();
    logger.log("extracting zip file", zipPath);
    // Unzip the file

    await extract(zipPath, { dir: path.join(projectRoot, relativeInstallationDirectory) });

    logger.log("finished extracting zip file", zipPath);

    // Clean up and rename the unzipped directory
    const extractedZipDirFullPath = path.join(projectRoot, relativeInstallationDirectory, `${repo}-${branch}`);
    const destinationUtilityDirFullPath = path.join(projectRoot, relativeInstallationDirectory, dirName);
    logger.log("moving extraction to destination", extractedZipDirFullPath, destinationUtilityDirFullPath);
    fs.moveSync(extractedZipDirFullPath, destinationUtilityDirFullPath, { overwrite: true });

    // Optionally, remove the ZIP file after unzipping if no longer needed
    fs.rmSync(extractedZipDirFullPath, { recursive: true });
    fs.rmSync(zipPath, { recursive: true });
}

export const downloadUtility = async (
    owner: string,
    utilityName: string,
    version: string,
    utilityParentDirRelativePath: string,
    utilityDirName: string,
) => {
    try {
        const utilityFullPath = path.join(projectRoot, utilityParentDirRelativePath, utilityDirName);
        if (fs.existsSync(utilityFullPath)) {
            fs.rmSync(utilityFullPath, {
                recursive: true,
                force: true,
            });
        }
        await downloadRepoAsZip({
            owner,
            repo: utilityName,
            branch: version,
            relativeInstallationDirectory: utilityParentDirRelativePath,
            dirName: utilityDirName,
        });
    } catch (error) {
        logger.fatal("Failed to download utility.js", utilityName, error);
    }
};
