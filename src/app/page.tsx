"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  Zap,
  Lock,
  KeyRound,
  ArrowRight,
  EyeOff,
  Trash2,
  UserCheck,
  Flame,
  Timer,
  CheckCircle2,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [customRoomId, setCustomRoomId] = useState("");
  const [autoDestructMinutes, setAutoDestructMinutes] = useState(30);
  const [isCreating, setIsCreating] = useState(false);

  // Generate a cryptographically pleasant room ID
  const generateRoomId = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      if (i === 4) result += "-";
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    const roomId = customRoomId.trim().toLowerCase() || generateRoomId();
    const hostToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const finalName = userName.trim() || "Host";

    // Store strictly in temporary sessionStorage for this tab only
    sessionStorage.setItem(`room_${roomId}_hostToken`, hostToken);
    sessionStorage.setItem(`room_${roomId}_userName`, finalName);
    sessionStorage.setItem(`room_${roomId}_isHost`, "true");
    sessionStorage.setItem(`room_${roomId}_ttl`, autoDestructMinutes.toString());

    router.push(`/room/${roomId}`);
  };

  return (
    <main className="flex-1 flex flex-col justify-between p-4 sm:p-10 max-w-6xl mx-auto w-full relative">
      {/* Background ambient lighting */}
      <div className="absolute top-10 left-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[128px] pointer-events-none" />

      {/* Header */}
      <header className="flex items-center justify-between py-4 border-b border-neutral-800/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20 ring-1 ring-white/10">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-white">WhisperRoom</h1>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                v2.0 Zero-Trace
              </span>
            </div>
            <p className="text-xs text-neutral-400 hidden sm:block">
              RAM-Only Peer Chat with Knock-to-Enter Admission
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-300 bg-neutral-900/90 border border-neutral-800 px-3.5 py-1.5 rounded-full shadow-inner">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[11px]">Zero DB • Pure RAM</span>
        </div>
      </header>

      {/* Hero & Setup Box */}
      <div className="my-auto py-10 sm:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center z-10">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-neutral-900/80 text-neutral-300 border border-neutral-800 shadow-sm">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Never installs. Never touches disk. Leaves no forensic traces.</span>
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.1]">
            Talk privately in Chrome. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-purple-300 to-indigo-400">
              One link, accept them in, close to vanish forever.
            </span>
          </h2>

          <p className="text-neutral-400 text-base sm:text-lg leading-relaxed max-w-xl">
            No installation, no account, no phone number. Generate a disposable room link,
            approve your guest when they knock on the door, exchange burn-after-read whispers,
            and press <strong>Close Session</strong> to scrub everything from RAM.
          </p>

          {/* Key Feature Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
            <div className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800/80 space-y-2 hover:border-neutral-700 transition">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-neutral-200">Knock Gatekeeper</h3>
              <p className="text-xs text-neutral-400 leading-normal">
                Strangers cannot join. Host must review and explicitly click Accept.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800/80 space-y-2 hover:border-neutral-700 transition">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400">
                <Flame className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-neutral-200">Burn Messages</h3>
              <p className="text-xs text-neutral-400 leading-normal">
                Send self-destructing text that burns away automatically after 10s.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800/80 space-y-2 hover:border-neutral-700 transition">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <EyeOff className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-neutral-200">Zero Storage</h3>
              <p className="text-xs text-neutral-400 leading-normal">
                Strict anti-cache headers. Cleared instantly on tab close or button click.
              </p>
            </div>
          </div>
        </div>

        {/* Action Card */}
        <div className="lg:col-span-5">
          <div className="p-6 sm:p-8 rounded-3xl bg-neutral-900/90 border border-neutral-800/90 shadow-2xl relative overflow-hidden backdrop-blur-xl ring-1 ring-white/5">
            <div className="flex items-center gap-2 mb-6">
              <Zap className="w-5 h-5 text-rose-400" />
              <h3 className="font-semibold text-lg text-white">Create Private Session</h3>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Your Nickname (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alice or Host"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  maxLength={25}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm text-white placeholder-neutral-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Custom Room Code (leave blank for random)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={customRoomId}
                    onChange={(e) => setCustomRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    maxLength={20}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm text-white placeholder-neutral-500 outline-none transition font-mono"
                  />
                  <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-neutral-400" />
                    Auto-Destruct Lifetime
                  </span>
                  <span className="text-neutral-400 font-mono text-[11px]">{autoDestructMinutes} minutes</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 60, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setAutoDestructMinutes(mins)}
                      className={`py-1.5 rounded-lg text-xs font-mono font-medium border transition ${
                        autoDestructMinutes === mins
                          ? "bg-rose-500/20 border-rose-500/60 text-rose-300"
                          : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-indigo-600 hover:from-rose-600 hover:to-indigo-700 text-white text-sm font-semibold shadow-lg shadow-rose-500/25 transition active:scale-[0.99] cursor-pointer disabled:opacity-50"
              >
                <span>Launch Disposable Room</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Knock waiting room active
              </span>
              <span>100% In-Memory RAM</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="pt-6 border-t border-neutral-900 text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-2 z-10">
        <div>WhisperRoom — Ephemeral zero-trace private messaging. No setup, no apps.</div>
        <div className="flex items-center gap-3">
          <span>Self-destruct on tab close</span>
          <span>•</span>
          <span>Zero logs</span>
        </div>
      </footer>
    </main>
  );
}
