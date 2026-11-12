"""Build the French lesson audio with Piper."""
import argparse
import json
from pathlib import Path
import subprocess
import wave

from piper import PiperVoice, SynthesisConfig

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model", type=Path, help="Path to fr_FR-siwis-medium.onnx")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = root / "src/french-words.js"
lesson = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    """import fs from 'node:fs';
const source = fs.readFileSync(process.argv[1], 'utf8');
const lesson = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
console.log(JSON.stringify(lesson));""",
    str(source),
], text=True))
voice = PiperVoice.load(args.model)
output = root / "assets/voice"
output.mkdir(exist_ok=True)
clips = {"bakery-order": lesson["bakeryOrder"]}
for key, (term, _ipa, _reading, _translation, example, _meaning) in lesson["words"].items():
    clips[f"{key}-term"] = term + "."
    clips[f"{key}-example"] = example
for name, text in clips.items():
    with wave.open(str(output / (name + ".wav")), "wb") as wav:
        voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=1.05))
print(f"Built {len(clips)} clips.")
