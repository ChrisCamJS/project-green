// src/utils/AudioPlayer.js
// NOTE: This class handles the decoding and seamless playback of the raw PCM audio 
// chunks sent back by the Gemini Live API. 

export class AudioPlayer {
  constructor() {
    // Gemini Live returns 24kHz audio, so we set our context to match.
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ 
      sampleRate: 24000 
    });
    // This tracks when the next chunk should play so we don't get overlapping audio
    this.nextPlayTime = 0; 
  }

  // NOTE: Takes the raw Base64 string from the WebSocket and plays it
  playBase64Audio(base64String) {
    if (!base64String) return;

    // 1. Decode Base64 into a raw binary string
    const binaryString = window.atob(base64String);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. Convert the raw bytes into 16-bit PCM data
    const int16Array = new Int16Array(bytes.buffer);

    // 3. Convert 16-bit PCM to Float32 (which is what the Web Audio API demands)
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      // Normalize the 16-bit integer to a -1.0 to 1.0 float
      float32Array[i] = int16Array[i] / 0x8000; 
    }

    // 4. Create an AudioBuffer to hold the chunk
    const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    // 5. Create a source node and connect it to the speakers
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // 6. Queue management: ensure chunks play back-to-back smoothly
    const currentTime = this.audioContext.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }
    
    // Schedule the playback and update the time tracker for the next chunk
    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  // NOTE: Clears the queue and shuts down the context
  stop() {
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}