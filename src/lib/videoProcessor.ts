export interface VideoClip {
  startTime: number;
  endTime: number;
  duration: number;
  index: number;
  viralScore?: number;
  isViralMoment?: boolean;
}

export interface ProcessingOptions {
  clipCount: number;
  clipDuration: number;
  useSubtitles: boolean;
  subtitleStyle?: any;
  videoEffects: string[];
  transitions: string[];
  useViralDetection: boolean;
  useSplitScreen: boolean;
  maintainSpeed: boolean;
}

export class VideoProcessor {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audioContext: AudioContext | null = null;
  private audioSource: MediaElementAudioSourceNode | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;

  constructor() {
    this.video = document.createElement('video');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.video.crossOrigin = 'anonymous';
  }

  async loadVideo(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      this.video.src = url;

      this.video.onloadedmetadata = () => {
        this.canvas.width = 1080;
        this.canvas.height = 1920;

        this.audioContext = new AudioContext();
        this.audioSource = this.audioContext.createMediaElementSource(this.video);
        this.audioDestination = this.audioContext.createMediaStreamDestination();
        this.audioSource.connect(this.audioDestination);
        this.audioSource.connect(this.audioContext.destination);

        resolve();
      };

      this.video.onerror = () => {
        reject(new Error('Failed to load video'));
      };
    });
  }

  getVideoDuration(): number {
    return this.video.duration;
  }

  async generateClips(
    options: ProcessingOptions,
    viralMoments?: Array<{ startTime: number; endTime: number; score: number }>
  ): Promise<VideoClip[]> {
    const duration = this.video.duration;
    const clips: VideoClip[] = [];

    if (options.useViralDetection && viralMoments && viralMoments.length > 0) {
      const topMoments = viralMoments
        .sort((a, b) => b.score - a.score)
        .slice(0, options.clipCount);

      topMoments.forEach((moment, i) => {
        const clipDuration = Math.min(
          options.clipDuration,
          moment.endTime - moment.startTime
        );

        clips.push({
          startTime: moment.startTime,
          endTime: moment.startTime + clipDuration,
          duration: clipDuration,
          index: i,
          viralScore: moment.score,
          isViralMoment: true,
        });
      });
    } else {
      if (options.clipDuration > 0) {
        const maxClips = Math.floor(duration / options.clipDuration);
        const clipCount = Math.min(options.clipCount, maxClips);

        const segmentSize = duration / clipCount;

        for (let i = 0; i < clipCount; i++) {
          const startTime = i * segmentSize;
          const clipDuration = Math.min(options.clipDuration, duration - startTime);

          clips.push({
            startTime,
            endTime: startTime + clipDuration,
            duration: clipDuration,
            index: i,
            isViralMoment: false,
          });
        }
      }
    }

    return clips;
  }

  async extractClip(
    clip: VideoClip,
    options: ProcessingOptions,
    onProgress?: (progress: number) => void,
    speakerData?: Array<{ time: number; speaker: 'left' | 'right' | 'both'; faceCount?: number }>
  ): Promise<Blob> {
    const canvasStream = this.canvas.captureStream(30);

    if (!this.audioDestination) {
      throw new Error('Audio not initialized. Load video first.');
    }

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...this.audioDestination.stream.getAudioTracks()
    ]);

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 5000000,
      audioBitsPerSecond: 128000
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };

      mediaRecorder.onerror = () => {
        reject(new Error('Recording failed'));
      };

      mediaRecorder.start();
      this.video.currentTime = clip.startTime;

      let frameCount = 0;
      const fps = options.maintainSpeed ? 30 : 30;
      const totalFrames = Math.floor(clip.duration * fps);

      const captureFrame = () => {
        if (this.video.currentTime >= clip.endTime || frameCount >= totalFrames) {
          mediaRecorder.stop();
          return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.applyEffects(options.videoEffects);

        if (options.useSplitScreen && speakerData) {
          const currentTime = this.video.currentTime - clip.startTime;
          const speakerInfo = this.findClosestSpeaker(currentTime, speakerData);
          if (speakerInfo.faceCount === 2) {
            this.drawSplitScreenPortrait(speakerInfo.speaker);
          } else {
            this.drawVideoPortrait();
          }
        } else {
          this.drawVideoPortrait();
        }

        if (options.useSubtitles && options.subtitleStyle) {
          const subtitleText = clip.isViralMoment
            ? `🔥 Viral Moment ${clip.index + 1}`
            : `Clip ${clip.index + 1}`;
          this.drawSubtitle(subtitleText, options.subtitleStyle);
        }

        frameCount++;
        if (onProgress) {
          onProgress((frameCount / totalFrames) * 100);
        }

        requestAnimationFrame(captureFrame);
      };

      this.video.play();
      captureFrame();
    });
  }

  private findClosestSpeaker(
    time: number,
    speakerData: Array<{ time: number; speaker: 'left' | 'right' | 'both'; faceCount?: number }>
  ): { time: number; speaker: 'left' | 'right' | 'both'; faceCount: number } {
    let closest = speakerData[0];
    let minDiff = Math.abs(time - closest.time);

    for (const data of speakerData) {
      const diff = Math.abs(time - data.time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = data;
      }
    }

    return { ...closest, faceCount: closest.faceCount || 0 };
  }

  private drawVideoPortrait() {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;

    const canvasRatio = canvasWidth / canvasHeight;
    const videoRatio = videoWidth / videoHeight;

    if (videoRatio > canvasRatio) {
      const scale = canvasHeight / videoHeight;
      const scaledWidth = videoWidth * scale;

      const faceCenter = this.detectFaceCenterX();
      let sourceX = (faceCenter * videoWidth) - (canvasWidth / scale / 2);

      sourceX = Math.max(0, Math.min(sourceX, videoWidth - canvasWidth / scale));

      this.ctx.drawImage(
        this.video,
        sourceX, 0,
        canvasWidth / scale, videoHeight,
        0, 0,
        canvasWidth, canvasHeight
      );
    } else {
      const scale = canvasWidth / videoWidth;
      const scaledHeight = videoHeight * scale;
      const offsetY = (canvasHeight - scaledHeight) / 2;

      this.ctx.drawImage(
        this.video,
        0, 0,
        videoWidth, videoHeight,
        0, offsetY,
        canvasWidth, scaledHeight
      );
    }
  }

  private detectFaceCenterX(): number {
    const tempCanvas = document.createElement('canvas');
    const sampleWidth = 320;
    const sampleHeight = 180;
    tempCanvas.width = sampleWidth;
    tempCanvas.height = sampleHeight;
    const tempCtx = tempCanvas.getContext('2d')!;

    tempCtx.drawImage(this.video, 0, 0, sampleWidth, sampleHeight);
    const imageData = tempCtx.getImageData(0, 0, sampleWidth, sampleHeight);

    const regions = [
      { x: 0, width: sampleWidth / 3, score: 0 },
      { x: sampleWidth / 3, width: sampleWidth / 3, score: 0 },
      { x: (2 * sampleWidth) / 3, width: sampleWidth / 3, score: 0 }
    ];

    for (const region of regions) {
      const startX = Math.floor(region.x);
      const endX = Math.floor(region.x + region.width);

      for (let y = Math.floor(sampleHeight * 0.2); y < Math.floor(sampleHeight * 0.7); y += 2) {
        for (let x = startX; x < endX; x += 2) {
          const i = (y * sampleWidth + x) * 4;
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];

          const isSkinTone =
            r > 95 && g > 40 && b > 20 &&
            r > g && r > b &&
            Math.abs(r - g) > 15 &&
            r < 255 && g < 255 && b < 255;

          if (isSkinTone) {
            region.score += 1;
          }
        }
      }
    }

    regions.sort((a, b) => b.score - a.score);

    if (regions[0].score > 100) {
      return (regions[0].x + regions[0].width / 2) / sampleWidth;
    }

    return 0.5;
  }

  private drawSplitScreenPortrait(activeSpeaker: 'left' | 'right' | 'both') {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;

    if (activeSpeaker === 'both') {
      this.drawVideoPortrait();
      return;
    }

    const splitY = canvasHeight / 2;
    const videoRatio = videoWidth / videoHeight;
    const canvasRatio = canvasWidth / canvasHeight;

    if (videoRatio > canvasRatio * 2) {
      const sourceHalfWidth = videoWidth / 2;

      if (activeSpeaker === 'left') {
        const topHeight = splitY * 1.3;
        const bottomHeight = canvasHeight - topHeight;

        const faceOffsetLeft = this.detectFaceInRegion(0, 0, sourceHalfWidth, videoHeight);
        const scale = canvasWidth / sourceHalfWidth;
        const drawHeight = videoHeight * scale;
        const offsetY = (topHeight - drawHeight) / 2;

        this.ctx.drawImage(
          this.video,
          faceOffsetLeft, 0, sourceHalfWidth, videoHeight,
          0, offsetY, canvasWidth, drawHeight
        );

        this.ctx.globalAlpha = 0.5;
        const faceOffsetRight = this.detectFaceInRegion(sourceHalfWidth, 0, sourceHalfWidth, videoHeight);
        const scale2 = canvasWidth / sourceHalfWidth;
        const drawHeight2 = videoHeight * scale2;
        const offsetY2 = topHeight + (bottomHeight - drawHeight2) / 2;

        this.ctx.drawImage(
          this.video,
          sourceHalfWidth + faceOffsetRight, 0, sourceHalfWidth, videoHeight,
          0, offsetY2, canvasWidth, drawHeight2
        );
        this.ctx.globalAlpha = 1.0;
      } else {
        const bottomHeight = splitY * 1.3;
        const topHeight = canvasHeight - bottomHeight;

        this.ctx.globalAlpha = 0.5;
        const faceOffsetLeft = this.detectFaceInRegion(0, 0, sourceHalfWidth, videoHeight);
        const scale = canvasWidth / sourceHalfWidth;
        const drawHeight = videoHeight * scale;
        const offsetY = (topHeight - drawHeight) / 2;

        this.ctx.drawImage(
          this.video,
          faceOffsetLeft, 0, sourceHalfWidth, videoHeight,
          0, offsetY, canvasWidth, drawHeight
        );
        this.ctx.globalAlpha = 1.0;

        const faceOffsetRight = this.detectFaceInRegion(sourceHalfWidth, 0, sourceHalfWidth, videoHeight);
        const scale2 = canvasWidth / sourceHalfWidth;
        const drawHeight2 = videoHeight * scale2;
        const offsetY2 = topHeight + (bottomHeight - drawHeight2) / 2;

        this.ctx.drawImage(
          this.video,
          sourceHalfWidth + faceOffsetRight, 0, sourceHalfWidth, videoHeight,
          0, offsetY2, canvasWidth, drawHeight2
        );
      }

      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 4;
      this.ctx.setLineDash([15, 10]);
      this.ctx.beginPath();
      this.ctx.moveTo(0, splitY);
      this.ctx.lineTo(canvasWidth, splitY);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    } else {
      this.drawVideoPortrait();
    }
  }

  private detectFaceInRegion(x: number, y: number, width: number, height: number): number {
    return 0;
  }

  private applyEffects(effects: string[]) {
    if (effects.includes('blur')) {
      this.ctx.filter = 'blur(2px)';
    } else if (effects.includes('brightness')) {
      this.ctx.filter = 'brightness(1.2)';
    } else if (effects.includes('contrast')) {
      this.ctx.filter = 'contrast(1.3)';
    } else if (effects.includes('grayscale')) {
      this.ctx.filter = 'grayscale(100%)';
    } else if (effects.includes('sepia')) {
      this.ctx.filter = 'sepia(100%)';
    } else {
      this.ctx.filter = 'none';
    }
  }

  private drawSubtitle(text: string, style: any) {
    const config = style.config || style;

    this.ctx.save();

    this.ctx.font = `${config.fontWeight} ${config.fontSize}px ${config.fontFamily}`;
    this.ctx.textAlign = config.textAlign as CanvasTextAlign;
    this.ctx.textBaseline = 'middle';

    const textMetrics = this.ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = config.fontSize;

    let x = this.canvas.width / 2;
    let y: number;

    switch (config.position) {
      case 'top':
        y = textHeight + 40;
        break;
      case 'center':
        y = this.canvas.height / 2;
        break;
      case 'bottom':
      default:
        y = this.canvas.height - textHeight - 40;
        break;
    }

    if (config.backgroundColor && config.backgroundColor !== 'transparent') {
      const padding = config.padding || 20;
      const bgOpacity = config.backgroundOpacity || 0.8;

      this.ctx.globalAlpha = bgOpacity;
      this.ctx.fillStyle = config.backgroundColor;

      const bgX = x - textWidth / 2 - padding;
      const bgY = y - textHeight / 2 - padding;
      const bgWidth = textWidth + padding * 2;
      const bgHeight = textHeight + padding * 2;

      if (config.borderRadius) {
        this.roundRect(bgX, bgY, bgWidth, bgHeight, config.borderRadius);
        this.ctx.fill();
      } else {
        this.ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
      }

      this.ctx.globalAlpha = 1;
    }

    if (config.textStroke) {
      const strokeParts = config.textStroke.split(' ');
      this.ctx.strokeStyle = strokeParts[1] || '#000000';
      this.ctx.lineWidth = parseInt(strokeParts[0]) || 2;
      this.ctx.strokeText(text, x, y);
    }

    if (config.textShadow) {
      const shadowParts = config.textShadow.split(',');
      shadowParts.forEach((shadow: string) => {
        const parts = shadow.trim().split(' ');
        this.ctx.shadowOffsetX = parseInt(parts[0]) || 0;
        this.ctx.shadowOffsetY = parseInt(parts[1]) || 0;
        this.ctx.shadowBlur = parseInt(parts[2]) || 0;
        this.ctx.shadowColor = parts[3] || 'rgba(0,0,0,0.8)';
      });
    }

    this.ctx.fillStyle = config.color;
    this.ctx.fillText(text, x, y);

    this.ctx.restore();
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.audioSource = null;
      this.audioDestination = null;
    }
    if (this.video.src) {
      URL.revokeObjectURL(this.video.src);
    }
  }
}
