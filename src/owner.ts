import axios from "axios";
import {} from "./github.js";
import logger from "./logger.js";;
import { projectContext } from "./project.js";
import { readAnswerTo } from "./prompt.js";
import { orgNameValidationRegex } from "./regex.js";

export const checkIfOwnerExist = async (owner: string) => {
    try {
        await axios.get(`https://github.com/${owner}`);
    } catch (error: any) {
        if (error.status == 404) {
            return false;
        }
        logger.fatal("Error Occurred while trying to check if an owner exists", error);
    }
    return true;
};

export const validateOwnerNameOrExit = async (owner: string) => {
    if (!owner.match(orgNameValidationRegex)) {
        logger.fatal("Invalid Owner name");
        return "";
    }
};

export const checkIfOwnerExistsOrExit = async (owner: string) => {
    const exists = await checkIfOwnerExist(owner);
    if (!exists) {
        logger.fatal("owner does not exist");
    }
};
export const validateOwner = async (owner: string) => {
    await validateOwnerNameOrExit(owner);
    await checkIfOwnerExistsOrExit(owner);
};

export const readOwnerName = async (options?: { doNotCheckIfOwnerExists: boolean }) => {
    const answer = await readAnswerTo("Please Enter Organization/Owner Name (who owns the utility)");
    if (options?.doNotCheckIfOwnerExists) {
        await validateOwnerNameOrExit(answer);
        return answer;
    }
    await validateOwner(answer);
    return answer;
};

export const getDefaultOwner = () => {
    return projectContext.packageFile.verde.defaultOrg;
};
