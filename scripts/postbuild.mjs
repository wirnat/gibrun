import { chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const target = path.resolve(__dirname, "../build/index.js");

try {
    await chmod(target, 0o755);
    console.log("Made build/index.js executable");
} catch (error) {
    if ((error && error.code) === "ENOENT") {
        console.warn("build/index.js not found, skipped chmod");
    } else {
        throw error;
    }
}
