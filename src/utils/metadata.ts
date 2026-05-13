import { VideoSettings } from "../Root";

const RESOLUTIONS = {
  "1080p": { width: 1920, height: 1080 },
  "2k": { width: 2560, height: 1440 },
  "4k": { width: 3840, height: 2160 },
};

export const resolveMetadata = (settings: VideoSettings) => {
  let { width, height } = settings;

  // Apply preset resolution if not custom
  if (settings.preset !== "custom") {
    const res = RESOLUTIONS[settings.preset as keyof typeof RESOLUTIONS];
    width = res.width;
    height = res.height;
  }

  // Apply aspect ratio transformations
  if (settings.aspectRatio === "portrait") {
    [width, height] = [height, width];
  } else if (settings.aspectRatio === "square") {
    const min = Math.min(width, height);
    width = min;
    height = min;
  }

  return {
    width,
    height,
    fps: settings.fps,
    durationInFrames: settings.durationInFrames,
  };
};
