import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Project {
  id: string;
  name: string;
  settings: ProjectSettings;
  created_at: string;
  updated_at: string;
}

export interface ProjectSettings {
  clipCount?: number;
  clipDuration?: number;
  useSubtitles?: boolean;
  subtitleStyleId?: string;
  videoEffects?: string[];
  transitions?: string[];
}

export interface SubtitleStyle {
  id: string;
  name: string;
  config: SubtitleConfig;
  preview_url: string;
  is_default: boolean;
  created_at: string;
}

export interface SubtitleConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  padding?: number;
  borderRadius?: number;
  textAlign: string;
  textShadow?: string;
  textStroke?: string;
  animation: string;
  position: 'top' | 'center' | 'bottom';
}
