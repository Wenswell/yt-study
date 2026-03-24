import { homedir } from "node:os";
import path from "node:path";

export const APP_NAME = "yt-study";
export const DEFAULT_OUTPUT_DIR = path.join(homedir(), "." + APP_NAME, "outputs");
