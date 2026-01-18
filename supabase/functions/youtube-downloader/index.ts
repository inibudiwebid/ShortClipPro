import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  videoId: string;
}

interface CobaltResponse {
  status: string;
  url?: string;
  picker?: Array<{ url: string; type: string }>;
  error?: string;
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

    const cobaltResponse = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: videoUrl,
        downloadMode: "auto",
        videoQuality: "720",
        youtubeVideoCodec: "h264",
      }),
    });

    if (!cobaltResponse.ok) {
      console.error(`Cobalt API error: ${cobaltResponse.status}`);

      const errorText = await cobaltResponse.text();
      console.error(`Cobalt error details: ${errorText}`);

      return new Response(
        JSON.stringify({
          error: "Failed to process video. The video might be restricted, private, or unavailable.",
          details: `API returned status ${cobaltResponse.status}`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cobaltData: CobaltResponse = await cobaltResponse.json();
    console.log(`Cobalt response status: ${cobaltData.status}`);

    if (cobaltData.status === "error") {
      return new Response(
        JSON.stringify({
          error: cobaltData.error || "Failed to process video",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let downloadUrl = cobaltData.url;

    if (!downloadUrl && cobaltData.picker && cobaltData.picker.length > 0) {
      const videoItem = cobaltData.picker.find(item => item.type === "video") || cobaltData.picker[0];
      downloadUrl = videoItem.url;
    }

    if (!downloadUrl) {
      return new Response(
        JSON.stringify({
          error: "No download URL available for this video",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Download URL obtained, fetching video...`);

    const videoResponse = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

    const contentType = videoResponse.headers.get("Content-Type") || "video/mp4";

    return new Response(videoBlob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
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
