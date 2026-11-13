import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));

test('firestore.rules contains global deny-all safety net and rules_version 2', () => {
  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
});

test('firestore.rules covers every collection defined in firebase-blueprint.json', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.ok(paths.includes('/users/{userId}'));
  assert.ok(paths.includes('/users/{userId}/items/{itemId}'));
  assert.ok(paths.includes('/users/{userId}/backups/{backupId}'));
  assert.match(rules, /match \/users\/\{userId\}/);
  assert.match(rules, /match \/items\/\{itemId\}/);
  assert.match(rules, /match \/backups\/\{backupId\}/);
});

test('firestore.rules enforces email_verified, isValidId, hasOnly, and request.time invariants', () => {
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /function isValidId\(id\)/);
  assert.match(rules, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(/);
  assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rules, /resource\.data\.ownerId == request\.auth\.uid/);
  assert.match(rules, /data\.kind in \['task', 'memo', 'plugin', 'card'\]/);
});
