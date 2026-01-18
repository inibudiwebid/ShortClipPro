import { useState } from 'react';
import { Loader2, Download, CheckCircle, AlertCircle, Edit } from 'lucide-react';
import VideoEditor from './VideoEditor';

interface Clip {
  index: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  blob?: Blob;
}

interface ProcessingPanelProps {
  clips: Clip[];
  isProcessing: boolean;
  onDownload: (index: number) => void;
  onDownloadAll: () => void;
  onUpdateClip: (index: number, blob: Blob) => void;
}

export function ProcessingPanel({
  clips,
  isProcessing,
  onDownload,
  onDownloadAll,
  onUpdateClip,
}: ProcessingPanelProps) {
  const [editingClip, setEditingClip] = useState<number | null>(null);
  const completedClips = clips.filter((c) => c.status === 'completed').length;
  const totalClips = clips.length;

  const handleSaveEdit = (index: number, blob: Blob) => {
    onUpdateClip(index, blob);
    setEditingClip(null);
  };

  if (clips.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-800">
          Processing Clips ({completedClips}/{totalClips})
        </h3>
        {completedClips === totalClips && totalClips > 0 && (
          <button
            onClick={onDownloadAll}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
        )}
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {clips.map((clip) => (
          <div
            key={clip.index}
            className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            <div className="flex-shrink-0">
              {clip.status === 'processing' && (
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              )}
              {clip.status === 'completed' && (
                <CheckCircle className="w-6 h-6 text-green-500" />
              )}
              {clip.status === 'error' && (
                <AlertCircle className="w-6 h-6 text-red-500" />
              )}
              {clip.status === 'pending' && (
                <div className="w-6 h-6 border-2 border-gray-300 rounded-full"></div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-800">
                  Clip {clip.index + 1}
                </span>
                {clip.status === 'processing' && (
                  <span className="text-sm text-gray-600">{Math.round(clip.progress)}%</span>
                )}
              </div>

              {clip.status === 'processing' && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${clip.progress}%` }}
                  ></div>
                </div>
              )}

              {clip.status === 'completed' && (
                <div className="text-sm text-green-600">Ready to download</div>
              )}

              {clip.status === 'error' && (
                <div className="text-sm text-red-600">Processing failed</div>
              )}
            </div>

            {clip.status === 'completed' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingClip(clip.index)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => onDownload(clip.index)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingClip !== null && clips[editingClip]?.blob && (
        <VideoEditor
          videoBlob={clips[editingClip].blob!}
          clipIndex={editingClip}
          onClose={() => setEditingClip(null)}
          onSave={(blob) => handleSaveEdit(editingClip, blob)}
        />
      )}
    </div>
  );
}
