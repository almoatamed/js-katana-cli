import path from "path";
import { commandOnSystem, runCommand } from "./exec.js";

export const isGitInstalledOnSystem = () => commandOnSystem("git");

const repoNameToCliLink = (repoName: string) => `https://github.com/${repoName}`;

export const isRepoReachableByCli = (repositoryName: string) => {
    try {
        runCommand(`git ls-remote ${repoNameToCliLink(repositoryName)}`);
        return true;
    } catch (_) {
        return false;
    }
};

export const getFilesWithGitCli = async (repoName: string, branch: string, newProjectPath: string) => {
    const fullNewProjectPath = path.resolve(newProjectPath);

    runCommand(`git clone --depth=1 -b ${branch} ${repoNameToCliLink(repoName)} ${newProjectPath}`, {
        stdio: "inherit",
        encoding: "utf-8",
    });
    runCommand(`rm -rf ${fullNewProjectPath}/.git `);
    return;
};
