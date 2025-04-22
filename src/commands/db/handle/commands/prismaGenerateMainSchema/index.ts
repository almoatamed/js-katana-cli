
const createCommand = (program: import("commander").Command) => {
    program
        .command("prisma-generate-main-schema")
        .alias("ms+")
        .description("generate prism main schema")
        .action(async () => {
            await import("../generateMainSchema.js");
        });
};
export { createCommand };
