"""Musique originale + bruitages du film promo 90 s (HyperFrames), synthèse pure,
aucun extrait tiers. Calée sur les scènes de hyperframes/neoscool-90s/index.html.

    python3 marketing/videos/scripts/promo-music.py
"""
import os
import numpy as np
import soundfile as sf

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
SR = 44100
TOTAL = 91.0
SC = [0, 8.6, 15, 24.4, 33, 40.4, 47.8, 58.8, 66.2, 74, 82.4, 91]
BPM = 100
BEAT = 60 / BPM
rng = np.random.default_rng(90)
out = np.zeros((int(TOTAL * SR), 2))


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_(d):
    return np.arange(int(d * SR)) / SR


def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= len(out) or i < 0:
        return
    n = min(len(sig), len(out) - i)
    out[i:i + n, 0] += gain * sig[:n] * (1 - max(0, pan))
    out[i:i + n, 1] += gain * sig[:n] * (1 + min(0, pan))


def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")


def pad(freqs, d, attack=1.0, release=1.2):
    t = t_(d)
    env = np.minimum(1, t / attack) * np.minimum(1, np.maximum(0, d - t) / release)
    s = np.zeros_like(t)
    for f in freqs:
        for det in (-0.09, 0.0, 0.09):
            ff = f * 2 ** (det / 12)
            s += np.sin(2 * np.pi * ff * t) + 0.25 * np.sin(4 * np.pi * ff * t) + 0.08 * np.sin(6 * np.pi * ff * t)
    return s * env / (len(freqs) * 3)


def piano(f, d=1.6, bright=1.0):
    t = t_(d)
    env = np.exp(-t * 2.8) * np.minimum(1, t / 0.004)
    return (np.sin(2 * np.pi * f * t) + 0.45 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t * 2) + 0.18 * bright * np.sin(6 * np.pi * f * t) * np.exp(-t * 4)) * env


def pluck(f, d=0.45, decay=8.0):
    t = t_(d)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) * np.exp(-t * 7)) * np.exp(-t * decay) * np.minimum(1, t / 0.003)


def bass(f, d):
    t = t_(d)
    env = np.minimum(1, t / 0.01) * np.exp(-t * 1.6) * np.minimum(1, np.maximum(0, d - t) / 0.05)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * env


def kick():
    t = t_(0.4)
    f = 75 * np.exp(-t * 20) + 44
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def hat(open_=False):
    d = 0.18 if open_ else 0.05
    t = t_(d)
    x = rng.standard_normal(len(t))
    x = x - lowpass(x, 3)
    return x * np.exp(-t * (18 if open_ else 70))


def clap():
    t = t_(0.25)
    x = rng.standard_normal(len(t))
    env = np.exp(-t * 22) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 26) * (t > 0.012)
    return lowpass(x, 4) * env


def tick():
    t = t_(0.03)
    return np.sin(2 * np.pi * 3000 * t) * np.exp(-t * 260)


def click():
    t = t_(0.05)
    return (np.sin(2 * np.pi * 1800 * t) * 0.6 + rng.standard_normal(len(t)) * 0.3) * np.exp(-t * 120)


def whoosh(d=0.6, up=True):
    t = t_(d)
    x = rng.standard_normal(len(t))
    k = np.linspace(14, 3, len(t)) if up else np.linspace(3, 14, len(t))
    y = np.zeros_like(x)
    for i, kk in enumerate([14, 10, 7, 5, 3]):
        y += lowpass(x, kk) * np.exp(-((t / d - (i + 0.5) / 5) ** 2) * 18)
    return y * np.sin(np.pi * t / d) ** 2 * 0.6


def chime(f, d=1.4):
    t = t_(d)
    return (np.sin(2 * np.pi * f * t) + 0.55 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * 3) + 0.25 * np.sin(2 * np.pi * f * 3.0 * t) * np.exp(-t * 5)) * np.exp(-t * 3.0) * np.minimum(1, t / 0.002)


def beep(f1, f2):
    a = t_(0.09)
    b = t_(0.14)
    s1 = np.sin(2 * np.pi * f1 * a) * np.minimum(1, (0.09 - a) / 0.01)
    s2 = np.sin(2 * np.pi * f2 * b) * np.exp(-b * 10)
    return np.concatenate([s1, np.zeros(int(0.02 * SR)), s2])


def coin():
    t = t_(0.35)
    f = note(96 + rng.integers(-2, 3))
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.5 * t)) * np.exp(-t * 14)


def thud():
    t = t_(0.35)
    f = 110 * np.exp(-t * 14) + 50
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12) + lowpass(rng.standard_normal(len(t)), 6) * np.exp(-t * 30) * 0.6)


def printer(d=1.4):
    t = t_(d)
    motor = np.sign(np.sin(2 * np.pi * 95 * t)) * 0.25 + lowpass(rng.standard_normal(len(t)), 5) * 0.4
    return motor * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * t)) * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.08)


def riser(d):
    t = t_(d)
    x = lowpass(rng.standard_normal(len(t)), 4) * (t / d) ** 2
    s = np.sin(2 * np.pi * np.cumsum(150 + 1500 * (t / d) ** 2) / SR) * (t / d) ** 2 * 0.25
    return x * 0.8 + s


# --- 1. Tension (0 → 8.6) ------------------------------------------------------
add(pad([note(45), note(52), note(57)], SC[1] + 0.3, attack=0.5, release=0.4), 0, 0.30)
for i, t0 in enumerate(np.arange(0.3, SC[1] - 0.6, 0.25)):
    add(tick(), t0, 0.13 + 0.06 * (t0 / SC[1]), pan=0.35)
seq = [69, 72, 76, 72, 69, 72, 75, 72]
for i, t0 in enumerate(np.arange(0.5, SC[1] - 0.6, BEAT / 2)):
    add(pluck(note(seq[i % 8])), t0, 0.12, pan=-0.3 if i % 2 else 0.3)
for t0 in np.arange(1.2, SC[1] - 0.6, BEAT):
    add(kick(), t0, 0.22)
for k in range(10):
    add(whoosh(0.35), 0.4 + k * 0.7, 0.10, pan=float(rng.uniform(-0.7, 0.7)))
add(riser(1.2), SC[1] - 1.2, 0.28)

# --- 2. Corps du film (8.6 → 82.4) : Am – F – C – G puis C – G – Am – F ---------
prog = [[57, 60, 64], [53, 57, 60], [48, 55, 60, 64], [55, 59, 62]]
roots = [45, 41, 48, 43]
bar = 4 * BEAT
t0 = SC[1]
k = 0
while t0 < SC[10] - 0.05:
    ch = prog[k % 4]
    d = min(bar, SC[10] - t0)
    add(pad([note(m) for m in ch], d + 0.6, attack=0.35, release=0.6), t0, 0.20)
    # arpège de piano (doubles croches pointées à partir de la scène 3)
    step = BEAT / 2 if t0 < SC[2] else BEAT / 4
    j = 0
    for tt in np.arange(t0, t0 + d - 0.01, step):
        m = ch[j % len(ch)] + 12 + (12 if (j // len(ch)) % 2 else 0)
        add(piano(note(m), 1.2, 0.8), tt, 0.085 if step < 0.3 else 0.11, pan=-0.35 if j % 2 else 0.35)
        j += 1
    # basse à partir de la scène 5
    if t0 >= SC[4] - 0.01:
        for b in range(4):
            add(bass(note(roots[k % 4] - 12 + (7 if b == 3 else 0)), BEAT * 0.95), t0 + b * BEAT, 0.30)
    for b in range(4):
        tb = t0 + b * BEAT
        if tb >= SC[10]:
            break
        if t0 >= SC[2] - 0.01 and b in (0, 2):
            add(kick(), tb, 0.36)
        if t0 >= SC[4] - 0.01 and b in (1, 3):
            add(clap(), tb, 0.16)
        if t0 >= SC[3] - 0.01:
            add(hat(), tb + BEAT / 2, 0.07, pan=0.4)
            if t0 >= SC[7] - 0.01:
                add(hat(), tb, 0.05, pan=-0.4)
    t0 += bar
    k += 1
add(riser(2.0), SC[10] - 2.0, 0.32)

# --- 3. Final (82.4 → 91) -------------------------------------------------------
add(kick(), SC[10] + 0.9, 0.6)
add(whoosh(1.0), SC[10] + 0.4, 0.22)
final = [48, 55, 60, 64, 67, 72]
add(pad([note(m) for m in final], TOTAL - SC[10] - 0.9, attack=0.2, release=2.5), SC[10] + 0.9, 0.36)
for j, m in enumerate([72, 76, 79, 84, 79, 76, 72, 67]):
    add(piano(note(m), 2.2), SC[10] + 1.0 + j * 0.3, 0.12, pan=-0.3 if j % 2 else 0.3)
add(chime(note(84), 2.5), SC[10] + 1.0, 0.18)
add(chime(note(91), 2.0), SC[10] + 3.3, 0.10)

# --- 4. Bruitages calés sur les animations --------------------------------------
for s in range(2, 12):
    add(whoosh(0.55), SC[s - 1] - 0.3, 0.16)
add(chime(note(88)), SC[1] + 0.95, 0.16)                         # logo
for i in range(4):                                               # S3 frappe
    for c in range(8):
        add(tick(), SC[2] + 1.1 + i * 0.7 + c * 0.07, 0.07)
add(click(), SC[2] + 4.3, 0.3); add(chime(note(84)), SC[2] + 4.6, 0.16)
add(whoosh(0.6), SC[2] + 5.5, 0.18); add(chime(note(91), 1.2), SC[2] + 6.4, 0.10)
add(whoosh(0.5), SC[3] + 1.1, 0.14); add(beep(1760, 2350), SC[3] + 2.1, 0.12)   # S4 scan
add(chime(note(86)), SC[3] + 3.8, 0.16)
for i in range(8):
    add(np.sin(2 * np.pi * 180 * t_(0.05)) * 0.5, SC[3] + 3.8 + i * 0.06, 0.06)
for i in range(6):                                               # S5 statuts
    add(pluck(note(84 + [0, 2, 4, 5, 7, 9][i]), 0.3, 12), SC[4] + 1.35 + i * 0.32, 0.10)
add(click(), SC[4] + 3.5, 0.28); add(chime(note(84)), SC[4] + 3.7, 0.14)
for i in range(5):
    add(pluck(note(88 + i), 0.25, 14), SC[4] + 4.2 + i * 0.22, 0.08)
add(riser(1.6) * 0.5, SC[5] + 1.4, 0.18); add(chime(note(91)), SC[5] + 3.0, 0.16); add(thud(), SC[5] + 5.1, 0.35)   # S6
add(click(), SC[6] + 2.2, 0.3)                                   # S7 caisse
for i in range(7):
    add(coin(), SC[6] + 2.75 + i * 0.1, 0.12, pan=0.2)
add(printer(1.4), SC[6] + 3.3, 0.10); add(thud(), SC[6] + 5.05, 0.32); add(chime(note(84)), SC[6] + 5.1, 0.15)
add(chime(note(79)), SC[6] + 7.2, 0.12); add(chime(note(83)), SC[6] + 7.35, 0.10)
for i in range(12):                                              # S8 messages
    add(pluck(note(84 + (i % 5) * 2), 0.25, 12), SC[7] + 1.9 + i * 0.14, 0.08, pan=-0.8 + i * 0.14)
add(whoosh(0.7), SC[7] + 4.4, 0.18)
for i in range(4):                                               # S9 documents
    add(whoosh(0.3), SC[8] + 0.5 + i * 0.25, 0.10); add(thud() * 0.3, SC[8] + 1.1 + i * 0.25, 0.15)
add(beep(1760, 2350), SC[8] + 4.0, 0.10); add(chime(note(88)), SC[8] + 4.3, 0.15)
for i in range(4):                                               # S10 pilotage
    add(pluck(note(86 + i * 2), 0.25, 12), SC[9] + 0.9 + i * 0.12, 0.07)
add(chime(note(84), 1.0), SC[9] + 3.8, 0.10)
for i in range(3):
    add(pluck(note(91 + i * 2), 0.3, 10), SC[9] + 5.2 + i * 0.15, 0.08)

peak = np.max(np.abs(out))
out = out / peak * 0.89
fade = int(1.2 * SR)
out[-fade:] *= np.linspace(1, 0, fade)[:, None]
dst = os.path.join(root, "hyperframes", "neoscool-90s", "assets", "audio", "musique.wav")
sf.write(dst, out, SR)
print("musique.wav", TOTAL, "s")
