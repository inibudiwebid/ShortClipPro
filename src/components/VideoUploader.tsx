import { Upload, Video } from 'lucide-react';
import { useState, useRef } from 'react';
import { YouTubeInput } from './YouTubeInput';

interface VideoUploaderProps {
  onVideoUpload: (file: File) => void;
  disabled?: boolean;
}

export function VideoUploader({ onVideoUpload, disabled }: VideoUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        onVideoUpload(file);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onVideoUpload(e.target.files[0]);
    }
  };

  return (
    <div className="w-full space-y-6">
      <YouTubeInput onVideoFetch={onVideoUpload} disabled={disabled} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-gray-500">OR</span>
        </div>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={handleChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-4">
          {dragActive ? (
            <Video className="w-16 h-16 text-blue-500" />
          ) : (
            <Upload className="w-16 h-16 text-gray-400" />
          )}

          <div>
            <p className="text-lg font-medium text-gray-700">
              {dragActive ? 'Drop video here' : 'Upload from your device'}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Drag and drop or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Supports: MP4, MOV, AVI, WebM
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
