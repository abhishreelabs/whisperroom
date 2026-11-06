"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Zap, Lock, KeyRound, ArrowRight, EyeOff, Trash2, UserCheck } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [customRoomId, setCustomRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Generate a random room ID
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

    const roomId = customRoomId.trim() || generateRoomId();
    const hostToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const finalName = userName.trim() || "Host";

    // Store strictly in temporary sessionStorage for this tab only
    sessionStorage.setItem(`room_${roomId}_hostToken`, hostToken);
    sessionStorage.setItem(`room_${roomId}_userName`, finalName);
    sessionStorage.setItem(`room_${roomId}_isHost`, "true");

    router.push(`/room/${roomId}`);
  };

  return (
    <main className="flex-1 flex flex-col justify-between p-6 sm:p-12 max-w-5xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between py-4 border-b border-neutral-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white flex items-center gap-2">
              WhisperRoom
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                Zero-Trace
              </span>
            </h1>
            <p className="text-xs text-neutral-400">Ephemeral peer chat with knock-to-enter access</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900/80 border border-neutral-800 px-3 py-1.5 rounded-full">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          RAM-Only • No Database • No Logs
        </div>
      </header>

      {/* Hero & Setup Box */}
      <div className="my-auto py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-neutral-900 text-neutral-300 border border-neutral-800">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Never installs. Never syncs to cloud. Leaves no disk trace.</span>
          </div>

          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Chat privately in Chrome. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-purple-300 to-indigo-400">
              One link, accept them in, close to erase forever.
            </span>
          </h2>

          <p className="text-neutral-400 text-base leading-relaxed max-w-xl">
            Tired of having to download and install chat apps just for a quick sensitive conversation?
            Create an in-memory session, send the link to your friend, click <strong>Accept</strong> when they knock,
            and press <strong>Close</strong> to vanish every message permanently.
          </p>

          {/* Key Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 space-y-2">
              <UserCheck className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold text-sm text-neutral-200">Knock to Enter</h3>
              <p className="text-xs text-neutral-400 leading-normal">
                Guests wait outside until you inspect their name and click Accept.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 space-y-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              <h3 className="font-semibold text-sm text-neutral-200">Instant Wipe</h3>
              <p className="text-xs text-neutral-400 leading-normal">
                One-click Clear wipes both screens instantly. Close destroys the room.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 space-y-2">
              <EyeOff className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-sm text-neutral-200">Zero Storage</h3>
              <p className="text-xs text-neutral-400 leading-normal">
                Nothing is saved to disk, server DB, cookies, or browser cache.
              </p>
            </div>
          </div>
        </div>

        {/* Action Card */}
        <div className="lg:col-span-5">
          <div className="p-6 sm:p-8 rounded-2xl bg-neutral-900/90 border border-neutral-800 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-2 mb-6">
              <Zap className="w-5 h-5 text-rose-400" />
              <h3 className="font-semibold text-lg text-white">Create a Private Session</h3>
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
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Knock waiting room active
              </span>
              <span>100% Client/RAM ephemeral</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="pt-6 border-t border-neutral-900 text-center text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>WhisperRoom — Ephemeral private messaging without setup or downloads.</div>
        <div>No history stored on disk. Closes with zero trace.</div>
      </footer>
    </main>
  );
}
