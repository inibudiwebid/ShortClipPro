export interface FacePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpeakerDetectionResult {
  time: number;
  activeSpeaker: 'left' | 'right' | 'both';
  leftFace?: FacePosition;
  rightFace?: FacePosition;
}

export class SplitScreenProcessor {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  async detectFaces(time: number): Promise<FacePosition[]> {
    this.video.currentTime = time;
    await this.waitForSeek();

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.video.videoWidth;
    tempCanvas.height = this.video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(this.video, 0, 0);

    const faces = await this.simpleFaceDetection(tempCanvas);
    return faces;
  }

  private async simpleFaceDetection(canvas: HTMLCanvasElement): Promise<FacePosition[]> {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const faces: FacePosition[] = [];
    const width = canvas.width;
    const height = canvas.height;

    const leftThird = width / 3;
    const rightThird = (2 * width) / 3;

    const leftRegion = this.analyzeRegion(imageData, 0, 0, leftThird, height);
    const rightRegion = this.analyzeRegion(imageData, rightThird, 0, width - rightThird, height);

    if (leftRegion.hasFace) {
      faces.push({
        x: 0,
        y: height * 0.1,
        width: leftThird,
        height: height * 0.8,
      });
    }

    if (rightRegion.hasFace) {
      faces.push({
        x: rightThird,
        y: height * 0.1,
        width: width - rightThird,
        height: height * 0.8,
      });
    }

    return faces;
  }

  private analyzeRegion(
    imageData: ImageData,
    x: number,
    y: number,
    width: number,
    height: number
  ): { hasFace: boolean; intensity: number } {
    let skinTonePixels = 0;
    let totalPixels = 0;
    let edgeCount = 0;

    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const endX = Math.floor(x + width);
    const endY = Math.floor(y + height);

    for (let py = startY; py < endY; py += 4) {
      for (let px = startX; px < endX; px += 4) {
        const i = (py * imageData.width + px) * 4;
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        const isSkinTone = r > 95 && g > 40 && b > 20 &&
                          r > g && r > b &&
                          Math.abs(r - g) > 15;

        if (isSkinTone) skinTonePixels++;

        if (px < endX - 4) {
          const nextI = (py * imageData.width + px + 4) * 4;
          const rDiff = Math.abs(imageData.data[nextI] - r);
          if (rDiff > 30) edgeCount++;
        }

        totalPixels++;
      }
    }

    const skinToneRatio = skinTonePixels / totalPixels;
    const edgeRatio = edgeCount / totalPixels;

    const hasFace = skinToneRatio > 0.05 && edgeRatio > 0.02;

    return {
      hasFace,
      intensity: skinToneRatio + edgeRatio,
    };
  }

  async detectSpeaker(
    time: number,
    leftFace?: FacePosition,
    rightFace?: FacePosition
  ): Promise<'left' | 'right' | 'both'> {
    if (!leftFace && !rightFace) return 'both';
    if (!leftFace) return 'right';
    if (!rightFace) return 'left';

    this.video.currentTime = time;
    await this.waitForSeek();

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.video.videoWidth;
    tempCanvas.height = this.video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(this.video, 0, 0);

    const leftActivity = this.calculateRegionActivity(tempCanvas, leftFace);
    const rightActivity = this.calculateRegionActivity(tempCanvas, rightFace);

    if (Math.abs(leftActivity - rightActivity) < 0.1) {
      return 'both';
    }

    return leftActivity > rightActivity ? 'left' : 'right';
  }

  private calculateRegionActivity(canvas: HTMLCanvasElement, face: FacePosition): number {
    const ctx = canvas.getContext('2d')!;
    const mouthRegion = {
      x: face.x + face.width * 0.3,
      y: face.y + face.height * 0.6,
      width: face.width * 0.4,
      height: face.height * 0.2,
    };

    const imageData = ctx.getImageData(
      mouthRegion.x,
      mouthRegion.y,
      mouthRegion.width,
      mouthRegion.height
    );

    let totalVariance = 0;
    const pixels = imageData.data.length / 4;

    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const brightness = (r + g + b) / 3;
      totalVariance += Math.abs(brightness - 128);
    }

    return totalVariance / pixels;
  }

  async createSplitScreenFrame(
    time: number,
    activeSpeaker: 'left' | 'right' | 'both',
    leftFace?: FacePosition,
    rightFace?: FacePosition
  ): Promise<ImageData> {
    this.video.currentTime = time;
    await this.waitForSeek();

    const width = this.video.videoWidth;
    const height = this.video.videoHeight;

    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, width, height);

    if (activeSpeaker === 'both' || !leftFace || !rightFace) {
      this.ctx.drawImage(this.video, 0, 0, width, height);
    } else {
      const splitX = width / 2;

      if (activeSpeaker === 'left') {
        this.ctx.drawImage(
          this.video,
          0, 0, splitX, height,
          0, 0, splitX * 1.2, height
        );

        this.ctx.globalAlpha = 0.6;
        this.ctx.drawImage(
          this.video,
          splitX, 0, width - splitX, height,
          splitX * 1.2, 0, width - splitX * 1.2, height
        );
        this.ctx.globalAlpha = 1.0;
      } else {
        this.ctx.globalAlpha = 0.6;
        this.ctx.drawImage(
          this.video,
          0, 0, splitX, height,
          0, 0, splitX * 0.8, height
        );
        this.ctx.globalAlpha = 1.0;

        this.ctx.drawImage(
          this.video,
          splitX, 0, width - splitX, height,
          splitX * 0.8, 0, (width - splitX) * 1.2, height
        );
      }

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(splitX, 0);
      this.ctx.lineTo(splitX, height);
      this.ctx.stroke();
    }

    return this.ctx.getImageData(0, 0, width, height);
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
}
