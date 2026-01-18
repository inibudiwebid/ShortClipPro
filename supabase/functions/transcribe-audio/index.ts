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
  duration?: number;
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
        JSON.stringify({
          error: "OpenRouter API key not configured",
          success: false
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { audioBase64, mimeType = "audio/wav", language = "auto", duration = 0 }: TranscribeRequest = await req.json();

    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "No audio data provided", success: false }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const transcriptionPrompt = `Transcribe this audio with timestamps. The audio is ${duration > 0 ? duration.toFixed(1) + ' seconds long' : 'a short clip'}.

IMPORTANT: Return the transcription in this EXACT JSON format:
{
  "segments": [
    {"start": 0.0, "end": 2.5, "text": "First sentence or phrase"},
    {"start": 2.5, "end": 5.0, "text": "Second sentence or phrase"},
    {"start": 5.0, "end": 7.5, "text": "Third sentence or phrase"}
  ]
}

Rules:
- Break the audio into natural speech segments (2-5 seconds each)
- Each segment should contain a complete phrase or short sentence
- Timestamps must be in seconds (decimal format)
- Start time of next segment should match or follow end time of previous
- Transcribe exactly what is spoken
- ${language !== "auto" ? `Language: ${language}` : "Detect language automatically"}
- Return ONLY valid JSON, no other text`;

    const dataUrl = `data:${mimeType};base64,${audioBase64}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "https://localhost",
        "X-Title": "Video Clip Transcription",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: transcriptionPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("OpenRouter API error:", response.status, responseText);
      let errorMessage = "Transcription failed";
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.error?.message || errorJson.message || responseText;
      } catch {
        errorMessage = responseText;
      }
      return new Response(
        JSON.stringify({ error: errorMessage, success: false, status: response.status }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid response from AI", success: false }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const content = result.choices?.[0]?.message?.content || "";

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No transcription returned from AI", success: false }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let segments = [];
    let plainText = content;

    try {
      const jsonMatch = content.match(/\{[\s\S]*"segments"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.segments && Array.isArray(parsed.segments)) {
          segments = parsed.segments.map((seg: { start: number; end: number; text: string }) => ({
            start: Number(seg.start) || 0,
            end: Number(seg.end) || 0,
            text: String(seg.text || "").trim()
          })).filter((seg: { text: string }) => seg.text.length > 0);
          plainText = segments.map((s: { text: string }) => s.text).join(" ");
        }
      }
    } catch (parseError) {
      console.error("Failed to parse segments:", parseError);
      plainText = content.replace(/```json|```|\{[\s\S]*\}/g, "").trim();
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcription: plainText.trim(),
        segments,
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
      JSON.stringify({ error: "Internal server error", details: String(error), success: false }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
