#!/usr/bin/env node
import "dotenv";
const axios = (await import("axios")).default;
const unzipper = await import("unzipper");
import { program } from "commander";

import fs from "fs";
import path from "path";
import url from "url";

const __process = process;

const currentDir = (() => {
    try {
        return url.fileURLToPath(new url.URL("./.", import.meta.url));
    } catch (error) {
        return __dirname;
    }
})();
const parentProjectPath = path.join(currentDir, "../.");
const findProjectRoot = async (currentDir = parentProjectPath): Promise<string> => {
    const packagePath = path.join(currentDir, "package.json");

    if (fs.existsSync(packagePath)) {
        return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
        console.error("No package.json file found in any parent directory.");
        __process.exit(1);
    }

    return findProjectRoot(parentDir);
};
const currentPackagePath = await findProjectRoot();
const mainProjectPath = await findProjectRoot(path.resolve("."));

const currentPackageDotJSONContent = fs.readFileSync(path.join(currentPackagePath, "./package.json"), "utf-8");
const currentPackageDotJSON: typeof import("../../package.json") = JSON.parse(currentPackageDotJSONContent);

const packageDotJsonFullPath = path.join(mainProjectPath, "./package.json");
const packageDotJson: {
    [key: string]: any;
    apiTypes?: {
        apiPrefix: string;
        assetsPrefix: string;
        baseUrl: string;
        scope?: string;
    };
} = JSON.parse(fs.readFileSync(packageDotJsonFullPath, "utf-8"));

if (!packageDotJson["apiTypes"]) {
    console.error(
        "Please provide api types loading config in package.json before loading api types as in ",
        `
{
    "apiPrefix": string;
    "assetsPrefix": string;
    "baseUrl": string; 
    "scope"?: string;
}

For example 

// package.json content 
{
    ...
    "apiTypes": {
        "apiPrefix": "server/api",
        "assetsPrefix": "server/assets",
        "baseUrl": "http://localhost:3000", // your js-katana server host and port
        "scope": "dashboard",
    }
    ...
}

you can drop the scope if you do not want scoped access 
`
    );
    __process.exit(1);
}

const apiTypesFilePath = path.join(currentPackagePath, "apiTypes.d.ts");

program
    .name("Js-katana Api Types Loader")
    .description("set of commands to control autocomplete and type system on API of axios.")
    .version(currentPackageDotJSON.version);

const trimSlashes = (s: string) => {
    return s.replace(/\/$/, "").replace(/^\//, "");
};
const join = (...paths: string[]) => {
    return paths.map(s => trimSlashes(s)).join("/");
};

const extractApiError = (error: any) => {
    error.message =
        error.response?.data?.err?.msg ||
        error.response?.data?.err?.message ||
        error.response?.data?.error?.msg ||
        error.response?.data?.error?.message ||
        error.response?.data?.error?.name ||
        error.response?.data?.msg ||
        error.response?.data?.message ||
        error.response?.data?.name ||
        error.msg ||
        error.message ||
        error.name;
};

interface DynamicAuthorities {
    values?: Array<string | number>;
    requestLookupCb?: string;
    dynamicAuthorityKey?: string;
}

interface Authority {
    keyName: string;
    dynamicAuthorities?: { [key: string]: DynamicAuthorities };
}

type ArrayAuthorities = Array<Authority>;

interface AuthorizationOption {
    or?: ArrayAuthorities | Array<string>;
    and?: ArrayAuthorities | Array<string>;
}

export type ChannelsDescriptionProps = {
    fileUrl: string;
    path?: string;
    fullChannelPath?: string;
    requiresAuth?: boolean;
    requiresAuthorities?: {
        allow?: AuthorizationOption;
        reject?: AuthorizationOption;
    };
    descriptionText?: string;
    requestBodyTypeString?: string;
    additionalTypes?: string;
    responseBodyTypeString?: string;
    descriptionFileFullPath?: string;
};

export type DescriptionProps = {
    fileUrl: string;
    path?: string;
    fullRoutePath?: string;
    requiresAuth?: boolean;
    requiresAuthorities?: {
        allow?: AuthorizationOption;
        reject?: AuthorizationOption;
    };
    descriptionText?: string;
    method: "all" | "get" | "put" | "post" | "delete";
    requestParamsTypeString?: string;
    requestBodyTypeString?: string;
    requestHeadersTypeString?: string;
    responseContentType?: string;
    additionalTypes?: string;
    responseBodyTypeString?: string;
    descriptionFileFullPath?: string;
};

export type EventDescriptionProps = {
    fileUrl: string;
    event: string;
    rooms?: string[];
    descriptionText?: string;
    eventBodyTypeString: string;
    additionalTypes?: string;
    expectedResponseBodyTypeString?: string;
    descriptionFileFullPath?: string;
};

program
    .command("loadTypes")
    .alias("l")
    .option("-s", "--scope <SCOPE>")
    .option("--apiPrefix <apiPrefix>")
    .option("--assetsPrefix <assetsPrefix>")
    .option("-b", "--baseUrl <BASEURL>")
    .description("use it to load api types from server")
    .action(async ({ scope, apiPrefix, assetsPrefix, baseUrl }: { [key: string]: string }) => {
        if (!packageDotJson["apiTypes"]) {
            console.error(
                "Please provide api types loading config in package.json before loading api types as in ",
                `{
                "apiPrefix": string;
                "assetsPrefix": string;
                "baseUrl": string; 
                scope?: string;
                "secret": string;  
            }`
            );
            __process.exit(1);
        }

        const apiTypesDirFullPath = path.join(currentPackagePath, "/apiTypes");
        fs.mkdirSync(apiTypesDirFullPath, { recursive: true });
        const clientArchiveFullPath = path.join(apiTypesDirFullPath, "client.zip");
        if (!scope) {
            if (!packageDotJson["apiTypes"]?.scope) {
                console.error("please provide valid scope in package.json apiTypes");
                __process.exit(1);
                return;
            }
            scope = packageDotJson["apiTypes"]?.scope;
        }

        if (!baseUrl && packageDotJson["apiTypes"]?.baseUrl) {
            baseUrl = packageDotJson["apiTypes"]?.baseUrl;
        }

        if (!apiPrefix && packageDotJson["apiTypes"]?.["apiPrefix"]) {
            apiPrefix = packageDotJson["apiTypes"]?.["apiPrefix"];
        }
        apiPrefix = join(baseUrl, apiPrefix);

        if (!assetsPrefix && packageDotJson["apiTypes"]?.["assetsPrefix"]) {
            assetsPrefix = packageDotJson["apiTypes"]?.["assetsPrefix"];
        }
        assetsPrefix = join(baseUrl, assetsPrefix);
        const dotEnv: any = process.env;
        const getFromEnv = (key: string): any => {
            return dotEnv[key] || dotEnv[key.toLowerCase()] || dotEnv[key.toUpperCase()];
        };

        const secret = getFromEnv("description_secret");
        if(!secret){
            console.error("Please provide description secret in your environment DESCRIPTION_SECRET=\"YOUR SECRET\"")
            process.exit(1)
        }

        const loadPrismaClient = () => {
            return new Promise(async (resolve, reject) => {
                try {
                    console.log("Loading Client");
                    const response = await axios({
                        data: {
                            secret: secret,
                        },
                        method: "post",
                        url: join(`${apiPrefix}`, `/apiDescription/prismaCompressedClient`),
                        responseType: "stream",
                    });

                    console.log("downloading prisma client...");
                    const stream = response.data;

                    const fileWriteStream = fs.createWriteStream(clientArchiveFullPath);

                    stream.pipe(fileWriteStream);
                    stream.on("error", error => {
                        console.log(error);
                        reject(error);
                    });

                    fileWriteStream.on("finish", () => {
                        console.log("finished downloading client\n\nExtracting Client...");
                        fs.createReadStream(clientArchiveFullPath)
                            .pipe(unzipper.Extract({ path: apiTypesDirFullPath }))
                            .on("finish", () => {
                                console.log("Client Extraction complete");
                                resolve(true);
                            })

                            .on("error", err => {
                                if (err.message == "FILE_ENDED") {
                                } else {
                                    console.error("Error during extraction:", err.message);
                                    reject(err);
                                }
                            });
                    });
                } catch (error) {
                    reject(error);
                }
            });
        };

        const buildTypes = async () => {
            console.log("Building Types");

            const apiDescription: { [key: string]: DescriptionProps } = (
                await axios({
                    method: "get",
                    url: join(assetsPrefix, `/apiDescriptionMap.json`),
                })
            ).data;

            const channelsDescription: { [key: string]: ChannelsDescriptionProps } = (
                await axios({
                    method: "get",
                    url: join(assetsPrefix, `/channelsDescriptionMap.json`),
                })
            ).data;

            const eventsDescription: { [key: string]: EventDescriptionProps } = (
                await axios({
                    method: "get",
                    url: join(assetsPrefix, `/eventsDescriptionMap.json`),
                })
            ).data;

            const content = [
                `// @ts-nocheck
import { $Enums, Prisma } from "./${path.relative(
                    path.dirname(apiTypesFilePath),
                    apiTypesDirFullPath
                )}/client/index.js";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { Merge } from "../common";

export {$Enums, Prisma}

export type AsyncEmitOptions = {
    timeout?: number;
    sinceMins?: number;
    now?: boolean;
    quiet?: boolean;
    notScoped?: boolean;
};

export type RequestConfig<D> = {
    sinceMins?: number;
    now?: boolean;
    requestVia?: ("http"|"socket")[]
    quiet?: boolean;
} & AxiosRequestConfig<D>;


type OmitFunctions<T> = T extends any[]? T: Pick<T, {
  [K in keyof T]: T[K] extends Function ? never : K
}[keyof T]>;

        `,
            ];

            console.log(
                `\n\n################################ Looking for Scope "${scope}" ################################`
            );

            const routesArray = Object.values(apiDescription).filter(r => {
                const result = trimSlashes(r.fullRoutePath || "")?.startsWith(trimSlashes(scope));
                console.log(r.fullRoutePath, result);
                return result;
            });

            const channelsArray = Object.values(channelsDescription).filter(c => {
                const result = trimSlashes(c.fullChannelPath || "")?.startsWith(trimSlashes(scope));
                console.log(c.fullChannelPath, result);
                return result;
            });

            const eventsArray = Object.values(eventsDescription);

            console.log(
                "###########################################################################################\n\n\n"
            );

            for (const r of routesArray) {
                for (const key in r) {
                    if (key.endsWith("TypeString")) {
                        r[key] = r[key]?.replace(/;$/, "");
                        r[key] = `OmitFunctions<${r[key]}>`;
                    }
                }
                r.fullRoutePath = trimSlashes(r.fullRoutePath || "")?.slice(trimSlashes(scope).length);
            }

            for (const c of channelsArray) {
                for (const key in c) {
                    if (key.endsWith("TypeString")) {
                        c[key] = c[key]?.replace(/;$/, "");
                        c[key] = `OmitFunctions<${c[key]}>`;
                    }
                }
                c.fullChannelPath = trimSlashes(c.fullChannelPath || "")?.slice(trimSlashes(scope).length);
            }

            for (const e of eventsArray) {
                for (const key in e) {
                    if (key.endsWith("TypeString")) {
                        e[key] = e[key]?.replace(/;$/, "");
                        e[key] = `OmitFunctions<${e[key]}>`;
                    }
                }
            }

            content.push(`

${channelsArray
    .map(c => {
        return c.additionalTypes;
    })
    .filter(e => !!e)
    .join("\n\n")}

${routesArray
    .map(c => {
        return c.additionalTypes;
    })
    .filter(e => !!e)
    .join("\n\n")}    


${eventsArray
    .map(c => {
        return c.additionalTypes;
    })
    .filter(e => !!e)
    .join("\n\n")}    
    
        


`);

            if (!eventsArray.length) {
                content.push(`
export type OnEvent = (
    event: string,
    cb: (body: any, cb?: (body?: any) => Promise<void>) => any | Promise<any>
) => Promise<() => void>;

        `);
            } else {
                content.push(`


export type OnEventNames = ${eventsArray.map(c => `"${c.event}"`).join(" | ")};

export type OnEventBody<U extends string> = ${eventsArray
                    .map(r => {
                        return `
U extends "${r.event}"
? ${r.eventBodyTypeString}
:`;
                    })
                    .join("")} any;

export type OnEventExpectedResponse<U extends string> = ${eventsArray
                    .map(r => {
                        return `
U extends "${r.event}"
? ${r.expectedResponseBodyTypeString}
:`;
                    })
                    .join("")} undefined;


export type OnEventBodyMap = {${eventsArray
                    .map(r => {
                        return `
"${r.event}": ${r.eventBodyTypeString};`;
                    })
                    .join("")}
};

export type OnEvent = <U extends AsyncEmitEvents | string>(
    event: U,
    cb: (
            body: OnEventBody<U>,  
            cb: OnEventExpectedResponse<U> extends never ? never : OnEventExpectedResponse<U> extends undefined ? (((body?: any) => Promise<void>) | undefined) : ((body?: OnEventExpectedResponse<U>) => Promise<void>)
        ) => any | Promise<any>
) => Promise<() => void>;

`);
            }

            //!!
            //!!
            //!!

            if (!channelsArray.length) {
                content.push(`
export type AsyncEmit = <T = any>(event: string, body?: any, options?: AsyncEmitOptions) => Promise<T>;
                    `);
            } else {
                content.push(`
    
export type AsyncEmitEvents = ${channelsArray.map(c => `"${c.fullChannelPath}"`).join(" | ")};

export type AsyncEmitBody<U extends string> = ${channelsArray
                    .map(r => {
                        return `
    U extends "${r.fullChannelPath}"
    ? ${r.requestBodyTypeString}
    :`;
                    })
                    .join("")} any;

export type AsyncEmitResponse<U extends string> = ${channelsArray
                    .map(r => {
                        return `
U extends "${r.fullChannelPath}"
? ${r.responseBodyTypeString}
:`;
                    })
                    .join("")} any;


export type AsyncEmitResponseMap = {${channelsArray
                    .map(r => {
                        return `
"${r.fullChannelPath}": ${r.responseBodyTypeString};`;
                    })
                    .join("")}
};

export type AsyncEmit = <U extends AsyncEmitEvents | string>(
    url: U,
    body?: AsyncEmitBody<U>,
    config?: AsyncEmitOptions,
) => Promise<AsyncEmitResponse<U>>;
                    
    `);
            }

            //!!
            //!!
            //!!

            const postRoutes = routesArray.filter(r => {
                return r.method == "post" || r.method == "all";
            });
            if (!postRoutes.length) {
                content.push(`

export type ApiPost = <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AsyncEmitOptions & RequestConfig<D>
) => Promise<R>;

            `);
            } else {
                content.push(`

export type ApiPostUrl = ${postRoutes.map(r => `"${r.fullRoutePath}"`).join(" | ")};

export type ApiPostBody<U extends string> = ${postRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestBodyTypeString}
    :`;
                    })
                    .join("")} any;


export type ApiPostResponse<U extends string> = ${postRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.responseBodyTypeString}
    :`;
                    })
                    .join("")} any;

export type ApiPostResponseMap = {${postRoutes
                    .map(r => {
                        return `
    "${r.fullRoutePath}": ${r.responseBodyTypeString};`;
                    })
                    .join("")}
};

export type ApiPostBodyMap = {${postRoutes
                    .map(r => {
                        return `
"${r.fullRoutePath}": ${r.requestBodyTypeString};`;
                    })
                    .join("")}
};

export type ApiPostResponseExtractor<Url extends keyof ApiPostResponseMap> = ApiPostResponseMap[Url]



export type ApiPostHeaders<U extends string> = ${postRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestHeadersTypeString} & {
        [key: string]: string; 
    } :`;
                    })
                    .join("")} any;


export type ApiPostParams<U extends string> = ${postRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestParamsTypeString}
    :`;
                    })
                    .join("")} any;


export type ApiPost = <U extends ApiPostUrl | string>(
    url: U,
    data?: ApiPostBody<U>,
    config?: AsyncEmitOptions &  Merge<{
        ${
            postRoutes.some(r => r.requestHeadersTypeString != "OmitFunctions<any>")
                ? "headers?: ApiPostHeaders<U>; "
                : ""
        }
        params?: ApiPostParams<U>; 
    }, RequestConfig<ApiPostBody<U>>>
) => Promise<AxiosResponse<ApiPostResponse<U>>>;


            `);
            }

            //
            //
            //

            const putRoutes = routesArray.filter(r => {
                return r.method == "put" || r.method == "all";
            });
            if (!putRoutes.length) {
                content.push(`

export type ApiPut = <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AsyncEmitOptions & RequestConfig<D>
) => Promise<R>;

            `);
            } else {
                content.push(`


export type ApiPutUrl = ${putRoutes.map(r => `"${r.fullRoutePath}"`).join(" | ")};

export type ApiPutBody<U extends string> = ${putRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestBodyTypeString}
    :`;
                    })
                    .join("")} any;


export type ApiPutResponse<U extends string> = ${putRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.responseBodyTypeString}
    :`;
                    })
                    .join("")} any;



export type ApiPutHeaders<U extends string> = ${putRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestHeadersTypeString} & {
        [key: string]: string; 
    } :`;
                    })
                    .join("")} any;


export type ApiPutParams<U extends string> = ${putRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestParamsTypeString}
    :`;
                    })
                    .join("")} any;


export type ApiPut = <U extends ApiPutUrl | string>(
    url: U,
    data?: ApiPutBody<U>,
    config?: AsyncEmitOptions & Merge<{
        ${putRoutes.some(r => r.requestHeadersTypeString != "OmitFunctions<any>") ? "headers?: ApiPutHeaders<U>; " : ""}
        params?: ApiPutParams<U>; 
    }, RequestConfig<ApiPutBody<U>>>
) => Promise<AxiosResponse<ApiPutResponse<U>>>;

            `);
            }

            //
            //
            //

            const getRoutes = routesArray.filter(r => {
                return r.method == "get" || r.method == "all";
            });
            if (!getRoutes.length) {
                content.push(`

export type ApiGet = <T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AsyncEmitOptions & RequestConfig<D>) => Promise<R>;;

            `);
            } else {
                content.push(`

         

export type ApiGetUrl = ${getRoutes.map(r => `"${r.fullRoutePath}"`).join(" | ")};

export type ApiGetBody<U extends string> = ${getRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestBodyTypeString}
    :`;
                    })
                    .join("")} any;


export type ApiGetResponse<U extends string> = ${getRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.responseBodyTypeString}
    :`;
                    })
                    .join("")} any;



export type ApiGetHeaders<U extends string> = ${getRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestHeadersTypeString} & {
        [key: string]: string; 
    } :`;
                    })
                    .join("")} any;


export type ApiGetParams<U extends string> = ${getRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestParamsTypeString}
    :`;
                    })
                    .join("")} any;


export type ApiGet = <U extends ApiGetUrl | string>(
    url: U,
    config?: AsyncEmitOptions & Merge<{
        ${getRoutes.some(r => r.requestHeadersTypeString != "OmitFunctions<any>") ? "headers?: ApiGetHeaders<U>; " : ""}
        params?: ApiGetParams<U>; 
    }, RequestConfig<ApiGetBody<U>>>
) => Promise<AxiosResponse<ApiGetResponse<U>>>;

            `);
            }

            //
            //
            //

            const deleteRoutes = routesArray.filter(r => {
                return r.method == "delete" || r.method == "all";
            });
            if (!deleteRoutes.length) {
                content.push(`

export type ApiDelete = <T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AsyncEmitOptions & RequestConfig<D>) => Promise<R>;;

            `);
            } else {
                content.push(`
         
export type ApiDeleteUrl = ${deleteRoutes.map(r => `"${r.fullRoutePath}"`).join(" | ")};

export type ApiDeleteBody<U extends string> = ${deleteRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestBodyTypeString}
    :`;
                    })
                    .join("")} any;


export type ApiDeleteResponse<U extends string> = ${deleteRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.responseBodyTypeString}
    :`;
                    })
                    .join("")} any;



export type ApiDeleteHeaders<U extends string> = ${deleteRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestHeadersTypeString} & {
        [key: string]: string; 
    } :`;
                    })
                    .join("")} any;


export type ApiDeleteParams<U extends string> = ${deleteRoutes
                    .map(r => {
                        return `
    U extends "${r.fullRoutePath}"
    ? ${r.requestParamsTypeString}
    :`;
                    })
                    .join("")} any;


export type ApiDelete = <U extends ApiDeleteUrl | string>(
    url: U,
    config?: AsyncEmitOptions & Merge<{
        ${
            deleteRoutes.some(r => r.requestHeadersTypeString != "OmitFunctions<any>")
                ? "headers?: ApiDeleteHeaders<U>; "
                : ""
        }
        params?: ApiDeleteParams<U>; 
    }, RequestConfig<ApiDeleteBody<U>>>
) => Promise<AxiosResponse<ApiDeleteResponse<U>>>;

            `);
            }

            console.log("Writing Types....");
            fs.writeFileSync(apiTypesFilePath, content.join("\n"));
        };

        try {
            await loadPrismaClient();
            await buildTypes();
        } catch (error: any) {
            extractApiError(error);
            console.log(error?.message);
        }

        console.log("\n\nDone!!");
    });

program
    .command("resetTypes")
    .alias("r")
    .description("reset types to be `any`")
    .action(async () => {
        fs.writeFileSync(
            apiTypesFilePath,
            `
        
import { AxiosRequestConfig, AxiosResponse } from "axios";

export type RequestConfig<D> = {
    sinceMins?: number;
    now?: boolean;
    requestVia?: ("http"|"socket")[]
    quiet?: boolean;
} & AxiosRequestConfig<D>;

export type ApiPost = <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AsyncEmitOptions & RequestConfig<D>
) => Promise<R>;

export type ApiPut = <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AsyncEmitOptions & RequestConfig<D>
) => Promise<R>;
export type ApiDelete = <T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AsyncEmitOptions & RequestConfig<D>) => Promise<R>;
export type ApiGet = <T = any, R = AxiosResponse<T>, D = any>(url: string, config?: AsyncEmitOptions & RequestConfig<D>) => Promise<R>;

export type AsyncEmit = <T = any>(event: string, body?: any, options?: AsyncEmitOptions) => Promise<T>;

export type OnEvent = (
    event: string,
    cb: (body: any, cb?: (body?: any) => Promise<void>) => any | Promise<any>
) => Promise<() => void>;

export type AsyncEmitOptions = {
    timeout?: number;
    sinceMins?: number;
    now?: boolean;
    quiet?: boolean;
    notScoped?: boolean;
};

        `
        );
    });
program.parse();

export {};
