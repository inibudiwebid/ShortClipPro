import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TranscribeRequest {
  audioBase64: string;
  mimeType: string;
  language?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenRouter API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { audioBase64, mimeType, language = "auto" }: TranscribeRequest = await req.json();

    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "No audio data provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const systemPrompt = `You are a professional transcription assistant. Your task is to transcribe the audio accurately.

Instructions:
- Transcribe the speech exactly as spoken
- Include punctuation and proper formatting
- If the language is not specified, detect it automatically
- If there are multiple speakers, indicate speaker changes with [Speaker 1], [Speaker 2], etc.
- If a word is unclear, use [unclear] placeholder
- Keep timestamps if the audio has clear pauses between sentences
- Return ONLY the transcription text, no explanations or metadata
${language !== "auto" ? `- Transcribe in ${language} language` : "- Detect the language automatically"}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "https://localhost",
        "X-Title": "Video Clip Transcription",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite-preview-06-17",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please transcribe the following audio:",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${audioBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Transcription failed", details: errorText }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await response.json();
    const transcription = result.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({
        success: true,
        transcription: transcription.trim(),
        model: result.model,
        usage: result.usage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
