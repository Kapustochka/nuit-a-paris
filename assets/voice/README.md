# Французская озвучка

Файлы WAV сгенерированы для Nuit à Paris локально, с помощью Piper и французского голоса [fr_FR-siwis-medium](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/siwis/medium/MODEL_CARD). Игра загружает отдельную запись по кнопке озвучки. Для воспроизведения модель Piper и доступ к облачному синтезу не требуются.

Источник данных для голоса — Junichi Yamagishi, Pierre-Edouard Honnet, Philip Garner, Alexandros Lazaridis. *The SIWIS French Speech Synthesis Database, 2016*. University of Edinburgh, The Centre for Speech Technology Research, 2017. [DOI](https://doi.org/10.7488/ds/1705) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Чтобы пересобрать записи после добавления слов, установи `piper-tts` в Python-окружение, скачай модель ONNX и её файл настроек с тем же именем и суффиксом `.json`, затем запусти из корня проекта `python scripts/build-french-audio.py /путь/к/fr_FR-siwis-medium.onnx`. Для чтения словаря скрипт использует Node.js.
