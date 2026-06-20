Place your alert sound file here as:

  assets/alert.mp3

Requirements:
  - Format: MP3 (or AAC/M4A also works with expo-av)
  - Duration: 0.5 – 2 seconds recommended
  - Volume: normalised, not clipped

Without this file, audio/audio.js will log a warning but the app
will continue to function — detections are still logged and all other
features work normally.

Free sources for short alert sounds:
  - https://freesound.org  (search "beep" or "alert")
  - https://soundbible.com
  - https://mixkit.co/free-sound-effects/

After adding the file, rebuild the app bundle:
  npx expo start --clear
