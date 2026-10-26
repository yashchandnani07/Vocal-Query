// mic-worklet.js : runs on the audio thread and hands raw microphone samples to voice.js.
class MicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0][0] // first input, first (mono) channel
    if (channel) this.port.postMessage(channel.slice()) // copy, the browser reuses the buffer
    return true // keep running
  }
}
registerProcessor('mic-processor', MicProcessor)
