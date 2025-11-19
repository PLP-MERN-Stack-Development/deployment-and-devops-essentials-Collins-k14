
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: String, default: 'Anonymous' },
  senderId: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  isPrivate: { type: Boolean, default: false },
  to: { type: String, default: null }, // if private, this can hold socketId or userId
  reactions: [
    {
      type: { type: String }, 
      user: String, // user who reacted
      timestamp: { type: Date, default: Date.now },
    },
  ],
  readBy: [String], // array of user ids who have read this message (for read receipts)
  room: { type: String, default: 'global' }, 
});

module.exports = mongoose.model('Message', MessageSchema);
