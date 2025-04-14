import axios from "axios";
import { orgNameToApiLink } from "./github.js";
import logger, { loadingSpinner } from "./logger.js";
import { readAnswerTo, requestPermsToRun } from "./prompt.js";
import { encryptAndSaveFileToStorage, isStoredAsEncrypted, retrieveEncryptedFileFromStorage } from "./storage/index.js";
import { lockMethod } from "./sync.js";

const tokensCacheFileName = "tokens.json";
let password: null | string = null;
const readTokensPassword = lockMethod(
    async () => {
        if (password) {
            return password;
        }
        password = (await readAnswerTo("please enter password for your tokens cache"));
        return password!;
    },
    {
        lockName: "readTokensPassword",
    },
);

const createTokensCacheFileIfItDoesNotExist = async () => {
    const password = await readTokensPassword();
    if (!(await isStoredAsEncrypted(tokensCacheFileName))) {
        return encryptAndSaveFileToStorage(tokensCacheFileName, JSON.stringify({}, null, 4), password);
    }
};

const getStoredTokens = async () => {
    await createTokensCacheFileIfItDoesNotExist();
    const content = await retrieveEncryptedFileFromStorage(tokensCacheFileName, await readTokensPassword());
    if (content === null) {
        logger.fatal("Provided password is not connect, please reset cache if it is necessary");
        return {};
    }
    const tokensMap: {
        [owner: string]: string; // token
    } = JSON.parse(content);
    return tokensMap;
};

const getTokenFromStorage = async (owner: string) => {
    const storedTokens = await getStoredTokens();
    return storedTokens[owner] || null;
};

const storeTokenInStorage = async (owner: string, token: string) => {
    const storedTokens = await getStoredTokens();
    if (storedTokens[owner]) {
        const override = await requestPermsToRun("There is a matching record, do you want to override existing token?");
        if (!override) {
            return;
        }
    }
    await encryptAndSaveFileToStorage(
        tokensCacheFileName,
        JSON.stringify({
            ...storedTokens,
            [owner]: token,
        }),
        await readTokensPassword(),
    );
};

export const getTokenForOrg = async (orgName: string) => {
    let githubPersonalAccessToken = "";

    let tryCount = 0;

    while (true) {
        tryCount += 1;
        if (tryCount > 3) {
            logger.fatal("Maximum try count exceeded");
        }

        githubPersonalAccessToken = await readAnswerTo(
            "Please provide your classic personal github access token (you can create one at https://github.com/settings/tokens)\n\n Token:",
        );

        loadingSpinner.text = "Verifying Token for owner: " + orgName + "...";
        loadingSpinner.start();

        try {
            await axios({
                method: "GET",
                url: orgNameToApiLink(orgName),
                headers: {
                    Authorization: `Bearer ${githubPersonalAccessToken}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });
            loadingSpinner.stop();

            break;
        } catch (error: any) {
            if (error?.status == 401) {
                logger.error("Provided token have no access to this organization");
            }
            if (error?.status == 404) {
                logger.fatal("organization does not exist");
            }
            logger.error("\nInvalid Github Access Token, Please Make sure that the token is valid.\n", error);
            loadingSpinner.stop();
            continue;
        }
    }
    return githubPersonalAccessToken;
};

let cachedRecord: {
    [owner: string]: string; // token
} = {};
export const getToken = lockMethod(
    async (owner: string) => {
        if (cachedRecord[owner]) {
            return cachedRecord[owner];
        }

        const storedToken = await getTokenFromStorage(owner);

        const useGlobalToken =
            !!storedToken &&
            (await requestPermsToRun("There is a global encrypted token stored, do you wish to use it?"));

        if (useGlobalToken) {
            cachedRecord[owner] = storedToken;
            return storedToken;
        }

        const token = await getTokenForOrg(owner);
        if (await requestPermsToRun("would you like to store token and organization name")) {
            await storeTokenInStorage(owner, token);
        }
        cachedRecord[owner] = token;

        return token;
    },
    {
        lockName: "getToken",
    },
);
