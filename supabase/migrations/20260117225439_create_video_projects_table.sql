/*
  # Create Video Projects Database Schema

  1. New Tables
    - `projects`
      - `id` (uuid, primary key) - Unique project identifier
      - `name` (text) - Project name
      - `settings` (jsonb) - Project settings including clip count, subtitle preferences, etc.
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `subtitle_styles`
      - `id` (uuid, primary key) - Style identifier
      - `name` (text) - Style name
      - `config` (jsonb) - Style configuration (colors, fonts, animations, etc.)
      - `preview_url` (text) - Preview image URL
      - `is_default` (boolean) - Whether this is a default style
      - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS on all tables
    - Add policies for public read access to subtitle styles
    - Add policies for users to manage their own projects
*/

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Untitled Project',
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create subtitle_styles table
CREATE TABLE IF NOT EXISTS subtitle_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  config jsonb NOT NULL,
  preview_url text DEFAULT '',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtitle_styles ENABLE ROW LEVEL SECURITY;

-- Policies for projects (open access for demo - in production, tie to auth.uid())
CREATE POLICY "Anyone can view projects"
  ON projects FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create projects"
  ON projects FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update projects"
  ON projects FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete projects"
  ON projects FOR DELETE
  USING (true);

-- Policies for subtitle_styles
CREATE POLICY "Anyone can view subtitle styles"
  ON subtitle_styles FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create subtitle styles"
  ON subtitle_styles FOR INSERT
  WITH CHECK (true);

-- Insert default subtitle styles
INSERT INTO subtitle_styles (name, config, is_default) VALUES
  ('Modern Bold', '{
    "fontFamily": "Arial Black, sans-serif",
    "fontSize": 48,
    "fontWeight": "bold",
    "color": "#FFFFFF",
    "backgroundColor": "#000000",
    "backgroundOpacity": 0.8,
    "padding": 20,
    "borderRadius": 10,
    "textAlign": "center",
    "animation": "fadeIn",
    "position": "bottom"
  }'::jsonb, true),
  ('Neon Glow', '{
    "fontFamily": "Impact, sans-serif",
    "fontSize": 52,
    "fontWeight": "bold",
    "color": "#00FF00",
    "textShadow": "0 0 20px #00FF00, 0 0 40px #00FF00",
    "backgroundColor": "transparent",
    "textAlign": "center",
    "animation": "pulse",
    "position": "center"
  }'::jsonb, true),
  ('Elegant Minimal', '{
    "fontFamily": "Georgia, serif",
    "fontSize": 42,
    "fontWeight": "normal",
    "color": "#FFFFFF",
    "backgroundColor": "transparent",
    "textShadow": "2px 2px 4px rgba(0,0,0,0.8)",
    "textAlign": "center",
    "animation": "slideUp",
    "position": "bottom"
  }'::jsonb, true),
  ('Comic Pop', '{
    "fontFamily": "Comic Sans MS, cursive",
    "fontSize": 46,
    "fontWeight": "bold",
    "color": "#FFFF00",
    "textStroke": "3px #000000",
    "backgroundColor": "#FF1493",
    "backgroundOpacity": 0.9,
    "padding": 15,
    "borderRadius": 20,
    "textAlign": "center",
    "animation": "bounce",
    "position": "top"
  }'::jsonb, true),
  ('Professional', '{
    "fontFamily": "Helvetica, Arial, sans-serif",
    "fontSize": 40,
    "fontWeight": "600",
    "color": "#FFFFFF",
    "backgroundColor": "#1a1a1a",
    "backgroundOpacity": 0.85,
    "padding": 18,
    "borderRadius": 8,
    "textAlign": "center",
    "animation": "none",
    "position": "bottom"
  }'::jsonb, true),
  ('Retro Gaming', '{
    "fontFamily": "Courier New, monospace",
    "fontSize": 44,
    "fontWeight": "bold",
    "color": "#00FFFF",
    "textShadow": "4px 4px 0px #FF00FF",
    "backgroundColor": "#000080",
    "backgroundOpacity": 0.7,
    "padding": 16,
    "textAlign": "center",
    "animation": "glitch",
    "position": "center"
  }'::jsonb, true);
