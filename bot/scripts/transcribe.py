#!/usr/bin/env python3
"""
Transcribe an audio file using faster-whisper (local, free, no API/quota).
Usage: transcribe.py <audio_path>
Prints transcription to stdout. Model cached after first run.
"""
import sys
import os

def main():
    if len(sys.argv) < 2:
        print("ERROR: no audio path", file=sys.stderr)
        sys.exit(1)
    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"ERROR: file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    from faster_whisper import WhisperModel

    # "base" model: good accuracy, fast on CPU, ~140MB. int8 for speed/low-RAM.
    model_size = os.environ.get("WHISPER_MODEL", "base.en")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, info = model.transcribe(audio_path, beam_size=1)
    text = " ".join(seg.text.strip() for seg in segments).strip()
    print(text)

if __name__ == "__main__":
    main()
