import fs from "fs-extra";
import path from "path";
import os from "os";

if (fs.existsSync(path.join(os.tmpdir(), "ki"))) {
    fs.removeSync(path.join(os.tmpdir(), "ki"));
}

fs.mkdirpSync(path.join(os.tmpdir(), "ki", ".ki"));
