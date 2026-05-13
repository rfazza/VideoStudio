import { VideoSettings } from "./Root";
import { AbsoluteFill } from "remotion";

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

// Presentational Components
const StatItem: React.FC<{ label: string; value: string | number; subValue?: string }> = ({
  label,
  value,
  subValue,
}) => (
  <div className="space-y-1.5 p-4 rounded-xl bg-white/5 border border-white/5">
    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
      {label}
    </label>
    <div className="text-xl font-medium text-white flex items-baseline gap-2">
      {value}
      {subValue && <span className="text-slate-500 text-xs">{subValue}</span>}
    </div>
  </div>
);

const TabButton: React.FC<{
  active: boolean;
  label: string;
  count?: number;
}> = ({ active, label, count }) => (
  <div
    className={`px-6 py-3 text-sm font-semibold transition-all cursor-pointer relative ${
      active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
    }`}
  >
    {label}
    {count !== undefined && (
      <span className="ml-2 px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] text-slate-400 border border-slate-700">
        {count}
      </span>
    )}
    {active && (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
    )}
  </div>
);

export const MyComposition: React.FC<VideoSettings> = ({
  width,
  height,
  fps,
  durationInFrames,
  preset,
  aspectRatio,
  activeTab,
}) => {
  // Calculate scale based on base resolution
  const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

  return (
    <AbsoluteFill className="bg-slate-950 flex items-center justify-center overflow-hidden">
      {/* Scaling Container */}
      <div
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[160px] rounded-full" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[160px] rounded-full" />
        </div>

        <div className="relative w-full max-w-3xl bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col min-h-[500px]">
          {/* Header */}
          <div className="px-10 pt-10 pb-6 flex items-center justify-between border-b border-white/5">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
                  <div className="w-4 h-4 border-2 border-white rounded-sm" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Studio <span className="text-blue-500">Workspace</span>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Live
              </span>
              <span className="opacity-20">|</span>
              <span>v1.2.0</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="px-6 flex border-b border-white/5 bg-white/[0.02]">
            <TabButton active={activeTab === "live-preview"} label="Live Preview" />
            <TabButton active={activeTab === "settings"} label="Settings" count={6} />
            <TabButton active={activeTab === "output"} label="Output" />
          </div>

          {/* Content Area */}
          <div className="flex-1 p-10">
            {activeTab === "live-preview" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="text-xs font-bold text-blue-400 uppercase tracking-[0.3em]">
                    Active Configuration
                  </div>
                  <div className="text-6xl font-black tracking-tighter text-white">
                    {width}x{height}
                  </div>
                  <p className="text-slate-400 text-lg max-w-md">
                    Optimized for{" "}
                    <span className="text-white font-medium capitalize">{aspectRatio}</span> viewing using
                    the <span className="text-white font-medium uppercase">{preset}</span> profile.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <StatItem label="Mode" value={preset === "custom" ? "Manual" : "Preset"} />
                  <StatItem label="Format" value={aspectRatio.toUpperCase()} />
                  <StatItem label="Fluidity" value={fps} subValue="FPS" />
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <StatItem label="Preset" value={preset.toUpperCase()} />
                <StatItem label="Aspect Ratio" value={aspectRatio.toUpperCase()} />
                <StatItem label="Width" value={width} subValue="px" />
                <StatItem label="Height" value={height} subValue="px" />
                <StatItem label="Frame Rate" value={fps} subValue="fps" />
                <StatItem label="Total Duration" value={durationInFrames} subValue="frames" />
              </div>
            )}

            {activeTab === "output" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                    Export Parameters
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm py-2 border-b border-white/5">
                      <span className="text-slate-500">Codec</span>
                      <span className="text-white font-mono">H.264 / AVC</span>
                    </div>
                    <div className="flex justify-between text-sm py-2 border-b border-white/5">
                      <span className="text-slate-500">Resolution</span>
                      <span className="text-white font-mono">
                        {width} x {height}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm py-2 border-b border-white/5">
                      <span className="text-slate-500">Total Frames</span>
                      <span className="text-white font-mono">{durationInFrames}</span>
                    </div>
                    <div className="flex justify-between text-sm py-2">
                      <span className="text-slate-500">Render Estimate</span>
                      <span className="text-green-400 font-mono">
                        ~{(durationInFrames / fps).toFixed(1)}s output
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 bg-blue-600 hover:bg-blue-500 transition-colors py-4 rounded-xl text-center font-bold text-sm cursor-pointer shadow-lg shadow-blue-900/40">
                    Prepare for Render
                  </div>
                  <div className="bg-white/5 hover:bg-white/10 transition-colors px-6 flex items-center justify-center rounded-xl border border-white/10 cursor-pointer">
                    <div className="w-4 h-4 border-2 border-slate-400 rounded-sm" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer info */}
          <div className="px-10 py-6 border-t border-white/5 flex items-center justify-between">
            <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] font-medium">
              Remotion Engine v4.0.450
            </p>
            <div className="text-[10px] text-slate-500 font-mono">CRC: 0x82F1</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
