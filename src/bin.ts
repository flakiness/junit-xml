#!/usr/bin/env node
import { createCommand } from './cli.js';

createCommand('flakiness-junit-xml').parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
