import { useState, useRef, useEffect } from "react";
import { useSocket } from "../socket/socket";

export default function Chat() {
  const {
    connect,
    disconnect,
    isConnected,
    messages,
    lastMessage,
    sendMessage,
    sendPrivateMessage,
    typingUsers,
    setTyping,
    users,
    socket,
    unreadCounts,
    reconnecting,
  } = useSocket();

  const [username, setUsername] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [message, setMessage] = useState("");
  const [privateRecipient, setPrivateRecipient] = useState(null);
  const [currentRoom, setCurrentRoom] = useState("general");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const notificationSound = useRef(new Audio("/notification.mp3")).current;

  // --- Join chat ---
  const handleJoin = () => {
    if (!username.trim()) return;
    connect(username);
    setIsJoined(true);
  };

  // --- Send message ---
  const handleSend = () => {
    if (!message.trim()) return;

    if (privateRecipient) {
      sendPrivateMessage(privateRecipient.id, message);
    } else {
      sendMessage({ message, room: currentRoom });
    }

    setMessage("");
    setTyping(false);
  };

  // --- Scroll to latest message ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentRoom]);

  // --- Browser notifications ---
  useEffect(() => {
    if (lastMessage && Notification.permission === "granted") {
      new Notification(
        lastMessage.isPrivate
          ? `Private from ${lastMessage.sender}`
          : `${lastMessage.sender}: ${lastMessage.message}`
      );
      notificationSound.play().catch(() => {});
    }
  }, [lastMessage]);

  useEffect(() => {
    if ("Notification" in window) Notification.requestPermission();
  }, []);

  // --- Load older messages (pagination) ---
  const loadOlderMessages = async () => {
    const res = await fetch(`/api/messages?page=${page + 1}&room=${currentRoom}`);
    const older = await res.json();
    if (older.length === 0) setHasMore(false);
    else {
      setPage(page + 1);
      setMessages(prev => [...older, ...prev]);
    }
  };

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0 && hasMore) loadOlderMessages();
  };

  // --- Join room ---
  const joinRoom = (room) => {
    if (currentRoom === room) return;
    setCurrentRoom(room);
    if (isConnected) socket?.emit("join_room", room);
    setPage(0);
    setHasMore(true);
    // Server will send unread_counts which updates UI
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };

  // --- Filter messages by room or private ---
  const displayedMessages = messages.filter(msg => 
    privateRecipient
      ? msg.isPrivate && (msg.sender === privateRecipient.username || msg.sender === "You")
      : !msg.isPrivate && msg.room === currentRoom
  );

  // --- Search messages via server API ---
  const doSearch = async () => {
    if (!searchQuery.trim()) return setSearchResults([]);
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&room=${currentRoom}`);
    const results = await res.json();
    setSearchResults(results);
  };

  return (
    <div className="p-4 sm:p-6 font-sans">
      {!isJoined ? (
        <div className="max-w-md mx-auto">
          <h2 className="text-2xl font-bold mb-4 text-center sm:text-left">Join the Chat</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleJoin}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Join
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-4">
          {/* Chat Section */}
          <div className="flex-1 flex flex-col gap-3">
            {/* Room buttons + search */}
            <div className="flex gap-2 mb-2 overflow-x-auto items-center">
              {["general", "sports", "tech"].map((room) => (
                <button
                  key={room}
                  onClick={() => joinRoom(room)}
                  className={`px-3 py-1 rounded whitespace-nowrap ${
                    currentRoom === room ? "bg-blue-500 text-white" : "bg-gray-200"
                  }`}
                >
                  {room}
                  {/* Display unread count if any */}
                  {unreadCounts && unreadCounts[room] > 0 && (
                    <span className="ml-1 text-xs bg-red-500 text-white px-1 rounded-full">
                      {unreadCounts[room]}
                    </span>
                  )}
                </button>
              ))}

              {/* Search box */}
              <div className="ml-auto flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border rounded px-2 py-1"
                />
                <button
                  onClick={doSearch}
                  className="bg-gray-800 text-white px-3 py-1 rounded"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="border p-2 rounded bg-white mb-2 max-h-40 overflow-y-auto">
                <strong>Search results ({searchResults.length}):</strong>
                {searchResults.map((r) => (
                  <div key={r.id} className="text-sm py-1 border-b last:border-b-0">
                    <div><strong>{r.sender}</strong> ({r.room}) — {r.message}</div>
                    <div className="text-xs text-gray-500">{formatTime(r.timestamp)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Connection status */}
            <div className="mb-2 font-semibold text-center sm:text-left">
              Status: {isConnected ? "🟢 Connected" : "🔴 Disconnected"} {reconnecting && " (reconnecting...)"}
            </div>

            {/* Messages */}
            <div
              className="border border-gray-300 rounded-lg p-4 h-64 sm:h-80 overflow-y-auto bg-gray-50"
              onScroll={handleScroll}
              ref={messagesContainerRef}
            >
              {displayedMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`mb-2 p-2 rounded ${
                    msg.system
                      ? "bg-gray-200 border border-gray-400 border-dashed"
                      : msg.isPrivate
                      ? "bg-yellow-100 border border-yellow-400"
                      : "bg-white border border-gray-300"
                  }`}
                >
                  {!msg.system && <strong>{msg.sender}</strong>} {!msg.system && ": "} {msg.message}
                  <span className="float-right text-xs text-gray-500">
                    {formatTime(msg.timestamp)}
                    {/* delivery indicator for own messages */}
                    {msg.sender === "You" && (
                      <span className="ml-2 text-xs">
                        {msg.delivered ? "✔︎" : "⏳"}
                      </span>
                    )}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef}></div>
              {typingUsers.length > 0 && !privateRecipient && (
                <div className="italic text-gray-500 mt-1 text-sm">{typingUsers.join(", ")} typing...</div>
              )}
            </div>

            {/* Private chat indicator */}
            {privateRecipient && (
              <div className="text-sm text-yellow-600 mb-1">
                Private chat with {privateRecipient.username}
                <button
                  onClick={() => setPrivateRecipient(null)}
                  className="ml-2 text-red-500"
                >
                  X
                </button>
              </div>
            )}

            {/* Message input */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setTyping(true);
                }}
                onBlur={() => setTyping(false)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSend}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                Send
              </button>
            </div>

            {/* Disconnect */}
            <button
              onClick={disconnect}
              className="mt-2 sm:mt-0 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Disconnect
            </button>
          </div>

          {/* Online Users Sidebar */}
          <div className="w-full sm:w-64 border border-gray-300 rounded-lg p-3 bg-gray-100 h-64 sm:h-80 overflow-y-auto">
            <h3 className="font-semibold mb-2">Online Users ({users.length})</h3>
            <ul>
              {users.map((user) => (
                <li
                  key={user.id}
                  className="mb-1 px-2 py-1 rounded bg-white border border-gray-300 flex justify-between items-center"
                >
                  {user.username}
                  {socket && user.id !== socket.id && (
                    <button
                      onClick={() => setPrivateRecipient(user)}
                      className="text-sm text-blue-500 hover:underline"
                    >
                      PM
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
