/* Anna's ElevenLabs voice in art/narration.py and its ASR check in art/asr_check.py. Hermetic: urllib is replaced inside the spawned
   Python, nothing reaches the network and no key is needed. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const py = (script, env) => spawnSync('python3', ['-c', script, ROOT], { encoding: 'utf8', env: { ...process.env, ...env } });
const PRE = `import sys,json,os,tempfile,pathlib;sys.path.insert(0,sys.argv[1]+'/art');import narration as n
root=pathlib.Path(sys.argv[1]);c=n.Content(root/'src/content/lines.json',root/'src/content/words.json')
`;

export function annaReadsAWholeMixedLineInOneRequest({ assert }) {
  const r = py(PRE + `
segs=c.spoken('start_hall_1','nuan')
assert len(segs)==1 and segs[0]['lang']=='mix', segs
assert segs[0]['text']=='Hello! 姐姐，我跟着 star 的光，找到你啦！', segs[0]['text']
assert c.spoken('learn_ball','nuan')[0]['text'].startswith('要用大大的 ball。看，ball 就是球')
assert all(len(c.spoken(k,'frost'))>=1 for k in c.lines if c.lines[k]['who']=='frost')
elsa=[k for k in c.lines if c.lines[k]['who']=='frost'][0]
assert c.spoken(elsa,'frost')==c.segments(elsa,'frost'), 'edge-tts keeps one request per segment'
print('ok')`);
  assert.equal(r.status, 0, r.stderr);
}

export function anElevenLabsSpeakerMustUseOneVoiceAndAValidSpeed({ assert }) {
  const r = py(PRE + `
doc=json.loads((root/'src/content/lines.json').read_text())
def bad(edit, msg):
  d=json.loads(json.dumps(doc)); edit(d)
  with tempfile.TemporaryDirectory() as t:
    p=pathlib.Path(t)/'l.json'; p.write_text(json.dumps(d))
    try: n.Content(p, root/'src/content/words.json')
    except n.Fail as e: assert msg in str(e), str(e); return
  raise AssertionError('accepted: '+msg)
bad(lambda d: d['voices']['nuan']['en'].__setitem__(0,'elevenlabs:other'), 'same voice')
bad(lambda d: d['voices']['nuan']['en'].__setitem__(1,'-50%'), 'rate within')
bad(lambda d: d['voices']['nuan']['zh'].__setitem__(2,'v4'), 'eleven_<model>')
print('ok')`);
  assert.equal(r.status, 0, r.stderr);
}

export function elevenLabsRequestsCarryModelSpeedAndTheKeyOnlyInAHeader({ assert }) {
  const r = py(PRE + `
import urllib.request
seen=[]
class R:
  def __enter__(self): return self
  def __exit__(self,*a): pass
  def read(self): return b'ID3fake'
def fake(req, timeout=None):
  seen.append((req.full_url, dict(req.header_items()), json.loads(req.data))); return R()
urllib.request.urlopen=fake
word=c.voice('nuan','en'); line=c.voice('nuan','zh')
with tempfile.TemporaryDirectory() as t:
  n.synth_all({'a':(word,'ball'),'b':(line,'哪个是 ball？')}, t)
  assert sorted(os.listdir(t))==['a.raw.mp3','b.raw.mp3']
by={b['text']:(u,h,b) for u,h,b in seen}
u,h,b=by['ball']
assert u.startswith('https://api.elevenlabs.io/v1/text-to-speech/'+word[0].split(':',1)[1]+'?'), u
assert b=={'text':'ball','model_id':'eleven_v4','voice_settings':{'speed':0.85}}, b
assert h['Xi-api-key']=='k-test' and 'k-test' not in u
assert 'voice_settings' not in by['哪个是 ball？'][2], 'a line is read at the voice own speed'
del os.environ['ELEVENLABS_API_KEY']
try: n.synth_all({'a':(word,'ball')}, '.')
except n.Fail as e: assert 'ELEVENLABS_API_KEY' in str(e)
else: raise AssertionError('ran without a key')
print('ok')`, { ELEVENLABS_API_KEY: 'k-test' });
  assert.equal(r.status, 0, r.stderr);
}

export function asrJudgesMixedLinesByChineseCharactersAndEveryEnglishWord({ assert }) {
  const r = py(`import sys;sys.path.insert(0,sys.argv[1]+'/art');import asr_check as a
assert a.judge_mix('哪个是 ball？点一点！','哪个是Ball?点一点!',0.1)==('OK','')
assert a.judge_mix('要用大大的 ball。','要用大大的波。',0.1)[0]=='DIFF'
assert a.judge_mix('一起数 one, two, three!','一起数 1, 2, 3',0.1)==('OK','')
assert a.judge_mix('红红的 heart','红红的 heart',0.1)==('OK','')
assert a.judge_mix('红红的 heart','宏红的 heart',0.1)[0]=='NEAR'
assert a.judge_mix('会变得很 fast','会变得很快',0.1,'hui bian de hen fast')==('OK',''), 'a word heard in the en pass counts'
print('ok')`);
  assert.equal(r.status, 0, r.stderr);
}
