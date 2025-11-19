// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { connectDB } = require("./config/db");

// Load env vars
dotenv.config();

// Import Mongoose models
const User = require("./models/User");
const Message = require("./models/Message");

// Connect to MongoDB
connectDB();

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://myichatroom.vercel.app/",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// In-memory typing indicators and unread counts
const typingUsers = {};
const unreadCounts = {}; // { socketId: { general: 0, sports: 0, tech: 0 } }

// Socket.io connection
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Initialize unread counts
  unreadCounts[socket.id] = { general: 0, sports: 0, tech: 0 };

  // User joins
  socket.on("user_join", async (username) => {
    try {
      const user = await User.findOneAndUpdate(
        { username },
        { socketId: socket.id, online: true },
        { upsert: true, new: true }
      );

      // Emit updated user list and joined user
      io.emit("user_list", await User.find({ online: true }));
      io.emit("user_joined", user);
      console.log(`${username} joined`);
    } catch (err) {
      console.error("Error in user_join:", err);
    }
  });

  // Join room
  socket.on("join_room", (room) => {
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }
    socket.join(room);
    socket.currentRoom = room;

    // Reset unread count
    if (unreadCounts[socket.id]) unreadCounts[socket.id][room] = 0;

    // Send updated counts to user
    socket.emit("unread_counts", unreadCounts[socket.id]);

    console.log(`Socket ${socket.id} joined room ${room}`);
  });

  // Send message
  socket.on("send_message", async ({ message, room }, ack) => {
    try {
      const dbUser = await User.findOne({ socketId: socket.id });

      const msg = await Message.create({
        sender: dbUser?.username || "Anonymous",
        senderId: socket.id,
        room: room || "general",
        message,
        isPrivate: false,
      });

      io.to(msg.room).emit("receive_message", msg);

      // Acknowledge delivery
      if (typeof ack === "function") {
        ack({ status: "delivered", id: msg._id, timestamp: msg.timestamp });
      }

      // Update unread counts for other users in the room
      const onlineUsers = await User.find({ online: true });
      onlineUsers.forEach((user) => {
        if (user.socketId !== socket.id) {
          if (!unreadCounts[user.socketId][msg.room]) unreadCounts[user.socketId][msg.room] = 0;
          unreadCounts[user.socketId][msg.room] += 1;
          io.to(user.socketId).emit("unread_counts", unreadCounts[user.socketId]);
        }
      });
    } catch (err) {
      console.error("Error sending message:", err);
      if (typeof ack === "function") {
        ack({ status: "error", error: err.message });
      }
    }
  });

  // Private message
  socket.on("private_message", async ({ to, message }, ack) => {
    try {
      const dbUser = await User.findOne({ socketId: socket.id });
      const msg = await Message.create({
        sender: dbUser?.username || "Anonymous",
        senderId: socket.id,
        message,
        isPrivate: true,
      });

      socket.to(to).emit("private_message", msg);
      socket.emit("private_message", msg);

      if (typeof ack === "function") {
        ack({ status: "delivered", id: msg._id, timestamp: msg.timestamp });
      }
    } catch (err) {
      console.error("Error sending private message:", err);
      if (typeof ack === "function") {
        ack({ status: "error", error: err.message });
      }
    }
  });

  // Typing indicator
  socket.on("typing", async (isTyping) => {
    const dbUser = await User.findOne({ socketId: socket.id });
    if (dbUser) {
      if (isTyping) typingUsers[socket.id] = dbUser.username;
      else delete typingUsers[socket.id];

      io.emit("typing_users", Object.values(typingUsers));
    }
  });

  // Disconnect
  socket.on("disconnect", async () => {
    try {
      await User.findOneAndUpdate(
        { socketId: socket.id },
        { online: false }
      );

      delete typingUsers[socket.id];
      delete unreadCounts[socket.id];

      io.emit("user_list", await User.find({ online: true }));
      io.emit("typing_users", Object.values(typingUsers));
      console.log(`Socket ${socket.id} disconnected`);
    } catch (err) {
      console.error("Error during disconnect:", err);
    }
  });
});

// API: Get messages with pagination
app.get("/api/messages", async (req, res) => {
  try {
    const room = req.query.room || "general";
    const page = parseInt(req.query.page || "0", 10);
    const limit = 20;

    const msgs = await Message.find({ room })
      .sort({ timestamp: -1 })
      .skip(page * limit)
      .limit(limit);

    res.json(msgs.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Search messages
app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q?.trim().toLowerCase();
    const room = req.query.room;

    if (!q) return res.json([]);

    const filter = { message: { $regex: q, $options: "i" } };
    if (room) filter.room = room;

    const results = await Message.find(filter)
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get online users
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({ online: true });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root
app.get("/", (req, res) => res.send("Socket.io Chat Server Running"));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { app, server, io };
