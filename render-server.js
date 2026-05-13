/**
 * REMOTION RENDER SERVER — STABLE BASELINE v1.5
 * Verified: 2026-04-23
 * Status: Production-Ready / Backend Frozen
 */
const { bundle } = require("@remotion/bundler");
const { getCompositions, renderMedia, RenderInternals } = require("@remotion/renderer");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { execSync } = require("child_process");

/**
 * REMOTION LOCAL RENDER BACKEND
 * 
 * This server handles incoming render requests from the Studio.
 * It bundles the project and renders the DynamicRender composition 
 * with the provided user-authored code and settings.
 */

const PORT = 3001;
const rendersDir = path.join(__dirname, "renders");

// 1. Ensure output directory exists
if (!fs.existsSync(rendersDir)) {
  console.log("[Render Server] Creating renders directory...");
  fs.mkdirSync(rendersDir);
}

// Module-level cache for the Remotion bundle
let cachedBundleLocation = null;
let isBundling = false;

const server = http.createServer(async (req, res) => {
  // CORS Support for local studio communication
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 2. Handle Health Check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now(), cached: !!cachedBundleLocation }));
    return;
  }

  // 3. Handle Render Request
  if (req.method === "POST" && req.url === "/render") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const { code, fps, durationInFrames, aspectRatio, outputDir } = payload;

        // 1. Force explicit dimensions based on aspectRatio to fix black bars
        let finalWidth = payload.width || 1920;
        let finalHeight = payload.height || 1080;
        
        if (aspectRatio) {
          const ratio = aspectRatio.toUpperCase();
          if (ratio === 'PORTRAIT') {
            finalWidth = 1080;
            finalHeight = 1920;
          } else if (ratio === 'SQUARE') {
            finalWidth = 1080;
            finalHeight = 1080;
          } else {
            finalWidth = 1920;
            finalHeight = 1080;
          }
        }
        
        const width = finalWidth;
        const height = finalHeight;

        if (!code) throw new Error("No code provided for render");

        console.log(`\n[Render] 🎬 Starting New Render Session`);
        if (outputDir) console.log(`[Render] 📂 Custom Output: ${outputDir}`);
        console.log(`[Render] Specs: ${width}x${height} @ ${fps}fps | ${durationInFrames} frames`);

        // 3. Bundle the Remotion project (Cached)
        let bundleLocation;
        const bundleStart = Date.now();
        
        if (cachedBundleLocation) {
          console.log(`[Render] Using cached Remotion bundle`);
          bundleLocation = cachedBundleLocation;
        } else {
          // Prevent multiple simultaneous bundling operations
          if (isBundling) {
            console.log(`[Render] ⏳ Waiting for bundle in progress...`);
            while (isBundling) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            bundleLocation = cachedBundleLocation;
          } else {
            isBundling = true;
            try {
              console.log(`[Render] Creating initial Remotion bundle...`);
              const entry = path.join(__dirname, "src/index.ts");
              bundleLocation = await bundle(entry);
              cachedBundleLocation = bundleLocation;
              const bundleEnd = Date.now();
              console.log(`[Render] Bundling Complete (Time: ${((bundleEnd - bundleStart) / 1000).toFixed(2)}s)`);
            } finally {
              isBundling = false;
            }
          }
        }

        // 4. Resolve compositions with dynamic inputProps
        console.log(`[Render] Resolving compositions...`);
        const comps = await getCompositions(bundleLocation, {
          inputProps: { code, width, height, fps, durationInFrames, aspectRatio }
        });

        const composition = comps.find((c) => c.id === "DynamicRender");
        if (!composition) throw new Error("DynamicRender composition not found in Root.tsx");

        // 5. Resolve Binary Paths (Robust Electron Support)
        let ffmpegPath, ffprobePath;
        
        const isPackaged = process.mainModule?.filename.includes('app.asar') || process.resourcesPath?.includes('app.asar') || (process.env.IS_ELECTRON === 'true' && !process.env.NODE_ENV);
        
        // Use path.join for cross-platform stability
        const localFfmpeg = path.join(__dirname, "ffmpeg", "ffmpeg.exe");
        const localFfprobe = path.join(__dirname, "ffmpeg", "ffprobe.exe");
        
        const prodFfmpeg = process.resourcesPath ? path.join(process.resourcesPath, "ffmpeg", "ffmpeg.exe") : localFfmpeg;
        const prodFfprobe = process.resourcesPath ? path.join(process.resourcesPath, "ffmpeg", "ffprobe.exe") : localFfprobe;

        // Final Resolution
        ffmpegPath = fs.existsSync(prodFfmpeg) ? prodFfmpeg : (fs.existsSync(localFfmpeg) ? localFfmpeg : "ffmpeg");
        ffprobePath = fs.existsSync(prodFfprobe) ? prodFfprobe : (fs.existsSync(localFfprobe) ? localFfprobe : "ffprobe");

        console.log(`[Render] Resolved FFmpeg: ${ffmpegPath}`);
        console.log(`[Render] Resolved FFprobe: ${ffprobePath}`);

        if (ffmpegPath === "ffmpeg" || ffprobePath === "ffprobe") {
           console.warn(`[Render] ⚠️ WARNING: Bundled binaries not found. Falling back to system PATH.`);
        }

        // 6. Calculate dynamic bitrate based on resolution
        let bitrate = "8M";
        if (width >= 3840) bitrate = "25M";
        else if (width >= 2560) bitrate = "12M";

        const timestamp = Date.now();
        const tempMp4Path = path.join(rendersDir, `temp-${timestamp}.mp4`);
        const finalMp4Path = path.join(rendersDir, `video-${timestamp}.mp4`);

        console.log(`[Render] Step 1/2: Rendering High-Quality Intermediate...`);
        console.log(`[Render] Target Bitrate: ${bitrate}`);

        // Step 1: Render high-quality intermediate from Remotion
        const renderStart = Date.now();
        await renderMedia({
          composition,
          serveUrl: bundleLocation,
          codec: "h264",
          outputLocation: tempMp4Path,
          inputProps: { code, width, height, fps, durationInFrames, aspectRatio },
          crf: 10, // High quality intermediate
          onProgress: ({ progress }) => {
            const percent = Math.round(progress * 50); // First 50%
            process.stdout.write(`\r[Render] Step 1 Progress: ${percent}% `);
          }
        });
        const renderEnd = Date.now();
        console.log(`\n[Render] Step 1 Complete (Time: ${((renderEnd - renderStart) / 1000).toFixed(2)}s)`);

        // Step 2: Re-encode with explicit bitrate enforcement
        console.log(`[Render] Step 2/2: Enforcing Final Bitrate via FFmpeg...`);
        const encodeStart = Date.now();
        try {
          // Force bitrate using CBR-like settings (minrate = maxrate)
          const ffmpegCmd = `"${ffmpegPath}" -i "${tempMp4Path}" -c:v libx264 -b:v ${bitrate} -minrate ${bitrate} -maxrate ${bitrate} -bufsize ${parseInt(bitrate)*2}M -pix_fmt yuv420p -preset medium -r ${fps} -x264-params nal-hrd=cbr:force-cfr=1 -y "${finalMp4Path}"`;
          
          execSync(ffmpegCmd, { stdio: "ignore" });
          const encodeEnd = Date.now();
          console.log(`[Render] Step 2 Complete (Time: ${((encodeEnd - encodeStart) / 1000).toFixed(2)}s)`);
        } catch (e) {
          console.error(`\n[Render] ❌ Bitrate Enforcement Failed:`, e.message);
          // If Step 2 fails, we DO NOT pretend it succeeded. 
          // We provide the intermediate for debugging but throw to prevent false success.
          const fallbackPath = path.join(rendersDir, `FAILED_BITRATE_SYNC_video-${timestamp}.mp4`);
          fs.renameSync(tempMp4Path, fallbackPath);
          throw new Error("Intermediate render succeeded, but final bitrate enforcement (Step 2) failed. See fallback log.");
        }

        // Cleanup temporary intermediate
        if (fs.existsSync(tempMp4Path)) {
          try { fs.unlinkSync(tempMp4Path); } catch (e) {}
        }

        const filename = `video-${timestamp}.mp4`;

        // Move to custom folder if requested
        if (outputDir && fs.existsSync(outputDir)) {
          const customPath = path.join(outputDir, filename);
          console.log(`[Render] 🚚 Moving final asset to: ${customPath}`);
          try {
            fs.copyFileSync(finalMp4Path, customPath);
            console.log(`[Render] ✅ Asset successfully moved to custom folder.`);
          } catch (moveErr) {
            console.error(`[Render] ❌ Failed to move asset: ${moveErr.message}`);
          }
        }

        // 7. Inspect actual encoded bitrate using ffprobe (Truthful Check)
        const stat = fs.statSync(finalMp4Path);
        const fileSizeMB = (stat.size / (1024 * 1024)).toFixed(2);
        
        let actualBitrate = "Unable to verify";
        try {
          const probe = execSync(
            `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=bit_rate -of default=noprint_wrappers=1:nokey=1 "${finalMp4Path}"`,
            { encoding: "utf8" }
          ).trim();
          if (probe && !isNaN(probe)) {
            actualBitrate = (parseInt(probe) / 1000000).toFixed(2) + " Mbps";
          }
        } catch (e) {}

        console.log(`\n[Render] ✅ Success! Production Asset Ready.`);
        console.log(`[Render] 📐 Resolution: ${width}x${height} | ${fps} FPS`);
        console.log(`[Render] 💾 File Size: ${fileSizeMB} MB`);
        console.log(`[Render] ⚙️ Target Bitrate: ${bitrate}`);
        console.log(`[Render] 📊 Actual Bitrate: ${actualBitrate}\n`);

        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Content-Length": stat.size,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Access-Control-Expose-Headers": "Content-Disposition"
        });
        
        const cleanup = () => {
          console.log("[Render] 🧹 Cleaning up internal renders folder...");
          try {
            const files = fs.readdirSync(rendersDir);
            for (const file of files) {
              const filePath = path.join(rendersDir, file);
              if (fs.statSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
              }
            }
          } catch (e) {
            console.error("[Render] Cleanup failed:", e.message);
          }
        };

        res.on('finish', cleanup);
        res.on('close', cleanup);

        const readStream = fs.createReadStream(finalMp4Path);
        readStream.pipe(res);

      } catch (e) {
        console.error(`\n[Render] ❌ Render Failed:`, e.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e.message }));
        
        // Manual cleanup on error since finish might not behave same way
        try {
          const files = fs.readdirSync(rendersDir);
          for (const file of files) {
            fs.unlinkSync(path.join(rendersDir, file));
          }
        } catch (err) {}
      }
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

// 6. Start Server
server.listen(PORT, () => {
  console.log(`\n--------------------------------------------------`);
  console.log(`🚀 REMOTION RENDER BACKEND ACTIVE`);
  console.log(`📍 Endpoint: http://localhost:${PORT}/render`);
  console.log(`📁 Outputs:  ${rendersDir}`);
  console.log(`--------------------------------------------------\n`);
});
