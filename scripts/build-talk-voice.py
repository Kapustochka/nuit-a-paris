"""Voice the conversations with passers-by (src/talk-lines.js) with Piper.

    python scripts/build-talk-voice.py fr_FR-siwis-medium.onnx fr_FR-upmc-medium.onnx

Passer-by lines get a female (siwis) and a male (upmc, speaker "pierre") version:
assets/voice/talk/<id>-n<step>-f|m.mp3, <id>-end-f|m.mp3 and huh-<n>-f|m.mp3.
The heroine's answers use siwis: <id>-p<step>-<choice>.mp3. Needs ffmpeg on PATH.
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import wave

from piper import PiperVoice, SynthesisConfig

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("female", type=Path)
parser.add_argument("male", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
data = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "const m = await import('./src/talk-lines.js'); console.log(JSON.stringify(m));",
], text=True, cwd=root))
npc, hero = {}, {}
for tid, talk in data["talks"].items():
    for i, step in enumerate(talk["steps"]):
        if step["npc"]:
            npc[f"{tid}-n{i}"] = step["npc"][0]
        for c, (fr, _ru) in enumerate(step["choices"]):
            hero[f"{tid}-p{i}-{c}"] = fr
    npc[f"{tid}-end"] = talk["end"][0]
for n, (fr, _ru) in enumerate(data["puzzled"]):
    npc[f"huh-{n}"] = fr
out = root / "assets/voice/talk"
out.mkdir(exist_ok=True)
female = PiperVoice.load(args.female)
male = PiperVoice.load(args.male)
jobs = [(female, SynthesisConfig(), name, text) for name, text in hero.items()]
jobs += [(female, SynthesisConfig(), name + "-f", text) for name, text in npc.items()]
jobs += [(male, SynthesisConfig(speaker_id=1), name + "-m", text) for name, text in npc.items()]
with tempfile.TemporaryDirectory() as scratch:
    raw = Path(scratch) / "clip.wav"
    for voice, config, name, text in jobs:
        with wave.open(str(raw), "wb") as wav:
            voice.synthesize_wav(text, wav, syn_config=config)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ac", "1",
                        "-codec:a", "libmp3lame", "-b:a", "40k", str(out / (name + ".mp3"))], check=True)
print(f"Built {len(jobs)} clips.")
