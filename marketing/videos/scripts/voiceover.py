"""Voix off française (synthèse neuronale Kokoro, voix ff_siwis) : un fichier
par scène + manifest des durées, lu par les compositions Remotion.

    python3 marketing/videos/scripts/voiceover.py <dossier-du-modèle-kokoro>
"""
import json, os, re, sys
import soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
model_dir = sys.argv[1]
k = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))

# Prononciation : l'orthographe affichée reste « NeoScool ».
SAY = [
    (r"NeoScool", "Néo-scoule"),
    (r"WhatsApp", "ouatsape"),
    (r"e-mail", "imèle"),
    (r"neoscool point com", "néo-scoule point com"),
]

def speakable(text):
    for a, b in SAY:
        text = re.sub(a, b, text)
    return text

script = json.load(open(os.path.join(root, "src", "voiceover.json"), encoding="utf-8"))
manifest = {}
for video, scenes in script.items():
    os.makedirs(os.path.join(root, "public", "voix", video), exist_ok=True)
    manifest[video] = []
    for scene in scenes:
        samples, sr = k.create(speakable(scene["text"]), voice="ff_siwis", speed=0.96, lang="fr-fr")
        path = os.path.join(root, "public", "voix", video, f"{scene['id']}.wav")
        sf.write(path, samples, sr)
        manifest[video].append({"id": scene["id"], "seconds": round(len(samples) / sr, 3)})
        print(video, scene["id"], round(len(samples) / sr, 1), "s")
json.dump(manifest, open(os.path.join(root, "src", "voix-durees.json"), "w"), indent=2)
