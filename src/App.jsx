import { useState, useEffect, useRef, useCallback } from "react";

const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const P1 = 1;
const P2 = 2;
const POLL_MS = 600;
const GAME_KEY = "unir-puntos-state";
const CHAT_KEY = "unir-puntos-chat";
const PASSWORD = "puntos2026";

const createBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));

const checkWin = (board, player) => {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        let cells = [[r, c]];
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
};

const isFull = (board) => board[0].every(cell => cell !== EMPTY);
const getDropRow = (board, col) => {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === EMPTY) return r;
  }
  return -1;
};

const defaultState = () => ({
  phase: "lobby",
  board: createBoard(),
  current: P1,
  winner: null,
  winCells: null,
  lastMove: null,
  isDraw: false,
  players: { [P1]: null, [P2]: null },
  scores: { [P1]: 0, [P2]: 0 },
  moveCount: 0,
  version: 0,
});

const Orb = ({ color, size, x, y, dur, delay }) => (
  <div className="absolute rounded-full opacity-20 blur-3xl pointer-events-none"
    style={{ background: color, width: size, height: size, left: x, top: y,
      animation: `orbFloat ${dur}s ease-in-out ${delay}s infinite alternate` }} />
);

const Piece = ({ color, isWinning, isLast, isNew }) => {
  const palette = {
    green:  { bg: "radial-gradient(circle at 35% 35%, #4ade80, #16a34a, #065f27)", glow: "0 0 20px rgba(74,222,128,0.5), inset 0 -3px 6px rgba(0,0,0,0.3)" },
    yellow: { bg: "radial-gradient(circle at 35% 35%, #fbbf24, #f59e0b, #b45309)", glow: "0 0 20px rgba(251,191,36,0.5), inset 0 -3px 6px rgba(0,0,0,0.3)" },
  };
  const s = palette[color];
  if (!s) return null;
  return (
    <div className="absolute inset-1 rounded-full" style={{
      background: s.bg, boxShadow: s.glow,
      animation: isNew ? "dropPiece 0.45s cubic-bezier(0.34,1.2,0.64,1) forwards"
        : isWinning ? "winPulse 0.8s ease-in-out infinite alternate" : "none",
      opacity: isNew ? 0 : 1,
    }}>
      {isLast && !isWinning && (
        <div className="absolute inset-0 rounded-full border-2 border-white/50"
          style={{ animation: "ringPulse 1.5s ease-in-out infinite" }} />
      )}
      <div className="absolute rounded-full" style={{
        width: "38%", height: "22%", top: "14%", left: "22%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.45), transparent)",
        borderRadius: "50%",
      }} />
    </div>
  );
};

const STYLES = `
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
@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
.shake { animation: shake 0.45s ease-in-out; }
`;

const colorGrad = (c) => c === "green"
  ? "linear-gradient(135deg, #4ade80, #16a34a)"
  : "linear-gradient(135deg, #fbbf24, #f59e0b)";

export default function UnirPuntos() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState(null);
  const [joinName, setJoinName] = useState("");

  const [gs, setGs] = useState(defaultState());
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [hoverCol, setHoverCol] = useState(-1);
  const [animCell, setAnimCell] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);

  const chatEndRef = useRef(null);
  const pollRef = useRef(null);
  const prevMoveCount = useRef(0);

  const playerName = (pid, state = gs) => {
    const p = state.players[pid];
    return p ? p.name : `Jugador ${pid}`;
  };

  const saveState = async (s) => {
    try { await window.storage.set(GAME_KEY, JSON.stringify(s), true); } catch(e) { console.error(e); }
  };
  const loadState = async () => {
    try { const r = await window.storage.get(GAME_KEY, true); if (r?.value) return JSON.parse(r.value); } catch {} return null;
  };
  const saveChat = async (m) => {
    try { await window.storage.set(CHAT_KEY, JSON.stringify(m), true); } catch(e) { console.error(e); }
  };
  const loadChat = async () => {
    try { const r = await window.storage.get(CHAT_KEY, true); if (r?.value) return JSON.parse(r.value); } catch {} return [];
  };

  // Polling
  useEffect(() => {
    if (!authed) return;
    const poll = async () => {
      const remote = await loadState();
      if (remote && remote.version > lastSeen) {
        if (remote.lastMove && remote.moveCount > prevMoveCount.current) {
          setAnimCell(remote.lastMove);
          setTimeout(() => setAnimCell(null), 480);
        }
        prevMoveCount.current = remote.moveCount;
        setGs(remote);
        setLastSeen(remote.version);
      }
      const msgs = await loadChat();
      if (msgs && msgs.length !== chatMsgs.length) setChatMsgs(msgs);
    };
    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [authed, lastSeen, chatMsgs.length]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  // Actions
  const handleCreateRoom = async () => {
    if (!myName.trim()) return;
    const color = myColor || "green";
    const fresh = { ...defaultState(), players: { [P1]: { name: myName.trim(), color }, [P2]: null }, version: 1 };
    await saveState(fresh);
    const msgs = [{ type: "system", text: `🎮 ${myName.trim()} ha creado la sala.`, ts: Date.now() }];
    await saveChat(msgs);
    setMyId(P1); setMyColor(color); setGs(fresh); setLastSeen(1); setChatMsgs(msgs);
    prevMoveCount.current = 0;
  };

  const handleJoinRoom = async () => {
    if (!joinName.trim()) return;
    const remote = await loadState();
    if (!remote?.players[P1]) return;
    const p2Color = remote.players[P1].color === "green" ? "yellow" : "green";
    const updated = { ...remote, players: { ...remote.players, [P2]: { name: joinName.trim(), color: p2Color } }, phase: "playing", version: remote.version + 1 };
    await saveState(updated);
    const msgs = await loadChat();
    const newMsgs = [...msgs, { type: "system", text: `🎮 ${joinName.trim()} se ha unido. ¡A jugar!`, ts: Date.now() }];
    await saveChat(newMsgs);
    setMyId(P2); setMyName(joinName.trim()); setMyColor(p2Color); setGs(updated); setLastSeen(updated.version); setChatMsgs(newMsgs);
    prevMoveCount.current = 0;
  };

  const handleDrop = async (col) => {
    if (animating || gs.winner || gs.isDraw || gs.phase !== "playing" || gs.current !== myId) return;
    const row = getDropRow(gs.board, col);
    if (row < 0) return;
    setAnimating(true);
    const newBoard = gs.board.map(r => [...r]);
    newBoard[row][col] = gs.current;
    let ns = { ...gs, board: newBoard, lastMove: { row, col }, moveCount: gs.moveCount + 1, version: gs.version + 1 };
    const win = checkWin(newBoard, gs.current);
    if (win) { ns.winner = gs.current; ns.winCells = win; ns.scores = { ...gs.scores, [gs.current]: gs.scores[gs.current] + 1 }; ns.phase = "over"; }
    else if (isFull(newBoard)) { ns.isDraw = true; ns.phase = "over"; }
    else { ns.current = gs.current === P1 ? P2 : P1; }
    setAnimCell({ row, col });
    prevMoveCount.current = ns.moveCount;
    await saveState(ns);
    setGs(ns); setLastSeen(ns.version);
    if (win) { const m = [...chatMsgs, { type: "system", text: `🏆 ¡${playerName(gs.current, ns)} ha ganado!`, ts: Date.now() }]; await saveChat(m); setChatMsgs(m); }
    else if (ns.isDraw) { const m = [...chatMsgs, { type: "system", text: "🤝 ¡Empate!", ts: Date.now() }]; await saveChat(m); setChatMsgs(m); }
    setTimeout(() => { setAnimating(false); setAnimCell(null); }, 480);
  };

  const handlePlayAgain = async () => {
    const ns = { ...gs, board: createBoard(), current: P1, winner: null, winCells: null, lastMove: null, isDraw: false, phase: "playing", moveCount: 0, version: gs.version + 1 };
    await saveState(ns);
    const m = [...chatMsgs, { type: "system", text: "🔄 ¡Nueva partida!", ts: Date.now() }];
    await saveChat(m); setGs(ns); setLastSeen(ns.version); setChatMsgs(m);
    prevMoveCount.current = 0;
  };

  const handleFullReset = async () => {
    try { await window.storage.delete(GAME_KEY, true); } catch {}
    try { await window.storage.delete(CHAT_KEY, true); } catch {}
    setGs(defaultState()); setChatMsgs([]); setMyId(null); setMyName(""); setMyColor(null); setJoinName(""); setLastSeen(0);
    prevMoveCount.current = 0;
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !myId) return;
    const m = [...chatMsgs, { type: "player", player: myId, name: myName, text: chatInput.trim(), ts: Date.now() }];
    await saveChat(m); setChatMsgs(m); setChatInput("");
  };

  const isWinCell = (r, c) => gs.winCells?.some(([wr, wc]) => wr === r && wc === c);

  const orbs = (
    <>
      <Orb color="radial-gradient(circle, #4c1d95, transparent)" size="450px" x="-8%" y="8%" dur={7} delay={0} />
      <Orb color="radial-gradient(circle, #1e3a5f, transparent)" size="380px" x="68%" y="55%" dur={9} delay={1} />
      <Orb color="radial-gradient(circle, #ec4899, transparent)" size="320px" x="45%" y="-12%" dur={8} delay={2} />
    </>
  );

  // ═══ PASSWORD ═══
  if (!authed) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0a0e1a 0%, #141830 50%, #0a0e1a 100%)" }}>
        <style>{STYLES}</style>
        {orbs}
        <div className="relative z-10 p-8 rounded-3xl max-w-sm w-full mx-4" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", animation: "fadeUp 0.5s ease-out" }}>
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(251,191,36,0.12))", border: "1px solid rgba(255,255,255,0.06)" }}>🔒</div>
          </div>
          <h1 className="text-2xl font-extrabold text-center text-white/90 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Unir Puntos</h1>
          <p className="text-center text-white/35 text-sm mb-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>Introduce la contraseña para entrar</p>
          <input type="password" className={`w-full px-4 py-3 rounded-xl text-white outline-none text-center text-lg tracking-widest mb-3 transition-all ${pwError ? 'shake' : ''}`}
            style={{ background: "rgba(255,255,255,0.06)", border: pwError ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.1)", fontFamily: "'DM Sans', sans-serif" }}
            value={pwInput} onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { if (pwInput === PASSWORD) setAuthed(true); else { setPwError(true); setTimeout(() => setPwError(false), 500); } } }}
            placeholder="••••••••" autoFocus />
          {pwError && <p className="text-red-400/80 text-xs text-center mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>Contraseña incorrecta</p>}
          <button onClick={() => { if (pwInput === PASSWORD) setAuthed(true); else { setPwError(true); setTimeout(() => setPwError(false), 500); } }}
            className="w-full py-3 rounded-xl text-white font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #4ade80, #16a34a)", boxShadow: "0 8px 30px rgba(74,222,128,0.25)", fontFamily: "'Outfit', sans-serif" }}>
            Entrar
          </button>

        </div>
      </div>
    );
  }

  // ═══ LOBBY ═══
  if (!myId) {
    const roomExists = gs.players[P1] !== null;
    const roomFull = gs.players[P1] !== null && gs.players[P2] !== null;
    return (
      <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0a0e1a 0%, #141830 50%, #0a0e1a 100%)" }}>
        <style>{STYLES}</style>
        {orbs}
        <div className="relative z-10 p-8 rounded-3xl max-w-md w-full mx-4" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", animation: "fadeUp 0.5s ease-out" }}>
          <h1 className="text-3xl font-black text-center mb-1" style={{ fontFamily: "'Outfit', sans-serif", background: "linear-gradient(90deg, #4ade80, #fbbf24, #4ade80)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Unir Puntos</h1>
          <p className="text-center text-white/35 text-sm mb-7" style={{ fontFamily: "'DM Sans', sans-serif" }}>Conecta 4 en línea · Multijugador en tiempo real</p>

          {!roomExists && (
            <div style={{ animation: "fadeUp 0.4s ease-out" }}>
              <label className="block text-white/60 text-xs uppercase tracking-wider mb-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>Tu nombre</label>
              <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "'DM Sans', sans-serif" }} value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="Ej: María" />
              <label className="block text-white/60 text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>Elige tu color</label>
              <div className="flex gap-3 mb-6">
                {["green", "yellow"].map(c => (
                  <button key={c} onClick={() => setMyColor(c)} className={`flex-1 py-3.5 rounded-xl text-white font-bold transition-all hover:scale-105 ${myColor === c ? 'ring-2 ring-white/40 scale-105' : 'opacity-60'}`}
                    style={{ background: colorGrad(c), boxShadow: c === "green" ? "0 6px 25px rgba(74,222,128,0.25)" : "0 6px 25px rgba(251,191,36,0.25)", fontFamily: "'Outfit', sans-serif" }}>
                    {c === "green" ? "🟢 Verde" : "🟡 Amarillo"}
                  </button>
                ))}
              </div>
              <button onClick={handleCreateRoom} disabled={!myName.trim() || !myColor}
                className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] active:scale-[0.98] disabled:opacity-30 disabled:hover:scale-100"
                style={{ background: "linear-gradient(135deg, #4c1d95, #1e3a5f)", boxShadow: "0 8px 30px rgba(76,29,149,0.35)", fontFamily: "'Outfit', sans-serif" }}>
                Crear sala 🚀
              </button>
            </div>
          )}

          {roomExists && !roomFull && (
            <div style={{ animation: "fadeUp 0.4s ease-out" }}>
              <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl" style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.12)" }}>
                <div className="w-3 h-3 rounded-full" style={{ background: "#4ade80", animation: "winPulse 1.2s ease-in-out infinite alternate" }} />
                <span className="text-white/70 text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  <span className="text-white font-semibold">{gs.players[P1]?.name}</span> está esperando...
                </span>
              </div>
              <label className="block text-white/60 text-xs uppercase tracking-wider mb-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>Tu nombre</label>
              <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "'DM Sans', sans-serif" }} value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Ej: Carlos" />
              <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="w-4 h-4 rounded-full" style={{ background: colorGrad(gs.players[P1]?.color === "green" ? "yellow" : "green") }} />
                <span className="text-white/50 text-xs" style={{ fontFamily: "'DM Sans', sans-serif" }}>Tu color: {gs.players[P1]?.color === "green" ? "Amarillo" : "Verde"}</span>
              </div>
              <button onClick={handleJoinRoom} disabled={!joinName.trim()} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] active:scale-[0.98] disabled:opacity-30"
                style={{ background: "linear-gradient(135deg, #4c1d95, #1e3a5f)", boxShadow: "0 8px 30px rgba(76,29,149,0.35)", fontFamily: "'Outfit', sans-serif" }}>
                Unirse 🎯
              </button>
            </div>
          )}

          {roomFull && (
            <div className="text-center" style={{ animation: "fadeUp 0.4s ease-out" }}>
              <p className="text-white/50 text-sm mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Partida en curso entre <span className="text-white font-semibold">{gs.players[P1]?.name}</span> y <span className="text-white font-semibold">{gs.players[P2]?.name}</span>.</p>
              <div className="flex gap-3">
                <button onClick={() => { setMyId(P1); setMyName(gs.players[P1].name); setMyColor(gs.players[P1].color); }} className="flex-1 py-3 rounded-xl text-white font-semibold transition-all hover:scale-105" style={{ background: colorGrad(gs.players[P1].color), fontFamily: "'Outfit', sans-serif" }}>Soy {gs.players[P1].name}</button>
                <button onClick={() => { setMyId(P2); setMyName(gs.players[P2].name); setMyColor(gs.players[P2].color); }} className="flex-1 py-3 rounded-xl text-white font-semibold transition-all hover:scale-105" style={{ background: colorGrad(gs.players[P2].color), fontFamily: "'Outfit', sans-serif" }}>Soy {gs.players[P2].name}</button>
              </div>
              <button onClick={handleFullReset} className="mt-3 w-full py-2.5 rounded-xl text-white/40 text-sm transition-all hover:text-white/70" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "'DM Sans', sans-serif" }}>Reiniciar todo</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══ WAITING ═══
  if (gs.phase === "lobby" && myId === P1) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0a0e1a 0%, #141830 50%, #0a0e1a 100%)" }}>
        <style>{STYLES}</style>
        {orbs}
        <div className="relative z-10 p-8 rounded-3xl max-w-sm w-full mx-4 text-center" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", animation: "fadeUp 0.5s ease-out" }}>
          <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(76,29,149,0.5)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
          <h2 className="text-xl font-bold text-white/90 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>Esperando rival...</h2>
          <p className="text-white/40 text-sm mb-5" style={{ fontFamily: "'DM Sans', sans-serif" }}>Comparte este artefacto con otro jugador para que se una</p>
          <div className="flex items-center gap-2 justify-center px-4 py-2.5 rounded-xl mx-auto" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="w-4 h-4 rounded-full" style={{ background: colorGrad(myColor) }} />
            <span className="text-white/60 text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>{myName} · {myColor === "green" ? "Verde" : "Amarillo"}</span>
          </div>
          <button onClick={handleFullReset} className="mt-5 px-5 py-2 rounded-lg text-white/30 text-xs hover:text-white/60 transition-all" style={{ fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
        </div>
      </div>
    );
  }

  // ═══ GAME ═══
  const [tab, setTab] = useState("board"); // "board" | "chat"
  const isMyTurn = gs.current === myId;
  const curGrad = gs.players[gs.current] ? colorGrad(gs.players[gs.current].color) : "#888";

  // Cell size: 44px on mobile (44*7 + gaps = ~330px fits iPhone 11 at 375px), 56px on desktop
  const CELL = typeof window !== "undefined" && window.innerWidth < 640 ? 44 : 56;
  const GAP = 3;

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: "linear-gradient(135deg, #0a0e1a 0%, #141830 50%, #0a0e1a 100%)" }}>
      <style>{STYLES}</style>
      {orbs}
      <Orb color="radial-gradient(circle, #06b6d4, transparent)" size="280px" x="85%" y="-8%" dur={10} delay={3} />

      <div className="relative z-10 flex flex-col items-center w-full max-w-2xl mx-auto px-2 sm:px-4 py-3 sm:py-6 min-h-screen">

        {/* Header */}
        <h1 className="text-xl sm:text-2xl font-black mb-1" style={{ fontFamily: "'Outfit', sans-serif", background: "linear-gradient(90deg, #4ade80, #fbbf24, #4ade80)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Unir Puntos</h1>

        {/* Scoreboard */}
        <div className="flex items-center gap-3 sm:gap-4 mb-2 px-3 sm:px-5 py-2 rounded-2xl w-full justify-center" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[P1, P2].map(pid => (
            <div key={pid} className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full" style={{ background: gs.players[pid] ? colorGrad(gs.players[pid].color) : "#555", boxShadow: pid === myId ? "0 0 10px rgba(255,255,255,0.2)" : "none" }} />
              <span className={`text-xs sm:text-sm font-semibold truncate max-w-[70px] sm:max-w-none ${pid === myId ? 'text-white/90' : 'text-white/50'}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>{playerName(pid)}{pid === myId ? " (tú)" : ""}</span>
              <span className="text-white font-bold text-base sm:text-lg">{gs.scores[pid]}</span>
              {pid === P1 && <span className="text-white/15 text-base sm:text-lg mx-0.5 sm:mx-1">—</span>}
            </div>
          ))}
        </div>

        {/* Tab switcher (mobile only) */}
        <div className="flex sm:hidden w-full gap-1 mb-2 px-1">
          {[{id: "board", label: "🎮 Tablero"}, {id: "chat", label: `💬 Chat${chatMsgs.filter(m => m.type === "player").length > 0 ? ` (${chatMsgs.filter(m => m.type === "player").length})` : ""}`}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'text-white' : 'text-white/35'}`}
              style={{ background: tab === t.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", border: tab === t.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Main content area */}
        <div className="flex flex-col lg:flex-row items-start justify-center gap-4 w-full">

          {/* BOARD — hidden on mobile when chat tab is active */}
          <div className={`flex flex-col items-center w-full lg:w-auto ${tab !== "board" ? "hidden sm:flex" : "flex"}`} style={{ animation: "fadeUp 0.5s ease-out" }}>

            {/* Turn indicator */}
            {!gs.winner && !gs.isDraw && gs.phase === "playing" && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl" style={{ background: isMyTurn ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.03)", border: isMyTurn ? "1px solid rgba(74,222,128,0.12)" : "1px solid rgba(255,255,255,0.05)" }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: curGrad, animation: "winPulse 1s ease-in-out infinite alternate" }} />
                <span className="text-white/60 text-xs sm:text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {isMyTurn ? <span className="text-white font-semibold">¡Tu turno!</span> : <>Turno de <span className="text-white font-semibold">{playerName(gs.current)}</span></>}
                </span>
              </div>
            )}

            {/* Board */}
            <div className="p-1.5 sm:p-2.5 rounded-2xl sm:rounded-3xl" style={{ background: "linear-gradient(145deg, rgba(20,24,48,0.95), rgba(10,14,26,0.98))", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
              {/* Preview row */}
              <div className="flex mb-0.5 px-0.5" style={{ gap: `${GAP}px` }}>
                {Array.from({ length: COLS }).map((_, c) => {
                  const show = hoverCol === c && isMyTurn && !gs.winner && !gs.isDraw && getDropRow(gs.board, c) >= 0;
                  return (
                    <div key={c} className="flex items-center justify-center cursor-pointer"
                      style={{ width: `${CELL}px`, height: `${Math.round(CELL * 0.5)}px` }}
                      onMouseEnter={() => setHoverCol(c)} onMouseLeave={() => setHoverCol(-1)} onClick={() => handleDrop(c)}>
                      {show && <div className="rounded-full" style={{ width: `${Math.round(CELL * 0.38)}px`, height: `${Math.round(CELL * 0.38)}px`, background: myColor ? colorGrad(myColor) : "#555", opacity: 0.5, animation: "bob 1.2s ease-in-out infinite", boxShadow: myColor === "green" ? "0 0 12px rgba(74,222,128,0.3)" : "0 0 12px rgba(251,191,36,0.3)" }} />}
                    </div>
                  );
                })}
              </div>
              {/* Grid */}
              <div className="rounded-xl sm:rounded-2xl p-0.5 sm:p-1" style={{ background: "linear-gradient(180deg, rgba(15,23,42,0.4), rgba(20,24,48,0.5))", border: "1px solid rgba(255,255,255,0.03)" }}>
                {gs.board.map((row, r) => (
                  <div key={r} className="flex" style={{ gap: `${GAP}px`, marginBottom: r < ROWS - 1 ? `${GAP}px` : 0 }}>
                    {row.map((cell, c) => (
                      <div key={c} className="relative rounded-full transition-colors duration-200"
                        style={{ width: `${CELL}px`, height: `${CELL}px`, background: "radial-gradient(circle, rgba(10,14,26,0.95), rgba(10,14,26,0.75))", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(255,255,255,0.02)", cursor: isMyTurn && !gs.winner && !gs.isDraw ? "pointer" : "default" }}
                        onMouseEnter={() => setHoverCol(c)} onMouseLeave={() => setHoverCol(-1)} onClick={() => handleDrop(c)}>
                        {cell !== EMPTY && (
                          <Piece color={gs.players[cell]?.color || "green"} isWinning={isWinCell(r, c)} isLast={gs.lastMove?.row === r && gs.lastMove?.col === c} isNew={animCell?.row === r && animCell?.col === c} />
                        )}
                        {hoverCol === c && isMyTurn && getDropRow(gs.board, c) === r && cell === EMPTY && !gs.winner && !gs.isDraw && !animating && (
                          <div className="absolute inset-1 rounded-full" style={{ background: myColor ? colorGrad(myColor) : "#555", opacity: 0.1 }} />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Result */}
            {(gs.winner || gs.isDraw) && (
              <div className="mt-3 flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", animation: "bounceIn 0.5s ease-out" }}>
                <div className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {gs.isDraw ? "🤝 ¡Empate!" : gs.winner === myId ? "🏆 ¡Has ganado!" : `😔 ${playerName(gs.winner)} gana`}
                </div>
                <div className="flex gap-2.5">
                  <button onClick={handlePlayAgain} className="px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #4c1d95, #1e3a5f)", boxShadow: "0 4px 20px rgba(76,29,149,0.4)", fontFamily: "'Outfit', sans-serif" }}>Otra vez</button>
                  <button onClick={handleFullReset} className="px-4 py-2 rounded-xl text-white/50 text-sm font-semibold transition-all hover:text-white/80" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "'DM Sans', sans-serif" }}>Nueva sala</button>
                </div>
              </div>
            )}
          </div>

          {/* CHAT — always visible on desktop, tab-toggled on mobile */}
          <div className={`w-full lg:w-72 flex flex-col rounded-2xl overflow-hidden flex-shrink-0 ${tab !== "chat" ? "hidden sm:flex" : "flex"}`}
            style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 15px 40px rgba(0,0,0,0.3)", height: tab === "chat" ? "calc(100vh - 200px)" : "420px", maxHeight: "480px", animation: "fadeUp 0.6s ease-out 0.15s both" }}>
            <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span className="text-white/60 text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>💬 Chat</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" style={{ animation: "winPulse 2s ease-in-out infinite alternate" }} />
                <span className="text-white/30 text-xs" style={{ fontFamily: "'DM Sans', sans-serif" }}>en vivo</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
              {chatMsgs.map((msg, i) =>
                msg.type === "system" ? (
                  <div key={i} className="text-center text-white/25 text-xs py-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>{msg.text}</div>
                ) : (
                  <div key={i} className={`flex gap-2 items-start ${msg.player === myId ? 'flex-row-reverse' : ''}`} style={{ animation: "fadeUp 0.25s ease-out" }}>
                    <div className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" style={{ background: gs.players[msg.player] ? colorGrad(gs.players[msg.player].color) : "#555" }} />
                    <div>
                      <div className={`text-white/40 text-xs mb-0.5 ${msg.player === myId ? 'text-right' : ''}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>{msg.name}</div>
                      <div className="text-white/85 text-sm px-3 py-1.5 rounded-xl" style={{ background: msg.player === myId ? "rgba(76,29,149,0.15)" : "rgba(255,255,255,0.05)", fontFamily: "'DM Sans', sans-serif" }}>{msg.text}</div>
                    </div>
                  </div>
                )
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-2.5 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <input className="flex-1 px-3 py-2 rounded-xl text-white text-sm outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "'DM Sans', sans-serif" }} placeholder="Mensaje..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} />
              <button onClick={sendChat} className="px-3.5 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #4c1d95, #1e3a5f)" }}>➤</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
