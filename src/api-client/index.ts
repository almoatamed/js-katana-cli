import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import pako from "pako";
import io, { ManagerOptions, Socket, SocketOptions } from "socket.io-client";

export const trimSlashes = (path: string, removeStartingSlash = false, removeEndingSlash = true) => {
    if (path == "/") {
        return path;
    }

    const protocol = path.match(/^.+?:\/\//)?.[0] || "";
    if (protocol) {
        path = path.slice(protocol.length);
    }

    const startsWithASlash = path.startsWith("/");
    const endsWithASlash = path.endsWith("/");

    const paths = path.split("/").filter((x) => x);
    const processedPaths = [] as string[];
    for (const path of paths) {
        if (path == "..") {
            processedPaths.splice(-1, 1);
            continue;
        }

        if (path == ".") {
            continue;
        }

        processedPaths.push(path);
    }

    path = processedPaths.join("/") || "/";
    if (path == "/") {
        return path;
    }

    if (startsWithASlash && !removeStartingSlash) {
        path = "/" + path;
    }

    if (endsWithASlash && !removeEndingSlash) {
        path = path + "/";
    }

    return protocol + path;
};

const path = {
    join: function pathJoin(...args: string[]) {
        return args
            .map((part, i) => {
                if (i === 0) {
                    return part.trim().replace(/[/\\]+$/, ""); // Trim trailing slashes for the first part
                } else {
                    return part.trim().replace(/(^[/\\]+|[/\\]+$)/g, ""); // Trim both leading and trailing slashes for other parts
                }
            })
            .filter(Boolean) // Remove empty strings
            .join("/");
    },
};

export const isNumber = function (num: any) {
    if (typeof num === "number") {
        return num - num === 0;
    }
    if (typeof num === "string" && num.trim() !== "") {
        return Number.isFinite ? Number.isFinite(+num) : isFinite(+num);
    }
    return false;
};

export type AsyncEmitOptions = {
    timeout?: number;
    sinceMins?: number;
    now?: boolean;
    quiet?: boolean;
    notScoped?: boolean;
};
export interface ExtendedSocket extends Socket {
    destroyCurrentInstance: () => void;
}

export type Storage = {
    save: <T>(key: string, value: T) => Promise<void>;
    get: <T>(key: string) => Promise<T | null>;
    clear: () => Promise<void> | void;
};

type Notification = {
    text?: string;
    type?: "success" | "error" | "warning";
};

type PushNotificationHandler = (notification: string | Notification) => void;

type BaseUrl = string;
type GetToken = () => string | undefined;
type AppHeader = string | undefined;
type ChannellingPrefix = string | undefined;
type SocketProps = {
    baseUrl: BaseUrl;
    storage?: Storage;
    channellingRequestTimeout?: number;
    beforeReconnect?: (options: Partial<ManagerOptions & SocketOptions>) => void | boolean | Promise<void | boolean>;
    query?: any;
    scope?: string;
    noCaching?: () => boolean;
    getToken?: GetToken;
    autoConnect?: boolean;
    autoReconnect?: boolean;
    transports?: string[];
    reconnectPeriod?: number;
    appHeader?: AppHeader;
    pushNotification?: PushNotificationHandler;
    channellingPrefix?: ChannellingPrefix;
};

export const createSocketClient = <
    AsyncEmit = <T = any>(event: string, body?: any, options?: AsyncEmitOptions) => Promise<T>,
    OnEvent = DefaultOnEvent
>(
    props: SocketProps
) => {
    const secure = () => {
        return props.baseUrl?.startsWith("https");
    };
    if (props.autoConnect === undefined) {
        props.autoConnect = true;
    }

    const createEventFromRoute = (route: string, notScoped: boolean) => {
        let event = notScoped ? route : path.join(props.scope || "", route);
        if (!event.endsWith("/")) {
            event += "/";
        }
        return event;
    };
    const auth = () => {
        return {
            token: props.getToken?.(),
            "x-app": props.appHeader,
        };
    };

    const host = () => {
        return props.baseUrl.match(/(?<=^https?:\/\/)(.+?)(?:\:([0-9]{1,4}))?(\/.*?)?$/i)?.[1];
    };

    const port = () => {
        const specifiedPort = props.baseUrl.match(/(?<=^https?:\/\/)(.+?)(?:\:([0-9]{1,4}))?(\/.*?)?$/i)?.[2];
        if (specifiedPort) {
            return Number(specifiedPort);
        }

        return secure() ? 443 : 80;
    };

    let socketInstance: ExtendedSocket | null = null;

    const onceConnectQueue = [] as (() => void | Promise<void>)[];
    async function onceConnect(cb: () => any) {
        if (socketInstance?.connected) {
            try {
                await cb();
            } catch (error) {
                console.log(error);
            }
        } else {
            onceConnectQueue.push(async () => {
                try {
                    await cb();
                } catch (error) {
                    console.log("once connect error", error);
                }
            });
        }
    }

    const onConnectListeners = [] as (() => void | Promise<void>)[];
    const onConnect = async (cb: () => any) => {
        const listener = async () => {
            setTimeout(async () => {
                try {
                    await cb();
                } catch (error) {
                    console.log("onConnect listener error", error);
                }
            }, 400);
        };
        onConnectListeners.push(listener);
        if (socketInstance?.connected) {
            await listener();
        }
        return () => {
            const index = onConnectListeners.findIndex((l) => l === listener);
            if (index != -1) {
                onConnectListeners.splice(index, 1);
            }
        };
    };
    const onDisconnectListeners = [] as (() => void | Promise<void>)[];
    const onDisconnect = async (cb: () => any) => {
        const listener = async () => {
            setTimeout(async () => {
                try {
                    await cb();
                } catch (error) {
                    console.log("onDisconnect listener error", error);
                }
            }, 400);
        };
        onDisconnectListeners.push(listener);
        if (!socketInstance?.connected) {
            await listener();
        }
        return () => {
            const index = onDisconnectListeners.findIndex((l) => l === listener);
            if (index != -1) {
                onDisconnectListeners.splice(index, 1);
            }
        };
    };

    const onListeners = {} as {
        [event: string]: {
            originalCB: (...args: any[]) => any | Promise<any>;
            listener: (...args: any[]) => any | Promise<any>;
        }[];
    };
    const on = async (event: string, cb: (...args: any[]) => any | Promise<any>) => {
        const listener = async (...args: any[]) => {
            try {
                await cb(...args);
            } catch (error) {
                console.log("onDisconnect listener error", error);
            }
        };
        if (!onListeners[event]) {
            onListeners[event] = [];
        }
        onListeners[event].push({ listener, originalCB: cb });
        socketInstance?.on(event, listener);

        return () => {
            const index = onListeners[event]?.findIndex((l) => l.listener === listener);
            if (index != -1 && isNumber(index)) {
                onListeners[event].splice(index, 1);
            }
            socketInstance?.off(event, listener);
        };
    };
    const off = async (event: string, cb: (...args: any[]) => any | Promise<any>) => {
        const index = onListeners[event]?.findIndex((l) => l.listener === cb || l.originalCB === cb);
        if (!isNumber(index)) {
            return;
        }
        if (index != -1) {
            socketInstance?.off(event, onListeners[event][index].listener);
            onListeners[event].splice(index, 1);
        }
    };

    let manualDisconnect = false;
    const disconnect = () => {
        manualDisconnect = true;
        socketInstance?.disconnect();
    };

    const reconnect = () => {
        const options = {} as Partial<ManagerOptions & SocketOptions>;

        const authBody = auth();
        if (Object.values(authBody)?.filter((e) => !!e).length) {
            options.auth = authBody;
        }

        if (props.query) {
            options.query = props.query;
        }

        if (props.transports) {
            options.transports = props.transports;
        } else {
            options.transports = ["websocket"];
        }

        if (props.channellingPrefix) {
            options.path = props.channellingPrefix;
        }

        if (props.beforeReconnect) {
            const result = props.beforeReconnect(options);
            if (result === false) {
                return;
            }
        }

        socketInstance?.destroyCurrentInstance();

        socketState.connected = false;
        options.autoConnect = true;
        options.reconnection = props.autoReconnect;

        let destroyed = false;
        let currentInstance: null | ExtendedSocket = null;

        const ioSocket = io(props.baseUrl, options);
        currentInstance = socketInstance = Object.assign(ioSocket, {
            destroyCurrentInstance: () => {
                destroyed = true;
                currentInstance?.disconnect();
                currentInstance = null;
            },
        });
        console.log("reconnecting socket", props.baseUrl, options);

        socketInstance.on("connectError", (error) => {
            console.log("Socket Connection Error", error);
        });

        socketInstance.on("disconnect", async (reason, description) => {
            socketState.connected = false;
            await Promise.all(onDisconnectListeners.map((cb) => cb()));
            if (manualDisconnect) {
                manualDisconnect = false;
            }
        });

        socketInstance.once("connect", async () => {
            await Promise.all(onceConnectQueue.splice(0).map((cb) => cb()));
        });
        socketInstance.on("connect", async () => {
            setTimeout(() => {
                socketState.connected = true;
            }, 400);

            await Promise.all(onConnectListeners.map((cb) => cb()));
        });
        for (const event in onListeners) {
            for (const l of onListeners[event]) {
                socketInstance.on(event, l.listener);
            }
        }
    };

    const performAsyncEmit = function <T = any>(
        event: string,
        body?: any,
        options: AsyncEmitOptions = {
            timeout: 6e4,
        }
    ): Promise<T> {
        event = createEventFromRoute(event, options.notScoped || false);

        return new Promise((resolve, reject) => {
            if (!socketInstance) {
                reject(new Error("Socket is not connected"));
            }
            socketInstance
                ?.timeout(options.timeout || 6e4)
                .emit(event, body || null, (internalError: any, response: any) => {
                    if (!internalError && !response.error && !response.err) {
                        return resolve(response);
                    } else {
                        const error = internalError || response.error || response.err || {};
                        if (error?.statusCode || error?.status) {
                            error.status = error?.statusCode || error?.status;
                            error.statusCode = error?.statusCode || error?.status;
                        }

                        error.message =
                            error?.message ||
                            error?.msg ||
                            error?.error?.message ||
                            error?.error?.msg ||
                            error?.err?.message ||
                            error?.err?.msg ||
                            "unknown error occurred";
                        if (!options.quiet) {
                            if (error.message == "event not found") {
                            } else {
                                props.pushNotification?.(error.message);
                            }
                        }
                        error.msg = error.message;

                        return reject(error);
                    }
                });
        });
    };

    const asyncEmit = async function <T = any>(
        event: string,
        body?: any,
        options: AsyncEmitOptions = {
            timeout: props.channellingRequestTimeout || 6e4,
        }
    ): Promise<T> {
        const matchBody = {
            event: event,
            body: body,
        };
        const key = JSON.stringify(matchBody);

        const storage = props.storage;
        const refetch = async (): Promise<T> => {
            const response = await performAsyncEmit<T>(event, body, options);
            if (storage && typeof options?.sinceMins == "number" && options?.sinceMins > 0) {
                try {
                    await storage.save(key, {
                        timestamp: Date.now(),
                        response: response,
                    });
                } catch (error) {
                    await storage.clear();
                    await storage.save(key, {
                        timestamp: Date.now(),
                        response: response,
                    });
                }
            }
            return response;
        };
        if (props.noCaching?.() === true) {
            return await refetch();
        }

        if (typeof options?.sinceMins == "number" && options?.sinceMins > 0 && !options?.now) {
            const localCache = await storage?.get<any>(key);
            if (localCache) {
                const cachedResponse = localCache || {};
                if (
                    !!cachedResponse.timestamp &&
                    (Date.now() - parseInt(cachedResponse.timestamp)) / 60e3 < options.sinceMins
                ) {
                    return cachedResponse.response;
                } else {
                    return await refetch();
                }
            } else {
                return await refetch();
            }
        } else {
            return await refetch();
        }
    } as AsyncEmit;

    const socketState = {
        reconnect,
        socket: () => socketInstance,
        connected: false,
        asyncEmit: asyncEmit,
        on: on as OnEvent,
        off,
        disconnect,
        removeListener: off,
        onDisconnect,
        performAsyncEmit,
        _asyncEmit: performAsyncEmit,
        props,
        onConnect,
        onceConnect,
        createEventFromRoute,
    };

    if (props.autoConnect) {
        reconnect();
    }

    return socketState;
};

export type RequestConfig<D> = {
    requestVia?: ("http" | "socket")[];
} & AsyncEmitOptions &
    AxiosRequestConfig<D>;

type Merge<T, U> = T & Omit<U, keyof T>;

export type ApiInterface<Post = DefaultApiPost, Put = DefaultApiPut, Delete = DefaultApiDelete, Get = DefaultApiGet> = {
    _post: Post;
    _put: Put;
    _delete: Delete;
    _get: Get;
} & Merge<
    {
        baseUrl?: string;
        post: Post;
        put: Put;
        delete: Delete;
        get: Get;
    },
    AxiosInstance
>;

const passthroughFn = <T>(x: T) => x;

type HttpPrefix = string | undefined;
type ApiScope = string | undefined;
type onUnauthorized = () => void | Promise<void>;

export type ApiProps = {
    getToken?: GetToken;
    httpRequestTimeout?: number;
    appHeader?: AppHeader;
    noCaching?: () => boolean;
    baseUrl: BaseUrl;
    httpPrefix?: HttpPrefix;
    scope?: ApiScope;
    httpOnly?: () => boolean;
    storage?: Storage;
    pushNotification?: PushNotificationHandler;
    onUnauthorized?: onUnauthorized;
    channelling?: {
        Buffer: BufferConstructor;
        fetchChannelsListRoutePath?: string;
        fetchChannelsListMethod?: "GET" | "POST" | "PUT";
        useChannelling: boolean;
        channellingRequestTimeout?: number;
        beforeReconnect?: (
            options: Partial<ManagerOptions & SocketOptions>
        ) => void | boolean | Promise<void | boolean>;
        query?: any;
        onDisconnect?: (reason: string, description: string) => void | Promise<void>;
        autoConnect?: boolean;
        autoReconnect?: boolean;
        transports?: string[];
        reconnectPeriod?: number;
        channellingPrefix?: ChannellingPrefix;
    };
};

export type DefaultApiPost = <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: RequestConfig<D>
) => Promise<R>;

export type DefaultApiPut = <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: RequestConfig<D>
) => Promise<R>;
export type DefaultApiDelete = <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: RequestConfig<D>
) => Promise<R>;
export type DefaultApiGet = <T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: RequestConfig<D>
) => Promise<R>;

type DefaultOnEvent = (
    event: string,
    cb: (body: any, cb?: (body?: any) => Promise<void>) => any | Promise<any>
) => Promise<() => void>;

export const createApiClient = <
    Post = DefaultApiPost,
    Put = DefaultApiPut,
    Delete = DefaultApiDelete,
    Get = DefaultApiGet,
    AsyncEmit = <T = any>(event: string, body?: any, options?: AsyncEmitOptions) => Promise<T>,
    OnEvent = DefaultOnEvent
>(
    props: ApiProps
) => {
    let socket: null | ReturnType<typeof createSocketClient<AsyncEmit, OnEvent>> = null;
    const socketProps = {} as SocketProps;

    const updateSocketConfig = () => {
        if (props.channelling) {
            for (const key in props.channelling) {
                (socketProps as any)[key] = (props as any).channelling[key];
            }
        }
        socketProps.scope = props.scope;
        socketProps.storage = props.storage;
        socketProps.baseUrl = props.baseUrl;
        socketProps.appHeader = props.appHeader;
        socketProps.getToken = props.getToken;
        socketProps.pushNotification = props.pushNotification;
        socketProps.noCaching = props.noCaching;
    };
    const setSocket = () => {
        updateSocketConfig();
        if (!socket) {
            socket = createSocketClient<AsyncEmit, OnEvent>(socketProps);
        } else {
            socket.reconnect();
        }
    };
    const removeSocket = () => {
        socket?.socket()?.destroyCurrentInstance();
        socket = null;
    };

    const getChannelNamesFromBackend = async (props: {
        baseUrl: string;
        httpPrefix?: HttpPrefix;
        fetchChannelsRoutePath: string;
        method: "GET" | "POST" | "PUT";
    }) => {
        const response = await axios({
            url: props.baseUrl + path.join(props.httpPrefix || "", props.fetchChannelsRoutePath),
            method: props.method,
        });
        const names = response.data as string[];
        return names;
    };
    const channels = [] as string[];

    const reloadChannelsList = async () => {
        if (
            process.env.NODE_ENV !== "test" &&
            props.channelling?.fetchChannelsListMethod &&
            props.channelling?.fetchChannelsListRoutePath
        ) {
            const names = await getChannelNamesFromBackend({
                httpPrefix: props.httpPrefix,
                baseUrl: props.baseUrl,
                fetchChannelsRoutePath: props.channelling?.fetchChannelsListRoutePath,
                method: props.channelling.fetchChannelsListMethod,
            });
            channels.push(...names);
        }
    };

    const reloadSocket = () => {
        if (props.channelling) {
            setSocket();
        } else {
            removeSocket();
        }
    };

    const httpRequestTimeout = () => {
        if (props.httpRequestTimeout) {
            return props.httpRequestTimeout;
        }
        return 120e3;
    };

    const modifyHttpRequestConfig = (config: InternalAxiosRequestConfig<any> & { notScoped?: boolean }) => {
        config.timeout = httpRequestTimeout();
        config.baseURL = path.join(props.baseUrl, props.httpPrefix || "", config.notScoped ? "" : props.scope || "");

        const token = props.getToken?.();
        if (token) {
            config.headers["Authorization"] = token;
        }

        const appHeader = props.appHeader;
        if (appHeader) {
            config.headers["x-app"] = appHeader;
            config.headers["app"] = appHeader;
        }
        return config;
    };
    const httpErrorResponseHandler = async (error: any) => {
        const err = error.response;

        const response = error.response;

        if (response && response.status === 423) {
            await props.onUnauthorized?.();
        }

        error.message =
            error.response?.data?.error?.msg ||
            error.response?.data?.error?.message ||
            error.response?.data?.error?.name ||
            error.response?.data?.msg ||
            error.response?.data?.message ||
            error.response?.data?.name ||
            error.msg ||
            error.message;

        if (!error?.response || error?.response?.status === 502) {
            error.networkError = true;
            error.message = "Connection Error";
            if (!error?.config?.quiet) {
                props.pushNotification?.({
                    text: "Connection Error please try again" + "\n" + error.message,
                    type: "error",
                });
            }
        } else if (error.message) {
            if (!error?.config?.quiet) {
                props.pushNotification?.({
                    text: `Error Occurred: ${error.message}`,
                    type: "error",
                });
            }
        }
        error.msg = error.message;

        throw error;
    };
    const createHttpInstance = (): ApiInterface<Post, Put, Delete, Get> => {
        const Api: any = axios.create({
            baseURL: props.baseUrl,
        });
        Api.interceptors.request.use((config: any) => modifyHttpRequestConfig(config));
        Api.interceptors.response.use(passthroughFn, httpErrorResponseHandler);
        Api._put = Api.put;
        Api._post = Api.post;
        Api._get = Api.get;
        Api._delete = Api.delete;
        return Api;
    };
    let Api = createHttpInstance();
    const reloadHttpInstance = () => {
        Api = createHttpInstance();
    };

    const reloadConfig = async (updatedProps?: ApiProps) => {
        if (updatedProps) {
            for (const key in updatedProps) {
                (props as any)[key] = (updatedProps as any)[key];
            }
        }
        reloadHttpInstance();
        reloadSocket();
        await reloadChannelsList();
    };

    reloadSocket();
    reloadChannelsList().catch((err) => console.log("failed to load channels with error: ", err));

    const isSocketEmitPossible = <D>(url: string, options: RequestConfig<D>) => {
        const result =
            !!(
                !channels.length ||
                channels.find((e) => trimSlashes(e, true, true).endsWith(trimSlashes(url, true, true)))
            ) &&
            !(props.httpOnly?.() === true) &&
            !!socket?.connected &&
            !!(!options?.requestVia || options.requestVia.includes("socket"));
        return result;
    };

    const attemptToSaveToStorage = async <T>(key: string, value: T) => {
        if (!props.storage) {
            return;
        }
        const storage = props.storage;
        try {
            await storage.save(key, {
                timestamp: Date.now(),
                response: {
                    data: value,
                },
            });
        } catch (error) {
            storage.clear();
            await storage.save(key, {
                timestamp: Date.now(),
                response: {
                    data: value,
                },
            });
        }
    };

    type RequestDispatchDetails<D> =
        | { method: "get" | "delete"; options: RequestConfig<D>; key: string; url: string }
        | { method: "post" | "put"; options: RequestConfig<D>; key: string; url: string; body: D };

    const modifySocketDispatch = <D>(details: RequestDispatchDetails<D>) => {
        const options = { ...details.options };

        if (!options.headers) {
            options.headers = {};
        }

        const token = props.getToken?.();
        if (token) {
            options.headers.authorization = token;
        }
        const appHeader = props.appHeader;
        if (appHeader) {
            options.headers["x-app"] = appHeader;
            options.headers["app"] = appHeader;
        }

        return { ...details, options };
    };

    const dispatchRequestViaSocket = async <D, R>(details: RequestDispatchDetails<D>): Promise<R> => {
        if (!props.channelling || !socket?.connected) {
            throw new Error("Socket is not connected");
        }

        const detailsWithHeaders = modifySocketDispatch(details);

        const body =
            detailsWithHeaders.method === "post" || detailsWithHeaders.method === "put" ? detailsWithHeaders.body : {};

        const { options, key, url } = detailsWithHeaders;

        const emitBody = {
            ...body,
            provided__query: options.params,
            provided__headers: options.headers,
        };

        const compressedResponseBody: any = await socket.performAsyncEmit(url, emitBody, {
            timeout: 6e4,
            notScoped: details.options.notScoped,
            quiet: details.options.quiet,
        });
        const Buffer = props.channelling?.Buffer;
        const buffer = Buffer.from(compressedResponseBody);
        const responseBody = JSON.parse(pako.inflate(buffer, { to: "string" }));

        if (typeof options?.sinceMins == "number" && options?.sinceMins > 0) {
            await attemptToSaveToStorage(key, responseBody);
        }

        return { data: responseBody } as R;
    };

    const dispatchRequestViaHttp = async <D, R>(details: RequestDispatchDetails<D>): Promise<R> => {
        const { url, options, method, key } = details;
        let response: R;
        if (details.method === "post" || details.method === "put") {
            const body = details.body;
            response = (await (Api as any)?.[`_${method}`]?.(url, body, options)) as R;
        } else {
            response = (await (Api as any)?.[`_${method}`]?.(url, options)) as R;
        }
        if (typeof options?.sinceMins == "number" && options?.sinceMins > 0 && props.storage) {
            await attemptToSaveToStorage(key, (response as any).data);
        }
        return response;
    };

    const dispatchRequest = async <D, R>(details: RequestDispatchDetails<D>): Promise<R> => {
        const { options, url } = details;

        if (isSocketEmitPossible<D>(url, options)) {
            try {
                return await dispatchRequestViaSocket<D, R>(details);
            } catch (error: any) {
                console.log("socket dispatch error", error);
                if (isNumber(error?.status) && error?.status >= 400 && error?.status < 500) {
                    console.log("Event Error", error);
                    throw error;
                }
            }
        }
        return await dispatchRequestViaHttp<D, R>(details);
    };

    const createDispatcherWithCaching = (method: "get" | "post" | "put" | "delete") =>
        async function <T = any, R = AxiosResponse<T>, D = any>(
            url: string,
            body: D,
            options: RequestConfig<D> = { sinceMins: 0 }
        ): Promise<R> {
            const matchBody = {
                url: url,
                body: body,
            };
            const key = JSON.stringify(matchBody);

            if (props.noCaching?.() === true) {
                return await dispatchRequest<D, R>({
                    method,
                    body,
                    key,
                    options,
                    url,
                });
            }

            if (typeof options?.sinceMins == "number" && options?.sinceMins > 0 && !options?.now) {
                const localCache = await props.storage?.get<any>(key);

                if (localCache) {
                    const cachedResponse = localCache || {};
                    if (
                        !!cachedResponse.timestamp &&
                        (Date.now() - parseInt(cachedResponse.timestamp)) / 60e3 < options.sinceMins
                    ) {
                        return cachedResponse.response;
                    }

                    return await dispatchRequest<D, R>({
                        method,
                        body,
                        key,
                        options,
                        url,
                    });
                }
                return await dispatchRequest<D, R>({
                    method,
                    body,
                    key,
                    options,
                    url,
                });
            }

            return await dispatchRequest<D, R>({
                method,
                body,
                key,
                options,
                url,
            });
        };

    Api.put = createDispatcherWithCaching("put") as any;
    Api.post = createDispatcherWithCaching("post") as any;
    Api.delete = createDispatcherWithCaching("delete") as any;
    Api.get = createDispatcherWithCaching("get") as any;

    return {
        Api,
        socket: socket as null | ReturnType<typeof createSocketClient<AsyncEmit, OnEvent>>,
        reloadConfig,
        reloadChannelsList,
        reloadHttpInstance,
        reloadSocket,
    };
};
