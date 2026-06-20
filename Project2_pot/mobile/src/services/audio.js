import { Audio } from 'expo-av';

let soundObject = null;
let isLoaded = false;

/**
 * Pre-load the alert sound so playback is instantaneous.
 * Call once when monitoring begins.
 *
 * The bundled assets/alert.mp3 is a silent placeholder.
 * Replace it with a real short beep/chime for production use
 * (see assets/ALERT_AUDIO_README.txt for sources).
 */
export async function loadAlertSound() {
  try {
    // Configure audio session for playback (iOS)
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    if (soundObject) {
      await soundObject.unloadAsync();
      soundObject = null;
      isLoaded = false;
    }

    const { sound } = await Audio.Sound.createAsync(
      // Replace with a real alert sound for production
      require('../../assets/alert.mp3'),
      { shouldPlay: false, volume: 1.0 }
    );
    soundObject = sound;
    isLoaded = true;
  } catch (err) {
    // Fail silently — monitoring continues even without audio
    console.warn('[audio] Could not load alert sound:', err.message);
    isLoaded = false;
  }
}

/**
 * Play the alert sound once.
 * Safe to call even if the sound failed to load.
 */
export async function playAlert() {
  if (!isLoaded || !soundObject) {
    console.warn('[audio] Alert sound not loaded, skipping playback');
    return;
  }
  try {
    // Rewind to start in case it was played before
    await soundObject.setPositionAsync(0);
    await soundObject.playAsync();
  } catch (err) {
    console.warn('[audio] playAlert error:', err.message);
  }
}

/**
 * Release the sound resource.
 * Call when monitoring stops or on app unmount.
 */
export async function unloadAlertSound() {
  if (soundObject) {
    try {
      await soundObject.unloadAsync();
    } catch (_) {}
    soundObject = null;
    isLoaded = false;
  }
}
