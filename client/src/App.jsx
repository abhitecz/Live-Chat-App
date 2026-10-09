import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// Automatically uses your online URL on Vercel or localhost when developing locally
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const socket = io(BACKEND_URL);

const ALL_AVATARS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aanya&accessoriesProbability=30',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zack',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya&eyebrows=upRound',
  'https://api.dicebear.com/7.x/identicon/svg?seed=Neon',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sara&mouth=smile',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Riya&hair=straight01',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Aria'
];

export default function App() {
  const [user, setUser] = useState(localStorage.getItem('chat_user') || '');
  const [avatar, setAvatar] = useState(localStorage.getItem('chat_avatar') || ALL_AVATARS[0]);
  const [isRegister, setIsRegister] = useState(false);
  const [authForm, setAuthForm] = useState({ username: '', password: '' });

  const [users, setUsers] = useState([]);
  const [online, setOnline] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeChat, setActiveChat] = useState({ name: 'General', isGroup: true });
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [hideFrom, setHideFrom] = useState('');

  const [mediaAttachment, setMediaAttachment] = useState(null);
  const [wallpaper, setWallpaper] = useState(localStorage.getItem('chat_wallpaper') || '');
  const [font, setFont] = useState(localStorage.getItem('chat_font') || 'sans');
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef();
  const fileInputRef = useRef();
  const wallpaperInputRef = useRef();
  const chatMediaInputRef = useRef();

  useEffect(() => {
    let f = "system-ui, -apple-system, sans-serif";
    if (font === 'mono') f = "ui-monospace, monospace";
    if (font === 'comic') f = "'Comic Sans MS', cursive, sans-serif";
    document.documentElement.style.setProperty('--app-font', f);
  }, [font]);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/data`)
      .then(r => r.json())
      .then(d => {
        setUsers(d.users || []);
        setGroups(d.groups || []);
        setMessages(d.messages || []);
      })
      .catch(e => console.error(e));

    socket.on('sync_users', (d) => {
      setUsers(d.users);
      setOnline(d.online);
    });
    socket.on('sync_groups', (g) => setGroups(g));
    socket.on('msg_broadcast', (m) => setMessages(prev => [...prev, m]));

    return () => socket.off();
  }, []);

  useEffect(() => {
    if (user) {
      socket.emit('join', { username: user, avatar });
    }
  }, [user, avatar]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isRegister ? 'register' : 'login';
    try {
      const res = await fetch(`${BACKEND_URL}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...authForm, avatar })
      });
      const data = await res.json();
      if (data.error) return alert(data.error);

      localStorage.setItem('chat_user', data.username);
      if (data.avatar) {
        localStorage.setItem('chat_avatar', data.avatar);
        setAvatar(data.avatar);
      }
      setUser(data.username);
    } catch {
      alert('Cannot connect to backend server');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser('');
    window.location.reload();
  };

  const handleCreateGroup = () => {
    const g = prompt('Enter Group Name:');
    if (g && g.trim()) socket.emit('create_group', g.trim());
  };

  const handleSend = (customText) => {
    const msgToSend = customText !== undefined ? customText : text;
    if (!msgToSend.trim() && !mediaAttachment) return;

    socket.emit('msg', {
      from: user,
      avatar,
      to: activeChat.name,
      text: msgToSend,
      isGroup: activeChat.isGroup,
      hideFrom: activeChat.isGroup ? hideFrom : '',
      mediaType: mediaAttachment ? mediaAttachment.type : null,
      mediaUrl: mediaAttachment ? mediaAttachment.dataUrl : null,
      fileName: mediaAttachment ? mediaAttachment.name : null
    });

    if (customText === undefined) setText('');
    setMediaAttachment(null);
    setHideFrom('');
    if (chatMediaInputRef.current) chatMediaInputRef.current.value = '';
  };

  const handleChatMediaSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isVideo) return alert('Select an image or video file.');
    if (file.size > 20 * 1024 * 1024) return alert('File limit is 20MB.');

    const reader = new FileReader();
    reader.onload = () => {
      setMediaAttachment({
        type: isVideo ? 'video' : 'image',
        dataUrl: reader.result,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const updateAvatarAndSync = (newAvatar) => {
    setAvatar(newAvatar);
    localStorage.setItem('chat_avatar', newAvatar);
    if (user) {
      fetch(`${BACKEND_URL}/api/update-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, avatar: newAvatar })
      });
    }
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => updateAvatarAndSync(r.result);
    r.readAsDataURL(file);
  };

  const handleWallpaperUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      setWallpaper(r.result);
      localStorage.setItem('chat_wallpaper', r.result);
    };
    r.readAsDataURL(file);
  };

  if (!user) {
    return (
      <div className="login-card">
        <h2>Campus Mesh</h2>
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
          {isRegister ? 'Register your account with password' : 'Sign in to campus channels'}
        </p>
        <form onSubmit={handleAuth}>
          <input
            placeholder="Username"
            value={authForm.username}
            onChange={e => setAuthForm({ ...authForm, username: e.target.value })}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={authForm.password}
            onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
            required
          />
          <button className="btn" style={{ width: '100%', marginTop: 8 }} type="submit">
            {isRegister ? 'Register & Join' : 'Sign In'}
          </button>
        </form>
        <button
          onClick={() => setIsRegister(!isRegister)}
          style={{ background: 'none', border: 'none', color: '#818cf8', marginTop: 14, cursor: 'pointer', fontSize: 13 }}
        >
          {isRegister ? 'Already registered? Login here' : "Need an account? Register"}
        </button>
      </div>
    );
  }

  const currentMessages = messages.filter(m => {
    if (activeChat.isGroup) return m.isGroup && m.to === activeChat.name;
    const uLow = user.toLowerCase();
    const actLow = activeChat.name.toLowerCase();
    return !m.isGroup && (
      (m.from.toLowerCase() === uLow && m.to.toLowerCase() === actLow) ||
      (m.from.toLowerCase() === actLow && m.to.toLowerCase() === uLow)
    );
  });

  return (
    <div className="app-root">
      {showSettings && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, color: '#fff' }}>Profile & Display Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}
              >✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 8, fontWeight: 'bold' }}>CHOOSE AVATAR PRESET</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {ALL_AVATARS.map((p, idx) => (
                  <img
                    key={idx}
                    src={p}
                    onClick={() => updateAvatarAndSync(p)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: avatar === p ? '2px solid #6366f1' : '2px solid transparent'
                    }}
                    alt={`preset-${idx}`}
                  />
                ))}
              </div>
              <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginTop: 10, marginBottom: 4 }}>Or upload custom photo from device:</label>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleAvatarUpload} style={{ fontSize: 12 }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 6, fontWeight: 'bold' }}>TYPOGRAPHY FONT</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn-pill ${font === 'sans' ? 'active' : ''}`} onClick={() => { setFont('sans'); localStorage.setItem('chat_font', 'sans'); }}>Modern Sans</button>
                <button className={`btn-pill ${font === 'mono' ? 'active' : ''}`} onClick={() => { setFont('mono'); localStorage.setItem('chat_font', 'mono'); }}>Code Mono</button>
                <button className={`btn-pill ${font === 'comic' ? 'active' : ''}`} onClick={() => { setFont('comic'); localStorage.setItem('chat_font', 'comic'); }}>Playful</button>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 6, fontWeight: 'bold' }}>CHAT WALLPAPER</label>
              <input type="file" accept="image/*" ref={wallpaperInputRef} onChange={handleWallpaperUpload} style={{ fontSize: 12 }} />
              {wallpaper && (
                <button
                  onClick={() => { setWallpaper(''); localStorage.removeItem('chat_wallpaper'); }}
                  style={{ display: 'block', marginTop: 8, background: 'none', border: 'none', color: '#f87171', fontSize: 12, cursor: 'pointer' }}
                >
                  Reset Wallpaper
                </button>
              )}
            </div>

            <button className="btn" style={{ width: '100%' }} onClick={() => setShowSettings(false)}>Save & Close</button>
          </div>
        </div>
      )}

      <div className="sidebar">
        <div className="side-header">
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => setShowSettings(true)}
            title="Open Settings"
          >
            <img src={avatar} className="avatar-img" alt="avatar" />
            <div>
              <div style={{ fontWeight: 600 }}>{user}</div>
              <div style={{ fontSize: 11, color: '#34d399' }}>● Online</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowSettings(true)} className="settings-icon-btn" title="Settings">⚙️</button>
            <button onClick={handleLogout} className="settings-icon-btn" style={{ color: '#f87171' }} title="Logout">✕</button>
          </div>
        </div>

        <div style={{ padding: '12px 16px 4px', fontSize: 11, color: '#9ca3af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>GROUPS</span>
          <button onClick={handleCreateGroup} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 'bold' }}>+ NEW</button>
        </div>
        {groups.map(g => (
          <div
            key={g}
            className={`nav-item ${activeChat.name === g && activeChat.isGroup ? 'active' : ''}`}
            onClick={() => setActiveChat({ name: g, isGroup: true })}
          >
            <span># {g}</span>
          </div>
        ))}

        <div style={{ padding: '16px 16px 4px', fontSize: 11, color: '#9ca3af' }}>DIRECT MESSAGES</div>
        {users.filter(u => u.username.toLowerCase() !== user.toLowerCase()).map(u => {
          const isOnline = online.includes(u.username.toLowerCase());
          return (
            <div
              key={u.username}
              className={`nav-item ${activeChat.name.toLowerCase() === u.username.toLowerCase() && !activeChat.isGroup ? 'active' : ''}`}
              onClick={() => setActiveChat({ name: u.username, isGroup: false })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={u.avatar || ALL_AVATARS[0]} className="avatar-mini" alt={u.username} />
                <span>@{u.username}</span>
              </div>
              <span 
                style={{ fontSize: 11, color: isOnline ? '#34d399' : '#6b7280' }} 
                title={isOnline ? 'Online' : 'Offline'}
              >
                {isOnline ? '●' : '○'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="chat-area" style={wallpaper ? { backgroundImage: `url(${wallpaper})` } : {}}>
        <div className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{activeChat.isGroup ? `# ${activeChat.name}` : `@ ${activeChat.name}`}</span>
            {!activeChat.isGroup && (
              <span style={{ fontSize: 11, color: online.includes(activeChat.name.toLowerCase()) ? '#34d399' : '#9ca3af' }}>
                ({online.includes(activeChat.name.toLowerCase()) ? 'Online' : 'Offline'})
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#a5b4fc' }}>Try typing @ai help</span>
        </div>

        <div className="msg-feed">
          {currentMessages.map(m => {
            const isMe = m.from.toLowerCase() === user.toLowerCase();
            return (
              <div key={m.id} className={`msg-container ${isMe ? 'msg-me' : 'msg-other'}`}>
                {!isMe && (
                  <img src={m.avatar || ALL_AVATARS[0]} className="msg-avatar" alt={m.from} />
                )}
                <div className={`bubble ${m.from.includes('AI') ? 'ai' : isMe ? 'me' : 'other'}`}>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>
                    {m.from} {m.hideFrom ? <span style={{ color: '#f87171' }}>(Hidden from @{m.hideFrom})</span> : ''}
                  </div>
                  {m.text && <div>{m.text}</div>}
                  
                  {m.mediaType === 'image' && (
                    <img src={m.mediaUrl} alt={m.fileName || 'Attachment'} className="chat-media-img" />
                  )}
                  {m.mediaType === 'video' && (
                    <video src={m.mediaUrl} controls className="chat-media-video" />
                  )}

                  <div style={{ fontSize: 9, textAlign: 'right', opacity: 0.6, marginTop: 4 }}>{m.time}</div>
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>

        {mediaAttachment && (
          <div className="media-preview-strip">
            <span>📎 Attached {mediaAttachment.type}: <strong>{mediaAttachment.name}</strong></span>
            <button className="media-remove-btn" onClick={() => setMediaAttachment(null)}>Remove</button>
          </div>
        )}

        {activeChat.isGroup && (
          <div className="hide-bar">
            <span>🔒 Hide this message from:</span>
            <select value={hideFrom} onChange={e => setHideFrom(e.target.value)} className="hide-select">
              <option value="">No one (Visible to all)</option>
              {users.filter(u => u.username.toLowerCase() !== user.toLowerCase()).map(u => (
                <option key={u.username} value={u.username}>@{u.username}</option>
              ))}
            </select>
          </div>
        )}

        <div className="emoji-tray">
          {['👍', '❤️', '🔥', '🚀', '🎉', '💡'].map((em) => (
            <span key={em} className="emoji-pill" onClick={() => handleSend(em)}>
              {em}
            </span>
          ))}
        </div>

        <form className="input-dock" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
          <label className="attach-btn" title="Attach Image or Video">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <input
              type="file"
              ref={chatMediaInputRef}
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={handleChatMediaSelect}
            />
          </label>

          <input
            placeholder={`Message ${activeChat.name}... (Try @ai)`}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <button className="btn" type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}