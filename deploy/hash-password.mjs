#!/usr/bin/env node
/**
 * Generate a scrypt password hash for LINEPROS_ADMIN_PASSWORD_HASH.
 * Run this on your laptop so the plaintext password never touches the droplet.
 *
 * Usage:
 *   node deploy/hash-password.mjs
 *
 * The password is read from stdin (hidden if your terminal supports it)
 * and is not written to disk or printed back.
 */
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { randomBytes, scryptSync } from "node:crypto";

function readHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input, output, terminal: true });
    const mute = input.isTTY;
    if (mute) {
      rl._writeToOutput = (stringToWrite) => {
        if (stringToWrite.includes(prompt)) output.write(prompt);
      };
    }
    rl.question(prompt, (answer) => {
      rl.close();
      if (mute) output.write("\n");
      resolve(answer);
    });
  });
}

const password = (await readHidden("Admin password (will not be echoed): ")).trim();
if (!password || password.length < 12) {
  console.error("Use a password of at least 12 characters.");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");
console.log(`LINEPROS_ADMIN_PASSWORD_HASH=scrypt$${salt}$${hash}`);
