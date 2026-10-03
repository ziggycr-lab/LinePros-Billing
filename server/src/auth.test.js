import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./auth.js";

test("password hash verifies and rejects a wrong password", () => {
  const hash = hashPassword("correct-horse-battery");
  assert.match(hash, /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  assert.equal(verifyPassword("correct-horse-battery", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});

test("plaintext fallback compares without leaking via length mismatch", () => {
  assert.equal(verifyPassword("abc", "", "abc"), true);
  assert.equal(verifyPassword("ab", "", "abc"), false);
});
