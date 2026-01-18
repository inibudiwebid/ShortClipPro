import { Youtube, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface YouTubeInputProps {
  onVideoFetch: (file: File) => void;
  disabled?: boolean;
}

export function YouTubeInput({ onVideoFetch, disabled }: YouTubeInputProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleFetch = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      setError('Invalid YouTube URL. Please enter a valid YouTube video link');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-downloader`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch video from YouTube');
      }

      const blob = await response.blob();
      const file = new File([blob], `youtube-${videoId}.mp4`, { type: 'video/mp4' });

      onVideoFetch(file);
      setUrl('');
    } catch (err) {
      console.error('YouTube fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch video from YouTube');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !disabled && !isLoading) {
      handleFetch();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Paste YouTube URL here (e.g., https://youtube.com/watch?v=...)"
            disabled={disabled || isLoading}
            className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
        </div>

        <button
          onClick={handleFetch}
          disabled={disabled || isLoading || !url.trim()}
          className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
            disabled || isLoading || !url.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 shadow-md hover:shadow-lg'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <Youtube className="w-5 h-5" />
              Fetch
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Supports: youtube.com/watch?v=..., youtu.be/..., or direct video ID
      </p>
    </div>
  );
}
