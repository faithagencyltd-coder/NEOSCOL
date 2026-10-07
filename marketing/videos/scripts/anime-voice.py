"""Voix off du film animé (motion design, module scolaire) : Kokoro, voix ff_siwis.

    python3 marketing/videos/scripts/anime-voice.py <dossier-du-modèle-kokoro>
"""
import json, os, re, sys
import soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
k = Kokoro(os.path.join(sys.argv[1], "kokoro-v1.0.onnx"), os.path.join(sys.argv[1], "voices-v1.0.bin"))
SAY = [(r"NeoScool", "Néo-scoule")]
out_dir = os.path.join(root, "public", "voix", "anime")
os.makedirs(out_dir, exist_ok=True)
durations = []
for scene in json.load(open(os.path.join(root, "src", "anime", "script.json"), encoding="utf-8")):
    text = scene["text"]
    for a, b in SAY:
        text = re.sub(a, b, text)
    samples, sr = k.create(text, voice="ff_siwis", speed=0.92, lang="fr-fr")
    sf.write(os.path.join(out_dir, f"{scene['id']}.wav"), samples, sr)
    durations.append({"id": scene["id"], "seconds": round(len(samples) / sr, 3)})
    print(scene["id"], round(len(samples) / sr, 2), "s")
json.dump(durations, open(os.path.join(root, "src", "anime", "durees.json"), "w"), indent=2)
