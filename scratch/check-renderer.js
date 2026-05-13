const { RenderInternals } = require("@remotion/renderer");
async function run() {
  try {
    const ffmpeg = RenderInternals.getExecutablePath({ type: "ffmpeg" });
    const ffprobe = RenderInternals.getExecutablePath({ type: "ffprobe" });
    console.log("FFmpeg Path:", ffmpeg);
    console.log("FFprobe Path:", ffprobe);
  } catch (e) {
    console.log("Error:", e.message);
  }
}
run();
