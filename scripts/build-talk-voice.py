"""Voice the conversations with passers-by (src/talk-lines.js) with Piper.

    python scripts/build-talk-voice.py fr_FR-siwis-medium.onnx fr_FR-upmc-medium.onnx

Passer-by lines get a female (siwis) and a male (upmc, speaker "pierre") version:
assets/voice/talk/<id>-n<step>-f|m.mp3, <id>-end-f|m.mp3 and huh-<n>-f|m.mp3.
The heroine's answers use siwis: <id>-p<step>-<choice>.mp3. Lines that depend on the heroine's
earlier choice (café orders) become <id>-n<step>-<choice key>-f|m.mp3. Needs ffmpeg on PATH.
--only commande boulangerie rebuilds just those conversations (and skips the "Pardon ?" lines).
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
parser.add_argument("--only", nargs="+", help="conversation ids to build")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
data = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "const m = await import('./src/talk-lines.js'); console.log(JSON.stringify(m));",
], text=True, cwd=root))
npc, hero = {}, {}
for tid, talk in data["talks"].items():
    if args.only and tid not in args.only:
        continue
    for i, step in enumerate(talk["steps"]):
        if isinstance(step["npc"], list):
            npc[f"{tid}-n{i}"] = step["npc"][0]
        elif step["npc"]:
            for key, (fr, _ru) in step["npc"]["lines"].items():
                npc[f"{tid}-n{i}-{key}"] = fr
        for c, choice in enumerate(step["choices"]):
            hero[f"{tid}-p{i}-{c}"] = choice[0]
    npc[f"{tid}-end"] = talk["end"][0]
if not args.only:
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
