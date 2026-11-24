# Tone Lab

Static browser audio proof of concept. No dependencies, uploads, backend, analytics or recording.

## Try it

Enable microphone access on HTTPS, then play **one note at a time**. The keyboard follows the detected octave. Note names are German (H = English B).

Optional calibration: select starting C (C3, C4 or C5), remain quiet for two seconds, then hold C D E F G A H C for approximately one second per note. The app learns the noise threshold and median tuning offset from A4=440 Hz, and stores only this profile locally. The decay envelope provides a rough percussive/sustained sound hint; it is **not an instrument classifier**. Calibration accepts tuning within ±45 cents of standard pitch. Microphone audio processing is requested off but browsers/devices may override it.

Demo generates a harmonic tone, routes it through the same analyser and YIN detector, and plays an ascending C-major scale. It does not use the microphone and is not an acoustic accuracy test.

## Implementation

Web Audio AnalyserNode (4096 samples) → module Web Worker → YIN squared difference, cumulative mean normalization, parabolic lag refinement. Supported frequencies: 65–2000 Hz. Three agreeing frames stabilize the displayed semitone; ~220 ms dropout clears the note. Approximate analysis rate: 18 Hz. The UI shows measured frequency, cents relative to the calibrated equal-tempered reference, RMS level and periodicity (not accuracy probability).

Microphone stops when the page is hidden, explicitly stopped, or unloaded. Calibration can be cancelled, reset, and repeated. Audio tracks and AudioContext are released on stop.

## Develop / validate

Serve this directory on localhost or HTTPS (e.g. `python3 -m http.server 8000`). There is no build step. `node test.mjs` runs deterministic synthetic tests: 360 cases spanning C2–H6 at 44.1/48 kHz with sine, harmonics, and weak fundamentals, plus silence/noise/gating. Tests require less than 15 cents error. These tests do not validate physical microphones, room acoustics, real instruments or polyphonic input.

For GitHub Pages choose **Deploy from a branch → main → / (root)**.

## Limitations / next experiments

Monophonic only. Pedal resonance, chords, noisy rooms and strong missing fundamentals can lead to octave errors. Acoustic latency depends on browser, hardware and buffer size. Compare the results on a real keyboard against known notes, then test plucked/held instruments. No claim of automatic instrument identification or measured real-world accuracy.
