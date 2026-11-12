# French voice-over

The WAV files were generated locally for Nuit à Paris with Piper and the French voice [fr_FR-siwis-medium](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/siwis/medium/MODEL_CARD). The game loads a separate recording when the voice button is pressed. Playback needs neither the Piper model nor any cloud speech synthesis.

Voice data source: Junichi Yamagishi, Pierre-Edouard Honnet, Philip Garner, Alexandros Lazaridis. *The SIWIS French Speech Synthesis Database, 2016*. University of Edinburgh, The Centre for Speech Technology Research, 2017. [DOI](https://doi.org/10.7488/ds/1705) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

To rebuild the recordings after adding words, install `piper-tts` in a Python environment, download the ONNX model and its settings file with the same name and a `.json` suffix, then run from the project root: `python scripts/build-french-audio.py /path/to/fr_FR-siwis-medium.onnx`. The script uses Node.js to read the dictionary.

The falling-star dictionary (`src/star-words.js`) is voiced with the same model, but its clips are compressed to MP3 in `assets/voice/star/` to keep the download small; this step needs `ffmpeg`. After editing only that dictionary, add `--only star` to rebuild just those clips. Phrase and story clips are numbered by their position in the lists, so rebuild after reordering them.
