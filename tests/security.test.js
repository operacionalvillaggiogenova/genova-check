import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, normalizeUsername, sha256, validatePassword, verifyPassword } from '../src/security.js';

test('senha simples é armazenada somente como hash verificável', async () => {
  const password = 'senha-simples';
  const stored = await hashPassword(password);
  assert.match(stored, /^pbkdf2-sha256\$/);
  assert.equal(stored.includes(password), false);
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword('senha-incorreta', stored), false);
});

test('usuário é normalizado sem exigir e-mail', () => {
  assert.equal(normalizeUsername('  Joao.Silva  '), 'joao.silva');
  assert.throws(() => normalizeUsername('a'));
});

test('senha não exige composição, somente tamanho mínimo', () => {
  assert.equal(validatePassword('abcdefgh'), 'abcdefgh');
  assert.throws(() => validatePassword('curta'));
});

test('sha256 aceita texto e bytes', async () => {
  const text = await sha256('abc');
  const bytes = await sha256(new TextEncoder().encode('abc'));
  assert.equal(text, bytes);
});

