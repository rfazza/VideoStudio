/**
 * REMOTION STUDIO — STABLE BASELINE v1.3
 * Verified: 2026-04-22
 * Status: Production-Ready / Optimized Project Specs UI
 */
import React, { useState, useMemo, useEffect, useRef, Component as ReactComponent } from "react";
import { Player } from "@remotion/player";
import Editor, { OnMount } from "@monaco-editor/react";
import { transform } from "sucrase";
import * as Remotion from "remotion";
import { resolveMetadata } from "./utils/metadata";
import { VideoSettings } from "./Root";

declare global {
  interface Window {
    electron: {
      selectFolder: () => Promise<string | null>;
      platform: string;
      version: string;
    }
  }
}

// Constants
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const STORAGE_KEY = "video-studio-workspace-v1";
const LICENSE_STORAGE_KEY = "video-studio-license-v2"; // Bump version for new system

// --- License System Constants ---
const SECRET = 'video-studio-pro-secret-key-2026';
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLAN_MAP = ["VS3D", "VS1M", "VSLF", "VSCS"];

// --- Crypto & License Helpers (Pure JS Implementation) ---
function decode60Bit(str: string) {
  let val = 0n;
  for (const char of str) {
    const index = CHARSET.indexOf(char);
    if (index === -1) continue;
    val = (val << 5n) | BigInt(index);
  }
  return val;
}

/**
 * Pure JS deterministic hash (FNV-1a)
 * Replaces WebCrypto to avoid TypeScript / Environment compatibility issues.
 */
function simpleHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface LicenseResult {
  isValid: boolean;
  isExpired: boolean;
  plan: string;
  isLifetime: boolean;
  expiresAt: string | null;
  key: string;
}

async function verifyLicense(key: string): Promise<LicenseResult | null> {
  try {
    if (!key) return null;
    const parts = key.split("-");
    if (parts.length < 4) return null;
    
    const plan = parts[0];
    const bodyStr = parts.slice(1).join("");
    if (bodyStr.length !== 12) return null;

    const packed = decode60Bit(bodyStr);
    
    // [SIG: 18b] [NONCE: 8b] [PLAN: 2b] [EXP: 32b]
    const expSec = Number(packed & 0xFFFFFFFFn);
    const planIdx = Number((packed >> 32n) & 0x3n);
    const nonceVal = Number((packed >> 34n) & 0xFFn);
    const sigPart = Number((packed >> 42n) & 0x3FFFFn);

    if (PLAN_MAP[planIdx] !== plan) return null;

    const isLifetime = plan === "VSLF";
    const nonceStr = nonceVal.toString(16).padStart(2, '0');
    
    const payload: any = {
      product: "VideoStudio",
      plan: plan,
      nonce: nonceStr
    };
    if (isLifetime) {
      payload.lifetime = true;
    } else {
      payload.exp = expSec * 1000;
    }

    const payloadJson = JSON.stringify(payload);
    const payloadB64 = btoa(payloadJson);

    // Verify deterministic signature using pure JS hash
    const calcHash = simpleHash(payloadB64 + SECRET);
    const expectedSigPart = calcHash & 0x3FFFF; // Extract same 18 bits

    if (sigPart !== expectedSigPart) return null;

    const now = Date.now();
    const expiresAt = isLifetime ? null : expSec * 1000;
    const isExpired = !isLifetime && expiresAt !== null && now > expiresAt;

    return {
      isValid: true,
      isExpired,
      plan,
      isLifetime,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      key
    };
  } catch (e) {
    return null;
  }
}

// 1. Initial template: Component body authoring
const INITIAL_RUNTIME_CODE = `// RUNTIME AUTHORING: Secure Encryption Asset
// Layout adapts dynamically using {width} and {height} from Remotion props.
const frame = useCurrentFrame();

const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

const moveY = spring({
  frame,
  fps,
  config: { stiffness: 100 },
  from: height * 0.1,
  to: 0,
});

const iconSize = Math.min(width, height) * 0.15;

return (
  <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617', overflow: 'hidden' }}>
    {/* Background Grid - Adapts dynamically */}
    <div className="absolute inset-0 opacity-10" style={{ 
      backgroundImage: 'radial-gradient(circle at 2px 2px, #3b82f6 1px, transparent 0)', 
      backgroundSize: '40px 40px',
      transform: \`translateY(\${frame * 0.5}px)\`
    }} />
    
    <div style={{ opacity, transform: \`translateY(\${moveY}px)\`, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
      <div style={{ display: 'flex', gap: width * 0.05, marginBottom: height * 0.05, justifyContent: 'center' }}>
        <div style={{ width: iconSize, height: iconSize }}>
          <svg style={{ width: '100%', height: '100%' }} viewBox="0 0 24 24">
            <defs>
              <linearGradient id="lockGradPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
            </defs>
            <path fill="url(#lockGradPrimary)" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
          </svg>
        </div>

        <div style={{ width: iconSize, height: iconSize }}>
          <svg style={{ width: '100%', height: '100%' }} viewBox="0 0 24 24">
            <defs>
              <linearGradient id="lockGradSecondary" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
            </defs>
            <path fill="url(#lockGradSecondary)" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
          </svg>
        </div>
      </div>

      <h1 style={{ fontSize: Math.min(width, height) * 0.08, margin: 0 }} className="font-black tracking-tighter text-white">SECURE <span className="text-blue-500 font-black">VAULT</span></h1>
      <p style={{ fontSize: Math.min(width, height) * 0.02, marginTop: '10px' }} className="text-slate-500 font-mono tracking-[0.4em] uppercase">Encrypted Data Asset Protocol</p>
      
      <div style={{ width: width * 0.3, height: '4px', marginTop: height * 0.05 }} className="bg-gradient-to-r from-transparent via-blue-600 to-transparent rounded-full shadow-[0_0_20px_rgba(59,130,246,0.6)] opacity-50" />
    </div>
  </AbsoluteFill>
);`;

// Editor Typings
const EDITOR_TYPES = `
  declare const AbsoluteFill: any;
  declare const Sequence: any;
  declare const Series: any;
  declare const Audio: any;
  declare const Video: any;
  declare const Img: any;
  declare const OffthreadVideo: any;
  declare const Loop: any;
  declare const useCurrentFrame: () => number;
  declare const interpolate: (v: number, input: number[], output: number[], options?: any) => number;
  declare const spring: (options: { frame: number; fps: number; config?: { stiffness?: number; damping?: number; mass?: number }; from?: number; to?: number; durationInFrames?: number; delay?: number }) => number;
  declare const width: number;
  declare const height: number;
  declare const fps: number;
  declare const durationInFrames: number;
`;

const FORBIDDEN_KEYWORDS = [
  "width", "height", "fps", "durationInFrames",
  "AbsoluteFill", "Sequence", "useCurrentFrame", "interpolate", "spring"
];

// 2. Error Boundaries
class RuntimeErrorBoundary extends ReactComponent<{ children: React.ReactNode; onCatch: (error: Error) => void }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { this.props.onCatch(error); }
  render() {
    if (this.state.hasError) return <div className="flex items-center justify-center h-full bg-slate-900 text-slate-500 text-xs uppercase tracking-widest font-black">Runtime Logic Error</div>;
    return this.props.children;
  }
}

// 3. UI Primitives
const SidebarItem: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
  <div className={`px-4 py-2.5 rounded-lg cursor-pointer transition-colors text-sm font-medium ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
    {label}
  </div>
);

const InputField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">{label}</label>
    {children}
  </div>
);

// 3.5 License Panel Component
const LicensePanel: React.FC<{
  license: any;
  licenseInput: string;
  setLicenseInput: (v: string) => void;
  activateLicense: () => void;
  removeLicense: () => void;
  remainingDays: number;
}> = ({ license, licenseInput, setLicenseInput, activateLicense, removeLicense, remainingDays }) => {
  const [isManaging, setIsManaging] = useState(false);

  return (
    <div className="mb-6 p-4 bg-white/[0.03] border border-white/5 rounded-xl space-y-3">
      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
        <span>License</span>
        <span className={license.isActive ? "text-green-500" : "text-red-500"}>
          {license.isActive ? "● Active" : "Not Activated"}
        </span>
      </div>
      
      {!license.isActive ? (
        <div className="space-y-2">
          <input 
            type="text" 
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            placeholder="Enter License Key..."
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-bold focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-700"
          />
          <button 
            onClick={activateLicense}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-[9px] font-black uppercase tracking-widest text-white transition-all shadow-lg shadow-blue-900/20"
          >
            Activate
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!isManaging ? (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold text-white">License Active</span>
                <span className="text-[9px] font-medium text-slate-500">
                  {license.isLifetime ? "Lifetime License" : `${remainingDays} days remaining`}
                </span>
                {!license.isLifetime && license.expiresAt && (
                  <span className="text-[8px] text-slate-600 font-medium">
                    Expires on {new Date(license.expiresAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setIsManaging(true)}
                className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all"
              >
                Manage License
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1 px-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Actions</span>
                <button 
                  onClick={() => setIsManaging(false)}
                  className="text-[8px] font-black uppercase text-blue-500 hover:text-blue-400"
                >
                  Cancel
                </button>
              </div>
              <button 
                onClick={removeLicense}
                className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-red-500/80 transition-all"
              >
                Remove License
              </button>
              <button 
                onClick={() => { removeLicense(); setIsManaging(false); }}
                className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all"
              >
                Replace License
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 4. Main Studio Component
export const Studio: React.FC = () => {
  const [settings, setSettings] = useState<VideoSettings>({
    activeTab: "live-preview", preset: "1080p", aspectRatio: "landscape",
    width: 1920, height: 1080, fps: 30, durationInFrames: 150,
    code: INITIAL_RUNTIME_CODE,
    outputDir: "",
    apiKeys: [],
    activeApiKeyIndex: 0,
    aiProvider: "gemini",
    aiModel: "gemini-2.0-flash",
  });

  const [editorCode, setEditorCode] = useState(INITIAL_RUNTIME_CODE);
  const [compiledCode, setCompiledCode] = useState(INITIAL_RUNTIME_CODE);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"synced" | "dirty" | "error">("synced");
  const [showEditor, setShowEditor] = useState(true);
  const [lastApplied, setLastApplied] = useState<number | null>(null);
  const [showApiHelp, setShowApiHelp] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "checking">("checking");
  
  // Render Session State
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [renderStepStatus, setRenderStepStatus] = useState<"rendering" | "completed" | "error" | "idle">("idle");
  const [renderError, setRenderError] = useState<string | null>(null);

  // Batch Configurator State
  const [activePanel, setActivePanel] = useState<"editor" | "batch">("editor");
  const [batchTab, setBatchTab] = useState<"text" | "media" | "gradient">("text");
  const [batchTextInput, setBatchTextInput] = useState("Episode 1: The Beginning\nEpisode 2: The Rising\nEpisode 3: The Finale");
  const [batchMediaInput, setBatchMediaInput] = useState("");
  const [batchColorA, setBatchColorA] = useState("#3b82f6");
  const [batchColorB, setBatchColorB] = useState("#2563eb");
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<any>(null);

  // License State
  const [license, setLicense] = useState<{
    key: string;
    expiresAt: string | null;
    isActive: boolean;
    isLifetime?: boolean;
    plan?: string;
  }>({
    key: "",
    expiresAt: null,
    isActive: false,
    isLifetime: false,
  });
  const [licenseInput, setLicenseInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
    { role: 'assistant', content: "Hello! I am your AI Video Architect. How can I help you modify your Remotion logic today?" }
  ]);

  // Persistence states
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string>("");

  const resolved = useMemo(() => resolveMetadata(settings), [settings]);

  // Derived Values
  const getDimensions = () => {
    switch (settings.aspectRatio?.toUpperCase()) {
      case 'PORTRAIT': return { w: 1080, h: 1920 };
      case 'SQUARE': return { w: 1080, h: 1080 };
      default: return { w: 1920, h: 1080 };
    }
  };
  const { w: currentW, h: currentH } = getDimensions();
  const currentDurationSeconds = useMemo(() => Math.round(settings.durationInFrames / settings.fps), [settings.durationInFrames, settings.fps]);

  const checkBackend = async () => {
    try {
      const res = await fetch("http://localhost:3001/health", { method: "GET" }).catch(() => null);
      if (res && res.ok) setBackendStatus("online");
      else setBackendStatus("offline");
    } catch (e) {
      setBackendStatus("offline");
    }
  };

  useEffect(() => {
    checkBackend();
    // Check more frequently (every 3s) for a snappier "Online" status
    const interval = setInterval(checkBackend, 3000);
    return () => clearInterval(interval);
  }, []);

  // Batch Polling
  useEffect(() => {
    let interval: any;
    if (batchJobId) {
       interval = setInterval(async () => {
         try {
           const res = await fetch(`http://localhost:3001/batch-status?jobId=${batchJobId}`);
           if (res.ok) {
             const data = await res.json();
             setBatchStatus(data);
             setRenderProgress(data.progress || 0);
             setRenderLogs([data.message || `Processing item ${data.current} of ${data.total}`]);
             if (data.status === "completed" || data.status === "error") {
                clearInterval(interval);
                setRenderStepStatus(data.status);
                setBatchJobId(null);
             }
           }
         } catch (e) { }
       }, 2000);
    }
    return () => clearInterval(interval);
  }, [batchJobId]);

  // 1. Initial Load from Storage
  useEffect(() => {
    try {
      // Load Workspace
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.editorCode) setEditorCode(parsed.editorCode);
        if (parsed.compiledCode) setCompiledCode(parsed.compiledCode);
        if (parsed.settings) {
          setSettings(prev => ({
            ...prev,
            ...parsed.settings,
            apiKeys: parsed.settings.apiKeys || [],
            activeApiKeyIndex: parsed.settings.activeApiKeyIndex || 0,
            aiProvider: parsed.settings.aiProvider || "gemini",
            aiModel: parsed.settings.aiModel || (parsed.settings.aiProvider === "groq" ? "llama-3.1-70b-versatile" : parsed.settings.aiProvider === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash")
          }));
        }
        if (parsed.isLooping !== undefined) setIsLooping(parsed.isLooping);
        if (parsed.showEditor !== undefined) setShowEditor(parsed.showEditor);
        setLastSavedAt(parsed.updatedAt || "");
      }

      // Load & Re-validate License
      const savedLicense = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (savedLicense) {
        const parsed = JSON.parse(savedLicense);
        if (parsed.key) {
          verifyLicense(parsed.key).then(result => {
            if (result && result.isValid && !result.isExpired) {
              setLicense({
                key: result.key,
                expiresAt: result.expiresAt,
                isActive: true,
                isLifetime: result.isLifetime,
                plan: result.plan
              });
            } else {
              // License invalid or expired
              setLicense(prev => ({ ...prev, isActive: false }));
            }
          });
        }
      }
    } catch (e) {
      console.error("Failed to load workspace/license:", e);
    }
  }, []);

  const activateLicense = async () => {
    const rawInput = licenseInput.trim().toUpperCase();
    if (!rawInput) return;
    
    const result = await verifyLicense(rawInput);

    if (!result || !result.isValid) {
      alert("Invalid License Key (Verification Failed)");
      return;
    }

    if (result.isExpired) {
      alert("This license key has already expired.");
      return;
    }

    // Success
    const newLicense = {
      key: result.key,
      expiresAt: result.expiresAt,
      isActive: true,
      isLifetime: result.isLifetime,
      plan: result.plan
    };
    
    setLicense(newLicense);
    localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(newLicense));
    setLicenseInput("");
    alert(`License Activated: ${result.plan}`);
  };

  const removeLicense = () => {
    const emptyLicense = {
      key: "",
      expiresAt: null,
      isActive: false,
      isLifetime: false,
    };
    setLicense(emptyLicense);
    localStorage.removeItem(LICENSE_STORAGE_KEY);
  };

  const remainingDays = useMemo(() => {
    if (license.isLifetime) return 9999; // Represents infinity in UI
    if (!license.expiresAt || !license.isActive) return 0;
    const now = new Date();
    const expiry = new Date(license.expiresAt);
    const diff = expiry.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [license]);

  // 2. Debounced Auto-Save
  useEffect(() => {
    setSaveStatus("unsaved");
    const timeout = setTimeout(() => {
      setSaveStatus("saving");
      try {
        const payload = {
          version: 1,
          editorCode,
          compiledCode,
          settings,
          isLooping,
          showEditor,
          updatedAt: new Date().toLocaleTimeString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        setLastSavedAt(payload.updatedAt);
        setSaveStatus("saved");
      } catch (e) {
        console.error("Save failed:", e);
      }
    }, 1500);
    return () => clearTimeout(timeout);
  }, [editorCode, compiledCode, settings, isLooping, showEditor]);

  const updateSetting = <K extends keyof VideoSettings>(key: K, value: VideoSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleFpsChange = (newFps: number) => {
    setSettings(prev => ({
      ...prev,
      fps: newFps,
      // Maintain duration in seconds
      durationInFrames: currentDurationSeconds * newFps
    }));
  };

  const handleDurationChange = (seconds: number) => {
    setSettings(prev => ({
      ...prev,
      durationInFrames: seconds * prev.fps
    }));
  };

  const applyChangesCore = (codeToApply: string) => {
    const redeclarationRegex = new RegExp(
      `\\b(const|let|var|function)\\s+(${FORBIDDEN_KEYWORDS.join("|")})\\b`, 
      "g"
    );
    const match = redeclarationRegex.exec(codeToApply);
    if (match) {
      setError(`CRITICAL: Identifier "${match[2]}" is pre-declared by the studio. Remove the re-declaration to sync.`);
      setStatus("error");
      return;
    }

    try {
      const result = transform(codeToApply, { 
        transforms: ["jsx", "typescript"], 
        production: true,
      }).code;
      
      new Function("React", "Remotion", "props", `
        const { AbsoluteFill, useCurrentFrame, interpolate, spring } = Remotion;
        ${result}
      `);
      
      setCompiledCode(codeToApply);
      setError(null);
      setStatus("synced");
      setLastApplied(Date.now());
      setTimeout(() => setLastApplied(null), 2000);
    } catch (e: any) {
      setError(e.message);
      setStatus("error");
    }
  };

  const applyChanges = () => applyChangesCore(editorCode);

  const resetEditor = () => {
    setEditorCode(INITIAL_RUNTIME_CODE);
    setCompiledCode(INITIAL_RUNTIME_CODE);
    setError(null);
    setStatus("synced");
  };

  const resetToDefault = () => {
    if (confirm("Reset everything to default? All current work will be cleared.")) {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  };

  const handleSendMessage = async (textInput: string = chatInput) => {
    if (!textInput.trim()) return;
    
    if (textInput === chatInput) {
       setMessages(prev => [...prev, { role: 'user', content: textInput }]);
       setChatInput("");
    }

    if (!settings.apiKeys || settings.apiKeys.length === 0) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: No API Keys found. Please import your API keys first." }]);
      return;
    }

    let currentKeyIndex = settings.activeApiKeyIndex;
    let success = false;
    let attempts = 0;
    const maxAttempts = settings.apiKeys.length;

    const systemPrompt = `Kamu adalah AI Video Architect pakar Remotion. Tugasmu adalah memodifikasi kode React/Remotion berdasarkan instruksi user.
ATURAN KETAT:
- HANYA balas dengan kode mentah (raw code) di dalam block code markdown.
- JANGAN memberikan penjelasan, salam, atau teks tambahan apapun.
- Gunakan variabel global yang tersedia: width, height, fps, durationInFrames, useCurrentFrame, interpolate, spring, AbsoluteFill.
- Pastikan kode yang kamu berikan valid dan bisa langsung dijalankan.

Konteks Kode Saat Ini:
\`\`\`tsx
${editorCode}
\`\`\``;

    while (!success && attempts < maxAttempts) {
      attempts++;
      const apiKey = settings.apiKeys[currentKeyIndex];
      const provider = settings.aiProvider;

      setMessages(prev => {
         const newMsgs = [...prev];
         if (attempts > 1) newMsgs.pop();
         return [...newMsgs, { role: 'assistant', content: `AI is thinking... (Attempt ${attempts}/${maxAttempts} using ${provider.toUpperCase()})` }];
      });

      try {
        let responseText = "";

        if (provider === "gemini") {
          const modelId = settings.aiModel || "gemini-2.0-flash";
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: textInput }] }]
            })
          });
          if (res.status === 429) throw new Error("429");
          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            throw new Error(`Gemini Error: ${res.status} ${res.statusText} - ${errBody}`);
          }
          const data = await res.json();
          responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } else if (provider === "groq" || provider === "openai") {
          const baseUrl = provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
          const modelId = settings.aiModel || (provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini");
          const res = await fetch(baseUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelId,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: textInput }
              ]
            })
          });
          if (res.status === 429) throw new Error("429");
          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            throw new Error(`${provider.toUpperCase()} Error: ${res.status} ${res.statusText} - ${errBody}`);
          }
          const data = await res.json();
          responseText = data.choices?.[0]?.message?.content || "";
        }

        if (!responseText) throw new Error("Empty response from AI");

        const codeMatch = responseText.match(/```(?:tsx?|jsx?|javascript|typescript)?\s*([\s\S]*?)```/);
        const extractedCode = codeMatch ? codeMatch[1].trim() : responseText.trim();

        setEditorCode(extractedCode);
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs.pop();
          return [...newMsgs, { role: 'assistant', content: "Kode berhasil diperbarui dan diterapkan secara otomatis!" }];
        });

        applyChangesCore(extractedCode);
        success = true;
        
        if (currentKeyIndex !== settings.activeApiKeyIndex) {
          setSettings(prev => ({ ...prev, activeApiKeyIndex: currentKeyIndex }));
        }

      } catch (e: any) {
        if (e.message === "429" || e.message.includes("429")) {
           currentKeyIndex = (currentKeyIndex + 1) % settings.apiKeys.length;
           if (attempts >= maxAttempts) {
             setMessages(prev => {
               const newMsgs = [...prev];
               newMsgs.pop();
               return [...newMsgs, { role: 'assistant', content: "Error: Rate limit exceeded (429) on all available API keys." }];
             });
           }
        } else {
           setMessages(prev => {
             const newMsgs = [...prev];
             newMsgs.pop();
             return [...newMsgs, { role: 'assistant', content: `Error: ${e.message}` }];
           });
           break;
        }
      }
    }
  };

  const exportJson = () => {
    const payload = {
      version: 1,
      name: "Video_Export_" + Date.now(),
      code: compiledCode,
      settings: {
        width: currentW,
        height: currentH,
        fps: resolved.fps,
        durationInFrames: resolved.durationInFrames,
        aspectRatio: settings.aspectRatio,
      },
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRender = async () => {
    if (isRendering) return;
    if (!license.isActive) {
      alert("License required to render video. Please activate in the Project Specs panel.");
      return;
    }
    setIsRendering(true);
    setRenderError(null);
    setRenderStepStatus("rendering");
    setRenderProgress(0);
    setRenderLogs(["Preparing engine..."]);

    const logTimeline = [
      { time: 500, log: "Bundling assets..." },
      { time: 1200, log: "Resolving comps..." },
      { time: 2000, log: "Starting FFmpeg..." },
    ];

    logTimeline.forEach(entry => {
      setTimeout(() => {
        setRenderLogs(prev => [...prev, entry.log]);
      }, entry.time);
    });

    const progressInterval = setInterval(() => {
      setRenderProgress(p => {
        if (p < 92) {
          const inc = Math.random() * 8;
          const newP = p + inc;
          if (Math.floor(newP / 25) > Math.floor(p / 25)) {
             setRenderLogs(prev => [...prev, `Encoding: ${Math.round(newP)}%`]);
          }
          return newP;
        }
        return p;
      });
    }, 1200);

    try {
      if (backendStatus !== "online") {
        throw new Error("Server offline");
      }

      const response = await fetch("http://localhost:3001/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: compiledCode,
          width: resolved.width,
          height: resolved.height,
          preset: settings.preset,
          fps: resolved.fps,
          durationInFrames: resolved.durationInFrames,
          aspectRatio: settings.aspectRatio,
          outputDir: settings.outputDir,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Render failed");
      }

      // Wait for the full transfer to complete to ensure server-side cleanup triggers
      const blob = await response.blob();
      
      clearInterval(progressInterval);
      setRenderProgress(100);
      setRenderLogs(prev => [...prev, settings.outputDir ? "Done. Asset saved to custom folder." : "Done. Render complete."]);
      setRenderStepStatus("completed");

      // Browser-side download is now disabled as server handles file placement
      /*
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `render-${Date.now()}.mp4`;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      */
      
      setTimeout(() => {
        setRenderStepStatus("idle");
        setRenderProgress(0);
      }, 5000);
    } catch (e: any) {
      clearInterval(progressInterval);
      setRenderError(e.message);
      setRenderStepStatus("error");
      setRenderLogs(prev => [...prev, `Error: ${e.message}`]);
    } finally {
      setIsRendering(false);
    }
  };

  const handleBatchRender = async () => {
    if (isRendering) return;
    if (!license.isActive) {
      alert("License required");
      return;
    }
    setRenderStepStatus("rendering");
    setRenderProgress(0);
    setRenderLogs(["Preparing batch processing..."]);
    
    let batchItems: any[] = [];
    if (batchTab === "text") {
       const texts = batchTextInput.split('\n').map(t => t.trim()).filter(Boolean);
       if (texts.length === 0) { alert("Please input texts"); setRenderStepStatus("idle"); return; }
       batchItems = texts.map(t => ({ text: t }));
    } else if (batchTab === "gradient") {
       batchItems = [
         { colorA: batchColorA, colorB: batchColorB },
         { colorA: batchColorB, colorB: batchColorA }
       ];
    } else if (batchTab === "media") {
       batchItems = [{ search: batchMediaInput || "nature" }, { search: batchMediaInput || "city" }];
    }

    try {
      const response = await fetch("http://localhost:3001/render-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: compiledCode,
          width: resolved.width,
          height: resolved.height,
          preset: settings.preset,
          fps: resolved.fps,
          durationInFrames: resolved.durationInFrames,
          aspectRatio: settings.aspectRatio,
          outputDir: settings.outputDir,
          batchItems
        }),
      });

      if (!response.ok) {
        throw new Error("Batch render failed to start");
      }

      const data = await response.json();
      setBatchJobId(data.jobId);
    } catch (e: any) {
      setRenderError(e.message);
      setRenderStepStatus("error");
      setRenderLogs([`Error: ${e.message}`]);
    }
  };

  const RuntimePreview = useMemo(() => {
    return (props: any) => {
      try {
        const transpilied = transform(compiledCode, { transforms: ["jsx", "typescript"] }).code;
        const { AbsoluteFill, useCurrentFrame, interpolate, spring, Sequence, Series, Audio, Video, Img, OffthreadVideo, Loop } = Remotion;
        const renderFn = new Function(
          "React", "Remotion", "AbsoluteFill", "useCurrentFrame", "interpolate", "spring", "Sequence", "Series", "Audio", "Video", "Img", "OffthreadVideo", "Loop", "props",
          `const { width, height, fps, durationInFrames } = props; ${transpilied}`
        );
        // Lanjutkan props secara native tanpa di-override oleh DESIGN_WIDTH statis
        const content = renderFn(React, Remotion, AbsoluteFill, useCurrentFrame, interpolate, spring, Sequence, Series, Audio, Video, Img, OffthreadVideo, Loop, props);

        return (
          <Remotion.AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', overflow: 'hidden' }}>
            {content}
          </Remotion.AbsoluteFill>
        );
      } catch (e: any) {
        return (
          <Remotion.AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617', color: 'red' }}>
            <div className="text-center p-10 bg-black/50 rounded-xl border border-red-500/20">
              <h3 className="text-sm font-black mb-2 uppercase tracking-widest">Logic Exception</h3>
              <p className="text-[10px] opacity-50 max-w-xs">{e.message}</p>
            </div>
          </Remotion.AbsoluteFill>
        );
      }
    };
  }, [compiledCode]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans select-none">
      {/* 1. Navigation Sidebar (Left) */}
      <aside className="w-64 border-r border-white/5 bg-slate-900/50 flex flex-col shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <img src="/icon.png" alt="Zzrco Logo" className="w-8 h-8 object-contain rounded-lg shadow-lg shadow-blue-900/30 bg-blue-600/20 border border-white/10" onError={(e) => { e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><path d="M4 4h16v2H4zm0 14h16v2H4zm2-10h12l-8 8h8v2H6l8-8H6z"/></svg>'; }} />
          <h1 className="text-xl font-black tracking-tighter text-blue-500">VideoStudio</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <LicensePanel 
            license={license}
            licenseInput={licenseInput}
            setLicenseInput={setLicenseInput}
            activateLicense={activateLicense}
            removeLicense={removeLicense}
            remainingDays={remainingDays}
          />
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 px-2">Production</div>
          <div onClick={() => setActivePanel("editor")}>
            <SidebarItem label="Component Logic" active={activePanel === "editor"} />
          </div>
          <div onClick={() => setActivePanel("batch")}>
            <SidebarItem label="Batch Configurator" active={activePanel === "batch"} />
          </div>
          <SidebarItem label="Asset Library" />
          <div className="h-px bg-white/5 my-4 mx-2" />
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 px-2">Output</div>
          <SidebarItem label="Render Queue" />
        </nav>
        <div className="p-4 bg-slate-900 border-t border-white/5 flex flex-col gap-3">
           <div className="flex items-center justify-between text-[9px] font-black text-slate-600 uppercase px-1">
              <span>Core v4.0.450</span>
              <span className="text-blue-500/50">STABLE</span>
           </div>
           <button onClick={resetToDefault} className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[9px] font-black text-red-500/80 uppercase tracking-widest transition-all">Factory Reset</button>
        </div>
      </aside>

      {/* 2. Main Workspace */}
      <main className="flex-1 flex flex-col bg-slate-950 min-w-0">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-slate-900/20 shrink-0">
          {/* Left Header Group */}
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[10px] font-black text-white bg-blue-600/10 px-3 py-1 rounded-md border border-blue-600/20 tracking-widest uppercase text-xs">Studio Tooling</span>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest transition-all ${
                  backendStatus === "online" ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                }`}>
                  <span className={`w-1 h-1 rounded-full ${backendStatus === "online" ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500"}`} />
                  Engine: {backendStatus === "online" ? "Online" : "Offline"}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[9px] px-1 font-bold text-slate-600 tracking-tight">
                 <span className={`w-1 h-1 rounded-full ${saveStatus === "saved" ? "bg-green-500/50" : saveStatus === "saving" ? "bg-blue-500 animate-pulse" : "bg-amber-500"}`} />
                 {saveStatus === "saved" ? `Changes persistent ${lastSavedAt ? `@ ${lastSavedAt}` : ""}` : saveStatus === "saving" ? "Syncing storage..." : "Modified"}
              </div>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg">
              <button onClick={() => setShowEditor(true)} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${showEditor ? "bg-slate-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-400"}`}>Edit Logic</button>
              <button onClick={() => setShowEditor(false)} className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${!showEditor ? "bg-slate-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-400"}`}>Canvas Only</button>
            </div>
          </div>
          
          {/* Right Header Group */}
          <div className="flex items-center gap-6">
            {/* Inline Render Status */}
            {(renderStepStatus !== "idle") && (
              <div className="flex items-center gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      {renderStepStatus === "rendering" ? "Processing" : renderStepStatus === "completed" ? "Success" : "Failed"}
                    </span>
                    <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className={`h-full transition-all duration-300 ${renderStepStatus === "error" ? "bg-red-500" : "bg-blue-500"}`} 
                        style={{ width: `${renderProgress}%` }} 
                      />
                    </div>
                  </div>
                  <div className="h-3 overflow-hidden text-[8px] font-mono text-slate-400 uppercase tracking-tighter text-right">
                    {renderLogs.slice(-1)[0]}
                  </div>
                </div>
                <div className="h-6 w-px bg-white/10" />
              </div>
            )}

            <div className="flex items-center gap-4">
              <button onClick={exportJson} className="px-4 py-2 bg-white/5 hover:bg-white/10 transition-all rounded-lg text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest border border-white/5">Export JSON</button>
              <button 
                onClick={handleRender} 
                disabled={isRendering || status === "error" || backendStatus !== "online" || !license.isActive}
                className={`px-6 py-2.5 transition-all rounded-lg text-sm font-black text-white shadow-xl flex items-center justify-center gap-3 min-w-[120px] ${
                  isRendering || backendStatus !== "online" || !license.isActive ? "bg-slate-800 text-slate-600 cursor-not-allowed border border-white/5" : renderStepStatus === "completed" ? "bg-green-600 hover:bg-green-500 shadow-green-900/30" : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/30"
                }`}
              >
                {isRendering ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="tabular-nums">{Math.round(renderProgress)}%</span>
                  </>
                ) : !license.isActive ? (
                   "LOCKED"
                ) : renderStepStatus === "completed" ? (
                  "COMPLETE"
                ) : renderStepStatus === "error" ? (
                  "RETRY RENDER"
                ) : (
                  "RENDER"
                )}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {showEditor ? (
            <>
              {/* Panel Kiri: Editor */}
              {activePanel === "editor" ? (
              <div className="w-1/2 border-r border-white/5 flex flex-col bg-[#02040a]">
                <div className="h-10 bg-slate-900/20 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                     <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Runtime Buffer</span>
                     <button onClick={() => setShowApiHelp(!showApiHelp)} className="text-[9px] font-black bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all">API Help</button>
                  </div>
                  <div className="flex items-center gap-6">
                     <button onClick={resetEditor} className="text-[10px] font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest">Clear</button>
                     <button onClick={applyChanges} disabled={status === "synced"} className={`text-[10px] font-black uppercase transition-all tracking-[0.2em] px-4 py-1.5 rounded-md ${status === "synced" ? "text-slate-800 bg-transparent" : "bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600/20 shadow-lg"}`}>
                       {lastApplied ? "BUFFER SYNCED" : "SYNC LOGIC"}
                     </button>
                  </div>
                </div>

                <div className="flex-1 relative group">
                  <Editor height="100%" language="typescript" theme="vs-dark" value={editorCode} onMount={(e, m) => {
                    m.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
                    m.languages.typescript.typescriptDefaults.setExtraLibs([{ content: EDITOR_TYPES, filePath: "remotion-runtime.d.ts" }]);
                  }} onChange={(v) => { setEditorCode(v || ""); setStatus("dirty"); }} options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: "on", padding: { top: 20 }, fontFamily: "'JetBrains Mono', monospace", automaticLayout: true }} />
                  {lastApplied && <div className="absolute top-6 right-8 bg-green-600 text-white text-[10px] font-black px-4 py-2 rounded-full shadow-2xl animate-bounce pointer-events-none uppercase tracking-widest">Logic Injected</div>}
                  {showApiHelp && (
                    <div className="absolute top-0 left-0 w-full bg-slate-900/95 border-b border-white/10 p-8 z-50 backdrop-blur-md animate-in slide-in-from-top-4 duration-300 shadow-2xl">
                      <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Studio Runtime API</h3>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                           <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hooks</h4>
                           <p className="text-[10px] text-slate-500">useCurrentFrame, interpolate, spring</p>
                        </div>
                        <div className="space-y-2">
                           <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Globals</h4>
                           <p className="text-[10px] text-slate-500">width, height, fps, durationInFrames</p>
                        </div>
                      </div>
                      <button onClick={() => setShowApiHelp(false)} className="mt-6 text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest">Dismiss</button>
                    </div>
                  )}
                </div>

                {status === "error" && error && (
                  <div className="bg-red-950/20 border-t border-red-500/20 p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 shrink-0">
                    <div className="bg-black/90 p-5 rounded-xl border border-red-500/20 font-mono text-[11px] text-red-200 whitespace-pre-wrap leading-relaxed shadow-inner">
                       <div className="mb-2 text-red-500 font-black uppercase tracking-widest text-[9px]">Logic Exception Trace</div>
                       {error}
                    </div>
                  </div>
                )}
              </div>
              ) : activePanel === "batch" ? (
              <div className="w-1/2 border-r border-white/5 flex flex-col bg-[#02040a]">
                <div className="h-10 bg-slate-900/20 border-b border-white/5 px-6 flex items-center shrink-0">
                   <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Batch Configurator Panel</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                   <div className="flex gap-2">
                     <button onClick={() => setBatchTab("text")} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${batchTab === "text" ? "bg-blue-600 text-white" : "bg-white/5 text-slate-400"}`}>Batch Text</button>
                     <button onClick={() => setBatchTab("media")} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${batchTab === "media" ? "bg-blue-600 text-white" : "bg-white/5 text-slate-400"}`}>Media Search</button>
                     <button onClick={() => setBatchTab("gradient")} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${batchTab === "gradient" ? "bg-blue-600 text-white" : "bg-white/5 text-slate-400"}`}>Pure Gradient</button>
                   </div>
                   
                   {batchTab === "text" && (
                     <InputField label="Input List Teks (Pisahkan dengan baris baru)">
                        <textarea 
                           value={batchTextInput}
                           onChange={e => setBatchTextInput(e.target.value)}
                           className="w-full h-40 bg-slate-800 border border-white/10 rounded-xl p-4 text-[11px] font-mono text-slate-300 focus:border-blue-500/50 outline-none"
                           placeholder={"Contoh:\nTitle 1\nTitle 2\nTitle 3"}
                        />
                        <p className="text-[9px] text-slate-500 mt-2">Placeholder <code>BATCH_TEXT_PLACEHOLDER</code> pada kode editor akan diganti secara sekuensial dengan teks di atas.</p>
                     </InputField>
                   )}

                   {batchTab === "media" && (
                     <InputField label="Kata Kunci Smart Media Search">
                        <input 
                           type="text"
                           value={batchMediaInput}
                           onChange={e => setBatchMediaInput(e.target.value)}
                           className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-[11px] font-bold text-slate-300 focus:border-blue-500/50 outline-none"
                           placeholder="Contoh: neon city, abstract geometry..."
                        />
                     </InputField>
                   )}

                   {batchTab === "gradient" && (
                     <div className="space-y-4">
                        <InputField label="Color A (BATCH_COLOR_A)">
                           <input type="color" value={batchColorA} onChange={e => setBatchColorA(e.target.value)} className="w-full h-10 rounded cursor-pointer" />
                        </InputField>
                        <InputField label="Color B (BATCH_COLOR_B)">
                           <input type="color" value={batchColorB} onChange={e => setBatchColorB(e.target.value)} className="w-full h-10 rounded cursor-pointer" />
                        </InputField>
                     </div>
                   )}

                   <button 
                     onClick={handleBatchRender}
                     disabled={!!batchJobId || renderStepStatus === "rendering"}
                     className={`w-full py-4 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl mt-4 flex justify-center items-center gap-3 ${
                        (!!batchJobId || renderStepStatus === "rendering") ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02] text-white"
                     }`}
                   >
                      {(!!batchJobId || renderStepStatus === "rendering") ? (
                        <>
                           <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                           {batchStatus ? `RENDERING ${batchStatus.current} OF ${batchStatus.total}...` : "STARTING BATCH..."}
                        </>
                      ) : "START BATCH RENDER"}
                   </button>
                </div>
              </div>
              ) : null}

              {/* Panel Tengah (Baru): Preview + AI Chat */}
              <div className="flex-1 flex flex-col bg-slate-950">
                {/* Atas: Preview */}
                <div className="flex-1 flex flex-col min-h-0 bg-black relative">
                  <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
                    <div className="flex-1 flex items-center justify-center bg-[#050505] relative w-full h-full shadow-2xl rounded-3xl overflow-hidden border border-white/10 z-10">
                      {(!currentW || !currentH) ? (
                        <div className="text-white text-[10px] uppercase font-black tracking-widest">Loading Preview Dimensions...</div>
                      ) : (
                        <RuntimeErrorBoundary onCatch={(err) => setError(err.message)}>
                          <Player 
                            key={settings.aspectRatio}
                            component={RuntimePreview} 
                            inputProps={{ ...settings, width: currentW, height: currentH }} 
                            durationInFrames={Math.max(1, settings?.durationInFrames || 150)} 
                            fps={Math.max(1, settings?.fps || 30)} 
                            compositionWidth={currentW} 
                            compositionHeight={currentH} 
                            style={{ width: "100%", height: "100%", objectFit: "contain" }} 
                            controls 
                            loop={isLooping} 
                          />
                        </RuntimeErrorBoundary>
                      )}
                    </div>
                    {/* decorative background element behind player */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.05),_transparent_75%)] pointer-events-none" />
                  </div>
                  <div className="h-10 border-t border-white/5 px-6 flex items-center justify-between shrink-0 bg-slate-900/50">
                    <div className="flex items-center gap-6">
                       <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Preview</div>
                       <div className="h-3 w-px bg-white/5" />
                       <div className="flex items-center gap-2 text-[9px] font-bold text-white uppercase tracking-widest">{currentW}X{currentH}</div>
                    </div>
                    <div className="flex items-center gap-3">
                       <button onClick={() => setIsLooping(!isLooping)} className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all ${isLooping ? "text-blue-400" : "text-slate-600"}`}><span className={`w-1 h-1 rounded-full ${isLooping ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-slate-700"}`} />{isLooping ? "Looping" : "Single"}</button>
                    </div>
                  </div>
                </div>

                {/* Bawah: AI Configuration & Chat */}
                <div className="h-1/2 border-t border-white/5 flex flex-col min-h-0 bg-[#020617] overflow-hidden">
                   <div className="p-4 border-b border-white/5 bg-slate-900/20 grid grid-cols-3 gap-4 shrink-0">
                      <InputField label="AI Engine">
                         <div className="relative">
                           <select 
                              value={settings.aiProvider} 
                              onChange={(e) => {
                                 const newProvider = e.target.value as any;
                                 const newModel = newProvider === "groq" ? "llama-3.3-70b-versatile" : newProvider === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash";
                                 setSettings(prev => ({ ...prev, aiProvider: newProvider, aiModel: newModel }));
                              }}
                              className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold focus:outline-none transition-all hover:border-white/20 appearance-none text-white cursor-pointer"
                           >
                              <option value="gemini">Google Gemini</option>
                              <option value="groq">Groq LPU</option>
                              <option value="openai">OpenAI</option>
                           </select>
                         </div>
                      </InputField>

                      <InputField label="AI Model">
                         <div className="relative">
                           <select 
                              value={settings.aiModel} 
                              onChange={(e) => updateSetting("aiModel", e.target.value)}
                              className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold focus:outline-none transition-all hover:border-white/20 appearance-none text-white cursor-pointer"
                           >
                              {settings.aiProvider === "gemini" && (
                                <>
                                  <option value="gemini-2.0-flash">Gemini 2.5 Flash</option>
                                  <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro</option>
                                </>
                              )}
                              {settings.aiProvider === "groq" && (
                                <>
                                  <option value="llama-3.3-70b-versatile">Llama 4 Scout (70B)</option>
                                  <option value="llama3-8b-8192">Llama 3 (8B)</option>
                                </>
                              )}
                              {settings.aiProvider === "openai" && (
                                <>
                                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                                  <option value="gpt-4o">GPT-4o</option>
                                </>
                              )}
                           </select>
                         </div>
                      </InputField>

                      <InputField label="API Key">
                         <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl px-3 py-1.5">
                            <div className="flex flex-col">
                               <span className="text-[10px] font-mono text-blue-400">
                                  {(settings.apiKeys || []).length > 0 
                                    ? `${settings.apiKeys[settings.activeApiKeyIndex].substring(0, 6)}••••`
                                    : "No Keys Found"}
                               </span>
                            </div>
                            <button 
                               onClick={() => document.getElementById('key-import-input-panel')?.click()}
                               className="p-1 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 rounded-lg text-blue-400 transition-all"
                            >
                               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            </button>
                            <input 
                               id="key-import-input-panel"
                               type="file" 
                               accept=".txt"
                               className="hidden"
                               onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                     const text = event.target?.result as string;
                                     const keys = text.split(/\r?\n/).map(k => k.trim()).filter(k => k.length > 0);
                                     if (keys.length > 0) {
                                        setSettings(s => ({ ...s, apiKeys: keys, activeApiKeyIndex: 0 }));
                                     }
                                  };
                                  reader.readAsText(file);
                               }}
                            />
                         </div>
                      </InputField>
                   </div>

                   {/* Chat UI */}
                   <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                      {messages.map((msg, i) => (
                         <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed font-medium ${
                               msg.role === 'user' 
                                 ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 rounded-tr-none' 
                                 : 'bg-white/5 border border-white/5 text-slate-300 rounded-tl-none'
                            }`}>
                               {msg.content}
                            </div>
                         </div>
                      ))}
                   </div>

                   {/* Chat Input */}
                   <div className="p-4 bg-slate-900/40 border-t border-white/5 shrink-0">
                      <div className="flex items-center gap-2 group">
                         <input 
                            type="text" 
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                               if (e.key === 'Enter' && chatInput.trim()) {
                                  handleSendMessage();
                               }
                            }}
                            placeholder="Ask AI to modify your logic..."
                            className="flex-1 bg-slate-800/50 border border-white/10 rounded-xl px-5 py-3 text-xs font-bold focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600"
                         />
                         <button 
                            onClick={() => handleSendMessage()}
                            className="w-[42px] h-[42px] shrink-0 bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-lg transition-all active:scale-95 group-focus-within:shadow-blue-900/50"
                         >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                         </button>
                      </div>
                   </div>
                </div>
              </div>
            </>
          ) : (
            /* View Full Preview (Canvas Only) */
            <div className="flex-1 flex flex-col bg-slate-950">
              <div className="flex-1 flex items-center justify-center p-12 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.02),_transparent_75%)] relative overflow-hidden">
                <div className="flex-1 flex items-center justify-center bg-[#050505] relative w-full h-full shadow-[0_48px_96px_-24px_rgba(0,0,0,1)] rounded-[3rem] overflow-hidden border border-white/10 z-10">
                  {(!currentW || !currentH) ? (
                    <div className="text-white text-[10px] uppercase font-black tracking-widest">Loading Preview Dimensions...</div>
                  ) : (
                    <RuntimeErrorBoundary onCatch={(err) => setError(err.message)}>
                      <Player 
                        key={settings.aspectRatio}
                        component={RuntimePreview} 
                        inputProps={{ ...settings, width: currentW, height: currentH }} 
                        durationInFrames={Math.max(1, settings?.durationInFrames || 150)} 
                        fps={Math.max(1, settings?.fps || 30)} 
                        compositionWidth={currentW} 
                        compositionHeight={currentH} 
                        style={{ width: "100%", height: "100%", objectFit: "contain" }} 
                        controls 
                        loop={isLooping} 
                      />
                    </RuntimeErrorBoundary>
                  )}
                </div>
              </div>
              
              <div className="h-16 border-t border-white/5 px-10 flex items-center justify-between shrink-0 bg-slate-900/10">
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest"><span className="text-slate-600 tracking-tighter">Sync Matrix:</span><span className={status === "error" ? "text-red-500" : "text-green-500"}>{status === "error" ? "CONFLICT" : "ACTIVE"}</span></div>
                    <div className="h-4 w-px bg-white/5" />
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white"><span className="text-slate-600 tracking-tighter">Raster Canvas:</span>{currentW}X{currentH} @ {resolved.fps} FPS</div>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/5 text-[10px] font-black uppercase tracking-widest transition-all">
                    <button onClick={() => setIsLooping(!isLooping)} className={`flex items-center gap-2 transition-all ${isLooping ? "text-blue-400" : "text-slate-600"}`}><span className={`w-1.5 h-1.5 rounded-full ${isLooping ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-slate-700"}`} />Loop: {isLooping ? "ON" : "OFF"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 3. Project Specs Sidebar (Right) */}
      <aside className="w-80 border-l border-white/5 bg-slate-900/50 flex flex-col shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/20">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Project Specs</h2>
          <div className={`w-2 h-2 rounded-full ${status === "error" ? "bg-red-500 animate-pulse" : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"}`} />
        </div>
        <div className="flex-1 p-8 space-y-10 overflow-y-auto custom-scrollbar">
          <InputField label="Format Preset">
            <select value={settings.preset} onChange={(e) => updateSetting("preset", e.target.value as any)} className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none transition-all hover:border-white/20 appearance-none">
              <option value="1080p">High Definition (1080p)</option>
              <option value="2k">Ultra High (2K)</option>
              <option value="4k">Production Grade (4K)</option>
              <option value="custom">Custom Format</option>
            </select>
          </InputField>

          <InputField label="Output Location">
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={settings.outputDir || "Default (/renders internal)"} 
                className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-bold focus:outline-none text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap"
              />
              <button 
                onClick={async () => {
                  if (window.electron?.selectFolder) {
                    const folder = await window.electron.selectFolder();
                    if (folder) updateSetting("outputDir", folder);
                  } else {
                    alert("Folder picker is only available in the Desktop App.");
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-lg shadow-blue-900/20 shrink-0"
              >
                Browse
              </button>
            </div>
          </InputField>
          <InputField label="Aspect Geometry">
            <div className="grid grid-cols-3 gap-3">
              {["landscape", "portrait", "square"].map((ratio) => (
                <button key={ratio} onClick={() => setSettings(s => ({ ...s, aspectRatio: ratio as any }))} className={`py-3 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${settings.aspectRatio === ratio ? "bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-900/30" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"}`}>{ratio}</button>
              ))}
            </div>
          </InputField>
          <div className="h-px bg-white/5" />
          
          <InputField label="Motion Framerate">
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 24, label: "24", sub: "Cine" },
                { val: 30, label: "30", sub: "Std" },
                { val: 60, label: "60", sub: "High" }
              ].map((fps) => (
                <button 
                  key={fps.val} 
                  onClick={() => handleFpsChange(fps.val)} 
                  className={`flex flex-col items-center py-2 rounded-xl border transition-all ${settings.fps === fps.val ? "bg-blue-600 border-blue-500 text-white shadow-lg" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"}`}
                >
                  <span className="text-[11px] font-black">{fps.label}</span>
                  <span className="text-[7px] font-bold uppercase opacity-50">{fps.sub}</span>
                </button>
              ))}
            </div>
          </InputField>

          <InputField label="Target Duration">
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-1.5">
                {[3, 5, 8, 10, 15].map((s) => (
                  <button 
                    key={s} 
                    onClick={() => handleDurationChange(s)} 
                    className={`py-2 text-[10px] font-black rounded-lg border transition-all ${currentDurationSeconds === s ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"}`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-black text-white">{currentDurationSeconds}s</span>
                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">{settings.durationInFrames} frames</span>
              </div>
            </div>
          </InputField>
        </div>
        <div className="p-8 bg-slate-900 border-t border-white/5 space-y-4">
           <div className="flex items-center justify-between text-[10px] font-black text-slate-600 uppercase tracking-widest">
             <span>Scaling Engine</span>
             <span className="text-blue-500">Active</span>
           </div>
           <p className="text-[10px] text-slate-600 leading-relaxed italic text-center font-medium">Design Space is locked to 1920x1080 to ensure visual consistency across all output formats.</p>
        </div>
      </aside>
    </div>
  );
};
