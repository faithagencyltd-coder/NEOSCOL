"""Musique originale + bruitages du film animé (synthèse, aucun extrait tiers).
Scène 1 : tic-tac, pulsation mineure tendue, papiers, téléphone qui vibre.
Transition : montée + souffle + impact. Scène 2 : piano lumineux en majeur,
« ding » à chaque fonction, accord final sur le logo.

    python3 marketing/videos/scripts/anime-music.py
"""
import os
import numpy as np
import soundfile as sf

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
SR = 44100
FPS = 30
TOTAL = 465 / FPS
S2 = 246 / FPS
out_dir = os.path.join(root, "public", "musique", "anime")
os.makedirs(out_dir, exist_ok=True)
rng = np.random.default_rng(7)
out = np.zeros((int(TOTAL * SR), 2))


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= len(out):
        return
    n = min(len(sig), len(out) - i)
    out[i:i + n, 0] += gain * sig[:n] * (1 - max(0, pan))
    out[i:i + n, 1] += gain * sig[:n] * (1 + min(0, pan))


def pad(freqs, dur, attack=1.2, release=1.5):
    t = t_(dur)
    env = np.minimum(1, t / attack) * np.minimum(1, np.maximum(0, dur - t) / release)
    sig = np.zeros_like(t)
    for f in freqs:
        for det in (-0.08, 0.0, 0.08):
            ff = f * 2 ** (det / 12)
            sig += np.sin(2 * np.pi * ff * t) + 0.2 * np.sin(4 * np.pi * ff * t)
    return sig * env / (len(freqs) * 3)


def pluck(f, dur=0.5, decay=7.0):
    t = t_(dur)
    env = np.exp(-t * decay) * np.minimum(1, t / 0.003)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6)) * env


def piano(f, dur=1.8):
    t = t_(dur)
    env = np.exp(-t * 2.6) * np.minimum(1, t / 0.004)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) * np.exp(-t * 2) + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 4)) * env


def tick(high=True):
    t = t_(0.03)
    return np.sin(2 * np.pi * (3200 if high else 2400) * t) * np.exp(-t * 260)


def noise_burst(dur, lo=0.0, hi=1.0, decay=10.0):
    t = t_(dur)
    x = rng.standard_normal(len(t))
    # filtre passe-bas simple (moyenne glissante) pour un « froissement »
    k = int(2 + 20 * (1 - hi))
    x = np.convolve(x, np.ones(k) / k, mode="same")
    return x * np.exp(-t * decay) * np.minimum(1, t / 0.01)


def kick():
    t = t_(0.35)
    f = 70 * np.exp(-t * 18) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)


def chime(f):
    t = t_(1.4)
    return (np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * 3)) * np.exp(-t * 3.2) * np.minimum(1, t / 0.002)


# --- Scène 1 : tension -------------------------------------------------------
add(pad([note(45), note(52), note(57)], S2 + 0.4, attack=0.6, release=0.6), 0, 0.33)   # La mineur grave
for i, t0 in enumerate(np.arange(0.2, S2 - 0.3, 0.25)):                                 # tic-tac rapide
    add(tick(i % 2 == 0), t0, 0.22, pan=0.4)
seq = [57, 60, 64, 60, 57, 60, 63, 60]                                                   # ostinato inquiet
for i, t0 in enumerate(np.arange(0.4, S2 - 0.4, 0.5)):
    add(pluck(note(seq[i % len(seq)] + 12), 0.45), t0, 0.16, pan=-0.3)
for i, t0 in enumerate(np.arange(1.0, S2 - 0.5, 1.0)):                                  # pulsation sourde
    add(kick(), t0, 0.25)
for f0 in [8, 30, 38, 60, 75, 90, 105, 120, 135]:                                       # papiers qui tombent
    add(noise_burst(0.25, hi=0.6, decay=14), f0 / FPS + 0.3, 0.10, pan=float(rng.uniform(-0.6, 0.6)))
for f0 in range(0, 240, 60):                                                             # téléphone qui vibre
    t = t_(0.5)
    buzz = np.sign(np.sin(2 * np.pi * 150 * t)) * (np.sin(2 * np.pi * 9 * t) > 0) * 0.5
    add(buzz * np.minimum(1, (0.5 - t) / 0.05), f0 / FPS + 0.2, 0.05, pan=0.5)

# --- Transition --------------------------------------------------------------
rise_d = 1.0
t = t_(rise_d)
riser = rng.standard_normal(len(t)) * (t / rise_d) ** 2
add(np.convolve(riser, np.ones(6) / 6, mode="same"), S2 - 0.95, 0.18)
sweep = np.sin(2 * np.pi * np.cumsum(200 + 1600 * (t / rise_d) ** 2) / SR) * (t / rise_d) ** 2
add(sweep, S2 - 0.95, 0.06)
add(kick(), S2 + 0.05, 0.6)
add(noise_burst(0.8, hi=0.3, decay=5), S2 + 0.05, 0.2)

# --- Scène 2 : lumière (Ré majeur) -------------------------------------------
chords = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]]      # D, Bm, G, A
bar = 1.6
for k, ch in enumerate(chords * 2):
    t0 = S2 + 0.1 + k * bar
    if t0 > TOTAL - 0.3:
        break
    add(pad([note(m) for m in ch], bar + 0.8, attack=0.4, release=0.8), t0, 0.22)
    for j in range(4):                                                                   # arpège de piano
        add(piano(note(ch[(j % 3) + 1] + 12)), t0 + j * bar / 4, 0.13, pan=0.3 if j % 2 else -0.3)
    add(kick(), t0, 0.32)
    add(kick(), t0 + bar / 2, 0.22)
for i in range(6):                                                                       # une fonction = un « ding »
    add(chime(note(74 + [0, 2, 4, 7, 9, 12][i])), S2 + (6 + i * 5 + 14) / FPS, 0.12, pan=-0.5 + i * 0.2)
add(chime(note(86)), S2 + 70 / FPS, 0.16)                                                # logo
for w, f0 in enumerate([86, 106, 126]):                                                  # Simple. Rapide. Sécurisé.
    add(pluck(note([74, 78, 81][w]), 0.8, 4), S2 + f0 / FPS, 0.16)
final = S2 + 140 / FPS
add(pad([note(m) for m in [50, 57, 62, 66, 69]], TOTAL - final, attack=0.3, release=1.2), final, 0.3)

# Normalisation douce + fondu final
peak = np.max(np.abs(out))
out = out / peak * 0.89
fade = int(0.6 * SR)
out[-fade:] *= np.linspace(1, 0, fade)[:, None]
sf.write(os.path.join(out_dir, "extrait.wav"), out, SR)
print("extrait.wav", round(TOTAL, 2), "s")
