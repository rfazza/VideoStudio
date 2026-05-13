import "./index.css";
import { Composition } from "remotion";
import { z } from "zod";
import { MyComposition } from "./Composition";
import { DynamicComposition } from "./DynamicComposition";
import { resolveMetadata } from "./utils/metadata";

// 2. Define a schema for video settings
export const videoSettingsSchema = z.object({
  activeTab: z
    .enum(["live-preview", "settings", "output"])
    .describe("Switch between studio views"),
  preset: z
    .enum(["1080p", "2k", "4k", "custom"])
    .describe("Choose a resolution preset"),
  aspectRatio: z
    .enum(["landscape", "portrait", "square"])
    .describe("Choose an aspect ratio"),
  width: z.number().min(320).step(1).describe("Custom width (if preset is custom)"),
  height: z.number().min(240).step(1).describe("Custom height (if preset is custom)"),
  fps: z.number().min(1).max(120).step(1).describe("Frames per second"),
  durationInFrames: z
    .number()
    .min(1)
    .step(1)
    .describe("Total duration of the video in frames"),
  code: z.string().optional().default(""),
  outputDir: z.string().optional().default(""),
  apiKeys: z.array(z.string()).optional().default([]),
  activeApiKeyIndex: z.number().optional().default(0),
  aiProvider: z.enum(["gemini", "groq", "openai"]).optional().default("gemini"),
  aiModel: z.string().optional().default("llama-3.1-70b-versatile"),
});

export type VideoSettings = z.infer<typeof videoSettingsSchema>;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyComp"
        component={MyComposition}
        schema={videoSettingsSchema}
        defaultProps={{
          activeTab: "output" as const,
          preset: "1080p" as const,
          aspectRatio: "landscape" as const,
          width: 1920,
          height: 1080,
          fps: 30,
          durationInFrames: 300,
          code: "",
          outputDir: "",
          apiKeys: [],
          activeApiKeyIndex: 0,
          aiProvider: "gemini",
          aiModel: "llama-3.1-70b-versatile",
        }}
        calculateMetadata={({ props }) => {
          const resolved = resolveMetadata(props);
          return {
            ...resolved,
            props: { ...props, width: resolved.width, height: resolved.height },
          };
        }}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="DynamicRender"
        component={DynamicComposition}
        schema={videoSettingsSchema}
        defaultProps={{
          code: "",
          width: 1920,
          height: 1080,
          fps: 30,
          durationInFrames: 300,
          activeTab: "live-preview" as const,
          preset: "1080p" as const,
          aspectRatio: "landscape" as const,
          outputDir: "",
          apiKeys: [],
          activeApiKeyIndex: 0,
          aiProvider: "gemini",
          aiModel: "llama-3.1-70b-versatile",
        }}
        calculateMetadata={({ props }) => {
          return {
            width: props.width,
            height: props.height,
            fps: props.fps,
            durationInFrames: props.durationInFrames,
          };
        }}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
      />
    </>
  );
};
