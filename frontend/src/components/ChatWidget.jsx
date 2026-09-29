import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, User as UserIcon, Users, Circle, Search } from 'lucide-react';
import { io } from 'socket.io-client';
import { useOrgConfig } from '../orgConfig';

export default function ChatWidget({ currentUser }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('group'); // 'group' or username
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [staff, setStaff] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  const { defaultDepartment, inDepartment } = useOrgConfig();
  const userDept = currentUser?.department || defaultDepartment;
  const groupRoom = `group_${userDept}`;

  useEffect(() => {
    fetchStaff();
    fetchMessages();
    const interval = setInterval(fetchStaff, 5000); // Polling for staff status

    socketRef.current = io('/');
    
    if (currentUser) {
      socketRef.current.emit('user_online', currentUser.username);
    }
    
    socketRef.current.on('online_users', (users) => {
      setOnlineUsers(users);
    });

    socketRef.current.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });
    
    socketRef.current.on('messages_read', ({ reader, receiver }) => {
      setMessages(prev => prev.map(m => {
        let match = false;
        if (receiver.startsWith('group')) {
          match = m.receiver === receiver;
        } else {
          match = m.sender === receiver && m.receiver === reader;
        }
        
        if (match) {
          return { ...m, readBy: [...(m.readBy || []), reader] };
        }
        return m;
      }));
    });

    return () => {
      clearInterval(interval);
      socketRef.current.disconnect();
    }
  }, []);

  // Mark as read whenever chat is open and activeTab changes or messages change
  useEffect(() => {
    if (isOpen && currentUser) {
      markAsRead(activeTab === 'group' ? groupRoom : activeTab);
    }
    scrollToBottom();
  }, [messages, activeTab, isOpen]);

  const fetchStaff = async () => {
    const res = await fetch('/api/staff');
    const data = await res.json();
    // Only show staff in the same department, and exclude self
    setStaff(data.filter(u => u.username !== currentUser?.username && inDepartment(u, userDept)));
  };

  const fetchMessages = async () => {
    const res = await fetch('/api/messages');
    const data = await res.json();
    setMessages(data);
  };

  const markAsRead = async (receiverId) => {
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          receiver: receiverId
        })
      });
    } catch (e) {
      console.error('Error marking as read', e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (e, quickResponse = null) => {
    if (e) e.preventDefault();
    const content = quickResponse || inputMsg.trim();
    if (!content) return;
    
    const receiverId = activeTab === 'group' ? groupRoom : activeTab;

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentUser.username,
          senderRole: currentUser.role,
          receiver: receiverId,
          content: content
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        // M2 fix: show error if server rejects (e.g. 403 non-admin in group chat)
        if (res.status === 403) {
          alert('Chỉ Admin mới được gửi tin nhắn vào nhóm chung.');
        } else {
          console.error('Message send failed:', errData);
        }
        return;
      }
      setInputMsg('');
    } catch (err) {
      console.error('Network error sending message:', err);
    }
  };

  // Filter messages based on active tab
  const displayMessages = messages.filter(m => {
    if (activeTab === 'group') return m.receiver === groupRoom;
    return (m.sender === currentUser?.username && m.receiver === activeTab) ||
           (m.sender === activeTab && m.receiver === currentUser?.username);
  });

  const unreadMessages = messages.filter(m => {
    if (m.sender === currentUser?.username) return false;
    if (m.receiver !== currentUser?.username && m.receiver !== groupRoom) return false;
    return !(m.readBy || []).includes(currentUser?.username);
  });
  
  const hasUnread = unreadMessages.length > 0;

  if (!currentUser) return null;

  // Search filter
  const filteredStaff = staff.filter(s => {
    const name = s.fullName || s.username || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Sort staff and extract unread ones
  const staffWithUnread = filteredStaff.filter(s => unreadMessages.some(m => m.sender === s.username && m.receiver === currentUser.username));
  const otherStaff = filteredStaff.filter(s => !staffWithUnread.includes(s));

  const renderStaffList = (title, list) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-2">
        <div className="px-3 py-1 bg-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider sticky top-0 z-10">
          {title}
        </div>
        {list.map(s => {
          const isOnline = onlineUsers.includes(s.username);
          const displayName = s.fullName || s.username;
          
          const hasUnreadFromThisUser = unreadMessages.some(m => m.sender === s.username && m.receiver === currentUser.username);
          
          return (
            <div 
              key={s.username}
              onClick={() => setActiveTab(s.username)}
              className={`p-3 border-b cursor-pointer text-sm truncate flex items-center justify-between transition-colors ${activeTab === s.username ? 'bg-blue-100 font-bold' : 'hover:bg-gray-100'}`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <UserIcon size={14} className="shrink-0 text-gray-400" /> 
                <span className={`truncate font-bold ${isOnline ? 'text-green-600' : 'text-gray-400'}`}>
                  {displayName}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {hasUnreadFromThisUser ? (
                  <Circle size={8} fill="currentColor" className="text-red-500" />
                ) : (
                  isOnline && <Circle size={8} fill="currentColor" className="text-green-500" />
                )}
              </div>
            </div>
          )
        })}
      </div>
    );
  };

  const isAllowedToChatInGroup = currentUser.role === 'admin' || (currentUser.roles && currentUser.roles.includes('admin'));
  const groupHasUnread = unreadMessages.some(m => m.receiver === groupRoom);

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 relative"
        >
          <MessageSquare size={28} />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
              !
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="bg-white w-[500px] rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col h-[650px] animate-fade-in-up">
          {/* Header */}
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
            <h3 className="font-bold flex items-center gap-2">
              <MessageSquare size={18} /> Chat Nội Bộ ({userDept})
            </h3>
            <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 p-1 rounded transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar (Contacts) */}
            <div className="w-2/5 bg-gray-50 border-r border-gray-200 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Tìm tên..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div 
                onClick={() => setActiveTab('group')}
                className={`p-4 border-b cursor-pointer flex items-center justify-between ${activeTab === 'group' ? 'bg-blue-100 text-blue-700 font-bold' : 'hover:bg-gray-100 text-gray-700 font-bold'}`}
              >
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-blue-600" /> Nhóm chung
                </div>
                {groupHasUnread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>}
              </div>
              
              <div className="py-2 flex-1 overflow-y-auto">
                {renderStaffList('Tin nhắn mới', staffWithUnread)}
                {renderStaffList('Danh sách nhân sự', otherStaff)}
              </div>
            </div>

            {/* Chat Area */}
            <div className="w-3/5 flex flex-col bg-white">
              <div className="bg-gray-50 p-3 text-center text-sm font-bold text-gray-700 border-b shadow-sm truncate">
                {activeTab === 'group' ? 'Thông báo Chung' : `Chat với ${staff.find(s => s.username === activeTab)?.fullName || activeTab}`}
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50 custom-scrollbar">
                {displayMessages.map((m, idx) => {
                  const isMe = m.sender === currentUser.username;
                  
                  // Try to resolve the sender's full name for better UI
                  let senderName = m.sender;
                  if (!isMe && activeTab === 'group') {
                    const found = staff.find(s => s.username === m.sender);
                    if (found && found.fullName) senderName = found.fullName;
                  }
                  
                  const readByOthers = (m.readBy || []).filter(user => user !== m.sender);
                  const isRead = readByOthers.length > 0;

                  return (
                    <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {!isMe && activeTab === 'group' && (
                        <span className="text-[11px] font-bold text-gray-500 mb-1 ml-1">{senderName}</span>
                      )}
                      <div className={`px-4 py-2.5 max-w-[90%] text-sm shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-t-2xl rounded-bl-2xl' : 'bg-gray-200 text-gray-800 rounded-t-2xl rounded-br-2xl'}`}>
                        {m.content}
                      </div>
                      {isMe && isRead && (
                        <span className="text-[10px] text-gray-400 mt-0.5 mr-1 font-medium">Đã đọc</span>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              {activeTab !== 'group' || isAllowedToChatInGroup ? (
                <form onSubmit={sendMessage} className="p-3 border-t bg-white flex gap-2">
                  <input 
                    type="text" 
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    placeholder="Nhập tin nhắn..."
                    className="flex-1 border-2 border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <button type="submit" className="bg-blue-600 text-white p-2.5 rounded-full hover:bg-blue-700 transition-colors shadow-sm">
                    <Send size={18} />
                  </button>
                </form>
              ) : (
                <div className="p-3 border-t bg-gray-50">
                  <button 
                    onClick={() => sendMessage(null, "Đã nhận thông báo.")}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm py-2.5 rounded-full transition-colors flex justify-center items-center gap-2 shadow-sm"
                  >
                    Xác nhận đã nhận thông tin
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
