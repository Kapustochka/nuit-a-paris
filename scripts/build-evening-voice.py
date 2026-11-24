"""Voice the evening task list (src/evening.js) with Piper (siwis).

    python scripts/build-evening-voice.py fr_FR-siwis-medium.onnx

Writes assets/voice/evening/<id>.mp3 for every task and bravo.mp3. Needs ffmpeg.
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
data = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "const { TASKS, BRAVO } = await import('./src/evening.js'); console.log(JSON.stringify({ TASKS, BRAVO }));",
], text=True, cwd=root))
clips = [(task[0], task[1]) for task in data["TASKS"]] + [("bravo", data["BRAVO"][0])]
out = root / "assets/voice/evening"
out.mkdir(exist_ok=True)
voice = PiperVoice.load(args.model)
with tempfile.TemporaryDirectory() as scratch:
    raw = Path(scratch) / "clip.wav"
    for cid, text in clips:
        with wave.open(str(raw), "wb") as wav:
            voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=1.05))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ac", "1",
                        "-codec:a", "libmp3lame", "-b:a", "40k", str(out / f"{cid}.mp3")], check=True)
print(f"Built {len(clips)} clips.")
