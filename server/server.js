const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// In-memory storage 
const users = {};
const typingUsers = {};
const messages = {
  general: [],
  sports: [],
  tech: [],
};

// Track unread counts per user per room
const unreadCounts = {}; // { socketId: { general: 0, sports: 0, tech: 0 } }

// Socket.io connection 
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Initialize unread counts for this user
  unreadCounts[socket.id] = { general: 0, sports: 0, tech: 0 };

  //  User joins
  socket.on("user_join", (username) => {
    users[socket.id] = { id: socket.id, username };
    io.emit("user_list", Object.values(users));
    io.emit("user_joined", { id: socket.id, username });
    console.log(`${username} joined`);
  });

  // Join room 
  socket.on("join_room", (room) => {
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }
    socket.join(room);
    socket.currentRoom = room;

    // Reset unread count for this room when user joins
    if (unreadCounts[socket.id]) unreadCounts[socket.id][room] = 0;
    // Send updated counts to this user
    socket.emit("unread_counts", unreadCounts[socket.id]);

    console.log(`${users[socket.id]?.username} joined room ${room}`);
  });

  // Send message 
  // This handler supports acknowledgement callback for delivery confirmation.
  socket.on("send_message", ({ message, room }, ack) => {
    const msg = {
      id: Date.now(), // server canonical id
      sender: users[socket.id]?.username || "Anonymous",
      senderId: socket.id,
      message,
      timestamp: new Date().toISOString(),
      isPrivate: false,
      room: room || "general",
    };

    const roomName = room || "general";

    if (!messages[roomName]) messages[roomName] = [];
    messages[roomName].push(msg);

    // Limit stored messages to prevent memory issues
    if (messages[roomName].length > 100) {
      messages[roomName].shift();
    }

    // Emit message to the room
    io.to(roomName).emit("receive_message", msg);

    // Acknowledge delivery to the sender 
    if (typeof ack === "function") {
      ack({ status: "delivered", id: msg.id, timestamp: msg.timestamp });
    }

    // Increment unread counts for all users in the room except sender
    Object.keys(users).forEach((id) => {
      if (id !== socket.id) {
        if (!unreadCounts[id][roomName]) unreadCounts[id][roomName] = 0;
        unreadCounts[id][roomName] += 1;
        io.to(id).emit("unread_counts", unreadCounts[id]);
      }
    });
  });

  //  Private message
  // Also supports acknowledgement callback
  socket.on("private_message", ({ to, message }, ack) => {
    const msg = {
      id: Date.now(),
      sender: users[socket.id]?.username || "Anonymous",
      senderId: socket.id,
      message,
      timestamp: new Date().toISOString(),
      isPrivate: true,
    };

    socket.to(to).emit("private_message", msg);
    socket.emit("private_message", msg);

    // ACK back to sender with delivered status
    if (typeof ack === "function") {
      ack({ status: "delivered", id: msg.id, timestamp: msg.timestamp });
    }
  });
  
  // Typing indicator
  socket.on("typing", (isTyping) => {
    if (users[socket.id]) {
      if (isTyping) typingUsers[socket.id] = users[socket.id].username;
      else delete typingUsers[socket.id];
      io.emit("typing_users", Object.values(typingUsers));
    }
  });

  // Disconnect 
  socket.on("disconnect", () => {
    if (users[socket.id]) {
      io.emit("user_left", { id: socket.id, username: users[socket.id].username });
      console.log(`${users[socket.id].username} disconnected`);
    }
    delete users[socket.id];
    delete typingUsers[socket.id];
    delete unreadCounts[socket.id]; // remove unread tracking
    io.emit("user_list", Object.values(users));
    io.emit("typing_users", Object.values(typingUsers));
  });
});

// API: Get messages with pagination 
app.get("/api/messages", (req, res) => {
  const room = req.query.room || "general";
  const page = parseInt(req.query.page || "0", 10);
  const pageSize = 20;

  const roomMessages = messages[room] || [];
  const start = Math.max(roomMessages.length - (page + 1) * pageSize, 0);
  const end = roomMessages.length - page * pageSize;

  const paginated = roomMessages.slice(start, end);
  res.json(paginated);
});

// API: Search messages (simple text search across message content and sender)
app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  const room = req.query.room || null; // optional room filter

  if (!q) return res.json([]);

  const roomsToSearch = room ? [room] : Object.keys(messages);
  const results = [];

  roomsToSearch.forEach((r) => {
    const roomMessages = messages[r] || [];
    roomMessages.forEach((m) => {
      if (
        (m.message && m.message.toLowerCase().includes(q)) ||
        (m.sender && m.sender.toLowerCase().includes(q))
      ) {
        results.push({ ...m, room: r });
      }
    });
  });

  // return most recent first
  results.sort((a, b) => b.id - a.id);
  res.json(results.slice(0, 100)); // limit results
});

// API: Get users 
app.get("/api/users", (req, res) => {
  res.json(Object.values(users));
});

//  Root 
app.get("/", (req, res) => res.send("Socket.io Chat Server Running"));

// Start server 
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { app, server, io };
