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
        JSON.stringify({
          error: "OpenRouter API key not configured. Please add OPENROUTER_API_KEY to your Supabase Edge Function secrets.",
          success: false
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { audioBase64, mimeType = "audio/wav", language = "auto" }: TranscribeRequest = await req.json();

    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "No audio data provided", success: false }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const transcriptionPrompt = `Listen carefully to this audio file and transcribe every word spoken.

Requirements:
- Transcribe ALL speech exactly as spoken
- Include proper punctuation
- Detect the language automatically
- If multiple speakers, use [Speaker 1], [Speaker 2] format
- If unclear, use [unclear]
- Return ONLY the transcription, nothing else
${language !== "auto" ? `- Language: ${language}` : ""}`;

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

    const transcription = result.choices?.[0]?.message?.content || "";

    if (!transcription) {
      return new Response(
        JSON.stringify({ error: "No transcription returned from AI", success: false }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
      JSON.stringify({ error: "Internal server error", details: String(error), success: false }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
