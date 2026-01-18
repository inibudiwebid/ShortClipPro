import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateRequest {
  transcription: string;
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
          error: "OpenRouter API key not configured",
          success: false
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { transcription, language = "id" }: GenerateRequest = await req.json();

    if (!transcription || transcription.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No transcription provided", success: false }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const truncatedTranscription = transcription.substring(0, 3000);

    const prompt = language === 'id'
      ? `Berdasarkan transkripsi berikut, buatkan judul dan deskripsi yang menarik untuk video short (reels/tiktok/youtube shorts):

Transkripsi:
${truncatedTranscription}

Instruksi:
1. Judul: Buat judul yang catchy, singkat (maksimal 60 karakter), dan relevan dengan konten
2. Deskripsi: Buat deskripsi yang informatif, menarik, dan mencakup poin-poin penting dari video (maksimal 500 karakter)
3. Gunakan bahasa Indonesia yang natural dan sesuai dengan konten
4. Fokus pada value yang diberikan kepada viewer
5. Tambahkan call-to-action yang relevan

Format output (JSON):
{
  "title": "judul yang menarik",
  "description": "deskripsi informatif"
}`
      : `Based on the following transcription, create an engaging title and description for a short video (reels/tiktok/youtube shorts):

Transcription:
${truncatedTranscription}

Instructions:
1. Title: Create a catchy, short title (max 60 characters) relevant to the content
2. Description: Create an informative, engaging description that covers key points (max 500 characters)
3. Use natural language appropriate for the content
4. Focus on value provided to viewers
5. Include relevant call-to-action

Format output (JSON):
{
  "title": "catchy title",
  "description": "engaging description"
}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "https://localhost",
        "X-Title": "ShortClip Pro - Title & Description Generation",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that creates engaging titles and descriptions for short videos. You always respond with valid JSON containing \"title\" and \"description\" fields.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("OpenRouter API error:", response.status, responseText);
      let errorMessage = "Failed to generate title and description";
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
        JSON.stringify({ error: "No response returned from AI", success: false }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let parsedContent;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return new Response(
          JSON.stringify({ error: "Invalid response format from AI", success: false }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      parsedContent = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse response:", parseError);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", success: false }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!parsedContent.title || !parsedContent.description) {
      return new Response(
        JSON.stringify({ error: "AI response missing required fields (title or description)", success: false }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const title = parsedContent.title.trim();
    const description = parsedContent.description.trim();

    if (title.length === 0 || description.length === 0) {
      return new Response(
        JSON.stringify({ error: "Generated title or description is empty", success: false }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          title,
          description,
        },
        model: result.model,
        usage: result.usage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Title/description generation error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error), success: false }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
