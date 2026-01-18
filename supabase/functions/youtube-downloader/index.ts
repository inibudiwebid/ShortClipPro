import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  videoId: string;
}

async function tryGetVideoUrl(videoUrl: string): Promise<{ url: string | null; error: string }> {
  const endpoints = [
    {
      url: "https://api.cobalt.tools/",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: {
        url: videoUrl,
        downloadMode: "auto",
        videoQuality: "720",
      },
      parseResponse: (data: Record<string, unknown>) => {
        if (data.status === "tunnel" || data.status === "redirect") {
          return data.url as string;
        }
        if (data.status === "picker" && Array.isArray(data.picker) && data.picker.length > 0) {
          return data.picker[0].url as string;
        }
        return null;
      }
    },
    {
      url: "https://co.wuk.sh/api/json",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: {
        url: videoUrl,
        vCodec: "h264",
        vQuality: "720",
        aFormat: "mp3",
        isAudioOnly: false,
      },
      parseResponse: (data: Record<string, unknown>) => {
        if (data.status === "stream" || data.status === "redirect") {
          return data.url as string;
        }
        if (data.status === "picker" && Array.isArray(data.picker) && data.picker.length > 0) {
          return data.picker[0].url as string;
        }
        if (data.url) {
          return data.url as string;
        }
        return null;
      }
    }
  ];

  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      console.log(`Trying: ${endpoint.url}`);

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: endpoint.headers,
        body: JSON.stringify(endpoint.body),
      });

      const responseText = await response.text();
      console.log(`Response from ${endpoint.url}: ${response.status} - ${responseText.substring(0, 500)}`);

      if (response.ok) {
        try {
          const data = JSON.parse(responseText);
          const downloadUrl = endpoint.parseResponse(data);
          if (downloadUrl) {
            return { url: downloadUrl, error: "" };
          }
          lastError = data.text || data.error?.message || "No download URL returned";
        } catch {
          lastError = "Invalid JSON response";
        }
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (err) {
      console.error(`Error with ${endpoint.url}:`, err);
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { url: null, error: lastError };
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

    const { url: downloadUrl, error: apiError } = await tryGetVideoUrl(videoUrl);

    if (!downloadUrl) {
      return new Response(
        JSON.stringify({
          error: "Could not process this video. It might be restricted, private, or too long.",
          details: apiError,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Download URL obtained: ${downloadUrl.substring(0, 100)}...`);

    const videoResponse = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!videoResponse.ok) {
      console.error(`Failed to download: ${videoResponse.status}`);
      return new Response(
        JSON.stringify({ error: "Failed to download video" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const videoBlob = await videoResponse.blob();
    console.log(`Downloaded: ${videoBlob.size} bytes`);

    if (videoBlob.size < 10000) {
      return new Response(
        JSON.stringify({ error: "Video download failed - file too small" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(videoBlob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="youtube-${videoId}.mp4"`,
      },
    });

  } catch (error) {
    console.error("Error:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to process video",
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
