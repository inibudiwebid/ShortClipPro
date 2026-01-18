import ytdl from "npm:@distube/ytdl-core@4.14.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  videoId: string;
}

interface VideoFormat {
  url: string;
  container: string;
  qualityLabel: string;
  hasVideo: boolean;
  hasAudio: boolean;
}

// Declare Deno global for TypeScript
declare global {
  var Deno: any;
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

    // Get video info with retry logic
    let info;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        info = await ytdl.getInfo(videoUrl);
        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw error;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    if (!info) {
      throw new Error("Failed to get video information after retries");
    }

    console.log(`Video info retrieved: ${info.videoDetails.title}`);

    // Try to find the best format with both video and audio
    let format = ytdl.chooseFormat(info.formats, {
      quality: 'highestvideo',
      filter: (format: VideoFormat) => format.hasVideo && format.hasAudio
    });

    // If no format with both video and audio, try video only
    if (!format || !format.url) {
      format = ytdl.chooseFormat(info.formats, {
        quality: 'highestvideo',
        filter: (format: VideoFormat) => format.hasVideo
      });
    }

    if (!format || !format.url) {
      return new Response(
        JSON.stringify({
          error: "No suitable video format found. Please try a different video."
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Selected format: ${format.container}, quality: ${format.qualityLabel}`);

    // Download video
    const videoResponse = await fetch(format.url);

    if (!videoResponse.ok) {
      console.error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
      return new Response(
        JSON.stringify({ error: "Failed to download video from YouTube" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const videoBlob = await videoResponse.blob();
    console.log(`Video downloaded successfully: ${videoBlob.size} bytes`);

    return new Response(videoBlob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": `video/${format.container}`,
        "Content-Disposition": `attachment; filename="youtube-${videoId}.${format.container}"`,
      },
    });

  } catch (error) {
    console.error("Error processing YouTube video:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to process YouTube video. The video might be restricted, private, or unavailable.",
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
