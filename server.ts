import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
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

export interface RoomState {
  roomId: string;
  hostSocketId: string;
  hostToken: string;
  createdAt: number;
  participants: Map<string, Participant>;
  waitingRoom: Map<string, KnockRequest>;
}

// In-Memory state ONLY (no disk writes, no database)
const rooms = new Map<string, RoomState>();
const socketToRoom = new Map<string, string>();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Zero cache headers to prevent browser caching of sensitive chat pages
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    handle(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    // 1. Host creates a room
    socket.on("create_room", ({ roomId, hostToken, hostName }) => {
      // Clean up previous room if any
      const existingRoomId = socketToRoom.get(socket.id);
      if (existingRoomId) {
        destroyRoom(existingRoomId, "Host started a new room");
      }

      const room: RoomState = {
        roomId,
        hostSocketId: socket.id,
        hostToken,
        createdAt: Date.now(),
        participants: new Map(),
        waitingRoom: new Map(),
      };

      const hostParticipant: Participant = {
        id: socket.id,
        name: hostName || "Host",
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
      });
    });

    // 2. Guest knocks / requests to join
    socket.on("knock_room", ({ roomId, name }) => {
      const room = rooms.get(roomId);
      if (!room) {
        socket.emit("room_error", { message: "This room does not exist or has already been closed." });
        return;
      }

      // Check if user is already in participants
      if (room.participants.has(socket.id)) {
        socket.emit("room_joined", {
          roomId,
          participants: Array.from(room.participants.values()),
          isHost: false,
        });
        return;
      }

      const knockReq: KnockRequest = {
        id: socket.id,
        name: name || `Guest-${socket.id.slice(0, 4)}`,
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

    // 3. Host accepts or rejects knock request
    socket.on("respond_knock", ({ roomId, guestId, accepted }) => {
      const room = rooms.get(roomId);
      if (!room || room.hostSocketId !== socket.id) return;

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
          });
        }

        // Broadcast updated participants to everyone in the room
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
    socket.on("send_message", ({ roomId, content, type, attachment }) => {
      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;

      const sender = room.participants.get(socket.id);
      const msgPayload = {
        id: Math.random().toString(36).slice(2, 11),
        senderId: socket.id,
        senderName: sender?.name || "Anonymous",
        content,
        type: type || "text",
        attachment: attachment || null, // in-memory base64 preview or data
        timestamp: Date.now(),
      };

      // Broadcast to all participants in the room
      io.to(roomId).emit("new_message", msgPayload);
    });

    // 5. Typing indicator
    socket.on("typing", ({ roomId, isTyping }) => {
      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;
      const sender = room.participants.get(socket.id);

      socket.to(roomId).emit("user_typing", {
        userId: socket.id,
        userName: sender?.name || "Anonymous",
        isTyping,
      });
    });

    // 6. CLEAR all chat messages in the room
    socket.on("clear_chat", ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || !room.participants.has(socket.id)) return;
      const initiator = room.participants.get(socket.id);

      // Instruct all clients to immediately wipe their message buffers
      io.to(roomId).emit("chat_cleared", {
        clearedBy: initiator?.name || "A participant",
      });
    });

    // 7. CLOSE session permanently & destroy everything
    socket.on("close_session", ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      // Either host or any authorized participant can trigger destruction if desired
      destroyRoom(roomId, "Session was closed and wiped permanently.");
    });

    // 8. Handle Disconnect
    socket.on("disconnect", () => {
      const roomId = socketToRoom.get(socket.id);
      socketToRoom.delete(socket.id);

      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      // If host disconnected, auto destroy the room after 5 seconds if not reconnected
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

        // If no participants left, purge
        if (room.participants.size === 0) {
          rooms.delete(roomId);
        }
      }
    });

    function destroyRoom(roomId: string, reason: string) {
      const room = rooms.get(roomId);
      if (!room) return;

      // Broadcast room destroyed
      io.to(roomId).emit("room_destroyed", { reason });

      // Disconnect all sockets from room
      for (const [socketId] of room.participants) {
        socketToRoom.delete(socketId);
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
    console.log(`> Ephemeral Chat server ready on http://${hostname}:${port}`);
  });
});
