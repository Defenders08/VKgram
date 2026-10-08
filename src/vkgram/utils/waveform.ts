import type {MyDocument} from '@appManagers/appDocsManager';

/**
 * Telegram stores the shape of a voice message as `bytes`: 5 bits per sample (0…31),
 * packed little-endian. This unpacks them into the samples.
 */
export function decodeWaveform(waveform: Uint8Array | number[]): number[] {
  const bytes = waveform instanceof Uint8Array ? waveform : new Uint8Array(waveform);
  const count = Math.floor(bytes.length * 8 / 5);
  if(!count) return [];

  const samples = new Array<number>(count);
  for(let i = 0; i < count; i++) {
    const byte = Math.floor(i * 5 / 8);
    const shift = i * 5 % 8;
    // the sample can straddle two bytes; past the last byte the missing one is 0
    const value = (bytes[byte] | ((bytes[byte + 1] ?? 0) << 8)) >> shift;
    samples[i] = value & 31;
  }
  return samples;
}

/**
 * The bars of a voice message: `count` heights in 0…1 (never below `floor`, so a quiet
 * moment is still a visible stroke). A message without a recorded shape is a flat line.
 */
export function getVoiceBars(doc: MyDocument | undefined, count: number, floor = .14): number[] {
  const attribute = doc?.attributes?.find((attr) => attr._ === 'documentAttributeAudio') as {waveform?: Uint8Array | number[]} | undefined;
  const samples = attribute?.waveform ? decodeWaveform(attribute.waveform) : [];
  if(!samples.length) return new Array(count).fill(floor);

  const bars: number[] = [];
  for(let i = 0; i < count; i++) {
    // every bar is the average of the samples under it (or the one nearest, if there are fewer samples than bars)
    const from = Math.floor(i * samples.length / count);
    const to = Math.max(from + 1, Math.floor((i + 1) * samples.length / count));
    let sum = 0;
    for(let j = from; j < to; j++) sum += samples[Math.min(j, samples.length - 1)];
    bars.push(Math.max(floor, sum / (to - from) / 31));
  }
  return bars;
}
