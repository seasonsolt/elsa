/* ESLint (flat config) for the game sources and the node tests. Run: npx eslint .   (make check does)

   src/*.js, src/lib/*.js and src/view/*.js are plain scripts that share globals across files (the logic group in one <script>,
   lib + view fragments in one IIFE scope; see art/build_page.py). ESLint sees one file at a time, so `no-undef` needs to know
   the names the other files declare. Those are read from the files themselves (the top-level declarations of each script,
   parsed with espree), so there is no list to keep in step by hand. A name that is used but declared nowhere is still an error. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import globals from 'globals';
import * as espree from 'espree';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const jsFiles = dir => fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js')).sort().map(f => path.join(ROOT, dir, f));

/** Names declared at the top level of the given scripts: functions, classes, and every identifier of a const / let / var
 *  (including several declarators and destructuring). */
function topLevelNames(files) {
  const names = new Set();
  const addPattern = p => {
    if (!p) return;
    if (p.type === 'Identifier') names.add(p.name);
    else if (p.type === 'ObjectPattern') for (const x of p.properties) addPattern(x.type === 'RestElement' ? x.argument : x.value);
    else if (p.type === 'ArrayPattern') p.elements.forEach(addPattern);
    else if (p.type === 'AssignmentPattern') addPattern(p.left);
    else if (p.type === 'RestElement') addPattern(p.argument);
  };
  for (const f of files) {
    const ast = espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2022, sourceType: 'script' });
    for (const node of ast.body) {
      if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) names.add(node.id.name);
      else if (node.type === 'VariableDeclaration') for (const d of node.declarations) addPattern(d.id);
    }
  }
  return names;
}

/** One config entry per script: it gets the names the OTHER files of its group declare (its own are real declarations, not globals). */
function groupConfigs(files, extra) {
  const own = new Map(files.map(f => [f, [...topLevelNames([f])]]));
  return files.map(f => {
    const others = {};
    for (const [g, names] of own) if (g !== f) for (const n of names) others[n] = 'writable';
    for (const n of own.get(f)) delete others[n];
    return { files: [path.relative(ROOT, f)], languageOptions: { sourceType: 'script', ecmaVersion: 2022, globals: { ...extra, ...others } } };
  });
}

const logicFiles = jsFiles('src');
const pageFiles = [...jsFiles('src/lib'), ...jsFiles('src/view')];
const logicGlobalNames = [...topLevelNames(logicFiles)];
/* the view scope sees the logic group too (the logic <script> runs first) */
const logicAsGlobals = Object.fromEntries(logicGlobalNames.map(n => [n, 'writable']));

const rules = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', vars: 'local' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  { ignores: ['node_modules/**', 'castle3d/**', 'art/**', 'game/**', '.tools/**', 'ice-castle.html'] },
  js.configs.recommended,
  { rules },
  ...groupConfigs(logicFiles, globals.es2021),
  ...groupConfigs(pageFiles, { ...globals.es2021, ...globals.browser, ...logicAsGlobals }),
  {
    files: ['test/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2022, globals: { ...globals.node } },
  },
];
