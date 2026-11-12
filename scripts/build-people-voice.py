"""Build what the passers-by say aloud (src/people.js) with two Piper voices.

    python scripts/build-people-voice.py fr_FR-siwis-medium.onnx fr_FR-upmc-medium.onnx

Women use the first voice, men the second (speaker "pierre" of the two-speaker UPMC model). Clips go to assets/voice/people/<key>-f.mp3
and <key>-m.mp3 (needs ffmpeg on PATH). Lines are the GREETINGS keys of src/people.js,
their text is the term in src/french-words.js.
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
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
words = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "const { words } = await import('./src/french-words.js'); console.log(JSON.stringify(words));",
], text=True, cwd=root))
source = (root / "src/people.js").read_text(encoding="utf-8")
keys = re.findall(r"'(\w+)'", re.search(r"const GREETINGS = \[(.*?)\];", source, re.S).group(1))
out = root / "assets/voice/people"
out.mkdir(exist_ok=True)
female = SynthesisConfig(length_scale=1.0)
male = SynthesisConfig(length_scale=1.0, speaker_id=1)
with tempfile.TemporaryDirectory() as scratch:
    raw = Path(scratch) / "clip.wav"
    for suffix, model, config in (("f", args.female, female), ("m", args.male, male)):
        voice = PiperVoice.load(model)
        for key in keys:
            with wave.open(str(raw), "wb") as wav:
                voice.synthesize_wav(words[key][0], wav, syn_config=config)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ac", "1",
                            "-codec:a", "libmp3lame", "-b:a", "48k", str(out / f"{key}-{suffix}.mp3")], check=True)
print(f"Built {2 * len(keys)} clips.")
