import { useState, useRef, useCallback } from "react";
import { Upload, Film, Play, Pause, Wand2, Mic2, X, Check, Sparkles, Loader2, AlertCircle, Link2 } from "lucide-react";

const PREVIEW_TEXT = "မင်္ဂလာပါ၊ ဒါက ကျွန်တော့်အသံနမူနာ ဖြစ်ပါတယ်။";

// Recap backend (Render) — falls back to this deployed URL, or override
// locally via a .env file with VITE_RECAP_BACKEND_URL for local dev.
const RECAP_BACKEND_URL =
  import.meta.env.VITE_RECAP_BACKEND_URL || "https://recap-backend-1.onrender.com";

// ── Voice roster ──────────────────────────────────────────────
const VOICES = [
  {
    id: "hsayama",
    name: "Hsayama",
    tag: "Warm Elder",
    desc: "Slow, warm storyteller voice",
    accent: "#C9A227",
  },
  {
    id: "kolay",
    name: "Kolay",
    tag: "Energetic",
    desc: "Lively, youthful commentary voice",
    accent: "#B2452D",
  },
  {
    id: "mahmyaing",
    name: "Mahmyaing",
    tag: "Gentle Narrator",
    desc: "Soft, emotive storytelling voice",
    accent: "#7A6A9C",
  },
  {
    id: "bogyi",
    name: "Bogyi",
    tag: "Deep Suspense",
    desc: "Deep, intense thriller voice",
    accent: "#2E5C4E",
  },
  {
    id: "yamin",
    name: "Yamin",
    tag: "Confident",
    desc: "Firm, confident female narrator voice",
    accent: "#8C3B5E",
  },
  {
    id: "koaung",
    name: "Ko Aung",
    tag: "Action",
    desc: "Thrilling, high-energy action commentary voice",
    accent: "#B5651D",
  },
  {
    id: "koko",
    name: "Ko Ko",
    tag: "News Anchor",
    desc: "Clear, informative news-anchor style voice",
    accent: "#3C6E8F",
  },
  {
    id: "maley",
    name: "Ma Lay",
    tag: "Youthful",
    desc: "Young, lively female voice",
    accent: "#A0527A",
  },
];

const TONES = [
  { id: "suspense", label: "Suspense" },
  { id: "comedy", label: "Comedy" },
  { id: "emotional", label: "Emotional" },
  { id: "epic", label: "Epic" },
];

export default function RecapUpload() {
  const [mode, setMode] = useState("upload"); // upload | link
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [voice, setVoice] = useState("hsayama");
  const [tone, setTone] = useState("suspense");
  const [playingPreview, setPlayingPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  // idle | ready | processing | done | error
  const [stage, setStage] = useState("idle");
  const [jobStatus, setJobStatus] = useState(null); // backend pipeline status string
  const [jobProgress, setJobProgress] = useState(0); // 0-100
  const [genError, setGenError] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [jobId, setJobId] = useState(null);
  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const pollRef = useRef(null);

  // ── Post-generation editor: blur box + logo overlay ─────────
  const [showBlurBox, setShowBlurBox] = useState(false);
  const [blurBox, setBlurBox] = useState({ xPct: 8, yPct: 8, wPct: 30, hPct: 12 });
  const [showLogo, setShowLogo] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [logoBox, setLogoBox] = useState({ xPct: 4, yPct: 4, wPct: 16 });
  const [applyingEdit, setApplyingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editedResultUrl, setEditedResultUrl] = useState(null);
  const previewBoxRef = useRef(null);
  const logoInputRef = useRef(null);

  // ── Link import (TikTok/RedNote) state ──────────────────────
  const [linkUrl, setLinkUrl] = useState("");
  const [linkInfo, setLinkInfo] = useState(null); // { title, duration, thumbnail, uploader, platform }
  const [linkChecking, setLinkChecking] = useState(false);
  const [linkError, setLinkError] = useState(null);

  const checkLink = async () => {
    if (!linkUrl.trim()) return;
    setLinkChecking(true);
    setLinkError(null);
    setLinkInfo(null);
    try {
      const res = await fetch(`${RECAP_BACKEND_URL}/api/link/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Link check failed (${res.status})`);
      }
      setLinkInfo(data.info);
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setLinkChecking(false);
    }
  };

  const STAGE_LABELS = {
    queued: "Queued…",
    downloading: "Downloading video from link…",
    transcribing: "Listening to the video…",
    writing_script: "Writing the script…",
    narrating: "Recording the narration…",
    rendering: "Rendering the video…",
  };

  const handleFiles = useCallback((files) => {
    const f = files?.[0];
    if (f && f.type.startsWith("video/")) {
      setFile(f);
      setStage("ready");
    }
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const stopCurrentAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  };

  const previewVoice = async (id) => {
    // Same voice already playing → stop it (toggle off)
    if (playingPreview === id) {
      stopCurrentAudio();
      setPlayingPreview(null);
      return;
    }

    // Switching voices → stop whatever was playing first
    stopCurrentAudio();
    setPlayingPreview(null);
    setPreviewError(null);
    setLoadingPreview(id);

    try {
      const res = await fetch(`${RECAP_BACKEND_URL}/api/preview-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: id }),
      });

      if (!res.ok) {
        throw new Error(`TTS server responded ${res.status}`);
      }

      const data = await res.json();
      const base64 = data.audioBase64;
      if (!base64) throw new Error("Response missing audio data");
      const audioUrl = `data:${data.mimeType || "audio/wav"};base64,${base64}`;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingPreview((p) => (p === id ? null : p));
        stopCurrentAudio();
      };
      audio.onerror = () => {
        setPreviewError(id);
        setPlayingPreview(null);
        stopCurrentAudio();
      };

      await audio.play();
      setLoadingPreview(null);
      setPlayingPreview(id);
    } catch (err) {
      console.error("Voice preview failed:", err);
      setLoadingPreview(null);
      setPlayingPreview(null);
      setPreviewError(id);
      setTimeout(() => setPreviewError((e) => (e === id ? null : e)), 2500);
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const resetEditorState = () => {
    setShowBlurBox(false);
    setBlurBox({ xPct: 8, yPct: 8, wPct: 30, hPct: 12 });
    setShowLogo(false);
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setLogoBox({ xPct: 4, yPct: 4, wPct: 16 });
    setApplyingEdit(false);
    setEditError(null);
    setEditedResultUrl(null);
  };

  const startGenerate = async () => {
    if (mode === "upload") {
      if (!file) return;
      setStage("processing");
      setGenError(null);
      setResultUrl(null);
      setJobId(null);
      resetEditorState();
      setJobStatus("queued");
      setJobProgress(0);

      try {
        const form = new FormData();
        form.append("video", file);
        form.append("voice", voice);
        form.append("tone", tone);

        const res = await fetch(`${RECAP_BACKEND_URL}/api/process`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { jobId: newJobId } = await res.json();
        setJobId(newJobId);

        pollJob(`${RECAP_BACKEND_URL}/api/process/${newJobId}`, `${RECAP_BACKEND_URL}/api/process/${newJobId}/result`);
      } catch (err) {
        setGenError(err.message);
        setStage("error");
      }
      return;
    }

    // mode === "link"
    if (!linkInfo) return;
    setStage("processing");
    setGenError(null);
    setResultUrl(null);
    setJobId(null);
    resetEditorState();
    setJobStatus("downloading");
    setJobProgress(0);

    try {
      const res = await fetch(`${RECAP_BACKEND_URL}/api/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl.trim(), voice, tone, info: linkInfo }),
      });
      if (!res.ok) throw new Error(`Link submit failed (${res.status})`);
      const { jobId: newJobId } = await res.json();
      setJobId(newJobId);

      pollJob(`${RECAP_BACKEND_URL}/api/link/${newJobId}`, `${RECAP_BACKEND_URL}/api/link/${newJobId}/result`);
    } catch (err) {
      setGenError(err.message);
      setStage("error");
    }
  };

  const pollJob = (statusUrl, resultUrlBase) => {
    pollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch(statusUrl);
        if (!statusRes.ok) throw new Error(`Status check failed (${statusRes.status})`);
        const data = await statusRes.json();
        setJobStatus(data.status);
        if (typeof data.progress === "number") setJobProgress(data.progress);

        if (data.status === "error") {
          stopPolling();
          setGenError(data.error || "Something went wrong");
          setStage("error");
        } else if (data.status === "done") {
          stopPolling();
          setResultUrl(resultUrlBase);
          setStage("done");
        }
      } catch (err) {
        stopPolling();
        setGenError(err.message);
        setStage("error");
      }
    }, 2500);
  };

  const activeVoice = VOICES.find((v) => v.id === voice);

  // ── Post-generation editor: drag-to-position blur box / logo ─
  const startDrag = (kind) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const container = previewBoxRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const box = kind === "blur" ? blurBox : logoBox;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startXPct = box.xPct;
    const startYPct = box.yPct;
    const maxYPct = kind === "blur" ? 100 - box.hPct : 96;

    const onMove = (moveEvent) => {
      const dxPct = ((moveEvent.clientX - startClientX) / rect.width) * 100;
      const dyPct = ((moveEvent.clientY - startClientY) / rect.height) * 100;
      const newX = Math.min(100 - box.wPct, Math.max(0, startXPct + dxPct));
      const newY = Math.min(maxYPct, Math.max(0, startYPct + dyPct));
      if (kind === "blur") setBlurBox((b) => ({ ...b, xPct: newX, yPct: newY }));
      else setLogoBox((b) => ({ ...b, xPct: newX, yPct: newY }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startResizeBlur = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const container = previewBoxRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startW = blurBox.wPct;
    const startH = blurBox.hPct;

    const onMove = (moveEvent) => {
      const dwPct = ((moveEvent.clientX - startClientX) / rect.width) * 100;
      const dhPct = ((moveEvent.clientY - startClientY) / rect.height) * 100;
      setBlurBox((b) => ({
        ...b,
        wPct: Math.min(100 - b.xPct, Math.max(8, startW + dwPct)),
        hPct: Math.min(100 - b.yPct, Math.max(6, startH + dhPct)),
      }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleLogoFile = (f) => {
    if (!f) return;
    setLogoFile(f);
    setLogoPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    setShowLogo(true);
  };

  const applyEdits = async () => {
    if (!jobId || (!showBlurBox && !(showLogo && logoFile))) return;
    setApplyingEdit(true);
    setEditError(null);
    try {
      const form = new FormData();
      if (showBlurBox) {
        form.append("blurX", blurBox.xPct);
        form.append("blurY", blurBox.yPct);
        form.append("blurW", blurBox.wPct);
        form.append("blurH", blurBox.hPct);
      }
      if (showLogo && logoFile) {
        form.append("logo", logoFile);
        form.append("logoX", logoBox.xPct);
        form.append("logoY", logoBox.yPct);
        form.append("logoW", logoBox.wPct);
      }
      const res = await fetch(`${RECAP_BACKEND_URL}/api/jobs/${jobId}/edit`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Edit failed (${res.status})`);
      }
      setEditedResultUrl(`${RECAP_BACKEND_URL}/api/jobs/${jobId}/edit-result?t=${Date.now()}`);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setApplyingEdit(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full text-[#F0E6D2]"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% -10%, #2A1518 0%, transparent 60%), #150F0D",
        fontFamily:
          "'Padauk', 'Myanmar Text', 'Noto Sans Myanmar', system-ui, sans-serif",
      }}
    >
      {/* Gold hairline top border, lacquerware nod */}
      <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-[#C9A227] to-transparent opacity-80" />

      <div className="mx-auto max-w-3xl px-6 py-14">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-[#C9A227]/80">
            <Film size={13} strokeWidth={1.5} />
            <span>Coco.EXE — Recap Studio</span>
          </div>
          <h1
            className="mt-4 text-4xl sm:text-5xl leading-[1.15]"
            style={{ fontWeight: 700, letterSpacing: "-0.01em" }}
          >
            Turn Movies Into
            <br />
            <span className="text-[#C9A227]">Recap Stories</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#F0E6D2]/60">
            Upload a video, pick a voice, and Coco.EXE will narrate a recap for you.
          </p>
        </header>

        {/* ── Mode toggle: Upload vs Link ─────────────────── */}
        <div className="mb-4 inline-flex rounded-full border border-[#F0E6D2]/14 p-1">
          <button
            onClick={() => {
              setMode("upload");
              setStage("idle");
              setGenError(null);
              setResultUrl(null);
            }}
            className="rounded-full px-4 py-1.5 text-[13px] transition"
            style={{
              background: mode === "upload" ? "rgba(201,162,39,0.14)" : "transparent",
              color: mode === "upload" ? "#C9A227" : "rgba(240,230,210,0.55)",
            }}
          >
            Upload File
          </button>
          <button
            onClick={() => {
              setMode("link");
              setStage("idle");
              setGenError(null);
              setResultUrl(null);
            }}
            className="rounded-full px-4 py-1.5 text-[13px] transition"
            style={{
              background: mode === "link" ? "rgba(201,162,39,0.14)" : "transparent",
              color: mode === "link" ? "#C9A227" : "rgba(240,230,210,0.55)",
            }}
          >
            Link (TikTok/RedNote)
          </button>
        </div>

        {/* ── Upload zone ─────────────────────────────────── */}
        {mode === "upload" && (
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className="relative overflow-hidden rounded-2xl border transition-colors duration-200"
          style={{
            borderColor: dragActive ? "#C9A227" : "rgba(240,230,210,0.14)",
            background: dragActive
              ? "rgba(201,162,39,0.06)"
              : "rgba(255,255,255,0.02)",
          }}
        >
          {/* sprocket-hole strip, cinema film reference */}
          <div className="absolute left-0 top-0 flex h-full w-6 flex-col items-center justify-evenly opacity-30">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-2.5 w-2.5 rounded-[2px] bg-[#F0E6D2]" />
            ))}
          </div>
          <div className="absolute right-0 top-0 flex h-full w-6 flex-col items-center justify-evenly opacity-30">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-2.5 w-2.5 rounded-[2px] bg-[#F0E6D2]" />
            ))}
          </div>

          <div className="px-10 py-12 sm:px-16">
            {!file ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#C9A227]/40 text-[#C9A227]">
                  <Upload size={22} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[15px] font-medium">
                    Drag and drop your video file
                  </p>
                  <p className="mt-1 text-[13px] text-[#F0E6D2]/45">
                    MP4, MOV — up to 500MB
                  </p>
                </div>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="mt-2 rounded-full border border-[#F0E6D2]/25 px-5 py-2 text-[13px] transition hover:border-[#C9A227] hover:text-[#C9A227]"
                >
                  Choose File
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#C9A227]/12 text-[#C9A227]">
                    <Film size={18} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">
                      {file.name}
                    </p>
                    <p className="text-[12px] text-[#F0E6D2]/45">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB — ready
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setStage("idle");
                  }}
                  className="shrink-0 rounded-full p-2 text-[#F0E6D2]/40 transition hover:bg-white/5 hover:text-[#F0E6D2]"
                  aria-label="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        </section>
        )}

        {/* ── Link import zone ────────────────────────────── */}
        {mode === "link" && (
        <section
          className="relative overflow-hidden rounded-2xl border p-8"
          style={{
            borderColor: "rgba(240,230,210,0.14)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#C9A227]/40 text-[#C9A227]">
              <Link2 size={18} strokeWidth={1.5} />
            </div>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setLinkInfo(null);
                setLinkError(null);
              }}
              placeholder="Paste your link"
              className="min-w-0 flex-1 rounded-lg border border-[#F0E6D2]/18 bg-transparent px-4 py-2.5 text-[14px] outline-none placeholder:text-[#F0E6D2]/35 focus:border-[#C9A227]"
            />
            <button
              onClick={checkLink}
              disabled={!linkUrl.trim() || linkChecking}
              className="shrink-0 rounded-full border border-[#F0E6D2]/25 px-5 py-2.5 text-[13px] transition hover:border-[#C9A227] hover:text-[#C9A227] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {linkChecking ? <Loader2 size={14} className="animate-spin" /> : "Check"}
            </button>
          </div>

          {linkError && (
            <p className="mt-3 text-[13px] text-[#B2452D]">{linkError}</p>
          )}

          {linkInfo && (
            <div className="mt-5 flex items-center gap-4">
              {linkInfo.thumbnail && (
                <img
                  src={linkInfo.thumbnail}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium">{linkInfo.title}</p>
                <p className="mt-0.5 text-[12px] text-[#F0E6D2]/45">
                  {linkInfo.uploader} · {linkInfo.platform} ·{" "}
                  {Math.floor((linkInfo.duration || 0) / 60)}:
                  {String(Math.round((linkInfo.duration || 0) % 60)).padStart(2, "0")}
                </p>
              </div>
              <Check size={18} className="ml-auto shrink-0 text-[#C9A227]" />
            </div>
          )}
        </section>
        )}

        {/* ── Voice selection ─────────────────────────────── */}
        <section className="mt-14">
          <div className="mb-5 flex items-center gap-2">
            <Mic2 size={15} strokeWidth={1.5} className="text-[#C9A227]" />
            <h2 className="text-[13px] uppercase tracking-[0.2em] text-[#F0E6D2]/55">
              Choose a Narrator
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {VOICES.map((v) => {
              const selected = voice === v.id;
              const playing = playingPreview === v.id;
              const loading = loadingPreview === v.id;
              const errored = previewError === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className="group relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-150"
                  style={{
                    borderColor: selected
                      ? v.accent
                      : "rgba(240,230,210,0.12)",
                    background: selected
                      ? `${v.accent}14`
                      : "rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                    style={{
                      background: `${v.accent}22`,
                      color: v.accent,
                    }}
                  >
                    {v.name[0]}
                  </div>

                  <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <span className="shrink-0 text-[13.5px] font-medium">{v.name}</span>
                    <span className="truncate text-[12px] text-[#F0E6D2]/45">
                      {v.desc}
                    </span>
                  </div>

                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-wide"
                    style={{ color: v.accent, background: `${v.accent}18` }}
                  >
                    {v.tag}
                  </span>

                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      previewVoice(v.id);
                    }}
                    role="button"
                    aria-label={errored ? "Preview unavailable" : "Preview voice"}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#F0E6D2]/50 transition hover:text-[#F0E6D2]"
                  >
                    {loading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : errored ? (
                      <AlertCircle size={12} className="text-[#B2452D]" />
                    ) : playing ? (
                      <Pause size={12} />
                    ) : (
                      <Play size={12} />
                    )}
                  </span>

                  {selected && (
                    <span
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ background: v.accent }}
                    >
                      <Check size={11} className="text-[#150F0D]" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Tone selection ──────────────────────────────── */}
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={15} strokeWidth={1.5} className="text-[#C9A227]" />
            <h2 className="text-[13px] uppercase tracking-[0.2em] text-[#F0E6D2]/55">
              Story Tone
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className="rounded-full border px-4 py-2 text-[13px] transition"
                style={{
                  borderColor:
                    tone === t.id ? "#C9A227" : "rgba(240,230,210,0.14)",
                  background:
                    tone === t.id ? "rgba(201,162,39,0.1)" : "transparent",
                  color: tone === t.id ? "#C9A227" : "rgba(240,230,210,0.7)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Generate ─────────────────────────────────────── */}
        <section className="mt-14">
          <button
            disabled={
              (mode === "upload" ? !file : !linkInfo) || stage === "processing"
            }
            onClick={startGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "linear-gradient(90deg, #C9A227, #B2452D)",
              color: "#150F0D",
            }}
          >
            {stage === "processing" ? (
              <>
                <Wand2 size={17} className="animate-pulse" />
                {STAGE_LABELS[jobStatus] || `${activeVoice?.name} is narrating the story…`}
                <span className="ml-1 tabular-nums opacity-80">{jobProgress}%</span>
              </>
            ) : (
              <>
                <Wand2 size={17} />
                Generate Recap
              </>
            )}
          </button>

          {stage === "processing" && (
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.max(jobProgress, 3)}%`,
                  background: "linear-gradient(90deg, #C9A227, #B2452D)",
                }}
              />
            </div>
          )}

          {stage === "error" && (
            <p className="mt-4 text-center text-[13px] text-[#B2452D]">
              Something went wrong: {genError}
            </p>
          )}

          {stage === "done" && resultUrl && (
            <div className="mt-4 space-y-4">
              {/* Video preview with draggable blur box / logo overlay */}
              <div
                ref={previewBoxRef}
                className="relative overflow-hidden rounded-xl border"
                style={{ borderColor: "rgba(240,230,210,0.18)" }}
              >
                <video
                  src={resultUrl}
                  controls
                  className="block w-full"
                  style={{ maxHeight: 420, background: "#000" }}
                />

                {showBlurBox && (
                  <div
                    onMouseDown={startDrag("blur")}
                    className="absolute cursor-move border-2"
                    style={{
                      left: `${blurBox.xPct}%`,
                      top: `${blurBox.yPct}%`,
                      width: `${blurBox.wPct}%`,
                      height: `${blurBox.hPct}%`,
                      borderColor: "#C9A227",
                      background: "rgba(201,162,39,0.18)",
                      backdropFilter: "blur(6px)",
                    }}
                  >
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-[#F0E6D2]">
                      Blur
                    </span>
                    <div
                      onMouseDown={startResizeBlur}
                      className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize rounded-tl bg-[#C9A227]"
                    />
                  </div>
                )}

                {showLogo && logoPreviewUrl && (
                  <img
                    src={logoPreviewUrl}
                    onMouseDown={startDrag("logo")}
                    className="absolute cursor-move select-none"
                    style={{
                      left: `${logoBox.xPct}%`,
                      top: `${logoBox.yPct}%`,
                      width: `${logoBox.wPct}%`,
                    }}
                    draggable={false}
                    alt="Logo overlay"
                  />
                )}
              </div>

              {/* Editor controls */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowBlurBox((s) => !s)}
                  className="rounded-full border px-3.5 py-1.5 text-[12.5px] transition"
                  style={{
                    borderColor: showBlurBox ? "#C9A227" : "rgba(240,230,210,0.2)",
                    color: showBlurBox ? "#C9A227" : "rgba(240,230,210,0.7)",
                    background: showBlurBox ? "rgba(201,162,39,0.1)" : "transparent",
                  }}
                >
                  {showBlurBox ? "Remove Blur Box" : "Add Blur Box"}
                </button>

                {!showLogo || !logoFile ? (
                  <>
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="rounded-full border px-3.5 py-1.5 text-[12.5px] transition hover:border-[#C9A227] hover:text-[#C9A227]"
                      style={{ borderColor: "rgba(240,230,210,0.2)", color: "rgba(240,230,210,0.7)" }}
                    >
                      Add Logo
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoFile(e.target.files?.[0])}
                    />
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setShowLogo(false);
                        setLogoFile(null);
                        setLogoPreviewUrl((old) => {
                          if (old) URL.revokeObjectURL(old);
                          return null;
                        });
                      }}
                      className="rounded-full border px-3.5 py-1.5 text-[12.5px] transition"
                      style={{ borderColor: "#C9A227", color: "#C9A227", background: "rgba(201,162,39,0.1)" }}
                    >
                      Remove Logo
                    </button>
                    <label className="flex items-center gap-2 text-[12px] text-[#F0E6D2]/50">
                      Size
                      <input
                        type="range"
                        min={5}
                        max={40}
                        value={logoBox.wPct}
                        onChange={(e) => setLogoBox((b) => ({ ...b, wPct: Number(e.target.value) }))}
                        className="w-24 accent-[#C9A227]"
                      />
                    </label>
                  </>
                )}

                {(showBlurBox || (showLogo && logoFile)) && (
                  <button
                    onClick={applyEdits}
                    disabled={applyingEdit}
                    className="ml-auto flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-medium transition disabled:opacity-50"
                    style={{ background: "linear-gradient(90deg, #C9A227, #B2452D)", color: "#150F0D" }}
                  >
                    {applyingEdit ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                    {applyingEdit ? "Applying…" : "Apply Edits"}
                  </button>
                )}
              </div>

              {editError && (
                <p className="text-[13px] text-[#B2452D]">Edit failed: {editError}</p>
              )}

              {/* Downloads */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={resultUrl}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-[14px] font-medium transition hover:border-[#C9A227] hover:text-[#C9A227]"
                  style={{ borderColor: "rgba(240,230,210,0.25)" }}
                >
                  <Check size={16} />
                  Download Original
                </a>
                {editedResultUrl && (
                  <a
                    href={editedResultUrl}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-medium transition"
                    style={{ background: "linear-gradient(90deg, #C9A227, #B2452D)", color: "#150F0D" }}
                  >
                    <Check size={16} />
                    Download Edited Video
                  </a>
                )}
              </div>
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-[12px] text-[#F0E6D2]/35">
          {activeVoice?.name} · {TONES.find((t) => t.id === tone)?.label} style will be generated
        </p>
      </div>

      <style>{`
        @keyframes recapBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
