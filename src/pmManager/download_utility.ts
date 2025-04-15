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
    relative_installation_directory,
    dir_name,
}: {
    owner: string;
    repo: string;
    branch: string;
    dir_name: string;
    relative_installation_directory: string;
}) {
    const url = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
    const token = await getToken(owner);
    const zipPath = path.join(projectRoot, relative_installation_directory, `${repo}.zip`);

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
    const project_root = projectRoot;
    logger.log("Writing downloaded file to cache...");

    const cacheWriter = createCacheWriteStream(`${repo}_branch_${branch}.zip`);
    for await (const chunk of fs.createReadStream(zipPath)) {
        cacheWriter.write(chunk);
    }
    cacheWriter.close();
    logger.log("extracting zip file", zipPath);
    // Unzip the file

    await extract(zipPath, { dir: path.join(projectRoot, relative_installation_directory) });

    logger.log("finished extracting zip file", zipPath);

    // Clean up and rename the unzipped directory
    const extractedZipDirFullPath = path.join(project_root, relative_installation_directory, `${repo}-${branch}`);
    const destinationUtilityDirFullPath = path.join(projectRoot, relative_installation_directory, dir_name);
    logger.log("moving extraction to destination", extractedZipDirFullPath, destinationUtilityDirFullPath);
    fs.moveSync(extractedZipDirFullPath, destinationUtilityDirFullPath, { overwrite: true });

    // Optionally, remove the ZIP file after unzipping if no longer needed
    fs.rmSync(extractedZipDirFullPath, { recursive: true });
    fs.rmSync(zipPath, { recursive: true });
}

export const download_utility = async (
    owner: string,
    utility_name: string,
    version: string,
    utility_parent_dir_relative_path: string,
    utility_dir_name: string,
) => {
    try {
        const utility_full_path = path.join(projectRoot, utility_parent_dir_relative_path, utility_dir_name);
        if (fs.existsSync(utility_full_path)) {
            fs.rmSync(utility_full_path, {
                recursive: true,
                force: true,
            });
        }
        await downloadRepoAsZip({
            owner,
            repo: utility_name,
            branch: version,
            relative_installation_directory: utility_parent_dir_relative_path,
            dir_name: utility_dir_name,
        });
    } catch (error) {
        logger.fatal("Failed to download utility.js", utility_name, error);
    }
};
