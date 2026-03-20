// Shared styles, components and helpers for all games
export const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:wght@400;500;600&display=swap');
@keyframes orbFloat { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(40px,-30px) scale(1.15)} }
@keyframes dropPiece { 0%{opacity:1;transform:translateY(-360px)} 55%{transform:translateY(6px)} 75%{transform:translateY(-3px)} 100%{opacity:1;transform:translateY(0)} }
@keyframes winPulse { 0%{filter:brightness(1) drop-shadow(0 0 6px rgba(255,255,255,0.15));transform:scale(1)} 100%{filter:brightness(1.35) drop-shadow(0 0 22px rgba(255,255,255,0.55));transform:scale(1.09)} }
@keyframes ringPulse { 0%,100%{opacity:.25;transform:scale(1)} 50%{opacity:.7;transform:scale(1.06)} }
@keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
@keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes bounceIn { 0%{opacity:0;transform:scale(.55)} 60%{transform:scale(1.06)} 100%{opacity:1;transform:scale(1)} }
@keyframes bob { 0%,100%{transform:translateY(0);opacity:.45} 50%{transform:translateY(-5px);opacity:.7} }
@keyframes spin { to{transform:rotate(360deg)} }
@keyframes cellPop { 0%{transform:scale(0)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }
@keyframes explode { 0%{transform:scale(1);opacity:1} 50%{transform:scale(1.3);opacity:0.6} 100%{transform:scale(1);opacity:1} }
@keyframes splash { 0%{transform:scale(0.5);opacity:0} 50%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
`;

export const Orb = ({ color, size, x, y, dur, delay }) => (
  <div className="absolute rounded-full opacity-20 blur-3xl pointer-events-none"
    style={{ background: color, width: size, height: size, left: x, top: y,
      animation: `orbFloat ${dur}s ease-in-out ${delay}s infinite alternate` }} />
);

export const colorGrad = (c) => c === "green"
  ? "linear-gradient(135deg, #4ade80, #16a34a)"
  : "linear-gradient(135deg, #fbbf24, #f59e0b)";

export const BG = "linear-gradient(135deg, #0a0e1a 0%, #141830 50%, #0a0e1a 100%)";

export const PANEL = {
  background: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
};

export const BackButton = ({ onClick }) => (
  <button onClick={onClick}
    className="absolute top-4 left-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/40 text-xs font-semibold hover:text-white/70 transition-all"
    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "'DM Sans', sans-serif" }}>
    ← Menú
  </button>
);

export const Orbs = () => (
  <>
    <Orb color="radial-gradient(circle, #4c1d95, transparent)" size="450px" x="-8%" y="8%" dur={7} delay={0} />
    <Orb color="radial-gradient(circle, #1e3a5f, transparent)" size="380px" x="68%" y="55%" dur={9} delay={1} />
    <Orb color="radial-gradient(circle, #ec4899, transparent)" size="320px" x="45%" y="-12%" dur={8} delay={2} />
  </>
);

// Default game state factory
export const P1 = 1;
export const P2 = 2;

export const defaultPlayers = () => ({ 1: null, 2: null });
export const defaultScores = () => ({ 1: 0, 2: 0 });

// Sanitize players from Firebase (it drops nulls and may convert to arrays)
export const sanitizePlayers = (p) => {
  if (!p || typeof p !== "object") return { 1: null, 2: null };
  if (Array.isArray(p)) return { 1: p[1] || null, 2: p[2] || null };
  return { 1: p[1] || null, 2: p[2] || null };
};

// ═══ EMOJI PICKER ═══
import { useState as us } from "react";

const EMOJI_GROUPS = [
  { label: "Caras", emojis: ["😀","😂","🤣","😍","🥳","😎","🤩","😜","🤔","😱","😤","🥺","😴","🤯","🫡"] },
  { label: "Gestos", emojis: ["👍","👎","👏","🙌","💪","🤝","✌️","🤞","👋","🫶","☝️","👀","🧠","💀","🔥"] },
  { label: "Juego", emojis: ["🏆","🥇","🥈","🥉","🎯","🎮","🎲","♟️","🃏","🎳","🥎","🚢","⚔️","💥","💧"] },
  { label: "Objetos", emojis: ["❤️","⭐","💎","🌟","✨","🎉","🎊","💣","🧨","🪄","📣","🔔","💬","👑","🫣"] },
];

export const EmojiPicker = ({ onSelect, onClose }) => (
  <div className="absolute bottom-full left-0 right-0 mb-1 p-2 rounded-xl z-50" 
    style={{ background: "rgba(15,18,35,0.97)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 -10px 40px rgba(0,0,0,0.5)", animation: "fadeUp 0.2s ease-out" }}>
    <div className="flex justify-between items-center mb-1.5 px-1">
      <span className="text-white/40 text-xs font-semibold" style={{ fontFamily: "'DM Sans',sans-serif" }}>Emojis</span>
      <button onClick={onClose} className="text-white/30 text-xs hover:text-white/60 transition-all px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)" }}>✕</button>
    </div>
    <div className="max-h-36 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
      {EMOJI_GROUPS.map(g => (
        <div key={g.label} className="mb-1.5">
          <div className="text-white/20 text-xs mb-0.5 px-0.5" style={{ fontFamily: "'DM Sans',sans-serif" }}>{g.label}</div>
          <div className="flex flex-wrap gap-0.5">
            {g.emojis.map(e => (
              <button key={e} onClick={() => onSelect(e)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base hover:bg-white/10 active:scale-90 transition-all">
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ═══ CHAT BOX — reusable across all games ═══
export const ChatBox = ({ chatMsgs, chatInput, setChatInput, sendChat, myId, players, tab, accentGrad }) => {
  const [showEmoji, setShowEmoji] = us(false);
  const chatEndRef = us(null);

  const handleEmojiSelect = (emoji) => {
    setChatInput(prev => prev + emoji);
  };

  return (
    <div className={`w-full lg:w-72 flex flex-col rounded-2xl overflow-hidden flex-shrink-0 ${tab !== "chat" ? "hidden sm:flex" : "flex"}`}
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 15px 40px rgba(0,0,0,0.3)",
        height: tab === "chat" ? "calc(100vh - 200px)" : "420px", maxHeight: "480px", animation: "fadeUp 0.6s ease-out 0.15s both" }}>
      <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span className="text-white/60 text-sm font-semibold" style={{ fontFamily: "'DM Sans',sans-serif" }}>💬 Chat</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400" style={{ animation: "winPulse 2s ease-in-out infinite alternate" }} />
          <span className="text-white/30 text-xs" style={{ fontFamily: "'DM Sans',sans-serif" }}>en vivo</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
        {(chatMsgs || []).map((msg, i) =>
          msg.type === "system" ? (
            <div key={i} className="text-center text-white/25 text-xs py-1" style={{ fontFamily: "'DM Sans',sans-serif" }}>{msg.text}</div>
          ) : (
            <div key={i} className={`flex gap-2 items-start ${msg.player === myId ? 'flex-row-reverse' : ''}`} style={{ animation: "fadeUp 0.25s ease-out" }}>
              <div className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" style={{ background: players?.[msg.player] ? colorGrad(players[msg.player].color) : "#555" }} />
              <div>
                <div className={`text-white/40 text-xs mb-0.5 ${msg.player === myId ? 'text-right' : ''}`} style={{ fontFamily: "'DM Sans',sans-serif" }}>{msg.name}</div>
                <div className="text-white/85 text-sm px-3 py-1.5 rounded-xl" style={{ background: msg.player === myId ? "rgba(76,29,149,0.15)" : "rgba(255,255,255,0.05)", fontFamily: "'DM Sans',sans-serif" }}>{msg.text}</div>
              </div>
            </div>
          )
        )}
      </div>
      <div className="relative p-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />}
        <div className="flex gap-1.5">
          <button onClick={() => setShowEmoji(!showEmoji)}
            className={`px-2 py-2 rounded-xl text-sm transition-all hover:scale-110 ${showEmoji ? 'bg-white/10' : ''}`}
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            😊
          </button>
          <input className="flex-1 px-3 py-2 rounded-xl text-white text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "'DM Sans',sans-serif" }}
            placeholder="Mensaje..." value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { sendChat(); setShowEmoji(false); } }}
            onFocus={() => setShowEmoji(false)} />
          <button onClick={() => { sendChat(); setShowEmoji(false); }}
            className="px-3 py-2 rounded-xl text-white text-sm font-semibold hover:scale-105 transition-all"
            style={{ background: accentGrad || "linear-gradient(135deg,#4c1d95,#1e3a5f)" }}>➤</button>
        </div>
      </div>
    </div>
  );
};
