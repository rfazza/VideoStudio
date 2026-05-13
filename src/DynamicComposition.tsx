import React from "react";
import * as Remotion from "remotion";
import { transform } from "sucrase";
import { VideoSettings } from "./Root";

export const DynamicComposition: React.FC<VideoSettings> = ({ 
  code, width, height, fps, durationInFrames 
}) => {
  const frame = Remotion.useCurrentFrame();

  // Reuse the exact same execution logic from the Studio
  const renderFn = React.useMemo(() => {
    try {
      const transpiled = transform(code, { 
        transforms: ["jsx", "typescript"],
        production: true 
      }).code;

      const { 
        AbsoluteFill, 
        useCurrentFrame, 
        interpolate, 
        spring, 
        Sequence, 
        Series, 
        Audio, 
        Video, 
        Img, 
        OffthreadVideo, 
        Loop 
      } = Remotion;

      return new Function(
        "React", "Remotion", "AbsoluteFill", "useCurrentFrame", "interpolate", "spring", "Sequence", "Series", "Audio", "Video", "Img", "OffthreadVideo", "Loop", "props",
        `const { width, height, fps, durationInFrames } = props; ${transpiled}`
      );
    } catch (e) {
      console.error("Dynamic Transpilation Failed:", e);
      return () => (
        <Remotion.AbsoluteFill className="bg-red-950 flex items-center justify-center text-white font-mono p-10">
          <div className="text-center">
             <h1 className="text-4xl mb-4">Render Error</h1>
             <pre className="text-xs text-red-300 whitespace-pre-wrap">{(e as Error).message}</pre>
          </div>
        </Remotion.AbsoluteFill>
      );
    }
  }, [code]);

  try {
    const { 
      AbsoluteFill, 
      useCurrentFrame, 
      interpolate, 
      spring, 
      Sequence, 
      Series, 
      Audio, 
      Video, 
      Img, 
      OffthreadVideo, 
      Loop 
    } = Remotion;

    // Execute natively using dynamic properties
    const content = renderFn(
      React, 
      Remotion, 
      AbsoluteFill, 
      useCurrentFrame, 
      interpolate, 
      spring, 
      Sequence, 
      Series, 
      Audio, 
      Video, 
      Img, 
      OffthreadVideo, 
      Loop, 
      { width, height, fps, durationInFrames }
    );

    return (
      <Remotion.AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', overflow: 'hidden' }}>
        {content}
      </Remotion.AbsoluteFill>
    );
  } catch (e) {
    return (
      <Remotion.AbsoluteFill className="bg-red-900 flex items-center justify-center text-white p-10">
        <pre className="text-sm">{(e as Error).message}</pre>
      </Remotion.AbsoluteFill>
    );
  }
};
