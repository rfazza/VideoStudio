/**
 * REMOTION RENDER SERVER — STABLE BASELINE v1.1.7
 * Verified: 2026-05-21
 * Status: Production-Ready / Backend Frozen
 */
const path = require("path");
const fs = require("fs");

// 0. ABSOLUTE FIX FOR NATIVE BINDING RESOLUTION
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === '@rspack/binding' && process.env.NODE_ENV !== 'development' && process.resourcesPath) {
    let bindingPath;
    try {
      bindingPath = Module._resolveFilename(id, this);
    } catch (e) {
      bindingPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@rspack', 'binding', 'index.js');
    }

    if (bindingPath && bindingPath.includes('app.asar') && !bindingPath.includes('app.asar.unpacked')) {
      bindingPath = bindingPath.replace('app.asar', 'app.asar.unpacked');
    }

    if (bindingPath) {
      return originalRequire.call(this, bindingPath);
    }
  }
  return originalRequire.apply(this, arguments);
};

if (process.env.NODE_ENV !== 'development' && process.resourcesPath) {
  module.paths.unshift(path.join(process.resourcesPath, "node_modules"));
  module.paths.unshift(path.join(process.resourcesPath, "app.asar.unpacked", "node_modules"));
}

const { bundle } = require("@remotion/bundler");
const { getCompositions, renderMedia, RenderInternals } = require("@remotion/renderer");
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

// Global state for batch tracking
const batchJobs = {};

const server = http.createServer(async (req, res) => {
  // CORS Support for local studio communication
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 2. Handle Health Check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "online", timestamp: Date.now(), cached: !!cachedBundleLocation }));
    return;
  }

  // 3. Handle Batch Status Request
  if (req.method === "GET" && req.url.startsWith("/batch-status")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const jobId = url.searchParams.get("jobId");
    if (!jobId || !batchJobs[jobId]) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Job not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(batchJobs[jobId]));
    return;
  }

  // 4. Handle Render Request
  if (req.method === "POST" && req.url === "/render") {
    let body = "";
    req.on("data", chunk => { body += chunk; });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const { code, fps, durationInFrames, aspectRatio, outputDir, bitrate: frontendBitrate, resolution, preset } = payload;

        // 1. Ambil data resolusi asli dari frontend, gunakan fallback hanya jika kosong murni!
        let finalWidth = payload.width || 1920;
        let finalHeight = payload.height || 1080;

        // HANYA timpa dimensi jika payload.width & payload.height TIDAK DIKIRIM (Mencegah override preset 2K/4K)
        if (aspectRatio && !payload.width && !payload.height) {
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
        const isWin = process.platform === 'win32';
        const ffmpegBin = isWin ? "ffmpeg.exe" : "ffmpeg";
        const ffprobeBin = isWin ? "ffprobe.exe" : "ffprobe";

        let ffmpegPath = path.join(__dirname, "ffmpeg", ffmpegBin);
        let ffprobePath = path.join(__dirname, "ffmpeg", ffprobeBin);

        if (process.env.NODE_ENV !== 'development' && process.resourcesPath) {
          ffmpegPath = path.join(process.resourcesPath, "ffmpeg", ffmpegBin);
          ffprobePath = path.join(process.resourcesPath, "ffmpeg", ffprobeBin);
        }

        if (!fs.existsSync(ffmpegPath)) {
          console.error(`[Render] CRITICAL: Bundled FFmpeg NOT FOUND at ${ffmpegPath}`);
          if (process.env.NODE_ENV === 'development') ffmpegPath = "ffmpeg";
        }

        console.log(`[Render] Resolved FFmpeg: ${ffmpegPath}`);

        if (ffmpegPath === "ffmpeg" || ffprobePath === "ffprobe") {
          console.warn(`[Render] ⚠️ WARNING: Bundled binaries not found. Falling back to system PATH.`);
        } else if (process.platform !== "win32") {
          try {
            fs.chmodSync(ffmpegPath, 0o755);
            fs.chmodSync(ffprobePath, 0o755);
            console.log(`[Render] 🔐 Executable permissions (755) granted for Mac/Linux.`);
          } catch (chmodErr) {
            console.error(`[Render] ⚠️ Failed to grant permissions:`, chmodErr.message);
          }
        }

        // Extra guard: Force chmod on all possible ffmpeg-static locations (for Remotion internal usage)
        if (process.platform !== 'win32') {
          const possibleFfmpegPaths = [
            path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
            process.resourcesPath ? path.join(process.resourcesPath, "app", "node_modules", "ffmpeg-static", "ffmpeg") : null,
            process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "ffmpeg-static", "ffmpeg") : null
          ].filter(Boolean);

          for (const p of possibleFfmpegPaths) {
            if (fs.existsSync(p)) {
              try {
                fs.chmodSync(p, 0o755);
                console.log(`[Render] 🔐 Guard activated: Permissions granted for ${p}`);
              } catch (e) { }
            }
          }
        }

        // 6. Calculate dynamic bitrate based on resolution
        let bitrate = "8M"; // Default 1080p
        if (frontendBitrate) {
          bitrate = String(frontendBitrate);
          if (!bitrate.toLowerCase().endsWith('m') && !bitrate.toLowerCase().endsWith('k')) {
            bitrate += 'M'; // Default to Mbps if just a number
          }
        } else {
          // 1. Paksa parsing ke Number untuk mengantisipasi data String dari frontend
          const numWidth = parseInt(width, 10) || 0;
          const numHeight = parseInt(height, 10) || 0;
          const presetName = String(preset || resolution || "").toLowerCase();

          // 2. Evaluasi bertingkat yang sensitif terhadap Width ATAU Height ATAU preset name
          if (numWidth >= 3840 || numHeight >= 2160 || presetName.includes("4k") || presetName.includes("2160")) {
            bitrate = "30M"; // Target 4K
          } else if (numWidth >= 2500 || numHeight >= 1400 || presetName.includes("2k") || presetName.includes("1440") || presetName.includes("2560")) {
            bitrate = "16M"; // Target 2K (Biar tembus belasan MB seperti semula!)
          } else if (numWidth >= 1920 || numHeight >= 1080 || presetName.includes("1080") || presetName.includes("hd")) {
            bitrate = "8M";  // Target 1080p
          } else if (numWidth > 0) {
            bitrate = "4M";  // Low-res
          } else {
            bitrate = "16M"; // ULTIMATE SAFETY: Jika deteksi payload gagal total, paksa 16M agar 2K/4K tidak kempes di 4.58MB!
          }

          // 3. Tambahkan Log Debug murni ke terminal agar kita bisa melacak pergerakannya saat testing
          console.log(`[DEBUG BITRATE] Incoming -> width: ${width} (${typeof width}), height: ${height} (${typeof height}), resolution: ${resolution} (${typeof resolution}), preset: ${preset} (${typeof preset})`);
          console.log(`[DEBUG BITRATE] Parsed -> numWidth: ${numWidth}, numHeight: ${numHeight}, presetName: ${presetName} -> SELECTED BITRATE: ${bitrate}`);
        }

        // Ensure bufsize calculation handles 'M' or 'k' correctly
        const isKbps = bitrate.toLowerCase().endsWith('k');
        const bitrateNum = parseInt(bitrate);
        const bufsize = `${bitrateNum * 2}${isKbps ? 'k' : 'M'}`;

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
          const { execFileSync } = require("child_process");

          const args = [
            "-i", tempMp4Path,
            "-c:v", "libx264",
            "-b:v", bitrate,
            "-minrate", bitrate,
            "-maxrate", bitrate,
            "-bufsize", bufsize,
            "-pix_fmt", "yuv420p",
            "-preset", "medium",
            "-r", fps.toString(),
            "-x264-params", "nal-hrd=cbr:force-cfr=1",
            "-y", finalMp4Path
          ];

          execFileSync(ffmpegPath, args, { stdio: "ignore" });
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
          try { fs.unlinkSync(tempMp4Path); } catch (e) { }
        }

        const filename = `video-${timestamp}.mp4`;

        // Move to custom folder if requested
        if (outputDir) {
          if (!fs.existsSync(outputDir)) {
            try {
              fs.mkdirSync(outputDir, { recursive: true });
              console.log(`[Render] 📂 Created custom output directory: ${outputDir}`);
            } catch (mkdirErr) {
              console.error(`[Render] ❌ Failed to create directory: ${mkdirErr.message}`);
            }
          }
          if (fs.existsSync(outputDir)) {
            const customPath = path.join(outputDir, filename);
            console.log(`[Render] 🚚 Moving final asset to: ${customPath}`);
            try {
              fs.copyFileSync(finalMp4Path, customPath);
              console.log(`[Render] ✅ Asset successfully moved to custom folder.`);
            } catch (moveErr) {
              console.error(`[Render] ❌ Failed to move asset: ${moveErr.message}`);
            }
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
        } catch (e) { }

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
        } catch (err) { }
      }
    });
  } else if (req.method === "POST" && req.url === "/render-batch") {
    let body = "";
    req.on("data", chunk => { body += chunk; });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const { codes, fps, durationInFrames, aspectRatio, outputDir, preset, width, height } = payload;
        
        if (!codes || !Array.isArray(codes) || codes.length === 0) {
           throw new Error("Invalid payload: missing codes array");
        }

        const jobId = `batch_${Date.now()}`;
        batchJobs[jobId] = {
           status: "queued",
           total: codes.length,
           current: 0,
           progress: 0,
           message: "Batch received. Starting..."
        };

        // Fire and forget response
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, jobId, message: "Batch processing started" }));

        // Background Processing
        (async () => {
          let finalWidth = width || 1920;
          let finalHeight = height || 1080;

          if (aspectRatio && !width && !height) {
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

          let bundleLocation;
          try {
             if (cachedBundleLocation) {
                bundleLocation = cachedBundleLocation;
             } else {
                if (isBundling) {
                   while (isBundling) await new Promise(resolve => setTimeout(resolve, 500));
                   bundleLocation = cachedBundleLocation;
                } else {
                   isBundling = true;
                   const entry = path.join(__dirname, "src/index.ts");
                   bundleLocation = await bundle(entry);
                   cachedBundleLocation = bundleLocation;
                   isBundling = false;
                }
             }

             const isWin = process.platform === 'win32';
             const ffmpegBin = isWin ? "ffmpeg.exe" : "ffmpeg";
             let ffmpegPath = path.join(__dirname, "ffmpeg", ffmpegBin);
             if (process.env.NODE_ENV !== 'development' && process.resourcesPath) {
               ffmpegPath = path.join(process.resourcesPath, "ffmpeg", ffmpegBin);
             }
             if (!fs.existsSync(ffmpegPath) && process.env.NODE_ENV === 'development') ffmpegPath = "ffmpeg";

             let bitrate = "16M";
             const numW = parseInt(finalWidth, 10) || 0;
             const numH = parseInt(finalHeight, 10) || 0;
             const pName = String(preset || "").toLowerCase();
             if (numW >= 3840 || numH >= 2160 || pName.includes("4k") || pName.includes("2160")) bitrate = "30M";
             else if (numW >= 2500 || numH >= 1400 || pName.includes("2k") || pName.includes("1440") || pName.includes("2560")) bitrate = "16M";
             else if (numW >= 1920 || numH >= 1080 || pName.includes("1080") || pName.includes("hd")) bitrate = "8M";
             else if (numW > 0) bitrate = "4M";
             
             const bufsize = `${parseInt(bitrate) * 2}M`;

             for (let i = 0; i < codes.length; i++) {
                batchJobs[jobId].current = i + 1;
                batchJobs[jobId].status = "rendering";
                batchJobs[jobId].progress = 0;
                batchJobs[jobId].message = `Rendering tab ${i + 1} of ${codes.length}...`;

                const itemCode = codes[i];

                const comps = await getCompositions(bundleLocation, {
                   inputProps: { code: itemCode, width: finalWidth, height: finalHeight, fps, durationInFrames, aspectRatio }
                });

                const composition = comps.find((c) => c.id === "DynamicRender");
                if (!composition) throw new Error("Composition not found");

                const ts = Date.now();
                const tempPath = path.join(rendersDir, `temp_batch_${jobId}_${i}_${ts}.mp4`);
                const finalPath = path.join(rendersDir, `video_tab_${i+1}_${ts}.mp4`);

                await renderMedia({
                   composition,
                   serveUrl: bundleLocation,
                   codec: "h264",
                   outputLocation: tempPath,
                   inputProps: { code: itemCode, width: finalWidth, height: finalHeight, fps, durationInFrames, aspectRatio },
                   crf: 10,
                   onProgress: ({ progress }) => {
                      batchJobs[jobId].progress = Math.round(progress * 50);
                   }
                });

                batchJobs[jobId].message = `Enforcing bitrate for item ${i + 1}...`;
                batchJobs[jobId].progress = 75; // Arbitrary progress
                const { execFileSync } = require("child_process");
                const args = ["-i", tempPath, "-c:v", "libx264", "-b:v", bitrate, "-minrate", bitrate, "-maxrate", bitrate, "-bufsize", bufsize, "-pix_fmt", "yuv420p", "-preset", "medium", "-r", fps.toString(), "-x264-params", "nal-hrd=cbr:force-cfr=1", "-y", finalPath];
                execFileSync(ffmpegPath, args, { stdio: "ignore" });

                if (fs.existsSync(tempPath)) {
                   try { fs.unlinkSync(tempPath); } catch (e) { }
                }

                if (outputDir) {
                   if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
                   const customPath = path.join(outputDir, `video_tab_${i+1}_${ts}.mp4`);
                   fs.copyFileSync(finalPath, customPath);
                }
                
                batchJobs[jobId].progress = 100;
             }

             batchJobs[jobId].status = "completed";
             batchJobs[jobId].progress = 100;
             batchJobs[jobId].message = "All batch items processed successfully.";
          } catch (error) {
             batchJobs[jobId].status = "error";
             batchJobs[jobId].message = error.message;
          }
        })();

      } catch (e) {
         res.writeHead(500, { "Content-Type": "application/json" });
         res.end(JSON.stringify({ success: false, error: e.message }));
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
