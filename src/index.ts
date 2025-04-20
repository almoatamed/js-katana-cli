import { createApiClient } from "./api-client/index.js";
import type {
    ApiDelete,
    ApiGet,
    ApiPost,
    ApiPut,
    AsyncEmitOptions,
    AsyncEmit,
    OnEvent,
} from "../apiTypes.js";
export * from "./api-client/index.js";

const create = createApiClient<ApiPost, ApiPut, ApiDelete, ApiGet, AsyncEmit, OnEvent>;
export default create;
