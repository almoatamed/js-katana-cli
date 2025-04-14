import { Octokit } from "@octokit/rest";
import logger from "./logger.js";;
import { getToken } from "./tokens.js";

const octokitClients: {
    [owner: string]: Octokit;
} = {};
export const getOctokitClient = async (owner: string): Promise<Octokit> => {
    if (octokitClients[owner]) {
        return octokitClients[owner];
    }
    const token = await getToken(owner);

    const client = new Octokit({
        auth: token,
        log: {
            info(message) {
                logger.log(message);
            },
            error(message) {
                if (message.match(/\b404\b/)) {
                    return;
                }
                logger.error(message);
            },
            debug(message) {
                console.debug(message);
            },
            warn(message) {
                logger.warning(message);
            },
        },
    });
    octokitClients[owner] = client;
    return client;
};
