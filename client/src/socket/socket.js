// socket.js - Socket.io client setup

import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';

// Socket.io connection URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Create socket instance
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Custom hook for using socket.io
export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastMessage, setLastMessage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  // Track unread messages per room
  const [unreadCounts, setUnreadCounts] = useState({ general: 0, sports: 0, tech: 0 });

  // Track reconnection state
  const [reconnecting, setReconnecting] = useState(false);

  // Connect to socket server
  const connect = (username) => {
    socket.connect();
    if (username) {
      socket.emit('user_join', username);
    }
  };

  // Disconnect from socket server
  const disconnect = () => {
    socket.disconnect();
  };

  // Send a message (uses server ACK to mark delivered)
  const sendMessage = ({ message, room }) => {
    const tempId = `tmp-${Date.now()}`;
    const msg = {
      id: tempId,
      message,
      room,
      sender: "You",
      timestamp: new Date().toISOString(),
      isPrivate: false,
      delivered: false,
    };

    // Add to local state immediately
    setMessages((prev) => [...prev, msg]);

    // Emit to server with acknowledgement callback
    socket.emit("send_message", { message, room }, (ack) => {
      if (ack && ack.status === "delivered") {
        // Update the temp message to mark delivered and set real id
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, delivered: true, id: ack.id, timestamp: ack.timestamp } : m
          )
        );
      }
    });
  };

  // Send a private message (uses ACK)
  const sendPrivateMessage = (to, message) => {
    const tempId = `tmp-${Date.now()}`;
    const msg = {
      id: tempId,
      message,
      sender: "You",
      timestamp: new Date().toISOString(),
      isPrivate: true,
      delivered: false,
      to,
    };
    socket.emit('private_message', { to, message }, (ack) => {
      if (ack && ack.status === "delivered") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, delivered: true, id: ack.id, timestamp: ack.timestamp } : m
          )
        );
      }
    });
    setMessages((prev) => [...prev, msg]);
  };

  // Set typing status
  const setTyping = (isTyping) => {
    socket.emit('typing', isTyping);
  };

  // Socket event listeners
  useEffect(() => {
    // Connection events
    const onConnect = () => {
      setIsConnected(true);
      setReconnecting(false);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onReconnectAttempt = () => {
      setReconnecting(true);
    };

    const onReconnect = () => {
      setReconnecting(false);
    };

    const onReconnectError = () => {
      setReconnecting(true);
    };

    // Message events
    const onReceiveMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    const onPrivateMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    // Unread counts sent by server
    const onUnreadCounts = (counts) => {
      setUnreadCounts(counts || {});
    };

    // User events
    const onUserList = (userList) => {
      setUsers(userList);
    };

    const onUserJoined = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} joined the chat`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    const onUserLeft = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} left the chat`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    // Typing events
    const onTypingUsers = (users) => {
      setTypingUsers(users);
    };

    // Register event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('reconnect', onReconnect);
    socket.on('reconnect_error', onReconnectError);

    socket.on('receive_message', onReceiveMessage);
    socket.on('private_message', onPrivateMessage);
    socket.on('unread_counts', onUnreadCounts);

    socket.on('user_list', onUserList);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('typing_users', onTypingUsers);

    // Clean up event listeners
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect_attempt', onReconnectAttempt);
      socket.off('reconnect', onReconnect);
      socket.off('reconnect_error', onReconnectError);

      socket.off('receive_message', onReceiveMessage);
      socket.off('private_message', onPrivateMessage);
      socket.off('unread_counts', onUnreadCounts);

      socket.off('user_list', onUserList);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('typing_users', onTypingUsers);
    };
  }, []);

  return {
    socket,
    isConnected,
    lastMessage,
    messages,
    users,
    typingUsers,
    unreadCounts,
    reconnecting,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping,
  };
};

export default socket;
