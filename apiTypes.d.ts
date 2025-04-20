
        
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

        