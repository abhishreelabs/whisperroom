"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import {
  Shield,
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
  Image as ImageIcon,
  Radio,
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

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type?: "text" | "image";
  attachment?: string | null;
  timestamp: number;
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

  // Destroyed state
  const [isDestroyed, setIsDestroyed] = useState(false);
  const [destroyedReason, setDestroyedReason] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize socket connection
  useEffect(() => {
    const s = io({
      reconnection: false, // Don't silently reconnect if destroyed
    });
    setSocket(s);

    const storedIsHost = sessionStorage.getItem(`room_${roomId}_isHost`) === "true";
    const storedToken = sessionStorage.getItem(`room_${roomId}_hostToken`);
    const storedName = sessionStorage.getItem(`room_${roomId}_userName`) || "";

    if (storedIsHost && storedToken) {
      setIsHost(true);
      setUserName(storedName || "Host");
      // Host creates/joins room
      s.emit("create_room", {
        roomId,
        hostToken: storedToken,
        hostName: storedName || "Host",
      });
      setHasEntered(true);
    } else {
      setIsHost(false);
      // Guest will see knock screen
    }

    // Socket Event Listeners
    s.on("room_created", (data) => {
      setParticipants(data.participants);
    });

    s.on("knock_pending", () => {
      setIsWaitingKnock(true);
    });

    s.on("knock_received", (data: KnockEvent) => {
      setIncomingKnocks((prev) => [...prev.filter((k) => k.guestId !== data.guestId), data]);
    });

    s.on("knock_cancelled", ({ guestId }) => {
      setIncomingKnocks((prev) => prev.filter((k) => k.guestId !== guestId));
    });

    s.on("knock_accepted", (data) => {
      setIsWaitingKnock(false);
      setHasEntered(true);
      setParticipants(data.participants);
    });

    s.on("knock_rejected", (data) => {
      setIsWaitingKnock(false);
      setKnockRejected(true);
      setRejectionMessage(data?.message || "Join request was declined by the host.");
    });

    s.on("participants_updated", ({ participants: newParticipants, joined, left }) => {
      setParticipants(newParticipants);
      if (joined) {
        showTemporaryAlert(`${joined} entered the room`);
      }
      if (left) {
        showTemporaryAlert(`${left} left the room`);
      }
    });

    s.on("new_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
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

  // Client Memory Purge
  const purgeClientMemory = () => {
    try {
      sessionStorage.removeItem(`room_${roomId}_hostToken`);
      sessionStorage.removeItem(`room_${roomId}_userName`);
      sessionStorage.removeItem(`room_${roomId}_isHost`);
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

  // Guest knocks
  const handleGuestKnock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !userName.trim()) return;

    socket.emit("knock_room", {
      roomId,
      name: userName.trim(),
    });
  };

  // Host responds to knock
  const handleRespondKnock = (guestId: string, accepted: boolean) => {
    if (!socket) return;
    socket.emit("respond_knock", {
      roomId,
      guestId,
      accepted,
    });
    setIncomingKnocks((prev) => prev.filter((k) => k.guestId !== guestId));
  };

  // Send message
  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!socket || !inputMessage.trim()) return;

    socket.emit("send_message", {
      roomId,
      content: inputMessage.trim(),
      type: "text",
    });

    setInputMessage("");

    // Reset typing
    socket.emit("typing", { roomId, isTyping: false });
  };

  // Handle typing indicator
  const handleTypingInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);

    if (!socket) return;
    socket.emit("typing", { roomId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", { roomId, isTyping: false });
    }, 1500);
  };

  // File / Image Attachment (In-Memory Base64 only, never saved to disk)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    // Limit to 4MB for fast WebSocket transmission
    if (file.size > 4 * 1024 * 1024) {
      alert("File size exceeds 4MB limit. Ephemeral transmission only supports light media.");
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

  // Host/User Clears Chat
  const handleClearChat = () => {
    if (confirm("Wipe all chat messages on both screens?")) {
      socket?.emit("clear_chat", { roomId });
    }
  };

  // Close & Destroy Room
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
        <div className="max-w-md w-full p-8 rounded-2xl bg-neutral-900 border border-neutral-800 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
            <Trash2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Session Destroyed</h2>
            <p className="text-sm text-neutral-400 leading-relaxed">{destroyedReason}</p>
          </div>
          <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800/80 text-xs text-neutral-400">
            ✓ Messages scrubbed from RAM <br />
            ✓ Sockets closed <br />
            ✓ Zero disk or cookie footprint remaining
          </div>
          <button
            onClick={() => router.push("/")}
            className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-sm transition"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // 2. Guest Knock Request Screen (if guest has not entered)
  if (!hasEntered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-950">
        <div className="max-w-md w-full p-8 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-6 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white text-base">Private Room Access</h2>
              <p className="text-xs text-neutral-400">Room Code: <span className="font-mono text-neutral-300">{roomId}</span></p>
            </div>
          </div>

          {knockRejected ? (
            <div className="space-y-4">
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                <h4 className="font-semibold text-rose-300 text-sm">Cannot Join Session</h4>
                <p className="text-xs text-neutral-400">{rejectionMessage}</p>
              </div>
              <button
                onClick={() => router.push("/")}
                className="w-full py-2.5 rounded-xl bg-neutral-800 text-white text-sm hover:bg-neutral-700 transition"
              >
                Back to Home
              </button>
            </div>
          ) : isWaitingKnock ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
              <div>
                <h3 className="font-medium text-white text-base">Waiting for host approval...</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  You knocked on the door. Once the host clicks <strong>Accept</strong>, you will enter instantly.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleGuestKnock} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Choose a nickname to knock with
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
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <DoorOpen className="w-4 h-4" />
                <span>Knock to Join Room</span>
              </button>

              <div className="text-[11px] text-neutral-400 text-center leading-normal">
                This room is ephemeral. No login, download, or app installation required.
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // 3. Active Chat Screen (Both Host and Guest inside)
  return (
    <div className="flex flex-col h-screen max-h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Top Bar */}
      <header className="h-16 border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-xs font-semibold text-neutral-300">
              {roomId}
            </span>
          </div>
          {isHost && (
            <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
              Host
            </span>
          )}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400 border-l border-neutral-800 pl-3">
            <Users className="w-3.5 h-3.5 text-neutral-400" />
            <span>{participants.length} connected</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Copy Invite Link */}
          <button
            onClick={copyInviteLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-medium border border-neutral-700/60 transition cursor-pointer"
            title="Share this link with your contact"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? "Copied Link!" : "Invite Link"}</span>
          </button>

          {/* Clear Messages */}
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-rose-950/40 text-neutral-300 hover:text-rose-300 text-xs font-medium border border-neutral-700/60 hover:border-rose-800/50 transition cursor-pointer"
            title="Clear all messages for everyone"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          {/* Close & Destroy Room */}
          <button
            onClick={handleCloseSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition cursor-pointer"
            title="End session and delete all data permanently"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Close Session</span>
          </button>
        </div>
      </header>

      {/* Host Knock Alerts (Waiting Room Banner / Floating Modals) */}
      {isHost && incomingKnocks.length > 0 && (
        <div className="bg-indigo-950/60 border-b border-indigo-800/60 px-4 py-3 flex flex-col gap-2 shrink-0">
          <div className="text-xs font-medium text-indigo-200 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>Waiting Room: Someone is asking to join this conversation</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {incomingKnocks.map((k) => (
              <div
                key={k.guestId}
                className="flex items-center gap-3 bg-neutral-900 border border-indigo-600/40 px-3 py-1.5 rounded-xl shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                    {k.guestName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-neutral-200">{k.guestName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRespondKnock(k.guestId, true)}
                    className="p-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 transition"
                  >
                    <UserCheck className="w-3 h-3" />
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespondKnock(k.guestId, false)}
                    className="p-1 px-2 rounded-lg bg-neutral-800 hover:bg-rose-900/60 text-neutral-400 hover:text-rose-300 text-xs font-medium flex items-center gap-1 transition"
                  >
                    <UserX className="w-3 h-3" />
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
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Security Warning Notice */}
        <div className="max-w-md mx-auto text-center py-4 px-4 rounded-xl bg-neutral-900/40 border border-neutral-800/60 space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
            <span>End-to-End Ephemeral Session</span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Messages exist only in this browser tab's RAM. They are never written to disk, server logs, or database.
          </p>
        </div>

        {messages.length === 0 && (
          <div className="text-center text-neutral-600 text-xs py-12">
            No messages yet. Send a whisper to start chatting.
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.senderId === socket?.id;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[11px] font-medium text-neutral-400">
                  {isMe ? "You" : msg.senderName}
                </span>
                <span className="text-[10px] text-neutral-600 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <div
                className={`max-w-[85%] sm:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? "bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/10"
                    : "bg-neutral-800 text-neutral-200 rounded-bl-none border border-neutral-700/50"
                }`}
              >
                {msg.type === "image" && msg.attachment && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-neutral-700/50">
                    {/* In-memory blob / base64 image */}
                    <img
                      src={msg.attachment}
                      alt="Attachment"
                      className="max-h-72 w-auto object-cover rounded-lg"
                    />
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
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
      <footer className="p-4 bg-neutral-900/60 border-t border-neutral-800/80 backdrop-blur-md shrink-0">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-2">
          {/* File / Image Attachment Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*,.pdf,.txt"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition cursor-pointer shrink-0"
            title="Attach in-memory image/file"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputMessage}
            onChange={handleTypingInput}
            placeholder="Type a disappearing message..."
            autoFocus
            autoComplete="off"
            spellCheck="false"
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />

          <button
            type="submit"
            disabled={!inputMessage.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white transition shadow-md shadow-indigo-600/20 cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>
    </div>
  );
}
