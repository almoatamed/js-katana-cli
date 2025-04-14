import { hasPrisma } from "../../utils/hasPrisma/index.js";
import { appPath } from "../../utils/kiPaths.js";

const createCommand = (program: import("commander").Command) => {
    if (!hasPrisma()) {
        return;
    }
    program
        .command("@authoritiesTypes")
        .alias("@at")
        .description("create the list of authorities types")
        .action(async options => {
            const authorities = (await import(`${appPath}/server/modules/User/static/utils/authorities/index.js`))
                .default;
            const buildAuthorities = (
                await import(`${appPath}/server/modules/User/static/utils/authorities/buildAuthorities.js`)
            ).seedAuthorities;
            await buildAuthorities(authorities);
        });
};
export { createCommand };
