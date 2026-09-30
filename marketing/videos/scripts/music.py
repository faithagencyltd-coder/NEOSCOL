"""Musique de fond originale (synthèse, aucun extrait tiers) : nappe douce +
arpège discret + pulsation légère, 100 BPM ; et un « whoosh » de transition.

    python3 marketing/videos/scripts/music.py
"""
import json, os
import numpy as np
import soundfile as sf

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
SR = 44100
BPM = 100
BEAT = 60 / BPM
FPS, TRANSITION, LEAD, TAIL = 30, 16, 24, 22

def total_seconds(video, durations):
    scenes = durations[video]
    frames = 0
    for i, s in enumerate(scenes):
        extra = 10 if i == 0 else 60 if i == len(scenes) - 1 else 0
        frames += LEAD + int(np.ceil(s["seconds"] * FPS)) + TAIL + extra
    frames -= TRANSITION * (len(scenes) - 1)
    return frames / FPS + 1

def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def pad(freqs, dur, t0, out, gain):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 2.0) * np.minimum(1, (dur - t) / 2.5)
    sig = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            sig += np.sin(2 * np.pi * ff * t) + 0.25 * np.sin(2 * np.pi * 2 * ff * t) + 0.08 * np.sin(2 * np.pi * 3 * ff * t)
    sig *= env / (len(freqs) * 3)
    i = int(t0 * SR)
    out[i:i + n] += gain * sig[: max(0, min(n, len(out) - i))]

def pluck(f, t0, out, gain):
    dur = 0.9
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.exp(-t * 5.5) * np.minimum(1, t / 0.005)
    sig = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)) * env
    i = int(t0 * SR)
    out[i:i + n] += gain * sig[: max(0, min(n, len(out) - i))]

def pulse(t0, out, gain):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    f = 55 * np.exp(-t * 18) + 45
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    i = int(t0 * SR)
    out[i:i + n] += gain * sig[: max(0, min(n, len(out) - i))]

PROGRESSIONS = {
    # Accords (notes MIDI) : chaleureux (scolaire), énergique (formation), noble (université).
    "scolaire": [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 66]],
    "formation": [[50, 57, 66, 73], [47, 54, 62, 69], [43, 50, 59, 66], [45, 52, 61, 68]],
    "universite": [[45, 52, 60, 67], [41, 48, 57, 64], [48, 55, 64, 71], [43, 50, 59, 67]],
}

def smooth_lowpass(x, k=6):
    kernel = np.ones(k) / k
    return np.convolve(x, kernel, mode="same")

durations = json.load(open(os.path.join(root, "src", "voix-durees.json")))
os.makedirs(os.path.join(root, "public", "musique"), exist_ok=True)
for video, prog in PROGRESSIONS.items():
    dur = total_seconds(video, durations)
    out = np.zeros(int(dur * SR) + SR * 4)
    chord_len = BEAT * 16
    t, k = 0.0, 0
    while t < dur:
        chord = prog[k % len(prog)]
        pad([note(m) for m in chord], chord_len + 2.5, t, out, 0.55)
        pad([note(chord[0] - 12)], chord_len + 2.5, t, out, 0.35)
        for b in range(16 * 2):
            if t + b * BEAT / 2 > dur:
                break
            arp = chord[(b * 3) % 4] + 12
            pluck(note(arp), t + b * BEAT / 2, out, 0.06 if b % 2 else 0.09)
        if t > BEAT * 8:
            for b in range(16):
                pulse(t + b * BEAT, out, 0.12)
        t += chord_len
        k += 1
    out = smooth_lowpass(out)[: int(dur * SR)]
    # Réverbération simple (échos atténués) pour l'ampleur.
    for delay, g in ((0.11, 0.35), (0.23, 0.22), (0.37, 0.12)):
        d = int(delay * SR)
        out[d:] += g * out[:-d]
    out /= np.max(np.abs(out)) + 1e-9
    out *= 0.8
    stereo = np.stack([out, np.roll(out, int(0.012 * SR))], axis=1)
    sf.write(os.path.join(root, "public", "musique", f"{video}.wav"), stereo.astype(np.float32), SR)
    print(video, round(dur, 1), "s")

# Whoosh : bruit filtré balayé.
n = int(0.7 * SR)
t = np.arange(n) / SR
noise = np.random.default_rng(7).standard_normal(n)
env = np.sin(np.pi * t / t[-1]) ** 2
sweep = np.zeros(n)
acc = 0.0
for i in range(n):
    a = 0.02 + 0.3 * (i / n)
    acc = acc + a * (noise[i] - acc)
    sweep[i] = acc
w = sweep * env
w /= np.max(np.abs(w)) + 1e-9
sf.write(os.path.join(root, "public", "musique", "whoosh.wav"), (0.7 * w).astype(np.float32), SR)
print("whoosh ok")
