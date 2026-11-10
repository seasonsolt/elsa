/* PLAN-2 B1: the legacy solo paths are gone and stay gone. Elsa is the only solo player, nobody swaps, the deprecated narrator voice,
   Elsa's English voice, the uncalled aliases and the dead voice lines no longer exist. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewEnv } from './input-safety.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

export function noSwapNarratorOrDeadAliasLeftInTheSources({ assert }) {
  const files = [...walk('src'), 'art/narration.py'];
  const banned = [/swap/i, /narrator/i, /\bsetMusic\b/, /\bplayVoice\b/, /\bdrawTalk\b/, /\bfunction speak\b/, /\bfreezeHelp\b/, /\bonPlayerSwapped\b/];
  const hits = [];
  for (const f of files) for (const re of banned) if (re.test(read(f))) hits.push(`${f}: ${re}`);
  assert.deepEqual(hits, []);
}

export function theDeadVoiceConfigAndLinesAreGone({ assert }) {
  const doc = JSON.parse(read('src/content/lines.json'));
  assert.deepEqual(Object.keys(doc.voices).sort(), ['frost', 'nuan'], 'no narrator voice');
  assert.deepEqual(Object.keys(doc.voices.frost), ['zh'], 'Elsa has no English voice');
  for (const key of ['tutor_swap', 'miss_nuan', 'ui_swap']) assert.equal(key in doc.lines, false, `${key} is gone`);
  assert.ok('miss_frost' in doc.lines && 'tutor_move' in doc.lines, 'the live neighbours stay');
}

export function noSolutionOrRunnerStillPlaysAnnaAsThePlayer({ assert }) {
  for (const f of walk('test/solutions')) assert.doesNotMatch(read(f), /me === 'nuan'|me === 'frost'|player: me/, `${f} branches on who plays`);
  assert.doesNotMatch(read('test/run.mjs'), /'nuan'\)|solo\/nuan/, 'test/run.mjs has no solo/nuan run');
}

export function soloIsAlwaysElsaAndHasNoSwapKeyOrButton({ assert }) {
  const env = viewEnv.playPage('solo', { touch: true });
  const { game, save, inputSeen, padState } = env.exports;
  assert.equal(game.player, 'frost');
  for (let i = 0; i < 5; i++) { env.tap('tSwitch'); env.keydown('Tab'); env.keyup('Tab'); }
  assert.equal(game.player, 'frost', 'the duo switch button and Tab do nothing in solo');
  assert.equal(save.settings.player, 'frost');
  assert.equal(game.events.some(e => e.type === 'swap'), false);
  assert.equal('tab' in game.kbd, false, 'the keyboard diagram has no Tab key');
  assert.equal('swap' in inputSeen, false, 'the tutorial tracks no swap');
  assert.equal('swap' in padState, false, 'the gamepad has no swap button');
  assert.equal(game.input.frost.l + game.input.frost.r + game.input.nuan.l + game.input.nuan.r, 0);
}
