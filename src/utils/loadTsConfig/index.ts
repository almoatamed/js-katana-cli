import path from "path";
import { appPath } from "../kiPaths.js";
import { readJSON } from "../../pmManager/fs.js";

const loadTsConfig = () => {
    const tsConfigPath = path.join(appPath, "tsconfig.json");
    return readJSON<any>(tsConfigPath);
};

export { loadTsConfig };
