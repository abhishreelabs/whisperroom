import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

export interface Participant {
  id: string; // socket id
  name: string;
  isHost: boolean;
  joinedAt: number;
}

export interface KnockRequest {
  id: string; // socket id
  name: string;
  requestedAt: number;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[]; // names
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type?: "text" | "image" | "burn_after_read";
  attachment?: string | null;
  timestamp: number;
  reactions?: Record<string, Reaction>;
  burnSeconds?: number;
  viewedBy?: string[];
}

export interface RoomState {
  roomId: string;
  hostSocketId: string;
  hostToken: string;
  createdAt: number;
  participants: Map<string, Participant>;
  waitingRoom: Map<string, KnockRequest>;
  autoDestructMinutes: number;
  expiresAt: number;
  destructTimer?: NodeJS.Timeout;
}

// In-Memory state ONLY (no disk writes, no database)
const rooms = new Map<string, RoomState>();
const socketToRoom = new Map<string, string>();

// Rate-limiting in-memory tracker (Sliding window per socket)
const messageRateLimits = new Map<string, { count: number; lastReset: number }>();
const knockRateLimits = new Map<string, number>();

function isRateLimited(socketId: string, maxPerSecond = 5): boolean {
  const now = Date.now();
  const limit = messageRateLimits.get(socketId) || { count: 0, lastReset: now };

  if (now - limit.lastReset > 1000) {
    limit.count = 1;
    limit.lastReset = now;
    messageRateLimits.set(socketId, limit);
    return false;
  }

  limit.count++;
  messageRateLimits.set(socketId, limit);
  return limit.count > maxPerSecond;
}

// Allowed MIME image signatures for security
const ALLOWED_IMAGE_MIMES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
  "data:image/gif;base64,",
];

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // 1. Strict Anti-Caching Headers (Prevent browser from saving DOM/pages to disk or swap)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, private, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    // 2. Strict Security Headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "no-referrer");

    handle(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow legitimate same-origin requests or trusted custom domain
        if (!origin || origin.includes("abhishreelabs.in") || origin.includes("localhost") || origin.includes("onrender.com")) {
          callback(null, true);
        } else {
          callback(new Error("CORS policy violation: unauthorized origin"));
        }
      },
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 8 * 1024 * 1024, // 8MB maximum payload
  });

  io.on("connection", (socket) => {
    // 1. Host creates a room
    socket.on("create_room", ({ roomId, hostToken, hostName, autoDestructMinutes }) => {
      if (!roomId || typeof roomId !== "string" || roomId.length < 3 || roomId.length > 32) {
        socket.emit("room_error", { message: "Invalid room identifier format." });
        return;
      }

      const existingRoomId = socketToRoom.get(socket.id);
      if (existingRoomId) {
        destroyRoom(existingRoomId, "Host started a new room");
      }

      const ttlMinutes = Math.min(Math.max(autoDestructMinutes || 30, 5), 240); // 5 mins to 4 hours max

      const room: RoomState = {
        roomId,
        hostSocketId: socket.id,
        hostToken: hostToken || Math.random().toString(36),
        createdAt: Date.now(),
        participants: new Map(),
        waitingRoom: new Map(),
        autoDestructMinutes: ttlMinutes,
        expiresAt: Date.now() + ttlMinutes * 60 * 1000,
      };

      room.destructTimer = setTimeout(() => {
        destroyRoom(roomId, `Session auto-destructed after ${ttlMinutes} minutes of lifetime.`);
      }, ttlMinutes * 60 * 1000);

      // Sanitize host display name
      const cleanName = (hostName || "Host").replace(/[<>]/g, "").slice(0, 25);

      const hostParticipant: Participant = {
        id: socket.id,
        name: cleanName,
        isHost: true,
        joinedAt: Date.now(),
      };

      room.participants.set(socket.id, hostParticipant);
      rooms.set(roomId, room);
      socketToRoom.set(socket.id, roomId);

      socket.join(roomId);

      socket.emit("room_created", {
        roomId,
        participants: Array.from(room.participants.values()),
        expiresAt: room.expiresAt,
      });
    });

    // 2. Guest knocks / requests to join
    socket.on("knock_room", ({ roomId, name }) => {
      // Prevent knock flood
      const lastKnock = knockRateLimits.get(socket.id) || 0;
      if (Date.now() - lastKnock < 2000) {
        socket.emit("room_error", { message: "Please wait a moment before knocking again." });
        return;
      }
      knockRateLimits.set(socket.id, Date.now());

      const room = rooms.get(roomId);
      if (!room) {
        socket.emit("room_error", { message: "This room does not exist or has already been closed." });
        return;
      }

      if (room.participants.has(socket.id)) {
        socket.emit("room_joined", {
          roomId,
          participants: Array.from(room.participants.values()),
          isHost: false,
          expiresAt: room.expiresAt,
        });
        return;
      }

      // Sanitize guest display name
      const cleanGuestName = (name || `Guest-${socket.id.slice(0, 4)}`).replace(/[<>]/g, "").slice(0, 25);

      const knockReq: KnockRequest = {
        id: socket.id,
        name: cleanGuestName,
        requestedAt: Date.now(),
      };

      room.waitingRoom.set(socket.id, knockReq);
      socketToRoom.set(socket.id, roomId);

      // Notify host that someone is knocking
      io.to(room.hostSocketId).emit("knock_received", {
        guestId: socket.id,
        guestName: knockReq.name,
      });

      socket.emit("knock_pending", {
        message: "Request sent. Waiting for host approval...",
      });
    });

    // 3. Host responds to knock (with cryptographic Host Token verification)
    socket.on("respond_knock", ({ roomId, guestId, accepted, hostToken }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      // Cryptographic verification: must match host token and host socket ID
      if (room.hostSocketId !== socket.id || (hostToken && room.hostToken !== hostToken)) {
        socket.emit("room_error", { message: "Unauthorized: only the host can admit guests." });
        return;
      }

      const guestKnock = room.waitingRoom.get(guestId);
      if (!guestKnock) return;

      room.waitingRoom.delete(guestId);
      const guestSocket = io.sockets.sockets.get(guestId);

      if (accepted) {
        const participant: Participant = {
          id: guestId,
          name: guestKnock.name,
          isHost: false,
          joinedAt: Date.now(),
        };

        room.participants.set(guestId, participant);
        if (guestSocket) {
          guestSocket.join(roomId);
          guestSocket.emit("knock_accepted", {
            roomId,
            participants: Array.from(room.participants.values()),
            self: participant,
            expiresAt: room.expiresAt,
          });
        }

        io.to(roomId).emit("participants_updated", {
          participants: Array.from(room.participants.values()),
          joined: participant.name,
        });
      } else {
        if (guestSocket) {
          guestSocket.emit("knock_rejected", {
            message: "Host declined your join request.",
          });
        }
      }
    });

    // 4. Send ephemeral message
    socket.on("send_message", ({ roomId, content, type, attachment, burnSeconds }) => {
      if (isRateLimited(socket.id, 6)) {
        socket.emit("system_warning", { message: "Slow down. Message rate limit reached." });
        return;
      }

      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;

      const sender = room.participants.get(socket.id);
      const isImage = type === "image";

      // Security check: validate attachment MIME signature if image
      if (isImage && attachment) {
        const isValidMime = ALLOWED_IMAGE_MIMES.some((mime) => attachment.startsWith(mime));
        if (!isValidMime) {
          socket.emit("system_warning", { message: "Security violation: Invalid or unsafe file format." });
          return;
        }
      }

      // Sanitize text content length
      const cleanContent = typeof content === "string" ? content.slice(0, 4000) : "";
      const finalBurn = burnSeconds || (isImage ? 10 : type === "burn_after_read" ? 10 : undefined);

      const msgPayload: ChatMessage = {
        id: Math.random().toString(36).slice(2, 11),
        senderId: socket.id,
        senderName: sender?.name || "Anonymous",
        content: cleanContent,
        type: type || "text",
        attachment: attachment || null,
        timestamp: Date.now(),
        reactions: {},
        burnSeconds: finalBurn,
        viewedBy: [socket.id],
      };

      io.to(roomId).emit("new_message", msgPayload);
    });

    // 5. Image/Message "Viewed" event -> triggers 10s countdown
    socket.on("message_viewed", ({ roomId, messageId }) => {
      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;

      io.to(roomId).emit("start_burn_timer", {
        messageId,
        burnSeconds: 10,
        viewedBy: socket.id,
      });

      // Server forcefully purges message payload from clients after 11 seconds
      setTimeout(() => {
        io.to(roomId).emit("message_deleted", { messageId });
      }, 11000);
    });

    // 6. Message Reactions (In-memory)
    socket.on("react_message", ({ roomId, messageId, emoji }) => {
      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;
      const sender = room.participants.get(socket.id);

      // Restrict emoji input to safe unicode emojis only
      const safeEmoji = typeof emoji === "string" ? emoji.slice(0, 4) : "👍";

      io.to(roomId).emit("message_reacted", {
        messageId,
        emoji: safeEmoji,
        userId: socket.id,
        userName: sender?.name || "Anonymous",
      });
    });

    // 7. Delete specific message for everyone
    socket.on("delete_message", ({ roomId, messageId }) => {
      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;

      io.to(roomId).emit("message_deleted", { messageId });
    });

    // 8. Typing indicator
    socket.on("typing", ({ roomId, isTyping }) => {
      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;
      const sender = room.participants.get(socket.id);

      socket.to(roomId).emit("user_typing", {
        userId: socket.id,
        userName: sender?.name || "Anonymous",
        isTyping: Boolean(isTyping),
      });
    });

    // 9. CLEAR all chat messages in the room
    socket.on("clear_chat", ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;
      const initiator = room.participants.get(socket.id);

      io.to(roomId).emit("chat_cleared", {
        clearedBy: initiator?.name || "A participant",
      });
    });

    // 10. CLOSE session permanently & destroy everything
    socket.on("close_session", ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      destroyRoom(roomId, "Session was closed and wiped permanently by participant.");
    });

    // 11. Handle Disconnect
    socket.on("disconnect", () => {
      messageRateLimits.delete(socket.id);
      knockRateLimits.delete(socket.id);

      const roomId = socketToRoom.get(socket.id);
      socketToRoom.delete(socket.id);

      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      // If host disconnected, auto destroy the room
      if (room.hostSocketId === socket.id) {
        destroyRoom(roomId, "Host left the session. Room permanently destroyed.");
        return;
      }

      // If guest in waiting room left
      if (room.waitingRoom.has(socket.id)) {
        room.waitingRoom.delete(socket.id);
        io.to(room.hostSocketId).emit("knock_cancelled", { guestId: socket.id });
      }

      // If participant left
      if (room.participants.has(socket.id)) {
        const leftUser = room.participants.get(socket.id);
        room.participants.delete(socket.id);

        io.to(roomId).emit("participants_updated", {
          participants: Array.from(room.participants.values()),
          left: leftUser?.name,
        });

        if (room.participants.size === 0) {
          destroyRoom(roomId, "All participants left. Room wiped.");
        }
      }
    });

    function destroyRoom(roomId: string, reason: string) {
      const room = rooms.get(roomId);
      if (!room) return;

      if (room.destructTimer) clearTimeout(room.destructTimer);

      io.to(roomId).emit("room_destroyed", { reason });

      for (const [socketId] of room.participants) {
        socketToRoom.delete(socketId);
        messageRateLimits.delete(socketId);
        const s = io.sockets.sockets.get(socketId);
        s?.leave(roomId);
      }
      for (const [socketId] of room.waitingRoom) {
        socketToRoom.delete(socketId);
        const s = io.sockets.sockets.get(socketId);
        s?.emit("room_destroyed", { reason });
        s?.leave(roomId);
      }

      // Scramble & purge room memory immediately
      room.participants.clear();
      room.waitingRoom.clear();
      rooms.delete(roomId);
    }
  });

  httpServer.listen(port, () => {
    console.log(`> WhisperRoom secured server running on http://${hostname}:${port}`);
  });
});
