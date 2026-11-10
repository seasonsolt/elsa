/* PLAN-2 B6: the stage is refitted when the window or a block beside it changes size (resize event, ResizeObserver), not on every
   20th frame. The real 80-input.js and 90-main.js run in the fake page of input-safety.test.mjs, with a ResizeObserver and an
   animation-frame queue the test drives by hand and a getComputedStyle that counts the layout reads a refit makes. */
import { viewEnv } from './input-safety.test.mjs';

function page({ withObserver = true } = {}) {
  const probe = { styleReads: 0, observers: [], rafs: [], intervals: [] };
  class FakeResizeObserver {
    constructor(cb) { this.cb = cb; this.targets = []; probe.observers.push(this); }
    observe(el) { this.targets.push(el); }
    disconnect() { this.targets = []; }
  }
  const globals = {
    advanceStory() {}, voice: { busy: false, stop() {}, line: () => Promise.resolve(true) },
    getComputedStyle: () => { probe.styleReads++; return { rowGap: '8px', paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px', display: 'block' }; },
    requestAnimationFrame: fn => { probe.rafs.push(fn); return probe.rafs.length; },
    setInterval: (fn, ms) => { probe.intervals.push({ fn, ms }); return probe.intervals.length; },
  };
  if (withObserver) globals.ResizeObserver = FakeResizeObserver;
  const env = viewEnv.playPage('solo', { globals });
  const root = env.ctx.document.documentElement;
  root.clientWidth = 1200; root.clientHeight = 800;
  const stage = env.getEl('stage');
  /** run the animation frames queued so far except the game loop itself; returns how many callbacks ran */
  const runRaf = () => {
    const due = probe.rafs.filter(fn => fn !== env.exports.frame);
    probe.rafs = probe.rafs.filter(fn => fn === env.exports.frame);
    due.forEach(fn => fn());
    return due.length;
  };
  return { env, probe, root, stage, runRaf };
}

export async function framesNeverRefitTheStage({ assert }) {
  const p = page();
  await p.env.clock.settle();   // let the load-time refit (after the images decoded) happen first
  p.probe.styleReads = 0;
  for (let i = 1; i <= 240; i++) p.env.exports.frame(i * 16.7);
  assert.equal(p.probe.styleReads, 0, '240 frames read no layout: the old every-20th-frame refit is gone');
}

export async function theObserverWatchesThePageAndNeverTheStage({ assert }) {
  const p = page();
  assert.equal(p.probe.observers.length, 1, 'one ResizeObserver');
  const [ro] = p.probe.observers;
  const doc = p.env.ctx.document;
  assert.ok(ro.targets.includes(doc.documentElement), 'the page is watched');
  assert.ok(ro.targets.includes(doc.body), 'the body is watched');
  assert.ok(!ro.targets.includes(p.stage), 'watching the stage itself would loop with the refit');
}

export async function aBurstOfSizeChangesQueuesOneRefitForTheNextFrame({ assert }) {
  const p = page();
  await p.env.clock.settle();
  const [ro] = p.probe.observers;
  p.runRaf();
  p.probe.styleReads = 0;

  p.root.clientWidth = 900;
  ro.cb([{}, {}, {}]); ro.cb([{}]); ro.cb([{}]);
  assert.equal(p.probe.styleReads, 0, 'the callback itself reads no layout');
  assert.equal(p.runRaf(), 1, 'three notifications, one queued refit');
  assert.ok(p.probe.styleReads > 0, 'the refit ran');
  assert.equal(p.stage.style.width, '900px', 'the stage follows the new window width');
  assert.equal(p.stage.style.height, Math.round(900 / (960 / 520)) + 'px');

  p.root.clientWidth = 700;
  ro.cb([{}]);
  assert.equal(p.runRaf(), 1, 'a later change queues again');
  assert.equal(p.stage.style.width, '700px');
}

export async function theResizeEventStillRefitsAtOnce({ assert }) {
  const p = page();
  await p.env.clock.settle();
  p.root.clientWidth = 1000;
  for (const l of p.env.windowListeners.filter(l => l.type === 'resize')) l.fn({ type: 'resize' });
  assert.equal(p.stage.style.width, '1000px', 'no wait for a frame');
}

export async function withoutResizeObserverTheStageIsRefitOncePerSecond({ assert }) {
  const p = page({ withObserver: false });
  assert.equal(p.probe.observers.length, 0);
  const tick = p.probe.intervals.find(i => i.ms === 1000);
  assert.ok(tick, 'a one second fallback timer');
  p.root.clientWidth = 640;
  tick.fn();
  assert.equal(p.stage.style.width, '640px');
}
