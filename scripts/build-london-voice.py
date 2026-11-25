"""Build all English voice clips for Night in London with Piper.

    python scripts/build-london-voice.py en_GB-cori-high.onnx en_GB-northern_english_male-medium.onnx

Voices (sherpa-onnx "tts-models" release on GitHub):
  - cori (high): UK English female, trained on LibriVox recordings (public domain).
  - northern_english_male (medium): OpenSLR 83, CC BY-SA 4.0.
The heroine, the word cards, falling stars, the passport and the evening list use the female
voice; passers-by get both (-f / -m). Everything goes to assets/london/voice/ as MP3 with the
same clip names as Paris uses under assets/voice/. Needs ffmpeg on PATH.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile
import wave

from piper import PiperVoice, SynthesisConfig

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("female", type=Path)
parser.add_argument("male", type=Path)
parser.add_argument("--missing", action="store_true", help="Build only clips that do not exist yet")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
data = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    """globalThis.NUIT_CITY = 'london';
const { words } = await import('./src/french-words.js');
const { starClips } = await import('./src/entries.js');
const { talks, puzzled } = await import('./src/talk-lines.js');
const { PLACES } = await import('./src/passport.js');
const { TASKS, BRAVO } = await import('./src/evening.js');
console.log(JSON.stringify({ words, star: starClips(), talks, puzzled, PLACES, TASKS, BRAVO }));""",
], text=True, cwd=root))

end = lambda text: text if re.search(r"[.!?»”]$", text) else text + "."
female, both = {}, {}
for key, (term, _ipa, _reading, _tr, example, _meaning) in data["words"].items():
    female[f"{key}-term"] = end(term)
    female[f"{key}-example"] = example
female.update(data["star"])
for pid, _how, name, _ru, line, _line_ru in data["PLACES"]:
    female[f"place/{pid}-name"] = end(name)
    female[f"place/{pid}"] = line
for tid, line, *_ in data["TASKS"]:
    female[f"evening/{tid}"] = line
female["evening/bravo"] = data["BRAVO"][0]
for tid, talk in data["talks"].items():
    for i, step in enumerate(talk["steps"]):
        if step["npc"]:
            both[f"talk/{tid}-n{i}"] = step["npc"][0]
        for c, (line, _ru) in enumerate(step["choices"]):
            female[f"talk/{tid}-p{i}-{c}"] = line
    both[f"talk/{tid}-end"] = talk["end"][0]
for n, (line, _ru) in enumerate(data["puzzled"]):
    both[f"talk/huh-{n}"] = line
source = (root / "src/people.js").read_text(encoding="utf-8")
for key in {k for block in re.findall(r"GREETINGS = \[(.*?)\];", source, re.S) for k in re.findall(r"'(\w+)'", block)}:
    both[f"people/{key}"] = data["words"][key][0]

out = root / "assets/london/voice"
jobs = [(name, text, "f") for name, text in female.items()]
jobs += [(f"{name}-{s}", text, s) for name, text in both.items() for s in "fm"]
voices = {"f": PiperVoice.load(args.female), "m": PiperVoice.load(args.male)}
config = SynthesisConfig(length_scale=1.05)
built = 0
with tempfile.TemporaryDirectory() as scratch:
    raw = Path(scratch) / "clip.wav"
    for name, text, who in jobs:
        target = out / (name + ".mp3")
        if args.missing and target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(raw), "wb") as wav:
            voices[who].synthesize_wav(text, wav, syn_config=config)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ac", "1",
                        "-codec:a", "libmp3lame", "-b:a", "48k", str(target)], check=True)
        built += 1
print(f"Built {built} clips.")
