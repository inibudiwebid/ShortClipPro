import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  videoId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { videoId }: RequestBody = await req.json();

    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Video ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Processing YouTube video: ${videoId}`);

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const cobaltEndpoints = [
      "https://co.wuk.sh/api/json",
      "https://cobalt-api.kwiatekmiki.com/api/json",
    ];

    let downloadUrl: string | null = null;
    let lastError = "";

    for (const endpoint of cobaltEndpoints) {
      try {
        console.log(`Trying endpoint: ${endpoint}`);

        const cobaltResponse = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: videoUrl,
            vCodec: "h264",
            vQuality: "720",
            aFormat: "mp3",
            isAudioOnly: false,
            isNoTTWatermark: true,
            isTTFullAudio: false,
            disableMetadata: false,
          }),
        });

        if (cobaltResponse.ok) {
          const data = await cobaltResponse.json();
          console.log(`Response from ${endpoint}:`, JSON.stringify(data));

          if (data.status === "stream" || data.status === "redirect") {
            downloadUrl = data.url;
            break;
          } else if (data.status === "picker" && data.picker && data.picker.length > 0) {
            downloadUrl = data.picker[0].url;
            break;
          } else if (data.url) {
            downloadUrl = data.url;
            break;
          } else {
            lastError = data.text || "No download URL in response";
          }
        } else {
          const errorText = await cobaltResponse.text();
          console.error(`Error from ${endpoint}: ${cobaltResponse.status} - ${errorText}`);
          lastError = `API error: ${cobaltResponse.status}`;
        }
      } catch (err) {
        console.error(`Failed to reach ${endpoint}:`, err);
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!downloadUrl) {
      return new Response(
        JSON.stringify({
          error: "Could not process this video. It might be restricted, private, or too long.",
          details: lastError,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Download URL obtained, fetching video...`);

    const videoResponse = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.youtube.com/",
      },
    });

    if (!videoResponse.ok) {
      console.error(`Failed to download video: ${videoResponse.status}`);
      return new Response(
        JSON.stringify({ error: "Failed to download video from source" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const videoBlob = await videoResponse.blob();
    console.log(`Video downloaded successfully: ${videoBlob.size} bytes`);

    if (videoBlob.size < 1000) {
      const text = await videoBlob.text();
      console.error(`Received small response, might be error: ${text}`);
      return new Response(
        JSON.stringify({ error: "Video download failed - received invalid data" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const contentType = videoResponse.headers.get("Content-Type") || "video/mp4";

    return new Response(videoBlob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType.includes("video") ? contentType : "video/mp4",
        "Content-Disposition": `attachment; filename="youtube-${videoId}.mp4"`,
      },
    });

  } catch (error) {
    console.error("Error processing YouTube video:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to process YouTube video. Please try again or use a different video.",
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
