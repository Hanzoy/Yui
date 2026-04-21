class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.frameSamples = options.processorOptions.frameSamples;
    this.sourceSampleRate = sampleRate;
    this.pending = [];
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i += 1) {
      this.pending.push(channelData[i]);

      if (this.pending.length === this.frameSamples) {
        const frame = new Float32Array(this.pending);
        this.pending.length = 0;
        this.port.postMessage(frame, [frame.buffer]);
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
