import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import { existsSync } from "node:fs.js";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import path from "path";
import { readJSON, storeJSON } from "../src/fs.js";
import { type UtilityFile } from "../src/utility.js";

describe("check", () => {
    let originalCwd: string = process.cwd();

    beforeAll(async () => {
        fs.exists = existsSync as any;
    });

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

    test("check command: should log an error if the utility cannot be found.", async () => {
        vi.spyOn(console, "error");

        await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        try {
            const cmd = addCommands(new Command());
            await cmd.parseAsync(["node", "ki", "check", "foo"]);
        } catch {}

        expect(console.error).toHaveBeenCalledWith("could not find utility with name foo");
    });

    test("check command: checksum matches.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());
        await fs.mkdir(path.join(testDirPath, "foo"));
        await fs.writeFile(path.join(testDirPath, "foo", "index.ts"), "console.log('hello world')");
        process.chdir("./foo");
        await cmd.parseAsync(["node", "ki", "init", "foo"]);
        process.chdir("..");

        const utilFileBeforeCheck = await readJSON<UtilityFile>("./foo/utils.json");

        await cmd.parseAsync(["node", "ki", "check", "foo"]);

        const utilFileAfterCheck = await readJSON<UtilityFile>("./foo/utils.json");

        expect(utilFileBeforeCheck.hash).toBe(utilFileAfterCheck.hash);
    });

    test("check command: checksum mismatch.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());
        await fs.mkdir(path.join(testDirPath, "foo"));
        await fs.writeFile(path.join(testDirPath, "foo", "index.ts"), "console.log('hello world')");
        process.chdir("./foo");
        await cmd.parseAsync(["node", "ki", "init", "foo"]);
        await fs.writeFile(path.join(testDirPath, "foo", "index2.ts"), "console.log('this file changes the hash')");
        process.chdir("..");

        const utilFileBeforeCheck = await readJSON<UtilityFile>("./foo/utils.json");

        await cmd.parseAsync(["node", "ki", "check", "foo"]);

        const utilFileAfterCheck = await readJSON<UtilityFile>("./foo/utils.json");

        expect(utilFileBeforeCheck.hash).not.toBe(utilFileAfterCheck.hash);
    });

    test("check all command: no utilities found in project.", async () => {
        vi.spyOn(console, "error");

        await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "ki", "check"]);

        expect(console.error).not.toHaveBeenCalled();
    });

    test("check all command: all checksums match.", async () => {
        vi.spyOn(console, "log");

        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());

        let i = 50;

        while (i > 0) {
            const name = `foo-${i}`;

            await fs.mkdir(path.join(testDirPath, name));
            await fs.writeFile(path.join(testDirPath, name, "index.ts"), "console.log('hello world')");
            process.chdir(`./${name}`);
            await cmd.parseAsync(["node", "ki", "init", name]);

            i--;
            process.chdir("..");
        }

        await cmd.parseAsync(["node", "ki", "check"]);

        i = 50;

        while (i > 0) {
            const name = `foo-${i}`;
            expect(console.log).toHaveBeenCalledWith(`utility "${name}" hash match!. no changes detected`);
            i--;
        }
    });

    test("check all command: half checksums do not match.", async () => {
        vi.spyOn(console, "log");

        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());

        let i = 50;

        while (i > 0) {
            const name = `foo-${i}`;

            await fs.mkdir(path.join(testDirPath, name));
            await fs.writeFile(path.join(testDirPath, name, "index.ts"), "console.log('hello world')");
            process.chdir(`./${name}`);
            await cmd.parseAsync(["node", "ki", "init", name]);

            i--;
            process.chdir("..");
        }

        i = 25;

        while (i > 0) {
            const name = `foo-${i}`;
            process.chdir(`./${name}`);

            await fs.writeFile(path.join(testDirPath, name, "index2.ts"), "console.log('should change stuff')");

            i--;
            process.chdir("..");
        }

        await cmd.parseAsync(["node", "ki", "check"]);

        i = 25;

        while (i > 0) {
            const name = `foo-${i}`;
            expect(console.log).toHaveBeenCalledWith(`${name} hash mismatch, updating on disk config file...`);

            i--;
            process.chdir("..");
        }
    });
});
