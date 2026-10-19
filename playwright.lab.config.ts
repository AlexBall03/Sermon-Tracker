// The editor lab's development server (PS-1A). See tests/lab/config.ts.
import { labConfig } from "./tests/lab/config";

const config = { ...labConfig({ production: false }), testDir: "./tests/lab" };

export default config;
