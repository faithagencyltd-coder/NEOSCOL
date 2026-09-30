"""Musique originale et effets sonores du film officiel (synthèse, aucun extrait
tiers) : piano/nappes ~100 BPM, montée jusqu'à « Tous connectés », respiration,
accord final sur le logo. Une piste par montage (film 3 min, 60 s, 30 s, logo).

    python3 marketing/videos/scripts/film-music.py
"""
import json, os
import numpy as np
import soundfile as sf

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
SR = 44100
BPM = 100
BEAT = 60 / BPM
out_dir = os.path.join(root, "public", "musique", "film")
os.makedirs(out_dir, exist_ok=True)

voice = {d["id"]: d["seconds"] for d in json.load(open(os.path.join(root, "src", "film", "durees.json")))}
cuts = json.load(open(os.path.join(root, "src", "film", "cuts.json")))

def scene_seconds(cut, sid, last):
    """Même règle que src/film/timing.ts."""
    if cut == "full":
        return max(cuts["full"]["storyboard"][sid], voice[sid] + 1.6)
    return voice[sid] + 1.6 + (2.4 if last else 0)

def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def add(out, sig, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= len(out):
        return
    n = min(len(sig), len(out) - i)
    out[i:i + n] += gain * sig[:n]

def pad(freqs, dur):
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, t / 1.8) * np.minimum(1, (dur - t) / 2.2)
    sig = np.zeros_like(t)
    for f in freqs:
        for det in (-0.1, 0.0, 0.1):
            ff = f * 2 ** (det / 12)
            sig += np.sin(2 * np.pi * ff * t) + 0.22 * np.sin(4 * np.pi * ff * t)
    return sig * env / (len(freqs) * 3)

def piano(f, dur=1.6):
    t = np.arange(int(dur * SR)) / SR
    env = np.exp(-t * 3.2) * np.minimum(1, t / 0.004)
    return (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) * np.exp(-t * 2) + 0.15 * np.sin(6 * np.pi * f * t) * np.exp(-t * 4)) * env

def kick():
    t = np.arange(int(0.3 * SR)) / SR
    f = 60 * np.exp(-t * 20) + 42
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12)

def hat(rng):
    n = int(0.06 * SR)
    x = rng.standard_normal(n)
    x = np.diff(np.concatenate([[0], x]))
    return x * np.exp(-np.arange(n) / SR * 70) * 0.25

PROG = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 66]]

def track(length, arc):
    """arc(t) -> intensité 0..1 (couches : nappes, piano, pulsation, charleston)."""
    rng = np.random.default_rng(3)
    out = np.zeros(int((length + 4) * SR))
    bar = BEAT * 4
    t, k = 0.0, 0
    while t < length:
        chord = PROG[k % 4]
        a = arc(t)
        add(out, pad([note(m) for m in chord], bar * 2 + 2), t, 0.45)
        add(out, pad([note(chord[0] - 12)], bar * 2 + 2), t, 0.3 + 0.2 * a)
        for b in range(16):
            tb = t + b * BEAT / 2
            if tb >= length:
                break
            m = chord[[0, 2, 1, 3, 2, 1, 3, 2][b % 8]] + 12
            add(out, piano(note(m)), tb, (0.05 + 0.08 * a) * (1.0 if b % 2 == 0 else 0.7))
            if a > 0.45 and b % 2 == 0:
                add(out, kick(), tb, 0.10 * a)
            if a > 0.65:
                add(out, hat(rng), tb + BEAT / 4, 0.5 * a)
        t += bar * 2
        k += 1
    out = out[: int(length * SR)]
    for delay, g in ((0.09, 0.3), (0.21, 0.2), (0.35, 0.1)):
        d = int(delay * SR)
        out[d:] += g * out[:-d]
    fade = np.minimum(1, np.arange(len(out)) / (1.5 * SR)) * np.minimum(1, (len(out) - np.arange(len(out))) / (2.5 * SR))
    out *= fade
    return out

def final_chord(out, t0):
    for m in (36, 48, 55, 60, 64, 71):
        add(out, pad([note(m)], 5.5), t0, 0.35)
        add(out, piano(note(m + 12), 4.5), t0, 0.12)

def write(name, sig):
    sig = sig / (np.max(np.abs(sig)) + 1e-9) * 0.8
    stereo = np.stack([sig, np.roll(sig, int(0.012 * SR))], axis=1)
    sf.write(os.path.join(out_dir, f"{name}.wav"), stereo.astype(np.float32), SR)
    print(name, round(len(sig) / SR, 1), "s")

for cut, spec in cuts.items():
    ids = spec["scenes"]
    starts, t = {}, 0.0
    for i, sid in enumerate(ids):
        starts[sid] = t
        t += scene_seconds(cut, sid, i == len(ids) - 1)
    length = t
    peak = starts.get("s18", length * 0.85)
    breath = starts.get("s19", peak + 4)
    logo = starts["s20"]
    def arc(x, peak=peak, breath=breath, logo=logo):
        if x < peak:
            return 0.35 + 0.6 * x / max(peak, 1)
        if x < breath:
            return 1.0
        return 0.2 if x < logo else 0.3
    sig = track(length, arc)
    final_chord(sig, logo + 0.3)
    write(cut, sig)

# Signature logo 6 s et 2 s.
for name, length in (("logo-6s", 6.0), ("logo-2s", 2.0)):
    sig = np.zeros(int(length * SR))
    final_chord(sig, 0.2 if length < 3 else 1.2)
    rng = np.random.default_rng(11)
    for i in range(10 if length > 3 else 4):
        add(sig, piano(note(84 + [0, 4, 7, 11, 12][i % 5]), 0.8), 0.1 + i * (0.12 if length > 3 else 0.05), 0.05)
    write(name, sig)

# Effets sonores.
def env_tone(freqs, dur, decay):
    t = np.arange(int(dur * SR)) / SR
    return sum(np.sin(2 * np.pi * f * t) for f in freqs) * np.exp(-t * decay) * np.minimum(1, t / 0.003) / len(freqs)

def save_fx(name, sig, gain=0.8):
    sig = sig / (np.max(np.abs(sig)) + 1e-9) * gain
    sf.write(os.path.join(out_dir, f"{name}.wav"), sig.astype(np.float32), SR)

save_fx("tick", env_tone([2400], 0.05, 90), 0.5)
save_fx("chime", np.concatenate([env_tone([1318.5, 2637], 0.18, 14), env_tone([1760, 3520], 0.6, 7)]), 0.7)
save_fx("scan", env_tone([1850], 0.14, 3) * (np.arange(int(0.14 * SR)) < int(0.12 * SR)), 0.6)
t = np.arange(int(0.5 * SR)) / SR
buzz = np.sin(2 * np.pi * 150 * t) * (np.sin(2 * np.pi * 8 * t) > 0) * 0.4
save_fx("notif", np.concatenate([env_tone([988, 1976], 0.12, 20), env_tone([1319, 2637], 0.4, 9)]) + np.pad(buzz, (0, max(0, int(0.52 * SR) - len(buzz))))[: int(0.52 * SR)], 0.7)
t = np.arange(int(1.2 * SR)) / SR
noise = np.random.default_rng(5).standard_normal(len(t))
lp = np.zeros_like(noise)
acc = 0.0
for i in range(len(noise)):
    a = 0.01 + 0.25 * (i / len(noise))
    acc += a * (noise[i] - acc)
    lp[i] = acc
save_fx("sync", lp * np.sin(np.pi * t / t[-1]) ** 2 + 0.3 * np.sin(2 * np.pi * (300 + 500 * t) * t) * np.sin(np.pi * t / t[-1]), 0.6)
save_fx("thread", env_tone([2093, 3136, 4186], 1.2, 4.5), 0.45)
bursts = np.concatenate([np.random.default_rng(i).standard_normal(int(0.05 * SR)) * 0.5 * (1 if i % 2 else 0.3) for i in range(14)])
save_fx("print", bursts, 0.45)
print("effets ok")
