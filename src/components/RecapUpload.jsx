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
    name: "ဆရာမကြီး",
    tag: "Warm Elder",
    desc: "နှေးညောင်း၊ လေးနက်တဲ့ ပုံပြင်ဆရာမ အသံ",
    accent: "#C9A227",
  },
  {
    id: "kolay",
    name: "ကိုလေး",
    tag: "Energetic",
    desc: "သွက်လက်၊ လူငယ်ဆန်တဲ့ commentary အသံ",
    accent: "#B2452D",
  },
  {
    id: "mahmyaing",
    name: "မမြိုင်",
    tag: "Gentle Narrator",
    desc: "ညင်သာ၊ ခံစားစေတဲ့ ဇာတ်ကြောင်းပြော အသံ",
    accent: "#7A6A9C",
  },
  {
    id: "bogyi",
    name: "ဘိုကြီး",
    tag: "Deep Suspense",
    desc: "နက်ရှိုင်း၊ တင်းမာတဲ့ thriller အသံ",
    accent: "#2E5C4E",
  },
  {
    id: "yamin",
    name: "ရာမင်း",
    tag: "Confident",
    desc: "ခိုင်မာ၊ ယုံကြည်စိတ်ချရတဲ့ female narrator အသံ",
    accent: "#8C3B5E",
  },
  {
    id: "koaung",
    name: "ကိုအောင်",
    tag: "Action",
    desc: "စိတ်လှုပ်ရှားဖွယ်၊ တက်ကြွတဲ့ action commentary အသံ",
    accent: "#B5651D",
  },
  {
    id: "koko",
    name: "ကိုကို",
    tag: "News Anchor",
    desc: "ရှင်းလင်း၊ informative သတင်းဆရာဆန်တဲ့ အသံ",
    accent: "#3C6E8F",
  },
  {
    id: "maley",
    name: "မလေး",
    tag: "Youthful",
    desc: "ငယ်ရွယ်၊ သွက်လက်တက်ကြွတဲ့ female voice အသံ",
    accent: "#A0527A",
  },
];

const TONES = [
  { id: "suspense", label: "တင်းမာဖွယ်" },
  { id: "comedy", label: "ရယ်စရာ" },
  { id: "emotional", label: "ခံစားချက်" },
  { id: "epic", label: "ဒရာမာကြီး" },
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
  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const pollRef = useRef(null);

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
        throw new Error(data.error || `Link စစ်ဆေးမှု မအောင်မြင်ပါ (${res.status})`);
      }
      setLinkInfo(data.info);
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setLinkChecking(false);
    }
  };

  const STAGE_LABELS = {
    queued: "တန်းစီနေပါတယ်…",
    downloading: "Link ကနေ ဗီဒီယို ဒေါင်းလုဒ်ဆွဲနေပါတယ်…",
    transcribing: "ဗီဒီယိုထဲက စကားလုံးတွေ နားထောင်နေပါတယ်…",
    writing_script: "ဇာတ်ကြောင်း ရေးနေပါတယ်…",
    narrating: `${""}အသံသွင်းနေပါတယ်…`,
    rendering: "ဗီဒီယို ပြင်ဆင်နေပါတယ်…",
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
      if (!base64) throw new Error("Response ဆီမှာ audio data မပါဘူး");
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

  const startGenerate = async () => {
    if (mode === "upload") {
      if (!file) return;
      setStage("processing");
      setGenError(null);
      setResultUrl(null);
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
        const { jobId } = await res.json();

        pollJob(`${RECAP_BACKEND_URL}/api/process/${jobId}`, `${RECAP_BACKEND_URL}/api/process/${jobId}/result`);
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
    setJobStatus("downloading");
    setJobProgress(0);

    try {
      const res = await fetch(`${RECAP_BACKEND_URL}/api/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl.trim(), voice, tone, info: linkInfo }),
      });
      if (!res.ok) throw new Error(`Link submit failed (${res.status})`);
      const { jobId } = await res.json();

      pollJob(`${RECAP_BACKEND_URL}/api/link/${jobId}`, `${RECAP_BACKEND_URL}/api/link/${jobId}/result`);
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
          setGenError(data.error || "အမှားတစ်ခုခု ဖြစ်သွားပါတယ်");
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
            ရုပ်ရှင်ကို ဇာတ်လမ်းအဖြစ်
            <br />
            <span className="text-[#C9A227]">ပြန်ပြောကြရအောင်</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#F0E6D2]/60">
            ဗီဒီယိုတစ်ခု တင်ပါ၊ အသံရွေးပါ၊ Coco.EXE က မြန်မာလို ဇာတ်ကြောင်းပြန်ပြောပေးပါလိမ့်မယ်။
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
            ဖိုင် Upload
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
                    ဗီဒီယို ဖိုင်ကို ဆွဲချထည့်ပါ
                  </p>
                  <p className="mt-1 text-[13px] text-[#F0E6D2]/45">
                    MP4, MOV — အများဆုံး 500MB
                  </p>
                </div>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="mt-2 rounded-full border border-[#F0E6D2]/25 px-5 py-2 text-[13px] transition hover:border-[#C9A227] hover:text-[#C9A227]"
                >
                  ဖိုင်ရွေးပါ
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
                      {(file.size / (1024 * 1024)).toFixed(1)} MB — အသင့်ဖြစ်ပါပြီ
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setStage("idle");
                  }}
                  className="shrink-0 rounded-full p-2 text-[#F0E6D2]/40 transition hover:bg-white/5 hover:text-[#F0E6D2]"
                  aria-label="ဖိုင်ဖယ်ရှားရန်"
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
              placeholder="Link ကို ကူးထည့်ပါ"
              className="min-w-0 flex-1 rounded-lg border border-[#F0E6D2]/18 bg-transparent px-4 py-2.5 text-[14px] outline-none placeholder:text-[#F0E6D2]/35 focus:border-[#C9A227]"
            />
            <button
              onClick={checkLink}
              disabled={!linkUrl.trim() || linkChecking}
              className="shrink-0 rounded-full border border-[#F0E6D2]/25 px-5 py-2.5 text-[13px] transition hover:border-[#C9A227] hover:text-[#C9A227] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {linkChecking ? <Loader2 size={14} className="animate-spin" /> : "စစ်ဆေးမယ်"}
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
              ဇာတ်ကြောင်းပြောသူ ရွေးပါ
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {VOICES.map((v) => {
              const selected = voice === v.id;
              const playing = playingPreview === v.id;
              const loading = loadingPreview === v.id;
              const errored = previewError === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className="group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150"
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
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                    style={{
                      background: `${v.accent}22`,
                      color: v.accent,
                    }}
                  >
                    {v.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-medium">{v.name}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                        style={{ color: v.accent, background: `${v.accent}18` }}
                      >
                        {v.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-snug text-[#F0E6D2]/50">
                      {v.desc}
                    </p>
                  </div>

                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      previewVoice(v.id);
                    }}
                    role="button"
                    aria-label={errored ? "အသံနမူနာ တင်၍မရပါ" : "အသံနမူနာ နားထောင်ရန်"}
                    className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-[#F0E6D2]/50 transition hover:text-[#F0E6D2]"
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
              ဇာတ်လမ်း အနှစ်သာရ
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
                {STAGE_LABELS[jobStatus] || `${activeVoice?.name} က ဇာတ်ကြောင်းပြောနေပါပြီ…`}
                <span className="ml-1 tabular-nums opacity-80">{jobProgress}%</span>
              </>
            ) : (
              <>
                <Wand2 size={17} />
                ဇာတ်ကြောင်း ပြန်ပြောပေးပါ
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
              အမှားတစ်ခုခု ဖြစ်သွားပါတယ်: {genError}
            </p>
          )}

          {stage === "done" && resultUrl && (
            <a
              href={resultUrl}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-[14px] font-medium transition hover:border-[#C9A227] hover:text-[#C9A227]"
              style={{ borderColor: "rgba(240,230,210,0.25)" }}
            >
              <Check size={16} />
              Recap ဗီဒီယို ဒေါင်းလုဒ်ဆွဲရန်
            </a>
          )}
        </section>

        <p className="mt-6 text-center text-[12px] text-[#F0E6D2]/35">
          {activeVoice?.name} · {TONES.find((t) => t.id === tone)?.label} အသွင်ဖြင့် ပြင်ဆင်မည်
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
