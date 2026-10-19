// The editor lab's production exclusion gate (PS-1A). See tests/lab/config.ts.
import { labConfig } from "./tests/lab/config";

const config = { ...labConfig({ production: true }), testDir: "./tests/lab" };

export default config;
