"""Voice the places of the Montmartre passport (src/passport.js) with Piper (siwis).

    python scripts/build-place-voice.py fr_FR-siwis-medium.onnx

Writes assets/voice/place/<id>-name.mp3 (the name) and <id>.mp3 (the phrase). Needs ffmpeg.
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import wave

from piper import PiperVoice, SynthesisConfig

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
places = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "const { PLACES } = await import('./src/passport.js'); console.log(JSON.stringify(PLACES));",
], text=True, cwd=root))
out = root / "assets/voice/place"
out.mkdir(exist_ok=True)
voice = PiperVoice.load(args.model)
with tempfile.TemporaryDirectory() as scratch:
    raw = Path(scratch) / "clip.wav"
    for pid, _how, name, _ru, phrase, _tr in places:
        for suffix, text in (("-name", name + "."), ("", phrase)):
            with wave.open(str(raw), "wb") as wav:
                voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=1.05))
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ac", "1",
                            "-codec:a", "libmp3lame", "-b:a", "40k", str(out / f"{pid}{suffix}.mp3")], check=True)
print(f"Built {2 * len(places)} clips.")
