export interface ViralMoment {
  startTime: number;
  endTime: number;
  score: number;
  type: 'scene_change' | 'audio_peak' | 'motion' | 'combined';
  confidence: number;
}

export class ViralMomentDetector {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audioContext: AudioContext | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  async detectViralMoments(
    sampleInterval: number = 0.5,
    onProgress?: (progress: number) => void,
    clipDuration: number = 15
  ): Promise<ViralMoment[]> {
    const duration = this.video.duration;
    const samples: { time: number; frame: ImageData; motion: number }[] = [];

    this.canvas.width = 320;
    this.canvas.height = 180;

    let prevFrame: ImageData | null = null;

    for (let time = 0; time < duration; time += sampleInterval) {
      this.video.currentTime = time;
      await this.waitForSeek();

      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      const currentFrame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      const motion = prevFrame ? this.calculateMotion(prevFrame, currentFrame) : 0;

      samples.push({
        time,
        frame: currentFrame,
        motion,
      });

      prevFrame = currentFrame;

      if (onProgress) {
        onProgress((time / duration) * 100);
      }
    }

    const moments = this.analyzeSamples(samples, clipDuration);
    return this.rankAndFilterMoments(moments);
  }

  private waitForSeek(): Promise<void> {
    return new Promise((resolve) => {
      const onSeeked = () => {
        this.video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      this.video.addEventListener('seeked', onSeeked);
    });
  }

  private calculateMotion(prev: ImageData, current: ImageData): number {
    let diff = 0;
    const step = 4;

    for (let i = 0; i < prev.data.length; i += step) {
      const rDiff = Math.abs(prev.data[i] - current.data[i]);
      const gDiff = Math.abs(prev.data[i + 1] - current.data[i + 1]);
      const bDiff = Math.abs(prev.data[i + 2] - current.data[i + 2]);
      diff += (rDiff + gDiff + bDiff) / 3;
    }

    return diff / (prev.data.length / 4);
  }

  private calculateBrightness(frame: ImageData): number {
    let brightness = 0;
    const step = 4;

    for (let i = 0; i < frame.data.length; i += step) {
      const r = frame.data[i];
      const g = frame.data[i + 1];
      const b = frame.data[i + 2];
      brightness += (r + g + b) / 3;
    }

    return brightness / (frame.data.length / 4);
  }

  private analyzeSamples(
    samples: { time: number; frame: ImageData; motion: number }[],
    clipDuration: number
  ): ViralMoment[] {
    const moments: ViralMoment[] = [];

    const motionValues = samples.map((s) => s.motion);
    const avgMotion = motionValues.reduce((a, b) => a + b, 0) / motionValues.length;
    const motionThreshold = avgMotion * 2;

    for (let i = 1; i < samples.length - 1; i++) {
      const sample = samples[i];
      const prevSample = samples[i - 1];
      const nextSample = samples[i + 1];

      const sceneChange = sample.motion > motionThreshold;

      const prevBrightness = this.calculateBrightness(prevSample.frame);
      const currBrightness = this.calculateBrightness(sample.frame);
      const brightnessDiff = Math.abs(currBrightness - prevBrightness);

      const isInterestingMoment = sceneChange || brightnessDiff > 20;

      if (isInterestingMoment) {
        const score =
          (sample.motion / motionThreshold) * 0.6 +
          (brightnessDiff / 50) * 0.4;

        const halfDuration = clipDuration / 2;
        const beforeMoment = Math.min(halfDuration * 0.4, 2);
        const afterMoment = clipDuration - beforeMoment;

        moments.push({
          startTime: Math.max(0, sample.time - beforeMoment),
          endTime: Math.min(this.video.duration, sample.time + afterMoment),
          score: Math.min(score, 1),
          type: sceneChange ? 'scene_change' : 'motion',
          confidence: Math.min(score * 100, 100),
        });
      }
    }

    return moments;
  }

  private rankAndFilterMoments(moments: ViralMoment[]): ViralMoment[] {
    const sorted = moments.sort((a, b) => b.score - a.score);

    const filtered: ViralMoment[] = [];
    for (const moment of sorted) {
      const hasOverlap = filtered.some(
        (existing) =>
          (moment.startTime >= existing.startTime && moment.startTime <= existing.endTime) ||
          (moment.endTime >= existing.startTime && moment.endTime <= existing.endTime)
      );

      if (!hasOverlap) {
        filtered.push(moment);
      }
    }

    return filtered.slice(0, 10);
  }

  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
