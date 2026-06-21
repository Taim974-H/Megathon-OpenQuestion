#!/bin/bash

# Trim silence from the beginning of horse sound files
# This removes any leading silence so sounds start immediately

SOUNDS_DIR="../public/sounds"
TEMP_DIR="./temp_trimmed"

# Create temporary directory
mkdir -p "$TEMP_DIR"

echo "Trimming silence from horse sounds..."

# Process all MP3 files in the sounds directory
for file in "$SOUNDS_DIR"/*.mp3; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo "Processing $filename..."
        
        # Use ffmpeg to detect and remove silence from the beginning
        # silenceremove: detects silence at start
        # start_periods=1: remove silence from beginning only
        # start_threshold=-50dB: audio below -50dB is considered silence
        # start_silence=0.1: minimum silence duration to remove (100ms)
        # start_duration=0: remove all leading silence
        ffmpeg -i "$file" \
            -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1:start_duration=0" \
            -c:a libmp3lame -q:a 2 \
            "$TEMP_DIR/$filename" \
            -y \
            -loglevel warning
        
        if [ $? -eq 0 ]; then
            # Replace original file with trimmed version
            mv "$TEMP_DIR/$filename" "$file"
            echo "✓ Trimmed $filename"
        else
            echo "✗ Failed to trim $filename"
        fi
    fi
done

# Clean up
rmdir "$TEMP_DIR" 2>/dev/null

echo "Done! All horse sounds have been trimmed."
