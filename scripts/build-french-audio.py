"""Build the French lesson audio with Piper.

Street words become WAV files in assets/voice. Falling-star content is larger,
so it is compressed to MP3 in assets/voice/star (needs ffmpeg on PATH).
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import wave

from piper import PiperVoice, SynthesisConfig

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model", type=Path, help="Path to fr_FR-siwis-medium.onnx")
parser.add_argument("--only", choices=["street", "star"], help="Build only one group of clips")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
lesson = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    """const lesson = await import('./src/french-words.js');
const { starClips } = await import('./src/entries.js');
console.log(JSON.stringify({ ...lesson, star: starClips() }));""",
], text=True, cwd=root))
voice = PiperVoice.load(args.model)
config = SynthesisConfig(length_scale=1.05)
output = root / "assets/voice"
output.mkdir(exist_ok=True)


def synthesize(text, path):
    with wave.open(str(path), "wb") as wav:
        voice.synthesize_wav(text, wav, syn_config=config)


built = 0
if args.only != "star":
    clips = {"bakery-order": lesson["bakeryOrder"]}
    for key, (term, _ipa, _reading, _translation, example, _meaning) in lesson["words"].items():
        clips[f"{key}-term"] = term + "."
        clips[f"{key}-example"] = example
    for name, text in clips.items():
        synthesize(text, output / (name + ".wav"))
    built += len(clips)
if args.only != "street":
    (output / "star").mkdir(exist_ok=True)
    for stale in (output / "star").glob("*.mp3"):
        stale.unlink()
    with tempfile.TemporaryDirectory() as scratch:
        raw = Path(scratch) / "clip.wav"
        for name, text in lesson["star"].items():
            synthesize(text, raw)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ac", "1",
                            "-codec:a", "libmp3lame", "-b:a", "48k", str(output / (name + ".mp3"))], check=True)
    built += len(lesson["star"])
print(f"Built {built} clips.")
