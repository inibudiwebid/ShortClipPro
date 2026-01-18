import { Settings, Film, Type, Sparkles, Zap, Users } from 'lucide-react';
import { SubtitleStyle } from '../lib/supabase';

interface SettingsPanelProps {
  clipCount: number;
  clipDuration: number;
  useSubtitles: boolean;
  selectedStyleId: string;
  subtitleStyles: SubtitleStyle[];
  useViralDetection: boolean;
  useSplitScreen: boolean;
  onClipCountChange: (count: number) => void;
  onClipDurationChange: (duration: number) => void;
  onUseSubtitlesChange: (use: boolean) => void;
  onStyleChange: (styleId: string) => void;
  onViralDetectionChange: (use: boolean) => void;
  onSplitScreenChange: (use: boolean) => void;
}

export function SettingsPanel({
  clipCount,
  clipDuration,
  useSubtitles,
  selectedStyleId,
  subtitleStyles,
  useViralDetection,
  useSplitScreen,
  onClipCountChange,
  onClipDurationChange,
  onUseSubtitlesChange,
  onStyleChange,
  onViralDetectionChange,
  onSplitScreenChange,
}: SettingsPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Settings className="w-6 h-6 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
      </div>

      <div className="space-y-6">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <Film className="w-5 h-5 text-blue-500" />
            Number of Clips
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={clipCount}
            onChange={(e) => onClipCountChange(parseInt(e.target.value) || 1)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-500 mt-2">Generate 1-50 short clips</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <Film className="w-5 h-5 text-blue-500" />
            Clip Duration (seconds)
          </label>
          <input
            type="number"
            min="5"
            max="60"
            value={clipDuration}
            onChange={(e) => onClipDurationChange(parseInt(e.target.value) || 10)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-500 mt-2">Each clip will be 5-60 seconds</p>
        </div>

        <div className="border-t pt-6 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={useViralDetection}
              onChange={(e) => onViralDetectionChange(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500 group-hover:text-orange-600 transition-colors" />
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                Detect Viral Moments
              </span>
            </div>
          </label>
          <p className="text-xs text-gray-500 ml-8">
            Automatically identify high-potential viral clips
          </p>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={useSplitScreen}
              onChange={(e) => onSplitScreenChange(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-green-500 group-hover:text-green-600 transition-colors" />
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                Split-Screen for Interviews
              </span>
            </div>
          </label>
          <p className="text-xs text-gray-500 ml-8">
            Dynamic focus on active speaker in 2-person interviews
          </p>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={useSubtitles}
              onChange={(e) => onUseSubtitlesChange(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex items-center gap-2">
              <Type className="w-5 h-5 text-blue-500 group-hover:text-blue-600 transition-colors" />
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                Enable Subtitles
              </span>
            </div>
          </label>
        </div>

        {useSubtitles && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              Subtitle Style
            </label>
            <div className="grid grid-cols-2 gap-3">
              {subtitleStyles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => onStyleChange(style.id)}
                  className={`relative p-4 border-2 rounded-lg text-left transition-all hover:scale-105 ${
                    selectedStyleId === style.id
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-blue-300 bg-white'
                  }`}
                >
                  <div className="font-semibold text-sm text-gray-800 mb-1">
                    {style.name}
                  </div>
                  <div
                    className="text-xs px-2 py-1 rounded inline-block"
                    style={{
                      backgroundColor: style.config.backgroundColor || '#000',
                      color: style.config.color || '#fff',
                      fontFamily: style.config.fontFamily,
                      opacity: 0.9,
                    }}
                  >
                    Preview
                  </div>
                  {selectedStyleId === style.id && (
                    <div className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full"></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
