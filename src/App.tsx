import { useState } from 'react';
import { VideoUploader } from './components/VideoUploader';
import { SettingsPanel } from './components/SettingsPanel';
import { ProcessingPanel } from './components/ProcessingPanel';
import { VideoProcessor } from './lib/videoProcessor';
import { ViralMomentDetector } from './lib/viralMomentDetector';
import { SplitScreenProcessor } from './lib/splitScreenProcessor';
import { Scissors, Play } from 'lucide-react';

interface Clip {
  index: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  blob?: Blob;
}

function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [clipCount, setClipCount] = useState<number>(5);
  const [clipDuration, setClipDuration] = useState<number>(15);
  const [useViralDetection, setUseViralDetection] = useState<boolean>(false);
  const [useSplitScreen, setUseSplitScreen] = useState<boolean>(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [processor] = useState(() => new VideoProcessor());

  const handleVideoUpload = async (file: File) => {
    setVideoFile(file);
    try {
      await processor.loadVideo(file);
      const duration = processor.getVideoDuration();
      setVideoDuration(duration);
    } catch (error) {
      console.error('Failed to load video:', error);
      alert('Failed to load video. Please try another file.');
    }
  };

  const handleGenerateClips = async () => {
    if (!videoFile) return;

    setIsProcessing(true);
    setIsAnalyzing(true);

    let viralMoments;
    let viralVideoUrl: string | null = null;
    if (useViralDetection) {
      const videoElement = document.createElement('video');
      viralVideoUrl = URL.createObjectURL(videoFile);
      videoElement.src = viralVideoUrl;

      await new Promise<void>((resolve) => {
        videoElement.onloadedmetadata = () => resolve();
      });

      const detector = new ViralMomentDetector(videoElement);
      viralMoments = await detector.detectViralMoments(0.5, undefined, clipDuration);
      detector.cleanup();
    }

    let speakerData;
    let splitVideoUrl: string | null = null;
    if (useSplitScreen) {
      const videoElement = document.createElement('video');
      splitVideoUrl = URL.createObjectURL(videoFile);
      videoElement.src = splitVideoUrl;

      await new Promise<void>((resolve) => {
        videoElement.onloadedmetadata = () => resolve();
      });

      const splitProcessor = new SplitScreenProcessor(videoElement);
      speakerData = [];

      for (let time = 0; time < videoDuration; time += 1) {
        const faces = await splitProcessor.detectFaces(time);

        if (faces.length === 2) {
          const speaker = await splitProcessor.detectSpeaker(
            time,
            faces[0],
            faces[1]
          );
          speakerData.push({ time, speaker, faceCount: 2 });
        } else {
          speakerData.push({ time, speaker: 'both', faceCount: faces.length });
        }
      }
    }

    setIsAnalyzing(false);

    const videoClips = await processor.generateClips(
      {
        clipCount,
        clipDuration,
        useSubtitles: false,
        videoEffects: [],
        transitions: [],
        useViralDetection,
        useSplitScreen,
        maintainSpeed: true,
      },
      viralMoments
    );

    const initialClips: Clip[] = videoClips.map((_, index) => ({
      index,
      status: 'pending',
      progress: 0,
    }));

    setClips(initialClips);

    for (let i = 0; i < videoClips.length; i++) {
      setClips((prev) =>
        prev.map((clip) =>
          clip.index === i ? { ...clip, status: 'processing' } : clip
        )
      );

      try {
        const blob = await processor.extractClip(
          videoClips[i],
          {
            clipCount,
            clipDuration,
            useSubtitles: false,
            videoEffects: [],
            transitions: [],
            useViralDetection,
            useSplitScreen,
            maintainSpeed: true,
          },
          (progress) => {
            setClips((prev) =>
              prev.map((clip) =>
                clip.index === i ? { ...clip, progress } : clip
              )
            );
          },
          speakerData
        );

        setClips((prev) =>
          prev.map((clip) =>
            clip.index === i
              ? { ...clip, status: 'completed', progress: 100, blob }
              : clip
          )
        );
      } catch (error) {
        console.error(`Failed to process clip ${i}:`, error);
        setClips((prev) =>
          prev.map((clip) =>
            clip.index === i ? { ...clip, status: 'error' } : clip
          )
        );
      }
    }

    if (viralVideoUrl) {
      URL.revokeObjectURL(viralVideoUrl);
    }
    if (splitVideoUrl) {
      URL.revokeObjectURL(splitVideoUrl);
    }

    setIsProcessing(false);
  };

  const handleDownloadClip = (index: number) => {
    const clip = clips.find((c) => c.index === index);
    if (!clip || !clip.blob) return;

    const url = URL.createObjectURL(clip.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clip-${index + 1}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    clips.forEach((clip) => {
      if (clip.status === 'completed') {
        handleDownloadClip(clip.index);
      }
    });
  };

  const handleUpdateClip = (index: number, blob: Blob) => {
    setClips((prev) =>
      prev.map((clip) =>
        clip.index === index ? { ...clip, blob } : clip
      )
    );
  };

  const canGenerate = videoFile && !isProcessing && clipCount > 0 && clipDuration > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Scissors className="w-12 h-12 text-blue-600" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              ShortClip Pro
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            Generate professional short videos from YouTube or uploaded files - No API costs
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                1. Get Your Video
              </h2>
              <VideoUploader
                onVideoUpload={handleVideoUpload}
                disabled={isProcessing}
              />
              {videoFile && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">File:</span> {videoFile.name}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Duration:</span>{' '}
                    {videoDuration.toFixed(1)} seconds
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Size:</span>{' '}
                    {(videoFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}
            </div>

            {videoFile && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  3. Generate Clips
                </h2>
                <button
                  onClick={handleGenerateClips}
                  disabled={!canGenerate}
                  className={`w-full flex items-center justify-center gap-3 px-8 py-4 rounded-lg font-semibold text-lg transition-all ${
                    canGenerate
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transform hover:scale-105'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Play className="w-6 h-6" />
                  {isAnalyzing ? 'Analyzing Video...' : isProcessing ? 'Processing...' : 'Generate Clips Now'}
                </button>
                <p className="text-xs text-gray-500 text-center mt-3">
                  This will create {clipCount} clips of {clipDuration} seconds each
                  {useViralDetection && ' focusing on viral moments'}
                  {useSplitScreen && ' with split-screen for interviews'}
                </p>
              </div>
            )}

            {clips.length > 0 && (
              <ProcessingPanel
                clips={clips}
                isProcessing={isProcessing}
                onDownload={handleDownloadClip}
                onDownloadAll={handleDownloadAll}
                onUpdateClip={handleUpdateClip}
              />
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                2. Configure Settings
              </h2>
              <SettingsPanel
                clipCount={clipCount}
                clipDuration={clipDuration}
                useViralDetection={useViralDetection}
                useSplitScreen={useSplitScreen}
                onClipCountChange={setClipCount}
                onClipDurationChange={setClipDuration}
                onViralDetectionChange={setUseViralDetection}
                onSplitScreenChange={setUseSplitScreen}
              />
            </div>
          </div>
        </div>

        <footer className="text-center py-8 text-gray-500 text-sm">
          <p>Process videos locally in your browser - No API costs</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
