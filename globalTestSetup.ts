import fs from "fs";
import path from "path";
import os from "os";

if (fs.existsSync(path.join(os.tmpdir(), "ki"))) {
    fs.rmSync(path.join(os.tmpdir(), "ki"));
}

fs.mkdirSync(path.join(os.tmpdir(), "ki", ".ki"), { recursive: true });
