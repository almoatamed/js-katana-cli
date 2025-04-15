import { InvalidArgumentError } from "commander";

import path from "path";
import { srcPath } from "../../utils/kiPaths.js";
import { projectRoot } from "../../pmManager/fs.js";
import fs from "fs"

const createCommand = (program: import("commander").Command) => {
    const methods = ["get", "post", "put", "delete"];
    program
        .command("create-route")
        .alias("r+")
        .description("use it to create new route")
        .argument(
            "<route>",
            `route relative path e.g "your/example/route" or if you want to create a sub route in the current the current route "./your/sub/route"`,
        )
        .argument(
            "[method]",
            `route method  "get" | "post"| "put" | "delete" `,
            (method, _) => {
                if (!methods.includes(method)) {
                    throw new InvalidArgumentError(
                        `Please Provide a valid route method  "get" | "post"| "put" | "delete"`,
                    );
                }
                return method;
            },
            "get",
        )
        .action(async (newRoute, routeMethod) => {
            const routerConfig = (await import(path.join(projectRoot, "server/config/routing/index.ts"))).routerConfig;

            const routerDirPath = path.join(srcPath, routerConfig.getRouterDirectory());
            const emptyRoutePath = !routerConfig.getEmptyRoutePath()
                ? path.join(routerDirPath, "emptyRoute.ts")
                : path.join(srcPath, routerConfig.getEmptyRoutePath());

            if (!newRoute || typeof newRoute != "string") {
                throw new InvalidArgumentError("Please Provide the route name as in 'aramRest r+ my/new/route get'");
            }

            if (!newRoute.match(routerConfig.getRouterSuffixRegx())) {
                newRoute += "/index" + routerConfig.getRouteSuffix();
            }
            if (newRoute.startsWith("./")) {
                if (!process.cwd().startsWith(routerDirPath)) {
                    throw new InvalidArgumentError(
                        "you are trying to create sub route, but you are not in the routers directory: " +
                            routerDirPath,
                    );
                }
                newRoute = path.join(process.cwd(), newRoute);
            } else {
                newRoute = path.join(routerDirPath, newRoute);
            }

            if (fs.existsSync(newRoute)) {
                throw new InvalidArgumentError(`Route ${newRoute} already exists, please check it`);
            }

            console.log("Creating Route", "\n", "new Route path", newRoute, "\n", "routeMethod", routeMethod);
            let emptyRoute = fs.readFileSync(emptyRoutePath, "utf-8");
            emptyRoute = emptyRoute.replace(/(?<=router(\s|\n)*?\.(\s|\n)*?).+?(?=(\s|\n)*?\()/, routeMethod);

            fs.cpSync(emptyRoutePath, newRoute, {
                recursive: true,
            });
            fs.writeFileSync(newRoute, emptyRoute);
        });
};
export { createCommand };
