import { useEffect, useRef, useState } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Download,
  Type,
  Sliders,
  Scissors,
  Video,
} from 'lucide-react';

interface VideoEditorProps {
  videoBlob: Blob;
  clipIndex: number;
  onClose: () => void;
  onSave: (editedBlob: Blob) => void;
}

interface SubtitleStyle {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  position: 'top' | 'center' | 'bottom';
  strokeColor: string;
  strokeWidth: number;
}

export default function VideoEditor({
  videoBlob,
  clipIndex,
  onClose,
  onSave,
}: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [activeTab, setActiveTab] = useState<'subtitle' | 'effects' | 'trim'>('subtitle');
  const [isProcessing, setIsProcessing] = useState(false);

  const [subtitle, setSubtitle] = useState<SubtitleStyle>({
    text: 'Add your subtitle here',
    fontFamily: 'Arial',
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    position: 'bottom',
    strokeColor: '#000000',
    strokeWidth: 2,
  });

  const [effects, setEffects] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
  });

  useEffect(() => {
    if (videoRef.current) {
      const url = URL.createObjectURL(videoBlob);
      videoRef.current.src = url;
      videoRef.current.muted = true;

      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          const dur = videoRef.current.duration;
          setDuration(dur);
          setTrimStart(0);
          setTrimEnd(dur);
          drawPreview();
        }
      };

      return () => {
        URL.revokeObjectURL(url);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [videoBlob]);

  const drawPreview = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;

    ctx.filter = `brightness(${effects.brightness}%) contrast(${effects.contrast}%) saturate(${effects.saturation}%) blur(${effects.blur}px)`;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    if (subtitle.text.trim()) {
      ctx.font = `${subtitle.fontWeight} ${subtitle.fontSize}px ${subtitle.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lines = subtitle.text.split('\n');
      const lineHeight = subtitle.fontSize * 1.3;
      const totalHeight = lines.length * lineHeight;

      let yPosition: number;
      if (subtitle.position === 'top') {
        yPosition = canvas.height * 0.15;
      } else if (subtitle.position === 'center') {
        yPosition = canvas.height / 2 - totalHeight / 2 + lineHeight / 2;
      } else {
        yPosition = canvas.height * 0.85 - totalHeight / 2;
      }

      lines.forEach((line, index) => {
        const y = yPosition + index * lineHeight;
        const x = canvas.width / 2;

        const metrics = ctx.measureText(line);
        const padding = 20;
        const bgX = x - metrics.width / 2 - padding;
        const bgY = y - subtitle.fontSize / 2 - padding / 2;
        const bgWidth = metrics.width + padding * 2;
        const bgHeight = subtitle.fontSize + padding;

        ctx.fillStyle = subtitle.backgroundColor;
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

        if (subtitle.strokeWidth > 0) {
          ctx.strokeStyle = subtitle.strokeColor;
          ctx.lineWidth = subtitle.strokeWidth;
          ctx.strokeText(line, x, y);
        }

        ctx.fillStyle = subtitle.color;
        ctx.fillText(line, x, y);
      });
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      setCurrentTime(video.currentTime);

      if (video.currentTime >= trimEnd && isPlaying) {
        video.currentTime = trimStart;
        video.pause();
        setIsPlaying(false);
      }
    };

    video.addEventListener('timeupdate', updateTime);
    return () => video.removeEventListener('timeupdate', updateTime);
  }, [trimStart, trimEnd, isPlaying]);

  useEffect(() => {
    const renderLoop = () => {
      drawPreview();
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [subtitle, effects]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime >= trimEnd) {
        videoRef.current.currentTime = trimStart;
      }
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const resetVideo = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = trimStart;
    videoRef.current.pause();
    setIsPlaying(false);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = trimStart + (trimEnd - trimStart) * percentage;

    videoRef.current.currentTime = time;
  };

  const handleExport = async () => {
    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        throw new Error('Video or canvas not available');
      }

      const stream = canvas.captureStream(30);

      video.muted = false;
      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(video);
      const dest = audioContext.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioContext.destination);

      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerPerSecond: 5000000,
      });

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        video.muted = true;
        audioContext.close();
        onSave(blob);
        setIsProcessing(false);
      };

      video.currentTime = trimStart;
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });

      mediaRecorder.start();
      await video.play();

      const checkTime = () => {
        if (video.currentTime >= trimEnd) {
          video.pause();
          mediaRecorder.stop();
        } else {
          requestAnimationFrame(checkTime);
        }
      };

      checkTime();

    } catch (error) {
      console.error('Export failed:', error);
      setIsProcessing(false);
      alert('Export failed. The video will be saved without edits.');
      onSave(videoBlob);
    }
  };

  const fonts = [
    'Arial',
    'Impact',
    'Comic Sans MS',
    'Courier New',
    'Georgia',
    'Times New Roman',
    'Verdana',
    'Trebuchet MS',
    'Helvetica',
    'Palatino',
  ];

  const progressPercentage = duration > 0
    ? ((currentTime - trimStart) / (trimEnd - trimStart)) * 100
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl w-full max-w-7xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Video className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold text-white">
              Video Editor - Clip {clipIndex + 1}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            disabled={isProcessing}
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col p-6">
            <div className="flex-1 bg-black rounded-lg relative overflow-hidden mb-4 flex items-center justify-center">
              <video
                ref={videoRef}
                className="hidden"
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-full object-contain"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlayPause}
                  disabled={isProcessing}
                  className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 text-white" />
                  ) : (
                    <Play className="w-6 h-6 text-white" />
                  )}
                </button>
                <button
                  onClick={resetVideo}
                  disabled={isProcessing}
                  className="p-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-5 h-5 text-white" />
                </button>
                <div className="flex-1">
                  <div
                    ref={timelineRef}
                    onClick={handleTimelineClick}
                    className="relative h-3 bg-gray-700 rounded-full cursor-pointer overflow-hidden"
                  >
                    <div
                      className="absolute h-full bg-blue-600 rounded-full transition-all"
                      style={{
                        width: `${Math.max(0, Math.min(100, progressPercentage))}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-sm text-gray-400">
                    <span>{currentTime.toFixed(1)}s</span>
                    <span>{trimEnd.toFixed(1)}s</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleExport}
                disabled={isProcessing}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-5 h-5" />
                {isProcessing ? 'Processing Video...' : 'Save & Download Edited Video'}
              </button>
            </div>
          </div>

          <div className="w-96 border-l border-gray-700 flex flex-col">
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setActiveTab('subtitle')}
                className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                  activeTab === 'subtitle'
                    ? 'bg-gray-800 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800'
                }`}
              >
                <Type className="w-5 h-5" />
                Subtitle
              </button>
              <button
                onClick={() => setActiveTab('trim')}
                className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                  activeTab === 'trim'
                    ? 'bg-gray-800 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800'
                }`}
              >
                <Scissors className="w-5 h-5" />
                Trim
              </button>
              <button
                onClick={() => setActiveTab('effects')}
                className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                  activeTab === 'effects'
                    ? 'bg-gray-800 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800'
                }`}
              >
                <Sliders className="w-5 h-5" />
                Effects
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'subtitle' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Subtitle Text
                    </label>
                    <textarea
                      value={subtitle.text}
                      onChange={(e) =>
                        setSubtitle({ ...subtitle, text: e.target.value })
                      }
                      placeholder="Enter your subtitle text here..."
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none focus:outline-none focus:border-blue-500"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Font Family
                    </label>
                    <select
                      value={subtitle.fontFamily}
                      onChange={(e) =>
                        setSubtitle({ ...subtitle, fontFamily: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      {fonts.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Font Size: {subtitle.fontSize}px
                    </label>
                    <input
                      type="range"
                      min="24"
                      max="120"
                      value={subtitle.fontSize}
                      onChange={(e) =>
                        setSubtitle({
                          ...subtitle,
                          fontSize: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Font Weight
                    </label>
                    <select
                      value={subtitle.fontWeight}
                      onChange={(e) =>
                        setSubtitle({ ...subtitle, fontWeight: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                      <option value="900">Extra Bold</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Text Color
                    </label>
                    <input
                      type="color"
                      value={subtitle.color}
                      onChange={(e) =>
                        setSubtitle({ ...subtitle, color: e.target.value })
                      }
                      className="w-full h-10 rounded-lg cursor-pointer bg-gray-800 border border-gray-700"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Background Color
                    </label>
                    <input
                      type="color"
                      value={subtitle.backgroundColor.startsWith('#')
                        ? subtitle.backgroundColor
                        : '#000000'}
                      onChange={(e) => {
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        setSubtitle({
                          ...subtitle,
                          backgroundColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
                        });
                      }}
                      className="w-full h-10 rounded-lg cursor-pointer bg-gray-800 border border-gray-700"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Stroke Width: {subtitle.strokeWidth}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={subtitle.strokeWidth}
                      onChange={(e) =>
                        setSubtitle({
                          ...subtitle,
                          strokeWidth: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Stroke Color
                    </label>
                    <input
                      type="color"
                      value={subtitle.strokeColor}
                      onChange={(e) =>
                        setSubtitle({ ...subtitle, strokeColor: e.target.value })
                      }
                      className="w-full h-10 rounded-lg cursor-pointer bg-gray-800 border border-gray-700"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Position
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['top', 'center', 'bottom'] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => setSubtitle({ ...subtitle, position: pos })}
                          className={`py-2 rounded-lg font-medium capitalize transition-colors ${
                            subtitle.position === pos
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'trim' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Trim Start: {trimStart.toFixed(2)}s
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={trimEnd - 0.1}
                      step="0.1"
                      value={trimStart}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        setTrimStart(value);
                        if (videoRef.current && videoRef.current.currentTime < value) {
                          videoRef.current.currentTime = value;
                        }
                      }}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Trim End: {trimEnd.toFixed(2)}s
                    </label>
                    <input
                      type="range"
                      min={trimStart + 0.1}
                      max={duration}
                      step="0.1"
                      value={trimEnd}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        setTrimEnd(value);
                        if (videoRef.current && videoRef.current.currentTime > value) {
                          videoRef.current.currentTime = value;
                        }
                      }}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <p className="text-sm text-gray-300 mb-2">
                      <span className="font-semibold">Original Duration:</span> {duration.toFixed(2)}s
                    </p>
                    <p className="text-sm text-gray-300">
                      <span className="font-semibold">Trimmed Duration:</span> {(trimEnd - trimStart).toFixed(2)}s
                    </p>
                  </div>
                </>
              )}

              {activeTab === 'effects' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Brightness: {effects.brightness}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={effects.brightness}
                      onChange={(e) =>
                        setEffects({
                          ...effects,
                          brightness: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Contrast: {effects.contrast}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={effects.contrast}
                      onChange={(e) =>
                        setEffects({
                          ...effects,
                          contrast: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Saturation: {effects.saturation}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={effects.saturation}
                      onChange={(e) =>
                        setEffects({
                          ...effects,
                          saturation: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Blur: {effects.blur}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={effects.blur}
                      onChange={(e) =>
                        setEffects({
                          ...effects,
                          blur: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <button
                    onClick={() =>
                      setEffects({
                        brightness: 100,
                        contrast: 100,
                        saturation: 100,
                        blur: 0,
                      })
                    }
                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
                  >
                    Reset All Effects
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
