const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  success: boolean;
  transcription: string;
  segments: SubtitleSegment[];
  error?: string;
}

export async function extractAudioFromVideo(videoBlob: Blob): Promise<{ audio: Blob; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const videoUrl = URL.createObjectURL(videoBlob);
    video.src = videoUrl;
    video.muted = true;

    video.onloadedmetadata = async () => {
      try {
        const audioContext = new AudioContext();
        const duration = video.duration;

        const offlineContext = new OfflineAudioContext(
          2,
          Math.ceil(duration * audioContext.sampleRate),
          audioContext.sampleRate
        );

        const arrayBuffer = await videoBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start(0);

        const renderedBuffer = await offlineContext.startRendering();
        const wavBlob = audioBufferToWav(renderedBuffer);

        URL.revokeObjectURL(videoUrl);
        audioContext.close();
        resolve({ audio: wavBlob, duration });
      } catch (error) {
        URL.revokeObjectURL(videoUrl);
        reject(error);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error('Failed to load video'));
    };
  });
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export async function transcribeAudio(
  audioBlob: Blob,
  language: string = 'auto',
  duration: number = 0
): Promise<TranscriptionResult> {
  try {
    const base64 = await blobToBase64(audioBlob);
    const base64Data = base64.split(',')[1];

    const response = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64: base64Data,
        mimeType: audioBlob.type || 'audio/wav',
        language,
        duration,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        transcription: '',
        segments: [],
        error: result.error || 'Transcription failed',
      };
    }

    return {
      success: true,
      transcription: result.transcription,
      segments: result.segments || [],
    };
  } catch (error) {
    console.error('Transcription error:', error);
    return {
      success: false,
      transcription: '',
      segments: [],
      error: String(error),
    };
  }
}

export async function transcribeVideoClip(
  videoBlob: Blob,
  language: string = 'auto'
): Promise<TranscriptionResult> {
  try {
    const { audio, duration } = await extractAudioFromVideo(videoBlob);
    return await transcribeAudio(audio, language, duration);
  } catch (error) {
    console.error('Failed to extract audio:', error);
    return {
      success: false,
      transcription: '',
      segments: [],
      error: 'Failed to extract audio from video',
    };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
