"""Voix off du film officiel (module scolaire) : synthèse neuronale Kokoro, voix
française ff_siwis. Un fichier par scène + durées (src/film/durees.json) ;
voix de la tablette de pointage (« Bonjour Ibrahim, bienvenue »).

    python3 marketing/videos/scripts/film-voice.py <dossier-du-modèle-kokoro>
"""
import json, os, re, sys
import soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
k = Kokoro(os.path.join(sys.argv[1], "kokoro-v1.0.onnx"), os.path.join(sys.argv[1], "voices-v1.0.bin"))

# Prononciation : l'orthographe affichée reste « NeoScool ».
SAY = [(r"NeoScool", "Néo-scoule"), (r"WhatsApp", "ouatsape"), (r"e-mail", "imèle"), (r"QR code", "code QR"), (r"Excel", "Exel")]

def speakable(text):
    for a, b in SAY:
        text = re.sub(a, b, text)
    return text

out_dir = os.path.join(root, "public", "voix", "film")
os.makedirs(out_dir, exist_ok=True)
script = json.load(open(os.path.join(root, "src", "film", "script.json"), encoding="utf-8"))
durations = []
for scene in script:
    samples, sr = k.create(speakable(scene["text"]), voice="ff_siwis", speed=0.94, lang="fr-fr")
    sf.write(os.path.join(out_dir, f"{scene['id']}.wav"), samples, sr)
    durations.append({"id": scene["id"], "seconds": round(len(samples) / sr, 3)})
    print(scene["id"], round(len(samples) / sr, 1), "s")
# Voix de la tablette (message vocal d'accueil, fonctionnalité réelle).
samples, sr = k.create("Bonjour Ibrahim, bienvenue.", voice="ff_siwis", speed=1.0, lang="fr-fr")
sf.write(os.path.join(out_dir, "tablette.wav"), samples, sr)
json.dump(durations, open(os.path.join(root, "src", "film", "durees.json"), "w"), indent=2)
print("total", round(sum(d["seconds"] for d in durations), 1), "s")
