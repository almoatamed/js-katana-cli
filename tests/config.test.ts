import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import { existsSync } from "node:fs.js";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import path from "path";
import { readJSON, storeJSON } from "../src/fs.js";
import { type UtilityFile } from "../src/utility.js";
import type { ProjectContext } from "../src/project";

describe("config", () => {
    let originalCwd: string = process.cwd();

    beforeEach(() => {
        vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("Exit called");
        });
    });

    afterEach(() => process.chdir(originalCwd));

    const moveToTestDir = async () => {
        const name = `/tmp/${randomInt(500_000)}`;

        await fs.mkdir(name);
        process.chdir(name);

        return name;
    };

    test("config command: no ki entry should write default.", async () => {
        vi.spyOn(console, "error");

        await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });
        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "ki", "config"]);

        const packageFile = await readJSON<ProjectContext["packageFile"]>("package.json");

        expect(packageFile.name).toBe("FOO");
        expect(packageFile.ki.org).toBe("aramtech");
        expect(packageFile.ki.dest).toBe("./server/utils");
        expect(packageFile.ki.deps).toEqual({});
    });

    test("config command: should not update an existing config entry.", async () => {
        vi.spyOn(console, "error");

        await moveToTestDir();

        await storeJSON("package.json", {
            name: "FOO",
            ki: { org: "salem-is-the-best", dest: "he-does-not-write-tests-though ; - ;" },
        });
        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "ki", "config"]);

        const packageFile = await readJSON<ProjectContext["packageFile"]>("package.json");

        expect(packageFile.name).toBe("FOO");
        expect(packageFile.ki.org).toBe("salem-is-the-best");
        expect(packageFile.ki.dest).toBe("he-does-not-write-tests-though ; - ;");
    });
});
