import enq from "enquirer";
import { loadingSpinner } from "./logger.js";;
import { lockMethod } from "./sync.js";

const spinWrapper = async <T>(cp: (...args: any[]) => T): Promise<T> => {
    if (loadingSpinner.isSpinning) {
        loadingSpinner.stop();
        try {
            const res = await cp();
            loadingSpinner.start();
            return res;
        } catch (error) {
            loadingSpinner.start();
            throw error;
        }
    }
    return cp();
};
export const readAnswerTo = lockMethod(
    async (question: string, opts?: { type: "input" | "password" }) => {
        return await spinWrapper(async () => {
            const type = opts?.type || "input";
            const { input }: { input: string } = await enq.prompt({
                type,
                name: "input",
                message: question,
                required: true,
            });

            return input;
        });
    },
    { lockName: "readAnswerTo" },
);

export const readPrompt = lockMethod(
    async (question: string, choices: string[]) => {
        return spinWrapper(async () => {
            const { input }: { input: string } = await enq.prompt({
                type: "select",
                name: "input",
                choices,
                message: question,
            });

            return input;
        });
    },
    {
        lockName: "readPrompt",
    },
);

export const requestPermsToRunWithCb = lockMethod(
    async (msg: string, cb: () => Promise<void> | void) => {
        return await spinWrapper(async () => {
            const answer = await readPrompt(msg, ["yes", "no"]);

            if (answer === "yes") {
                await cb();
            }
        });
    },
    {
        lockName: "requestPermsToRunWithCb",
    },
);

export const requestPermsToRun = lockMethod(
    async (msg: string) => {
        return spinWrapper(async () => {
            const answer = await readPrompt(msg, ["yes", "no"]);

            if (answer === "yes") {
                return true;
            }
            return false;
        });
    },
    { lockName: "requestPermsToRun" },
);
