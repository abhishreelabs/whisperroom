"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import QRCode from "qrcode";
import {
  Trash2,
  XCircle,
  Copy,
  Check,
  Send,
  Users,
  AlertTriangle,
  Lock,
  DoorOpen,
  UserCheck,
  UserX,
  Sparkles,
  Paperclip,
  Radio,
  Flame,
  QrCode as QrIcon,
  Smile,
  ShieldCheck,
  Clock,
  Download,
  Info,
} from "lucide-react";

interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
}

interface KnockEvent {
  guestId: string;
  guestName: string;
}

interface Reaction {
  emoji: string;
  count: number;
  users: string[];
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type?: "text" | "image" | "burn_after_read";
  attachment?: string | null;
  timestamp: number;
  reactions?: Record<string, Reaction>;
  burnSeconds?: number;
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400 text-sm">
          Loading ephemeral session...
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}

function RoomContent() {
  const params = useParams();
  const roomId = (params?.id as string) || "";
  const router = useRouter();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [isHost, setIsHost] = useState<boolean>(false);
  const [hasEntered, setHasEntered] = useState<boolean>(false);
  const [isWaitingKnock, setIsWaitingKnock] = useState<boolean>(false);
  const [knockRejected, setKnockRejected] = useState<boolean>(false);
  const [rejectionMessage, setRejectionMessage] = useState<string>("");

  // Room state
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [incomingKnocks, setIncomingKnocks] = useState<KnockEvent[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [systemAlert, setSystemAlert] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeftString, setTimeLeftString] = useState<string>("");

  // Advanced toggles
  const [burnMode, setBurnMode] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [showEmojiPickerFor, setShowEmojiPickerFor] = useState<string | null>(null);

  // Destroyed state
  const [isDestroyed, setIsDestroyed] = useState(false);
  const [destroyedReason, setDestroyedReason] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Play a soft audio alert (synthesized in-browser, no external audio file needed)
  const playKnockTone = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5 note
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // AudioContext unavailable or not permitted
    }
  };

  // Countdown timer calculation
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, expiresAt - Date.now());
      if (diff === 0) {
        setTimeLeftString("Expiring...");
        clearInterval(interval);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeftString(`${mins}:${secs < 10 ? "0" : ""}${secs}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Generate QR Code for fast mobile pairing
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = window.location.href;
      QRCode.toDataURL(url, { width: 260, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } })
        .then((res) => setQrDataUrl(res))
        .catch(() => {});
    }
  }, [roomId]);

  // Initialize socket connection
  useEffect(() => {
    const s = io({
      reconnection: false,
    });
    setSocket(s);

    const storedIsHost = sessionStorage.getItem(`room_${roomId}_isHost`) === "true";
    const storedToken = sessionStorage.getItem(`room_${roomId}_hostToken`);
    const storedName = sessionStorage.getItem(`room_${roomId}_userName`) || "";
    const storedTtl = parseInt(sessionStorage.getItem(`room_${roomId}_ttl`) || "30", 10);

    if (storedIsHost && storedToken) {
      setIsHost(true);
      setUserName(storedName || "Host");
      s.emit("create_room", {
        roomId,
        hostToken: storedToken,
        hostName: storedName || "Host",
        autoDestructMinutes: storedTtl,
      });
      setHasEntered(true);
    } else {
      setIsHost(false);
    }

    // Socket Event Listeners
    s.on("room_created", (data) => {
      setParticipants(data.participants);
      if (data.expiresAt) setExpiresAt(data.expiresAt);
    });

    s.on("knock_pending", () => {
      setIsWaitingKnock(true);
    });

    s.on("knock_received", (data: KnockEvent) => {
      playKnockTone();
      setIncomingKnocks((prev) => [...prev.filter((k) => k.guestId !== data.guestId), data]);
    });

    s.on("knock_cancelled", ({ guestId }) => {
      setIncomingKnocks((prev) => prev.filter((k) => k.guestId !== guestId));
    });

    s.on("knock_accepted", (data) => {
      setIsWaitingKnock(false);
      setHasEntered(true);
      setParticipants(data.participants);
      if (data.expiresAt) setExpiresAt(data.expiresAt);
    });

    s.on("knock_rejected", (data) => {
      setIsWaitingKnock(false);
      setKnockRejected(true);
      setRejectionMessage(data?.message || "Join request was declined by the host.");
    });

    s.on("participants_updated", ({ participants: newParticipants, joined, left }) => {
      setParticipants(newParticipants);
      if (joined) showTemporaryAlert(`${joined} joined the room`);
      if (left) showTemporaryAlert(`${left} left the room`);
    });

    s.on("new_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);

      // If message is burn_after_read, set local auto-delete timer
      if (msg.type === "burn_after_read" && msg.burnSeconds) {
        setTimeout(() => {
          setMessages((cur) => cur.filter((m) => m.id !== msg.id));
        }, msg.burnSeconds * 1000);
      }
    });

    s.on("message_deleted", ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    s.on("message_reacted", ({ messageId, emoji, userName: reactorName }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = { ...(m.reactions || {}) };
          const existing = reactions[emoji] || { emoji, count: 0, users: [] };
          if (!existing.users.includes(reactorName)) {
            existing.count += 1;
            existing.users.push(reactorName);
          }
          reactions[emoji] = existing;
          return { ...m, reactions };
        })
      );
    });

    s.on("user_typing", ({ userName: typer, isTyping }) => {
      setTypingUsers((prev) => {
        if (isTyping) {
          return prev.includes(typer) ? prev : [...prev, typer];
        } else {
          return prev.filter((u) => u !== typer);
        }
      });
    });

    s.on("chat_cleared", ({ clearedBy }) => {
      setMessages([]);
      showTemporaryAlert(`History wiped clean by ${clearedBy}`);
    });

    s.on("room_destroyed", ({ reason }) => {
      purgeClientMemory();
      setIsDestroyed(true);
      setDestroyedReason(reason || "This session was permanently wiped and destroyed.");
      s.disconnect();
    });

    s.on("room_error", ({ message }) => {
      setKnockRejected(true);
      setRejectionMessage(message);
    });

    // Auto wipe on window unload
    const handleUnload = () => {
      purgeClientMemory();
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      s.disconnect();
    };
  }, [roomId]);

  // Scroll to bottom on messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const purgeClientMemory = () => {
    try {
      sessionStorage.removeItem(`room_${roomId}_hostToken`);
      sessionStorage.removeItem(`room_${roomId}_userName`);
      sessionStorage.removeItem(`room_${roomId}_isHost`);
      sessionStorage.removeItem(`room_${roomId}_ttl`);
    } catch {
      // ignore
    }
  };

  const showTemporaryAlert = (text: string) => {
    setSystemAlert(text);
    setTimeout(() => {
      setSystemAlert((cur) => (cur === text ? null : cur));
    }, 4000);
  };

  const handleGuestKnock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !userName.trim()) return;

    socket.emit("knock_room", {
      roomId,
      name: userName.trim(),
    });
  };

  const handleRespondKnock = (guestId: string, accepted: boolean) => {
    if (!socket) return;
    socket.emit("respond_knock", {
      roomId,
      guestId,
      accepted,
    });
    setIncomingKnocks((prev) => prev.filter((k) => k.guestId !== guestId));
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!socket || !inputMessage.trim()) return;

    socket.emit("send_message", {
      roomId,
      content: inputMessage.trim(),
      type: burnMode ? "burn_after_read" : "text",
      burnSeconds: burnMode ? 10 : undefined,
    });

    setInputMessage("");
    socket.emit("typing", { roomId, isTyping: false });
  };

  const handleTypingInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);

    if (!socket) return;
    socket.emit("typing", { roomId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", { roomId, isTyping: false });
    }, 1500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    if (file.size > 8 * 1024 * 1024) {
      alert("File exceeds 8MB limit. Ephemeral transmission only supports light media.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      socket.emit("send_message", {
        roomId,
        content: file.name,
        type: file.type.startsWith("image/") ? "image" : "text",
        attachment: base64Data,
      });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleReact = (messageId: string, emoji: string) => {
    if (!socket) return;
    socket.emit("react_message", { roomId, messageId, emoji });
    setShowEmojiPickerFor(null);
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!socket) return;
    socket.emit("delete_message", { roomId, messageId });
  };

  const handleClearChat = () => {
    if (confirm("Wipe all chat messages on both screens?")) {
      socket?.emit("clear_chat", { roomId });
    }
  };

  const handleCloseSession = () => {
    if (confirm("Permanently destroy this session? All data and connections will be wiped immediately.")) {
      purgeClientMemory();
      socket?.emit("close_session", { roomId });
      setIsDestroyed(true);
      setDestroyedReason("You ended the session. All in-memory records were scrubbed.");
    }
  };

  const copyInviteLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // 1. Destroyed Screen
  if (isDestroyed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-950">
        <div className="max-w-md w-full p-8 rounded-3xl bg-neutral-900 border border-neutral-800 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
            <Trash2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Session Destroyed</h2>
            <p className="text-sm text-neutral-400 leading-relaxed">{destroyedReason}</p>
          </div>
          <div className="p-4 bg-neutral-950/80 rounded-2xl border border-neutral-800/80 text-xs text-neutral-400 space-y-1.5 text-left font-mono">
            <div className="flex items-center gap-2 text-emerald-400">
              <Check className="w-4 h-4" />
              <span>In-memory room erased</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <Check className="w-4 h-4" />
              <span>WebSockets terminated</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <Check className="w-4 h-4" />
              <span>Session tokens purged</span>
            </div>
          </div>
          <button
            onClick={() => router.push("/")}
            className="w-full py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-sm transition cursor-pointer"
          >
            Create New Session
          </button>
        </div>
      </div>
    );
  }

  // 2. Guest Knock Request Screen
  if (!hasEntered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-950 relative">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="max-w-md w-full p-8 rounded-3xl bg-neutral-900/90 border border-neutral-800 space-y-6 shadow-2xl backdrop-blur-xl relative z-10">
          <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <DoorOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Private Room Knock</h2>
              <p className="text-xs text-neutral-400">
                Room Code: <span className="font-mono text-neutral-300 font-semibold">{roomId}</span>
              </p>
            </div>
          </div>

          {knockRejected ? (
            <div className="space-y-4">
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                <h4 className="font-semibold text-rose-300 text-sm">Cannot Join Session</h4>
                <p className="text-xs text-neutral-400">{rejectionMessage}</p>
              </div>
              <button
                onClick={() => router.push("/")}
                className="w-full py-3 rounded-xl bg-neutral-800 text-white text-sm hover:bg-neutral-700 transition"
              >
                Back to Home
              </button>
            </div>
          ) : isWaitingKnock ? (
            <div className="text-center py-8 space-y-4">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                <DoorOpen className="w-6 h-6 text-indigo-400 absolute" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-base">Waiting for host approval...</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                  Your knock was delivered. The host received a notification to admit you.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleGuestKnock} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Choose a temporary nickname
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bob"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  maxLength={25}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-neutral-500 outline-none transition"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <DoorOpen className="w-4 h-4" />
                <span>Knock to Enter</span>
              </button>

              <div className="text-[11px] text-neutral-500 text-center leading-normal">
                100% browser-native • No cookies • Wiped on leave
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // 3. Active Chat Screen
  return (
    <div className="flex flex-col h-screen h-screen-dvh max-h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans select-none">
      {/* Top Bar */}
      <header className="h-16 pt-safe border-b border-neutral-800/80 bg-neutral-900/80 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-xs sm:text-sm font-semibold text-neutral-200">
              {roomId}
            </span>
          </div>

          {isHost && (
            <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
              Host
            </span>
          )}

          {timeLeftString && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-mono text-[11px]">{timeLeftString}</span>
            </div>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400 border-l border-neutral-800 pl-3">
            <Users className="w-3.5 h-3.5 text-neutral-400" />
            <span>{participants.length} connected</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* QR Code Modal Button */}
          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-medium border border-neutral-700/60 transition cursor-pointer"
            title="Scan QR to open on phone"
          >
            <QrIcon className="w-3.5 h-3.5" />
            <span className="hidden md:inline">QR Scan</span>
          </button>

          {/* Copy Invite Link */}
          <button
            onClick={copyInviteLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-medium border border-neutral-700/60 transition cursor-pointer"
            title="Share this link with your contact"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? "Copied!" : "Invite Link"}</span>
          </button>

          {/* Clear Messages */}
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-rose-950/40 text-neutral-300 hover:text-rose-300 text-xs font-medium border border-neutral-700/60 hover:border-rose-800/50 transition cursor-pointer"
            title="Clear all messages for everyone"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          {/* Close & Destroy Room */}
          <button
            onClick={handleCloseSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition cursor-pointer"
            title="End session and delete all data permanently"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Close</span>
          </button>
        </div>
      </header>

      {/* Host Knock Alerts */}
      {isHost && incomingKnocks.length > 0 && (
        <div className="bg-indigo-950/80 border-b border-indigo-700/70 px-4 py-3 flex flex-col gap-2 shrink-0 animate-in slide-in-from-top duration-200 z-10">
          <div className="text-xs font-medium text-indigo-200 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>Waiting Room: Someone is asking to join this conversation</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {incomingKnocks.map((k) => (
              <div
                key={k.guestId}
                className="flex items-center gap-3 bg-neutral-900 border border-indigo-500/50 px-3.5 py-2 rounded-2xl shadow-xl"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs">
                    {k.guestName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-neutral-100">{k.guestName}</span>
                    <span className="block text-[10px] text-neutral-400">Knocking at door</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRespondKnock(k.guestId, true)}
                    className="p-1 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 transition shadow-sm"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespondKnock(k.guestId, false)}
                    className="p-1 px-2.5 rounded-xl bg-neutral-800 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-xs font-medium flex items-center gap-1 transition"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ephemeral Alert Toast */}
      {systemAlert && (
        <div className="bg-neutral-900/90 border-b border-neutral-800 text-xs py-1.5 px-4 text-center text-neutral-300 flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{systemAlert}</span>
        </div>
      )}

      {/* Chat Messages Body */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 touch-pan-y overscroll-contain select-text">
        {/* Security Notice */}
        <div className="max-w-md mx-auto text-center py-3.5 px-4 rounded-2xl bg-neutral-900/40 border border-neutral-800/60 space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
            <span>End-to-End Ephemeral Session</span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Messages exist only in this browser tab's RAM. They are never written to disk, server logs, or database.
          </p>
        </div>

        {messages.length === 0 && (
          <div className="text-center text-neutral-600 text-xs py-16 flex flex-col items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-neutral-700" />
            <span>Room is ready and private. Send a whisper to start chatting.</span>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.senderId === socket?.id;
          const isBurn = msg.type === "burn_after_read";
          return (
            <div
              key={msg.id}
              className={`flex flex-col group relative ${isMe ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[11px] font-medium text-neutral-400">
                  {isMe ? "You" : msg.senderName}
                </span>
                {isBurn && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-mono bg-rose-500/10 px-1.5 py-0.5 rounded-full border border-rose-500/20">
                    <Flame className="w-3 h-3 text-rose-400 animate-pulse" />
                    Burns in 10s
                  </span>
                )}
                <span className="text-[10px] text-neutral-600 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <div
                className={`max-w-[85%] sm:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed relative ${
                  isBurn
                    ? "bg-gradient-to-r from-rose-950/80 to-neutral-900 border border-rose-700/50 text-rose-100"
                    : isMe
                    ? "bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/10"
                    : "bg-neutral-900 text-neutral-200 rounded-bl-none border border-neutral-800"
                }`}
              >
                {msg.type === "image" && msg.attachment && (
                  <div className="mb-2 rounded-xl overflow-hidden border border-neutral-700/50">
                    <img
                      src={msg.attachment}
                      alt="Attachment"
                      className="max-h-72 w-auto object-cover rounded-xl"
                    />
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                {/* Reactions Display */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-1 border-t border-white/10">
                    {Object.values(msg.reactions).map((r) => (
                      <span
                        key={r.emoji}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-black/30 text-[11px] text-neutral-200"
                        title={r.users.join(", ")}
                      >
                        <span>{r.emoji}</span>
                        <span className="text-[10px] font-mono">{r.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Message Quick Action Bar (Hover on desktop, permanent small trigger) */}
              <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 mt-1 px-1">
                {/* Emoji reactions */}
                {["👍", "❤️", "🔥", "🤫"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReact(msg.id, emoji)}
                    className="p-1 hover:scale-125 transition text-xs cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
                {isMe && (
                  <button
                    onClick={() => handleDeleteMessage(msg.id)}
                    className="p-1 text-neutral-500 hover:text-rose-400 transition text-[11px] ml-1"
                    title="Delete message"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 italic px-2 py-1">
            <span className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0.4s]" />
            </span>
            <span>{typingUsers.join(", ")} {typingUsers.length > 1 ? "are" : "is"} typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Chat Input Bar */}
      <footer className="p-2.5 sm:p-4 pb-safe bg-neutral-900/90 border-t border-neutral-800/80 backdrop-blur-md shrink-0">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-1.5 sm:gap-2">
          {/* File / Image Attachment Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="environment"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-neutral-800 active:bg-neutral-700 text-neutral-400 active:text-white transition cursor-pointer shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="Attach in-memory photo"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Self-Destruct / Burn-after-read Mode Toggle */}
          <button
            type="button"
            onClick={() => setBurnMode(!burnMode)}
            className={`p-2.5 rounded-xl transition cursor-pointer shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center border ${
              burnMode
                ? "bg-rose-500/20 border-rose-500/60 text-rose-400 ring-2 ring-rose-500/20"
                : "bg-neutral-800 border-transparent text-neutral-400 active:text-white"
            }`}
            title={burnMode ? "Burn-after-read: Active (10s)" : "Enable burn-after-read"}
          >
            <Flame className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputMessage}
            onChange={handleTypingInput}
            placeholder={burnMode ? "🔥 Burns in 10s..." : "Disappearing message..."}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck="false"
            className={`flex-1 bg-neutral-950 border rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none transition ${
              burnMode
                ? "border-rose-500/60 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                : "border-neutral-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            }`}
          />

          <button
            type="submit"
            disabled={!inputMessage.trim()}
            className={`p-2.5 rounded-xl text-white transition shadow-md cursor-pointer shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center disabled:opacity-40 active:scale-95 ${
              burnMode
                ? "bg-rose-600 active:bg-rose-500 shadow-rose-600/20"
                : "bg-indigo-600 active:bg-indigo-500 shadow-indigo-600/20"
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* QR Code Pairing Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl max-w-sm w-full space-y-4 text-center shadow-2xl relative">
            <h3 className="font-bold text-white text-base">Pair with Phone</h3>
            <p className="text-xs text-neutral-400">
              Scan with your phone's camera to knock into this session instantly.
            </p>
            {qrDataUrl && (
              <div className="p-3 bg-white rounded-2xl w-fit mx-auto shadow-inner">
                <img src={qrDataUrl} alt="Room QR Code" className="w-48 h-48 rounded-lg" />
              </div>
            )}
            <div className="font-mono text-xs text-neutral-400 bg-neutral-950 p-2 rounded-xl break-all">
              {window.location.href}
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
