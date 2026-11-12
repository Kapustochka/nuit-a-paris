"""Build the sung verses for the violet song stars.

Piper cannot sing, so every syllable from src/star-songs.js is spoken on its own,
then Praat (parselmouth) holds it on the note's pitch and stretches its vowel to
the note's length. The voice is mixed with the same music box the game plays and
saved as assets/voice/star/song-N.mp3 (needs ffmpeg on PATH).

    pip install piper-tts praat-parselmouth
    python scripts/build-star-songs.py <fr_FR-siwis-medium.onnx> [--only N]
"""
import argparse
import io
import json
from pathlib import Path
import subprocess
import tempfile
import wave

import numpy as np
import parselmouth
from parselmouth.praat import call
from piper import PiperVoice, SynthesisConfig

# Keep in sync with src/french-audio.js: the same lead-in, breath between lines and key shift.
LEAD, BREATH, SHIFT = 0.08, 0.5, 4

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model", type=Path, help="Path to fr_FR-siwis-medium.onnx")
parser.add_argument("--only", type=int, help="Build only this song")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
songs = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "const { starSongs } = await import('./src/star-songs.js'); console.log(JSON.stringify(starSongs));",
], text=True, cwd=root))
voice = PiperVoice.load(args.model)
rate = voice.config.sample_rate
config = SynthesisConfig(length_scale=1.0)
STEPS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def to_hz(note):
    step = STEPS[note[0]] + ("#" in note)
    return 440 * 2 ** ((step + 12 * (int(note[-1]) + 1) - 69 + SHIFT) / 12)


def speak(text):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        voice.synthesize_wav(text, wav, syn_config=config)
    buffer.seek(0)
    with wave.open(buffer) as wav:
        audio = np.frombuffer(wav.readframes(wav.getnframes()), np.int16) / 32768
    loud = np.where(np.abs(audio) > 0.01)[0]
    return audio[max(0, loud[0] - 80): loud[-1] + 80]


def sing(syllable, hz, length):
    sound = parselmouth.Sound(speak(syllable), rate)
    span = sound.duration
    manipulation = call(sound, "To Manipulation", 0.01, 75, 600)
    pitch = call(manipulation, "Extract pitch tier")
    call(pitch, "Remove points between", 0, span)
    for t in np.linspace(0, span, 16):                     # ровная нота с лёгким вибрато
        call(pitch, "Add point", t, hz * (1 + 0.007 * np.sin(2 * np.pi * 5.5 * t)))
    call([pitch, manipulation], "Replace pitch tier")
    # согласная в начале слога остаётся как есть, тянется гласная
    target = length * 0.94
    stretch = max(0.6, (target - 0.3 * span) / (0.7 * span))
    duration = call(manipulation, "Extract duration tier")
    for t, k in ((0, 1), (0.28 * span, 1), (0.36 * span, stretch), (span, stretch)):
        call(duration, "Add point", t, k)
    call([duration, manipulation], "Replace duration tier")
    sung = call(manipulation, "Get resynthesis (overlap-add)").values[0][: int(length * rate)]
    fade = min(len(sung) // 4, int(0.02 * rate))
    sung[:fade] *= np.linspace(0, 1, fade)
    sung[-fade:] *= np.linspace(1, 0, fade)
    return sung


def chime(hz, length, start, track):
    """The music box from french-audio.js: triangle plus two soft sine partials."""
    span = max(0.55, length * 1.7)
    t = np.arange(int(span * rate)) / rate
    decay = np.exp(np.log(0.001) * t / max(0.5, length * 1.6)) * np.minimum(1, t / 0.012)
    tone = 0.9 * (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * hz * t))
    tone += 0.25 * np.sin(2 * np.pi * 2 * hz * t) + 0.08 * np.sin(2 * np.pi * 3.01 * hz * t)
    begin = int(start * rate)
    track[begin: begin + len(t)] += 0.22 * tone * decay


output = root / "assets/voice/star"
output.mkdir(parents=True, exist_ok=True)
for number, song in enumerate(songs):
    if args.only is not None and number != args.only:
        continue
    beat = 60 / song["tempo"]
    total = LEAD + sum(sum(float(step.split(":")[1]) for step in line[2].split()) * beat + BREATH * beat
                       for line in song["lines"]) + 2
    vocals, box = np.zeros(int(total * rate)), np.zeros(int(total * rate))
    t = LEAD
    for _french, _russian, melody, syllables in song["lines"]:
        for step, syllable in zip(melody.split(), syllables.split()):
            note, beats = step.split(":")
            length = float(beats) * beat
            sung = sing(syllable, to_hz(note), length)
            begin = int(t * rate)
            vocals[begin: begin + len(sung)] += sung
            chime(to_hz(note), length, t, box)
            t += length
        t += BREATH * beat
    vocals *= 0.8 / np.abs(vocals).max()
    mix = vocals + 0.55 * box
    mix *= 0.9 / np.abs(mix).max()
    end = np.where(np.abs(mix) > 0.003)[0][-1] + int(0.2 * rate)
    with tempfile.TemporaryDirectory() as scratch:
        raw = Path(scratch) / "song.wav"
        with wave.open(str(raw), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes((mix[:end] * 32767).astype(np.int16).tobytes())
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ac", "1",
                        "-codec:a", "libmp3lame", "-b:a", "64k", str(output / f"song-{number}.mp3")], check=True)
    print(f"song-{number}.mp3  {song['title'][0]}")
