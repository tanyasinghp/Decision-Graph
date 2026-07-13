#!/usr/bin/env node
/**
 * dg entrypoint. In development run via tsx:  npm run dg -- <command>
 * (A compiled bin ships with the package build.)
 */
import { run } from "../src/app.js";

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
