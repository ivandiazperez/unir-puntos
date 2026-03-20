import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { ref, set, onValue, remove } from "firebase/database";
import { STYLES, Orbs, colorGrad, BG, PANEL, BackButton, P1, P2, sanitizePlayers, ChatBox } from "./shared.jsx";

const GAME_REF = "tres-en-raya/game";
const CHAT_REF = "tres-en-raya/chat";

const createBoard = () => Array(9).fill(0);
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const checkWin = (board, p) => { for (const w of WINS) if (w.every(i => board[i] === p)) return w; return null; };
const isFull = (board) => board.every(c => c !== 0);

const defaultState = () => ({
  phase: "lobby", board: createBoard(), current: P1, winner: null, winCells: null,
  isDraw: false, players: { 1: null, 2: null }, scores: { 1: 0, 2: 0 }, moveCount: 0, version: 0,
});

const sanitize = (data) => {
  if (!data) return defaultState();
  const d = { ...defaultState(), ...data };
  d.players = sanitizePlayers(d.players);
  if (!d.board || !Array.isArray(d.board) || d.board.length !== 9) d.board = createBoard();
  if (!d.scores) d.scores = { 1: 0, 2: 0 };
  if (d.winCells && !Array.isArray(d.winCells)) d.winCells = null;
  return d;
};

const fbSave = async (path, data) => { try { await set(ref(db, path), data); } catch (e) { console.error(e); } };
const fbDel = async () => { try { await remove(ref(db, "tres-en-raya")); } catch (e) { console.error(e); } };

// X and O SVG marks
const XMark = ({ isWin, isNew }) => (
  <svg viewBox="0 0 100 100" className="w-full h-full p-3" style={{ animation: isNew ? "cellPop 0.3s ease-out" : isWin ? "winPulse 0.8s ease-in-out infinite alternate" : "none" }}>
    <line x1="20" y1="20" x2="80" y2="80" stroke="#4ade80" strokeWidth="10" strokeLinecap="round" />
    <line x1="80" y1="20" x2="20" y2="80" stroke="#4ade80" strokeWidth="10" strokeLinecap="round" />
  </svg>
);

const OMark = ({ isWin, isNew }) => (
  <svg viewBox="0 0 100 100" className="w-full h-full p-3" style={{ animation: isNew ? "cellPop 0.3s ease-out" : isWin ? "winPulse 0.8s ease-in-out infinite alternate" : "none" }}>
    <circle cx="50" cy="50" r="30" fill="none" stroke="#fbbf24" strokeWidth="10" strokeLinecap="round" />
  </svg>
);

export default function TresEnRaya({ onBack }) {
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState(null);
  const [joinName, setJoinName] = useState("");
  const [gs, setGs] = useState(defaultState());
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [tab, setTab] = useState("board");
  const [lastCell, setLastCell] = useState(-1);
  const chatEndRef = useRef(null);
  const prevMC = useRef(0);

  const pName = (pid, s = gs) => s.players[pid]?.name || `Jugador ${pid}`;
  const pMark = (pid) => pid === P1 ? "X" : "O";

  useEffect(() => {
    const u1 = onValue(ref(db, GAME_REF), (snap) => {
      const d = sanitize(snap.val());
      if (d.moveCount > prevMC.current) { setLastCell(d.board.findIndex((v, i) => gs.board?.[i] !== v && v !== 0)); setTimeout(() => setLastCell(-1), 350); }
      prevMC.current = d.moveCount || 0; setGs(d);
    });
    const u2 = onValue(ref(db, CHAT_REF), (snap) => { const d = snap.val(); if (d) setChatMsgs(d); });
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  const createRoom = async () => {
    if (!myName.trim()) return;
    const c = myColor || "green";
    const f = { ...defaultState(), players: { 1: { name: myName.trim(), color: c }, 2: null }, version: 1 };
    await fbSave(GAME_REF, f);
    await fbSave(CHAT_REF, [{ type: "system", text: `🎮 ${myName.trim()} ha creado la sala.`, ts: Date.now() }]);
    setMyId(P1); setMyColor(c);
  };

  const joinRoom = async () => {
    if (!joinName.trim() || !gs.players[1]) return;
    const c2 = gs.players[1].color === "green" ? "yellow" : "green";
    const u = { ...gs, players: { ...gs.players, 2: { name: joinName.trim(), color: c2 } }, phase: "playing", version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, u);
    const m = [...(chatMsgs || []), { type: "system", text: `🎮 ${joinName.trim()} se ha unido. ¡A jugar!`, ts: Date.now() }];
    await fbSave(CHAT_REF, m);
    setMyId(P2); setMyName(joinName.trim()); setMyColor(c2);
  };

  const handleMove = async (idx) => {
    if (gs.board[idx] !== 0 || gs.winner || gs.isDraw || gs.phase !== "playing" || gs.current !== myId) return;
    const nb = [...gs.board]; nb[idx] = gs.current;
    let ns = { ...gs, board: nb, moveCount: (gs.moveCount || 0) + 1, version: (gs.version || 0) + 1 };
    const win = checkWin(nb, gs.current);
    if (win) { ns.winner = gs.current; ns.winCells = win; ns.scores = { ...gs.scores, [gs.current]: (gs.scores[gs.current] || 0) + 1 }; ns.phase = "over"; }
    else if (isFull(nb)) { ns.isDraw = true; ns.phase = "over"; }
    else ns.current = gs.current === P1 ? P2 : P1;
    prevMC.current = ns.moveCount;
    await fbSave(GAME_REF, ns);
    if (win) { const m = [...(chatMsgs || []), { type: "system", text: `🏆 ¡${pName(gs.current, ns)} ha ganado!`, ts: Date.now() }]; await fbSave(CHAT_REF, m); }
    else if (ns.isDraw) { const m = [...(chatMsgs || []), { type: "system", text: "🤝 ¡Empate!", ts: Date.now() }]; await fbSave(CHAT_REF, m); }
  };

  const playAgain = async () => {
    const ns = { ...gs, board: createBoard(), current: P1, winner: null, winCells: null, isDraw: false, phase: "playing", moveCount: 0, version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, ns);
    await fbSave(CHAT_REF, [...(chatMsgs || []), { type: "system", text: "🔄 ¡Nueva partida!", ts: Date.now() }]);
    prevMC.current = 0;
  };
  const fullReset = async () => { await fbDel(); setGs(defaultState()); setChatMsgs([]); setMyId(null); setMyName(""); setMyColor(null); setJoinName(""); };
  const sendChat = async () => { if (!chatInput.trim() || !myId) return; await fbSave(CHAT_REF, [...(chatMsgs || []), { type: "player", player: myId, name: myName, text: chatInput.trim(), ts: Date.now() }]); setChatInput(""); };
  const isWC = (i) => gs.winCells?.includes(i);

  // ═══ LOBBY ═══
  if (!myId) {
    const roomExists = !!(gs.players && gs.players[1]);
    const roomFull = !!(gs.players && gs.players[1] && gs.players[2]);
    return (
      <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: BG }}>
        <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
        <div className="relative z-10 p-8 rounded-3xl max-w-md w-full mx-4" style={{ ...PANEL, animation: "fadeUp 0.5s ease-out" }}>
          <h1 className="text-3xl font-black text-center mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#a78bfa,#7c3aed,#a78bfa)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Tres en Raya</h1>
          <p className="text-center text-white/35 text-sm mb-7" style={{ fontFamily: "'DM Sans',sans-serif" }}>X vs O · Multijugador</p>
          {!roomExists && (<div style={{ animation: "fadeUp 0.4s ease-out" }}>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2" style={{ fontFamily: "'DM Sans',sans-serif" }}>Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} value={myName} onChange={e => setMyName(e.target.value)} placeholder="Ej: María" />
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'DM Sans',sans-serif" }}>Elige tu color</label>
            <div className="flex gap-3 mb-6">{["green", "yellow"].map(c => (<button key={c} onClick={() => setMyColor(c)} className={`flex-1 py-3.5 rounded-xl text-white font-bold transition-all hover:scale-105 ${myColor === c ? 'ring-2 ring-white/40 scale-105' : 'opacity-60'}`} style={{ background: colorGrad(c) }}>{c === "green" ? "❌ Verde (X)" : "⭕ Amarillo (O)"}</button>))}</div>
            <button onClick={createRoom} disabled={!myName.trim() || !myColor} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>Crear sala 🚀</button>
          </div>)}
          {roomExists && !roomFull && (<div style={{ animation: "fadeUp 0.4s ease-out" }}>
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl" style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.12)" }}><div className="w-3 h-3 rounded-full" style={{ background: "#a78bfa", animation: "winPulse 1.2s infinite alternate" }} /><span className="text-white/70 text-sm"><span className="text-white font-semibold">{gs.players[1]?.name}</span> está esperando...</span></div>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Ej: Carlos" />
            <button onClick={joinRoom} disabled={!joinName.trim()} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>Unirse 🎯</button>
          </div>)}
          {roomFull && (<div className="text-center" style={{ animation: "fadeUp 0.4s ease-out" }}>
            <p className="text-white/50 text-sm mb-4">Partida en curso</p>
            <div className="flex gap-3">
              <button onClick={() => { setMyId(P1); setMyName(gs.players[1]?.name || "J1"); setMyColor(gs.players[1]?.color || "green"); }} className="flex-1 py-3 rounded-xl text-white font-semibold hover:scale-105 transition-all" style={{ background: colorGrad(gs.players[1]?.color || "green") }}>Soy {gs.players[1]?.name}</button>
              <button onClick={() => { setMyId(P2); setMyName(gs.players[2]?.name || "J2"); setMyColor(gs.players[2]?.color || "yellow"); }} className="flex-1 py-3 rounded-xl text-white font-semibold hover:scale-105 transition-all" style={{ background: colorGrad(gs.players[2]?.color || "yellow") }}>Soy {gs.players[2]?.name}</button>
            </div>
            <button onClick={fullReset} className="mt-3 w-full py-2.5 rounded-xl text-white/40 text-sm hover:text-white/70 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>Reiniciar todo</button>
          </div>)}
        </div>
      </div>);
  }

  // ═══ WAITING ═══
  if (gs.phase === "lobby" && myId === P1) return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: BG }}>
      <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
      <div className="relative z-10 p-8 rounded-3xl max-w-sm w-full mx-4 text-center" style={{ ...PANEL, animation: "fadeUp 0.5s ease-out" }}>
        <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(124,58,237,0.5)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
        <h2 className="text-xl font-bold text-white/90 mb-2" style={{ fontFamily: "'Outfit',sans-serif" }}>Esperando rival...</h2>
        <p className="text-white/40 text-sm mb-5">Comparte la URL con otro jugador</p>
        <button onClick={fullReset} className="mt-3 px-5 py-2 rounded-lg text-white/30 text-xs hover:text-white/60 transition-all">Cancelar</button>
      </div>
    </div>);

  // ═══ GAME ═══
  const isMyTurn = gs.current === myId;
  const CELL = typeof window !== "undefined" && window.innerWidth < 640 ? 90 : 110;

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: BG }}>
      <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
      <div className="relative z-10 flex flex-col items-center w-full max-w-2xl mx-auto px-2 sm:px-4 py-3 sm:py-6 min-h-screen pt-12">
        <h1 className="text-xl sm:text-2xl font-black mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#a78bfa,#7c3aed,#a78bfa)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Tres en Raya</h1>
        {/* Scoreboard */}
        <div className="flex items-center gap-3 sm:gap-4 mb-2 px-3 sm:px-5 py-2 rounded-2xl w-full justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[P1, P2].map(pid => (<div key={pid} className="flex items-center gap-1.5 sm:gap-2"><div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full" style={{ background: gs.players[pid] ? colorGrad(gs.players[pid].color) : "#555", boxShadow: pid === myId ? "0 0 10px rgba(255,255,255,0.2)" : "none" }} /><span className={`text-xs sm:text-sm font-semibold truncate max-w-[70px] sm:max-w-none ${pid === myId ? 'text-white/90' : 'text-white/50'}`}>{pName(pid)} ({pMark(pid)}){pid === myId ? " tú" : ""}</span><span className="text-white font-bold text-base sm:text-lg">{gs.scores[pid]}</span>{pid === P1 && <span className="text-white/15 text-base mx-0.5">—</span>}</div>))}
        </div>
        {/* Tabs */}
        <div className="flex sm:hidden w-full gap-1 mb-2 px-1">
          {[{ id: "board", label: "🎮 Tablero" }, { id: "chat", label: `💬 Chat` }].map(t => (<button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'text-white' : 'text-white/35'}`} style={{ background: tab === t.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", border: tab === t.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.04)" }}>{t.label}</button>))}
        </div>
        <div className="flex flex-col lg:flex-row items-start justify-center gap-4 w-full">
          {/* Board */}
          <div className={`flex flex-col items-center w-full lg:w-auto ${tab !== "board" ? "hidden sm:flex" : "flex"}`}>
            {!gs.winner && !gs.isDraw && gs.phase === "playing" && (
              <div className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-xl" style={{ background: isMyTurn ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.03)", border: isMyTurn ? "1px solid rgba(124,58,237,0.15)" : "1px solid rgba(255,255,255,0.05)" }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: gs.players[gs.current] ? colorGrad(gs.players[gs.current].color) : "#888", animation: "winPulse 1s infinite alternate" }} />
                <span className="text-white/60 text-xs sm:text-sm">{isMyTurn ? <span className="text-white font-semibold">¡Tu turno! ({pMark(myId)})</span> : <>Turno de <span className="text-white font-semibold">{pName(gs.current)}</span></>}</span>
              </div>)}
            <div className="grid grid-cols-3 rounded-2xl p-2" style={{ gap: "6px", background: "linear-gradient(145deg,rgba(20,24,48,0.95),rgba(10,14,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
              {gs.board.map((cell, i) => (
                <div key={i} onClick={() => handleMove(i)}
                  className="flex items-center justify-center rounded-xl transition-all duration-200 hover:bg-white/5"
                  style={{ width: `${CELL}px`, height: `${CELL}px`, background: "rgba(10,14,26,0.7)", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4)", cursor: isMyTurn && cell === 0 && !gs.winner && !gs.isDraw ? "pointer" : "default" }}>
                  {cell === P1 && <XMark isWin={isWC(i)} isNew={lastCell === i} />}
                  {cell === P2 && <OMark isWin={isWC(i)} isNew={lastCell === i} />}
                </div>
              ))}
            </div>
            {(gs.winner || gs.isDraw) && (
              <div className="mt-4 flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", animation: "bounceIn 0.5s ease-out" }}>
                <div className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>{gs.isDraw ? "🤝 ¡Empate!" : gs.winner === myId ? "🏆 ¡Has ganado!" : `😔 ${pName(gs.winner)} gana`}</div>
                <div className="flex gap-2.5">
                  <button onClick={playAgain} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:scale-105 transition-all" style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>Otra vez</button>
                  <button onClick={fullReset} className="px-4 py-2 rounded-xl text-white/50 text-sm font-semibold hover:text-white/80 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>Nueva sala</button>
                </div>
              </div>)}
          </div>
          {/* Chat */}
          <ChatBox chatMsgs={chatMsgs} chatInput={chatInput} setChatInput={setChatInput} sendChat={sendChat} myId={myId} players={gs.players} tab={tab} accentGrad="linear-gradient(135deg,#7c3aed,#4c1d95)" />
        </div>
      </div>
    </div>);
}
