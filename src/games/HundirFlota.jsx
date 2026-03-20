import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { ref, set, onValue, remove } from "firebase/database";
import { STYLES, Orbs, Orb, colorGrad, BG, PANEL, BackButton, P1, P2, sanitizePlayers, ChatBox } from "./shared.jsx";

const GAME_REF = "hundir-flota/game";
const CHAT_REF = "hundir-flota/chat";
const SIZE = 8;
const SHIPS = [{ name: "Portaaviones", len: 4 }, { name: "Crucero", len: 3 }, { name: "Destructor", len: 2 }, { name: "Submarino", len: 2 }];
const TOTAL_HITS = SHIPS.reduce((s, sh) => s + sh.len, 0); // 11

const emptyGrid = () => Array(SIZE * SIZE).fill(0);
// Cell states: 0=empty, 1=ship, 2=miss, 3=hit

const defaultState = () => ({
  phase: "lobby", current: P1, winner: null,
  players: { 1: null, 2: null }, scores: { 1: 0, 2: 0 },
  boards: { 1: emptyGrid(), 2: emptyGrid() },
  shots: { 1: emptyGrid(), 2: emptyGrid() }, // what each player has shot at opponent
  ready: { 1: false, 2: false },
  hits: { 1: 0, 2: 0 },
  moveCount: 0, version: 0, lastShot: null,
});

const sanitize = (data) => {
  if (!data) return defaultState();
  const d = { ...defaultState(), ...data };
  d.players = sanitizePlayers(d.players);
  if (!d.boards || typeof d.boards !== "object") d.boards = { 1: emptyGrid(), 2: emptyGrid() };
  if (!d.shots || typeof d.shots !== "object") d.shots = { 1: emptyGrid(), 2: emptyGrid() };
  if (!d.ready || typeof d.ready !== "object") d.ready = { 1: false, 2: false };
  if (!d.hits || typeof d.hits !== "object") d.hits = { 1: 0, 2: 0 };
  if (!d.scores) d.scores = { 1: 0, 2: 0 };
  // Ensure arrays
  [1, 2].forEach(p => {
    if (!Array.isArray(d.boards[p]) || d.boards[p].length !== SIZE * SIZE) d.boards[p] = emptyGrid();
    if (!Array.isArray(d.shots[p]) || d.shots[p].length !== SIZE * SIZE) d.shots[p] = emptyGrid();
  });
  return d;
};

const fbSave = async (path, data) => { try { await set(ref(db, path), data); } catch (e) { console.error(e); } };
const fbDel = async () => { try { await remove(ref(db, "hundir-flota")); } catch (e) { console.error(e); } };

const canPlace = (grid, startIdx, len, horizontal) => {
  const r = Math.floor(startIdx / SIZE), c = startIdx % SIZE;
  for (let i = 0; i < len; i++) {
    const nr = horizontal ? r : r + i, nc = horizontal ? c + i : c;
    if (nr >= SIZE || nc >= SIZE) return false;
    if (grid[nr * SIZE + nc] !== 0) return false;
  }
  return true;
};

const placeShip = (grid, startIdx, len, horizontal) => {
  const g = [...grid]; const r = Math.floor(startIdx / SIZE), c = startIdx % SIZE;
  for (let i = 0; i < len; i++) { const nr = horizontal ? r : r + i, nc = horizontal ? c + i : c; g[nr * SIZE + nc] = 1; }
  return g;
};

// ═══ GRID COMPONENT ═══
const Grid = ({ grid, shots, onClick, showShips, isSetup, highlight, size }) => {
  const cs = size || (typeof window !== "undefined" && window.innerWidth < 640 ? 34 : 38);
  const letters = "ABCDEFGH".split("");
  return (
    <div>
      {/* Column headers */}
      <div className="flex ml-6" style={{ gap: "1px" }}>
        {Array.from({ length: SIZE }).map((_, i) => (
          <div key={i} className="text-center text-white/25 text-xs font-semibold" style={{ width: `${cs}px`, fontFamily: "'DM Sans',sans-serif" }}>{i + 1}</div>
        ))}
      </div>
      {Array.from({ length: SIZE }).map((_, r) => (
        <div key={r} className="flex items-center" style={{ gap: "1px" }}>
          <div className="w-5 text-right text-white/25 text-xs font-semibold mr-1" style={{ fontFamily: "'DM Sans',sans-serif" }}>{letters[r]}</div>
          {Array.from({ length: SIZE }).map((_, c) => {
            const idx = r * SIZE + c;
            const ship = grid[idx] === 1;
            const shot = shots ? shots[idx] : 0;
            const isHit = ship && shot === 1;
            const isMiss = !ship && shot === 1;
            const isHighlight = highlight?.includes(idx);
            const isInvalid = highlight === false;
            let bg = "rgba(10,14,26,0.7)";
            if (showShips && ship && !isHit) bg = "rgba(56,189,248,0.25)";
            if (isHit) bg = "rgba(239,68,68,0.35)";
            if (isMiss) bg = "rgba(255,255,255,0.06)";
            if (isHighlight) bg = "rgba(56,189,248,0.3)";
            return (
              <div key={c} onClick={() => onClick?.(idx)}
                className="flex items-center justify-center rounded-sm transition-all duration-150"
                style={{ width: `${cs}px`, height: `${cs}px`, background: bg, boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)", cursor: onClick ? "pointer" : "default", border: isHighlight ? "1px solid rgba(56,189,248,0.4)" : "1px solid rgba(255,255,255,0.03)" }}>
                {isHit && <span className="text-red-400 text-sm" style={{ animation: "explode 0.4s ease-out" }}>💥</span>}
                {isMiss && <div className="w-2 h-2 rounded-full bg-white/15" style={{ animation: "splash 0.3s ease-out" }} />}
                {showShips && ship && !isHit && <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(56,189,248,0.6)" }} />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default function HundirFlota({ onBack }) {
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState(null);
  const [joinName, setJoinName] = useState("");
  const [gs, setGs] = useState(defaultState());
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [tab, setTab] = useState("board");
  const chatEndRef = useRef(null);

  // Setup state (local only)
  const [setupGrid, setSetupGrid] = useState(emptyGrid());
  const [shipIdx, setShipIdx] = useState(0);
  const [horizontal, setHorizontal] = useState(true);
  const [hoverCells, setHoverCells] = useState(null);

  const pName = (pid, s = gs) => s.players[pid]?.name || `Jugador ${pid}`;

  useEffect(() => {
    const u1 = onValue(ref(db, GAME_REF), (snap) => { setGs(sanitize(snap.val())); });
    const u2 = onValue(ref(db, CHAT_REF), (snap) => { const d = snap.val(); if (d) setChatMsgs(d); });
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  const createRoom = async () => {
    if (!myName.trim()) return;
    const c = myColor || "green";
    const f = { ...defaultState(), players: { 1: { name: myName.trim(), color: c }, 2: null }, phase: "setup", version: 1 };
    await fbSave(GAME_REF, f);
    await fbSave(CHAT_REF, [{ type: "system", text: `🚢 ${myName.trim()} ha creado la sala.`, ts: Date.now() }]);
    setMyId(P1); setMyColor(c); setSetupGrid(emptyGrid()); setShipIdx(0);
  };

  const joinRoom = async () => {
    if (!joinName.trim() || !gs.players[1]) return;
    const c2 = gs.players[1].color === "green" ? "yellow" : "green";
    const u = { ...gs, players: { ...gs.players, 2: { name: joinName.trim(), color: c2 } }, phase: "setup", version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, u);
    const m = [...(chatMsgs || []), { type: "system", text: `🚢 ${joinName.trim()} se ha unido. ¡Coloca tus barcos!`, ts: Date.now() }];
    await fbSave(CHAT_REF, m);
    setMyId(P2); setMyName(joinName.trim()); setMyColor(c2); setSetupGrid(emptyGrid()); setShipIdx(0);
  };

  // ── SETUP: place ships ──
  const handleSetupClick = (idx) => {
    if (shipIdx >= SHIPS.length) return;
    const ship = SHIPS[shipIdx];
    if (!canPlace(setupGrid, idx, ship.len, horizontal)) return;
    const ng = placeShip(setupGrid, idx, ship.len, horizontal);
    setSetupGrid(ng);
    setShipIdx(shipIdx + 1);
    setHoverCells(null);
  };

  const handleSetupHover = (idx) => {
    if (shipIdx >= SHIPS.length) return;
    const ship = SHIPS[shipIdx];
    const r = Math.floor(idx / SIZE), c = idx % SIZE;
    const cells = [];
    let valid = true;
    for (let i = 0; i < ship.len; i++) {
      const nr = horizontal ? r : r + i, nc = horizontal ? c + i : c;
      if (nr >= SIZE || nc >= SIZE) { valid = false; break; }
      const nidx = nr * SIZE + nc;
      if (setupGrid[nidx] !== 0) { valid = false; break; }
      cells.push(nidx);
    }
    setHoverCells(valid ? cells : false);
  };

  const confirmSetup = async () => {
    if (shipIdx < SHIPS.length) return;
    const nb = { ...gs.boards, [myId]: setupGrid };
    const nr = { ...gs.ready, [myId]: true };
    const otherReady = gs.ready[myId === P1 ? P2 : P1];
    const ns = { ...gs, boards: nb, ready: nr, phase: otherReady ? "playing" : "setup", version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, ns);
    if (otherReady) { const m = [...(chatMsgs || []), { type: "system", text: "⚔️ ¡Ambos listos! Comienza la batalla.", ts: Date.now() }]; await fbSave(CHAT_REF, m); }
    else { const m = [...(chatMsgs || []), { type: "system", text: `✅ ${myName} ha colocado sus barcos.`, ts: Date.now() }]; await fbSave(CHAT_REF, m); }
  };

  // ── GAME: shoot ──
  const handleShoot = async (idx) => {
    if (gs.phase !== "playing" || gs.current !== myId || gs.winner) return;
    const opId = myId === P1 ? P2 : P1;
    const myShots = [...(gs.shots[myId] || emptyGrid())];
    if (myShots[idx] !== 0) return; // already shot here
    myShots[idx] = 1;
    const opBoard = gs.boards[opId] || emptyGrid();
    const isHit = opBoard[idx] === 1;
    const newHits = { ...gs.hits, [myId]: (gs.hits[myId] || 0) + (isHit ? 1 : 0) };
    let ns = { ...gs, shots: { ...gs.shots, [myId]: myShots }, hits: newHits, lastShot: { player: myId, idx, hit: isHit }, moveCount: (gs.moveCount || 0) + 1, version: (gs.version || 0) + 1 };
    if (newHits[myId] >= TOTAL_HITS) {
      ns.winner = myId; ns.phase = "over"; ns.scores = { ...gs.scores, [myId]: (gs.scores[myId] || 0) + 1 };
    } else {
      ns.current = opId;
    }
    await fbSave(GAME_REF, ns);
    const emoji = isHit ? "💥" : "💧";
    const m = [...(chatMsgs || []), { type: "system", text: `${emoji} ${myName} dispara... ${isHit ? "¡Tocado!" : "Agua"}`, ts: Date.now() }];
    await fbSave(CHAT_REF, m);
    if (ns.winner) { const m2 = [...m, { type: "system", text: `🏆 ¡${myName} ha hundido toda la flota!`, ts: Date.now() }]; await fbSave(CHAT_REF, m2); }
  };

  const playAgain = async () => {
    const ns = { ...gs, boards: { 1: emptyGrid(), 2: emptyGrid() }, shots: { 1: emptyGrid(), 2: emptyGrid() }, ready: { 1: false, 2: false }, hits: { 1: 0, 2: 0 }, current: P1, winner: null, phase: "setup", moveCount: 0, lastShot: null, version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, ns);
    await fbSave(CHAT_REF, [...(chatMsgs || []), { type: "system", text: "🔄 ¡Nueva batalla!", ts: Date.now() }]);
    setSetupGrid(emptyGrid()); setShipIdx(0);
  };
  const fullReset = async () => { await fbDel(); setGs(defaultState()); setChatMsgs([]); setMyId(null); setMyName(""); setMyColor(null); setJoinName(""); setSetupGrid(emptyGrid()); setShipIdx(0); };
  const sendChat = async () => { if (!chatInput.trim() || !myId) return; await fbSave(CHAT_REF, [...(chatMsgs || []), { type: "player", player: myId, name: myName, text: chatInput.trim(), ts: Date.now() }]); setChatInput(""); };

  // ═══ LOBBY ═══
  if (!myId) {
    const roomExists = !!(gs.players && gs.players[1]);
    const roomFull = !!(gs.players && gs.players[1] && gs.players[2]);
    return (
      <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: BG }}>
        <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
        <div className="relative z-10 p-8 rounded-3xl max-w-md w-full mx-4" style={{ ...PANEL, animation: "fadeUp 0.5s ease-out" }}>
          <h1 className="text-3xl font-black text-center mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#38bdf8,#0369a1,#38bdf8)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Hundir la Flota</h1>
          <p className="text-center text-white/35 text-sm mb-7" style={{ fontFamily: "'DM Sans',sans-serif" }}>Batalla naval · Multijugador</p>
          {!roomExists && (<div style={{ animation: "fadeUp 0.4s ease-out" }}>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} value={myName} onChange={e => setMyName(e.target.value)} placeholder="Ej: Almirante" />
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-3">Elige tu color</label>
            <div className="flex gap-3 mb-6">{["green", "yellow"].map(c => (<button key={c} onClick={() => setMyColor(c)} className={`flex-1 py-3.5 rounded-xl text-white font-bold transition-all hover:scale-105 ${myColor === c ? 'ring-2 ring-white/40 scale-105' : 'opacity-60'}`} style={{ background: colorGrad(c) }}>{c === "green" ? "🟢 Verde" : "🟡 Amarillo"}</button>))}</div>
            <button onClick={createRoom} disabled={!myName.trim() || !myColor} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{ background: "linear-gradient(135deg,#0369a1,#1e3a5f)" }}>Crear sala 🚀</button>
          </div>)}
          {roomExists && !roomFull && (<div style={{ animation: "fadeUp 0.4s ease-out" }}>
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.12)" }}><div className="w-3 h-3 rounded-full" style={{ background: "#38bdf8", animation: "winPulse 1.2s infinite alternate" }} /><span className="text-white/70 text-sm"><span className="text-white font-semibold">{gs.players[1]?.name}</span> está esperando...</span></div>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Ej: Capitán" />
            <button onClick={joinRoom} disabled={!joinName.trim()} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{ background: "linear-gradient(135deg,#0369a1,#1e3a5f)" }}>Unirse 🎯</button>
          </div>)}
          {roomFull && (<div className="text-center" style={{ animation: "fadeUp 0.4s ease-out" }}>
            <p className="text-white/50 text-sm mb-4">Partida en curso</p>
            <div className="flex gap-3">
              <button onClick={() => { setMyId(P1); setMyName(gs.players[1]?.name || "J1"); setMyColor(gs.players[1]?.color || "green"); if (!gs.ready[P1]) { setSetupGrid(emptyGrid()); setShipIdx(0); } }} className="flex-1 py-3 rounded-xl text-white font-semibold hover:scale-105 transition-all" style={{ background: colorGrad(gs.players[1]?.color || "green") }}>Soy {gs.players[1]?.name}</button>
              <button onClick={() => { setMyId(P2); setMyName(gs.players[2]?.name || "J2"); setMyColor(gs.players[2]?.color || "yellow"); if (!gs.ready[P2]) { setSetupGrid(emptyGrid()); setShipIdx(0); } }} className="flex-1 py-3 rounded-xl text-white font-semibold hover:scale-105 transition-all" style={{ background: colorGrad(gs.players[2]?.color || "yellow") }}>Soy {gs.players[2]?.name}</button>
            </div>
            <button onClick={fullReset} className="mt-3 w-full py-2.5 rounded-xl text-white/40 text-sm hover:text-white/70 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>Reiniciar todo</button>
          </div>)}
        </div>
      </div>);
  }

  // ═══ WAITING (no P2 yet) ═══
  if (!gs.players[2] && myId === P1) return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: BG }}>
      <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
      <div className="relative z-10 p-8 rounded-3xl max-w-sm w-full mx-4 text-center" style={{ ...PANEL, animation: "fadeUp 0.5s ease-out" }}>
        <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(56,189,248,0.5)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
        <h2 className="text-xl font-bold text-white/90 mb-2" style={{ fontFamily: "'Outfit',sans-serif" }}>Esperando rival...</h2>
        <p className="text-white/40 text-sm mb-5">Comparte la URL con otro jugador</p>
        <button onClick={fullReset} className="mt-3 px-5 py-2 rounded-lg text-white/30 text-xs hover:text-white/60 transition-all">Cancelar</button>
      </div>
    </div>);

  // ═══ SETUP PHASE ═══
  if (gs.phase === "setup" && !gs.ready[myId]) {
    const allPlaced = shipIdx >= SHIPS.length;
    const currentShip = !allPlaced ? SHIPS[shipIdx] : null;
    return (
      <div className="relative min-h-screen w-full overflow-hidden" style={{ background: BG }}>
        <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
        <div className="relative z-10 flex flex-col items-center px-2 sm:px-4 py-6 sm:py-10 min-h-screen pt-12">
          <h1 className="text-xl sm:text-2xl font-black mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#38bdf8,#0369a1,#38bdf8)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Coloca tus barcos</h1>
          {currentShip && (
            <div className="flex items-center gap-3 mb-3">
              <span className="text-white/60 text-sm" style={{ fontFamily: "'DM Sans',sans-serif" }}>
                {currentShip.name} ({currentShip.len} casillas) — {horizontal ? "Horizontal" : "Vertical"}
              </span>
              <button onClick={() => setHorizontal(!horizontal)} className="px-3 py-1 rounded-lg text-white/60 text-xs font-semibold hover:text-white transition-all" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                🔄 Rotar
              </button>
            </div>
          )}
          {allPlaced && <p className="text-white/50 text-sm mb-3" style={{ fontFamily: "'DM Sans',sans-serif" }}>¡Todos los barcos colocados!</p>}
          <div className="p-2 rounded-2xl mb-4" style={{ background: "linear-gradient(145deg,rgba(20,24,48,0.95),rgba(10,14,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
            <Grid grid={setupGrid} shots={null} showShips={true}
              highlight={hoverCells}
              onClick={!allPlaced ? handleSetupClick : undefined}
              isSetup={true} />
          </div>
          <div className="flex gap-3">
            {allPlaced && (
              <button onClick={confirmSetup} className="px-6 py-2.5 rounded-xl text-white font-semibold hover:scale-105 transition-all" style={{ background: "linear-gradient(135deg,#0369a1,#1e3a5f)", boxShadow: "0 4px 20px rgba(3,105,161,0.3)" }}>
                ✅ Listo para combatir
              </button>
            )}
            <button onClick={() => { setSetupGrid(emptyGrid()); setShipIdx(0); setHoverCells(null); }} className="px-4 py-2.5 rounded-xl text-white/40 text-sm hover:text-white/70 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              Reiniciar barcos
            </button>
          </div>
          {/* Ship list */}
          <div className="flex gap-2 mt-4 flex-wrap justify-center">
            {SHIPS.map((sh, i) => (
              <div key={i} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${i < shipIdx ? 'text-white/60' : i === shipIdx ? 'text-white' : 'text-white/25'}`}
                style={{ background: i < shipIdx ? "rgba(56,189,248,0.15)" : i === shipIdx ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.03)", border: i === shipIdx ? "1px solid rgba(56,189,248,0.3)" : "1px solid rgba(255,255,255,0.05)" }}>
                {i < shipIdx ? "✅" : "🚢"} {sh.name} ({sh.len})
              </div>
            ))}
          </div>
        </div>
      </div>);
  }

  // ═══ WAITING FOR OTHER PLAYER SETUP ═══
  if (gs.phase === "setup" && gs.ready[myId]) return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: BG }}>
      <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
      <div className="relative z-10 p-8 rounded-3xl max-w-sm w-full mx-4 text-center" style={{ ...PANEL, animation: "fadeUp 0.5s ease-out" }}>
        <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(56,189,248,0.5)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
        <h2 className="text-xl font-bold text-white/90 mb-2" style={{ fontFamily: "'Outfit',sans-serif" }}>Esperando al rival...</h2>
        <p className="text-white/40 text-sm mb-5">Tu oponente está colocando sus barcos</p>
      </div>
    </div>);

  // ═══ BATTLE ═══
  const isMyTurn = gs.current === myId;
  const opId = myId === P1 ? P2 : P1;
  const myBoard = gs.boards[myId] || emptyGrid();
  const opShots = gs.shots[opId] || emptyGrid(); // what opponent shot at my board
  const myShots = gs.shots[myId] || emptyGrid(); // what I shot at opponent

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: BG }}>
      <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
      <Orb color="radial-gradient(circle,#06b6d4,transparent)" size="280px" x="85%" y="-8%" dur={10} delay={3} />
      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl mx-auto px-2 sm:px-4 py-3 sm:py-6 min-h-screen pt-12">
        <h1 className="text-xl sm:text-2xl font-black mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#38bdf8,#0369a1,#38bdf8)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Hundir la Flota</h1>
        {/* Scoreboard */}
        <div className="flex items-center gap-3 mb-2 px-3 sm:px-5 py-2 rounded-2xl w-full justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[P1, P2].map(pid => (<div key={pid} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ background: gs.players[pid] ? colorGrad(gs.players[pid].color) : "#555" }} /><span className={`text-xs sm:text-sm font-semibold truncate max-w-[70px] sm:max-w-none ${pid === myId ? 'text-white/90' : 'text-white/50'}`}>{pName(pid)}{pid === myId ? " (tú)" : ""}</span><span className="text-white font-bold text-base">{gs.scores[pid]}</span>{pid === P1 && <span className="text-white/15 mx-0.5">—</span>}</div>))}
        </div>
        {/* Turn */}
        {!gs.winner && gs.phase === "playing" && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl" style={{ background: isMyTurn ? "rgba(56,189,248,0.06)" : "rgba(255,255,255,0.03)", border: isMyTurn ? "1px solid rgba(56,189,248,0.12)" : "1px solid rgba(255,255,255,0.05)" }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: gs.players[gs.current] ? colorGrad(gs.players[gs.current].color) : "#888", animation: "winPulse 1s infinite alternate" }} />
            <span className="text-white/60 text-xs sm:text-sm">{isMyTurn ? <span className="text-white font-semibold">¡Tu turno! Dispara al tablero enemigo</span> : <>Turno de <span className="text-white font-semibold">{pName(gs.current)}</span></>}</span>
          </div>)}
        {/* Tabs */}
        <div className="flex sm:hidden w-full gap-1 mb-2 px-1">
          {[{ id: "board", label: "⚔️ Batalla" }, { id: "chat", label: "💬 Chat" }].map(t => (<button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'text-white' : 'text-white/35'}`} style={{ background: tab === t.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", border: tab === t.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.04)" }}>{t.label}</button>))}
        </div>
        <div className="flex flex-col lg:flex-row items-start justify-center gap-4 w-full">
          <div className={`flex flex-col sm:flex-row items-center sm:items-start gap-4 w-full lg:w-auto ${tab !== "board" ? "hidden sm:flex" : "flex"}`}>
            {/* Opponent grid (where I shoot) */}
            <div className="flex flex-col items-center">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-1">{pName(opId)} (enemigo)</p>
              <div className="p-1.5 rounded-xl" style={{ background: "linear-gradient(145deg,rgba(20,24,48,0.95),rgba(10,14,26,0.98))", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Grid grid={gs.boards[opId] || emptyGrid()} shots={myShots} showShips={!!gs.winner}
                  onClick={isMyTurn && !gs.winner ? handleShoot : undefined} />
              </div>
            </div>
            {/* My grid (my ships + opponent shots) */}
            <div className="flex flex-col items-center">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-1">Tu flota</p>
              <div className="p-1.5 rounded-xl" style={{ background: "linear-gradient(145deg,rgba(20,24,48,0.95),rgba(10,14,26,0.98))", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Grid grid={myBoard} shots={opShots} showShips={true} />
              </div>
            </div>
          </div>
          {/* Chat */}
          <ChatBox chatMsgs={chatMsgs} chatInput={chatInput} setChatInput={setChatInput} sendChat={sendChat} myId={myId} players={gs.players} tab={tab} accentGrad="linear-gradient(135deg,#0369a1,#1e3a5f)" />
        </div>
        {/* Result */}
        {gs.winner && (
          <div className="mt-4 flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", animation: "bounceIn 0.5s ease-out" }}>
            <div className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>{gs.winner === myId ? "🏆 ¡Has hundido la flota enemiga!" : `😔 ${pName(gs.winner)} ha ganado`}</div>
            <div className="flex gap-2.5">
              <button onClick={playAgain} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:scale-105 transition-all" style={{ background: "linear-gradient(135deg,#0369a1,#1e3a5f)" }}>Otra vez</button>
              <button onClick={fullReset} className="px-4 py-2 rounded-xl text-white/50 text-sm font-semibold hover:text-white/80 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>Nueva sala</button>
            </div>
          </div>)}
      </div>
    </div>);
}
