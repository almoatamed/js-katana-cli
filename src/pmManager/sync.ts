import AsyncLock from "async-lock";

const lock = new AsyncLock({});

type ArgumentsType<T extends (...args: any) => any> = T extends (...args: infer R) => any ? R : never;

export const lockMethod = function <T extends (...args: any[]) => any>(
    method: T,
    {
        lockName,
    }: {
        lockName: string;
        lockTimeout?: number;
    },
): (...args: ArgumentsType<T>) => Promise<ReturnType<T>> {
    const originalMethod = method;
    return async function (...args: any[]) {
        return new Promise(async (resolve, reject) => {
            try {
                await lock.acquire(lockName, async () => {
                    try {
                        return resolve(await originalMethod(...args));
                    } catch (error) {
                        reject(error);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    };
};
