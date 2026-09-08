export function playAlertChime() {
  if (typeof window === "undefined") return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.stop(context.currentTime + 0.2);
  } catch {
    // Audio is optional.
  }
}
