/** Round 8 test helper (not a test). Loads a file of src/, or of the tree named by CS_R8_SRC: qa/r8/run-old.sh builds a tree of the code as it was before round 8 and
 * runs the round 8 tests against it, to show that each one fails on the old code. */
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const SRC = process.env.CS_R8_SRC || join(here, "..", "src");
export const load = (rel) => import(pathToFileURL(join(SRC, rel)).href);
export const readSrc = (rel) => readFileSync(join(SRC, rel), "utf8");
