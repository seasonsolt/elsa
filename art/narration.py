"""Voice the story pages, in-level lines and memories with edge-tts into game/vo_<id>.mp3.

Run with a Python that has edge_tts:  ~/lemo-opuscar/.venv/bin/python narration.py [--all]
Existing clips are kept unless --all is given.
"""
import asyncio, json, os, subprocess, sys, tempfile
import edge_tts

VOICES = {
    'N': ('zh-CN-XiaoxiaoNeural', '-8%', '+0Hz'),   # narrator
    'F': ('zh-CN-XiaoyiNeural', '-6%', '-6Hz'),     # 霜霜, the elder
    'A': ('zh-CN-XiaoyiNeural', '+4%', '+18Hz'),    # 暖暖, the younger
}
PAGES = {
    'p1': [('N', '小时候，霜霜的手心会飘出雪花。姐妹俩常在大厅里堆雪人，暖暖最喜欢那个戴红围巾的雪人。')],
    'p2': [('N', '长大后，霜霜怕伤到妹妹，总是关着房门。丰收节那天，她的寒气失控了：港口一夜冰封，夏天变成了永冬。霜霜一个人，逃进了北山的冰堡。')],
    'p3': [('N', '暖暖提着灯笼，追上了山。'), ('A', '姐姐，我们一起回家吧。'),
           ('N', '只有姐妹俩一起，才能穿过冰堡的四个房间，把小时候的雪人重新堆起来。')],
    'c1': [('N', '第一个房间，冰堡大厅。暖暖在大厅里找到了姐姐。'), ('F', '别靠近我，我控制不住。'), ('A', '那我们就一起想办法。')],
    'c2': [('N', '第二个房间，冰湖长廊。冰堡后面的湖只冻住了一半。霜霜第一次试着轻轻地用魔法，为妹妹冻出一条路。')],
    'c3': [('N', '第三个房间，机关塔楼。塔楼的铁门很重，一个人打不开。一个踩住机关，另一个往前走。这一次，换霜霜相信妹妹。')],
    'c4': [('N', '第四个房间，星光舞厅。舞厅里散落着三个大雪球，是小时候的回忆。把那个戴红围巾的雪人，重新堆起来吧。')],
    'win': [('A', '姐姐，你看，雪人回来了！'), ('F', '嗯，我们一起堆的。')],
    'end': [('N', '霜霜终于明白：让冰雪听话的，不是害怕，而是爱。永冬一点点融化，港口的船，又能出海了。')],
}

def say(text, who, out):
    voice, rate, pitch = VOICES[who]
    for i in range(3):
        try:
            asyncio.run(edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(out))
            if os.path.getsize(out) > 0: return
        except Exception:
            if i == 2: raise

LINES = json.load(open('lines.json', encoding='utf-8'))
for k, (who, text) in LINES['say'].items(): PAGES[f's_{k}'] = [(who, text)]
for m in LINES['memory']: PAGES[m['id']] = [(m['who'], ''.join(m['lines']))]
redo = '--all' in sys.argv

os.makedirs('game', exist_ok=True)
durs = {}
with tempfile.TemporaryDirectory() as tmp:
    for pid, lines in PAGES.items():
        out = f'game/vo_{pid}.mp3'
        if os.path.exists(out) and not redo: continue
        parts = []
        for k, (who, text) in enumerate(lines):
            raw = f'{tmp}/{pid}_{k}.mp3'; say(text, who, raw)
            wav = f'{tmp}/{pid}_{k}.wav'   # trim edges, then leave a breath between speakers
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af',
                            'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.35',
                            '-ar', '24000', '-ac', '1', wav], check=True)
            parts.append(wav)
        lst = f'{tmp}/{pid}.txt'
        open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst,
                        '-af', 'loudnorm=I=-18:TP=-2', '-ar', '24000', '-ac', '1', '-b:a', '56k', out], check=True)
        d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out],
                                 capture_output=True, text=True, check=True).stdout)
        durs[pid] = round(d, 2)
print(json.dumps(durs, ensure_ascii=False))
