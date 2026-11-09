/* Build an isolated browser acceptance fixture. Production saves and playback speed are untouched.
   node test/build-browser-review.mjs -> .tools/s56/review.html
   Serve the repository, open that page, click Run acceptance. Audio timing is accelerated only in this fixture.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let html = fs.readFileSync(path.join(root, 'ice-castle.html'), 'utf8');
html = html.replace("const SAVE_KEY = 'icecastle.save';", "const SAVE_KEY = 'icecastle.s56-review';")
  .replace("const OLD_STARS_KEY = 'icecastle.stars';", "const OLD_STARS_KEY = 'icecastle.s56-review-old';")
  .replace('src.buffer = buf;', 'src.buffer = buf; src.playbackRate.value = 16;')
  .replace('const uxWait = ms => new Promise(r => setTimeout(r, ms));', 'const uxWait = ms => new Promise(r => setTimeout(r, ms >= 8000 ? ms : Math.min(ms, 20)));');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><base href="/">');
const qa = String.raw`
  const qaPanel = document.createElement('aside');
  qaPanel.style = 'position:fixed;z-index:9999;left:8px;top:8px;padding:8px;background:#fff;color:#123;font:14px sans-serif;max-height:95vh;overflow:auto';
  qaPanel.innerHTML = '<button id="qa-run">Run acceptance</button> <button id="qa-rooms">Show room</button><select id="qa-room"></select><button id="qa-hide">Hide QA</button><pre id="qa-results">Ready (isolated QA save, accelerated audio)</pre>';
  document.body.appendChild(qaPanel);
  const qaOutput = qaPanel.querySelector('#qa-results'), qaSelect = qaPanel.querySelector('#qa-room');
  qaOutput.dataset.readyMs = String(Math.round(performance.now()));
  LEVELS.forEach((lv, i) => { const op = document.createElement('option'); op.value = i; op.textContent = lv.id; qaSelect.appendChild(op); });
  const qaWait = ms => new Promise(r => setTimeout(r, ms));
  async function qaUntil(check, label, timeout = 60000) {
    const end = performance.now() + timeout;
    while (!check()) { if (performance.now() > end) throw new Error('Timed out: ' + label); await qaWait(20); }
  }
  let qaKey = '';
  voice.onSubtitle(p => { if (p) qaKey = p.key; });
  qaPanel.querySelector('#qa-hide').onclick = () => { qaPanel.hidden = true; };
  qaPanel.querySelector('#qa-rooms').onclick = () => {
    const i = +qaSelect.value;
    voice.stop(); uxState.modal = null; $('modal').textContent = ''; story = null; uxClearOverlay();
    game.mode = 'solo'; game.player = 'nuan'; game.start(i); companion.reset(); handleEvents(); playFlow.phase = 'play';
    save.flags.tutorial = true; playFlow.tutoring = false;
    qaOutput.textContent = 'Room ' + LEVELS[i].id + ' (normal keyboard input)';
  };
  qaPanel.querySelector('#qa-run').onclick = async () => {
    const rows = [];
    const check = (ok, message) => { rows.push({ ok: !!ok, message }); qaOutput.textContent = JSON.stringify(rows, null, 2); if (!ok) throw new Error(message); };
    try {
      setSetting('sound', true); wakeAudio();
      // Silence the accelerated test rendering without changing the production sound setting.
      if (bus) bus.master.gain.value = 0;
      save.flags.prologue = save.flags.tutorial = save.flags.fullscreenTip = true;
      for (let i = 0; i < LEVELS.length; i++) {
        voice.stop(); game.state = 'title'; playFlow.phase = 'intro'; game.load(i); handleEvents();
        const lv = LEVELS[i];
        playFlow.wordBaseline = Object.fromEntries(lv.words.map(id => [id, (save.words[id] || {}).heard || 0]));
        if (i) await new Promise(done => showRecall(LEVELS[i - 1], done));
        showChapter(lv, () => {});
        if (i % 2) advanceStory(); // deliberately skip half the chapter lessons
        else { await qaUntil(() => $('overlay').querySelector('[data-act="go"].ux-pulse'), lv.id + ' chapter'); advanceStory(); }
        game.state = 'clear'; playFlow.phase = 'clear';
        markRoom(lv.id, { cleared: true, stars: [true, true, true], memory: true });
        let finished = false;
        showClear(lv, () => { finished = true; });
        await qaUntil(() => story && story.phase === 2, lv.id + ' review phase');
        advanceStory();
        check(story && story.phase === 2, lv.id + ': keyboard cannot skip unfinished review');
        await qaUntil(() => $('overlay').querySelector('#uxCtl [data-act="next"]'), lv.id + ' word review');
        const counts = Object.fromEntries(lv.words.map(id => [id, (save.words[id].heard || 0) - playFlow.wordBaseline[id]]));
        check(Object.values(counts).every(n => n >= 8), lv.id + ': >=8 completed hearings ' + JSON.stringify(counts));
        advanceStory();
        if (i % 2) advanceStory(); // quiz is optional
        else {
          let previous = '';
          for (let q = 0; q < lv.words.length; q++) {
            await qaUntil(() => qaKey.startsWith('quiz_') && lv.words.includes(qaKey.slice(5)) && qaKey !== previous, lv.id + ' quiz question');
            previous = qaKey;
            const target = qaKey.slice(5);
            if (q === 0) {
              const wrong = lv.words.find(w => w !== target);
              $('overlay').querySelector('[data-act="pick"][data-word="' + wrong + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
              check(!!$('overlay').querySelector('.ux-glow'), lv.id + ': incorrect quiz answer gets a picture hint');
            }
            $('overlay').querySelector('[data-act="pick"][data-word="' + target + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
        }
        await qaUntil(() => story && story.phase === 4, lv.id + ' finished quiz');
        advanceStory();
        check(finished, lv.id + ': clear/quiz/next callback completed');
      }
      game.start(0); companion.reset(); handleEvents(); playFlow.phase = 'play';
      showSettings();
      check(!canPlay(), 'Parent settings pause the room');
      setSetting('subtitles', true); setSetting('english', 'words'); setSetting('mode', 'duo');
      const restored = loadSave();
      check(restored.settings.subtitles && restored.settings.english === 'words' && restored.settings.mode === 'duo', 'Parent settings persist');
      check(Object.values(restored.rooms).filter(r => r.cleared).length === 10, 'All ten room results persist');
      check(save.stickers.length >= 20, 'Room and gold stickers awarded');
      $('modal').textContent = ''; uxState.modal = null;
      setSetting('mode', 'solo'); setSetting('subtitles', false);
      game.start(0); companion.reset(); handleEvents(); playFlow.phase = 'play';
      guideReset(); guideTick(10.1, 10.1, true);
      check(guideFx.nextSay > 10, '10-second stuck voice hint scheduled');
      guideTick(10.1, 20.2, true);
      check(guideFx.trail.getAttribute('visibility') === 'visible', '20-second sparkle path appears');
      voice.stop(); goTitle();
      qaOutput.textContent = JSON.stringify({ status: 'passed', accelerated: true, checks: rows }, null, 2);
      qaOutput.dataset.status = 'passed';
    } catch (e) {
      voice.stop(); qaOutput.textContent = JSON.stringify({ status: 'failed', error: e.stack, checks: rows }, null, 2); qaOutput.dataset.status = 'failed';
    }
  };
`;
const end = html.lastIndexOf('})();');
if (end < 0) throw new Error('Missing view IIFE');
html = html.slice(0, end) + qa + html.slice(end);
const out = path.join(root, '.tools/s56/review.html');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
console.log(out);
