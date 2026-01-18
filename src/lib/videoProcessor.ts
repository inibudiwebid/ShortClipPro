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
  subtitleStyle?: SubtitleConfig;
  videoEffects: string[];
  transitions: string[];
  useViralDetection: boolean;
  useSplitScreen: boolean;
  maintainSpeed: boolean;
}

interface SubtitleConfig {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  padding?: number;
  borderRadius?: number;
  textAlign?: string;
  textShadow?: string;
  textStroke?: string;
  position?: 'top' | 'center' | 'bottom';
  config?: SubtitleConfig;
}

export class VideoProcessor {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private videoUrl: string | null = null;

  constructor() {
    this.video = document.createElement('video');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.video.crossOrigin = 'anonymous';
    this.video.playsInline = true;
  }

  async loadVideo(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.videoUrl) {
        URL.revokeObjectURL(this.videoUrl);
      }

      this.videoUrl = URL.createObjectURL(file);
      this.video.src = this.videoUrl;

      this.video.onloadedmetadata = () => {
        this.canvas.width = 1080;
        this.canvas.height = 1920;
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
    const extractVideo = document.createElement('video');
    extractVideo.src = this.videoUrl!;
    extractVideo.playsInline = true;
    extractVideo.muted = false;

    await new Promise<void>((resolve, reject) => {
      extractVideo.onloadedmetadata = () => resolve();
      extractVideo.onerror = () => reject(new Error('Failed to load video for extraction'));
    });

    const extractCanvas = document.createElement('canvas');
    extractCanvas.width = this.canvas.width;
    extractCanvas.height = this.canvas.height;
    const extractCtx = extractCanvas.getContext('2d')!;

    const canvasStream = extractCanvas.captureStream(30);

    const audioContext = new AudioContext();
    const audioSource = audioContext.createMediaElementSource(extractVideo);
    const audioDestination = audioContext.createMediaStreamDestination();
    audioSource.connect(audioDestination);
    audioSource.connect(audioContext.destination);

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks()
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
        audioContext.close();
        extractVideo.remove();
        resolve(blob);
      };

      mediaRecorder.onerror = () => {
        audioContext.close();
        extractVideo.remove();
        reject(new Error('Recording failed'));
      };

      extractVideo.currentTime = clip.startTime;

      extractVideo.onseeked = () => {
        mediaRecorder.start();

        const startTime = performance.now();
        const clipDurationMs = clip.duration * 1000;
        let lastProgress = 0;

        const drawFrame = () => {
          if (extractVideo.currentTime >= clip.endTime || extractVideo.paused || extractVideo.ended) {
            extractVideo.pause();
            setTimeout(() => {
              mediaRecorder.stop();
            }, 100);
            return;
          }

          extractCtx.clearRect(0, 0, extractCanvas.width, extractCanvas.height);
          extractCtx.fillStyle = '#000000';
          extractCtx.fillRect(0, 0, extractCanvas.width, extractCanvas.height);

          this.applyEffectsToContext(extractCtx, options.videoEffects);

          if (options.useSplitScreen && speakerData) {
            const currentTime = extractVideo.currentTime - clip.startTime;
            const speakerInfo = this.findClosestSpeaker(currentTime, speakerData);
            if (speakerInfo.faceCount === 2) {
              this.drawSplitScreenPortraitToContext(extractCtx, extractVideo, extractCanvas, speakerInfo.speaker);
            } else {
              this.drawVideoPortraitToContext(extractCtx, extractVideo, extractCanvas);
            }
          } else {
            this.drawVideoPortraitToContext(extractCtx, extractVideo, extractCanvas);
          }

          extractCtx.filter = 'none';

          const elapsed = performance.now() - startTime;
          const progress = Math.min(100, (elapsed / clipDurationMs) * 100);
          if (progress - lastProgress >= 1 && onProgress) {
            lastProgress = progress;
            onProgress(progress);
          }

          requestAnimationFrame(drawFrame);
        };

        extractVideo.play().then(() => {
          drawFrame();
        }).catch((err) => {
          console.error('Failed to play video:', err);
          reject(err);
        });
      };
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

  private drawVideoPortraitToContext(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const canvasRatio = canvasWidth / canvasHeight;
    const videoRatio = videoWidth / videoHeight;

    if (videoRatio > canvasRatio) {
      const scale = canvasHeight / videoHeight;
      const faceCenter = this.detectFaceCenterXFromVideo(video);
      let sourceX = (faceCenter * videoWidth) - (canvasWidth / scale / 2);
      sourceX = Math.max(0, Math.min(sourceX, videoWidth - canvasWidth / scale));

      ctx.drawImage(
        video,
        sourceX, 0,
        canvasWidth / scale, videoHeight,
        0, 0,
        canvasWidth, canvasHeight
      );
    } else {
      const scale = canvasWidth / videoWidth;
      const scaledHeight = videoHeight * scale;
      const offsetY = (canvasHeight - scaledHeight) / 2;

      ctx.drawImage(
        video,
        0, 0,
        videoWidth, videoHeight,
        0, offsetY,
        canvasWidth, scaledHeight
      );
    }
  }

  private detectFaceCenterXFromVideo(video: HTMLVideoElement): number {
    const tempCanvas = document.createElement('canvas');
    const sampleWidth = 320;
    const sampleHeight = 180;
    tempCanvas.width = sampleWidth;
    tempCanvas.height = sampleHeight;
    const tempCtx = tempCanvas.getContext('2d')!;

    tempCtx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
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

  private drawSplitScreenPortraitToContext(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    activeSpeaker: 'left' | 'right' | 'both'
  ) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (activeSpeaker === 'both') {
      this.drawVideoPortraitToContext(ctx, video, canvas);
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

        const scale = canvasWidth / sourceHalfWidth;
        const drawHeight = videoHeight * scale;
        const offsetY = (topHeight - drawHeight) / 2;

        ctx.drawImage(
          video,
          0, 0, sourceHalfWidth, videoHeight,
          0, offsetY, canvasWidth, drawHeight
        );

        ctx.globalAlpha = 0.5;
        const scale2 = canvasWidth / sourceHalfWidth;
        const drawHeight2 = videoHeight * scale2;
        const offsetY2 = topHeight + (bottomHeight - drawHeight2) / 2;

        ctx.drawImage(
          video,
          sourceHalfWidth, 0, sourceHalfWidth, videoHeight,
          0, offsetY2, canvasWidth, drawHeight2
        );
        ctx.globalAlpha = 1.0;
      } else {
        const bottomHeight = splitY * 1.3;
        const topHeight = canvasHeight - bottomHeight;

        ctx.globalAlpha = 0.5;
        const scale = canvasWidth / sourceHalfWidth;
        const drawHeight = videoHeight * scale;
        const offsetY = (topHeight - drawHeight) / 2;

        ctx.drawImage(
          video,
          0, 0, sourceHalfWidth, videoHeight,
          0, offsetY, canvasWidth, drawHeight
        );
        ctx.globalAlpha = 1.0;

        const scale2 = canvasWidth / sourceHalfWidth;
        const drawHeight2 = videoHeight * scale2;
        const offsetY2 = topHeight + (bottomHeight - drawHeight2) / 2;

        ctx.drawImage(
          video,
          sourceHalfWidth, 0, sourceHalfWidth, videoHeight,
          0, offsetY2, canvasWidth, drawHeight2
        );
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 4;
      ctx.setLineDash([15, 10]);
      ctx.beginPath();
      ctx.moveTo(0, splitY);
      ctx.lineTo(canvasWidth, splitY);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      this.drawVideoPortraitToContext(ctx, video, canvas);
    }
  }

  private applyEffectsToContext(ctx: CanvasRenderingContext2D, effects: string[]) {
    if (effects.includes('blur')) {
      ctx.filter = 'blur(2px)';
    } else if (effects.includes('brightness')) {
      ctx.filter = 'brightness(1.2)';
    } else if (effects.includes('contrast')) {
      ctx.filter = 'contrast(1.3)';
    } else if (effects.includes('grayscale')) {
      ctx.filter = 'grayscale(100%)';
    } else if (effects.includes('sepia')) {
      ctx.filter = 'sepia(100%)';
    } else {
      ctx.filter = 'none';
    }
  }

  private drawSubtitleToContext(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    text: string,
    style: SubtitleConfig
  ) {
    const config = style.config || style;

    ctx.save();

    const fontFamily = config.fontFamily || 'Arial';
    const fontSize = config.fontSize || 48;
    const fontWeight = config.fontWeight || 'bold';
    const color = config.color || '#FFFFFF';
    const position = config.position || 'bottom';

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = (config.textAlign as CanvasTextAlign) || 'center';
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;

    const x = canvas.width / 2;
    let y: number;

    switch (position) {
      case 'top':
        y = textHeight + 40;
        break;
      case 'center':
        y = canvas.height / 2;
        break;
      case 'bottom':
      default:
        y = canvas.height - textHeight - 40;
        break;
    }

    if (config.backgroundColor && config.backgroundColor !== 'transparent') {
      const padding = config.padding || 20;
      const bgOpacity = config.backgroundOpacity || 0.8;

      ctx.globalAlpha = bgOpacity;
      ctx.fillStyle = config.backgroundColor;

      const bgX = x - textWidth / 2 - padding;
      const bgY = y - textHeight / 2 - padding;
      const bgWidth = textWidth + padding * 2;
      const bgHeight = textHeight + padding * 2;

      if (config.borderRadius) {
        this.roundRect(ctx, bgX, bgY, bgWidth, bgHeight, config.borderRadius);
        ctx.fill();
      } else {
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
      }

      ctx.globalAlpha = 1;
    }

    if (config.textStroke) {
      const strokeParts = config.textStroke.split(' ');
      ctx.strokeStyle = strokeParts[1] || '#000000';
      ctx.lineWidth = parseInt(strokeParts[0]) || 2;
      ctx.strokeText(text, x, y);
    }

    if (config.textShadow) {
      const shadowParts = config.textShadow.split(',');
      shadowParts.forEach((shadow: string) => {
        const parts = shadow.trim().split(' ');
        ctx.shadowOffsetX = parseInt(parts[0]) || 0;
        ctx.shadowOffsetY = parseInt(parts[1]) || 0;
        ctx.shadowBlur = parseInt(parts[2]) || 0;
        ctx.shadowColor = parts[3] || 'rgba(0,0,0,0.8)';
      });
    }

    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  cleanup() {
    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl);
      this.videoUrl = null;
    }
  }
}
