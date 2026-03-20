import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../firebase";
import { ref, set, onValue, remove } from "firebase/database";
import { STYLES, Orbs, Orb, colorGrad, BG, PANEL, BackButton, P1, P2, sanitizePlayers, ChatBox } from "./shared.jsx";

const GAME_REF = "bolos/game";
const CHAT_REF = "bolos/chat";
const TOTAL_FRAMES = 10;
const TOTAL_PINS = 10;

// Pin positions (triangle formation, normalized 0-1 coords, origin center)
const PIN_POSITIONS = [
  { x: 0, y: 0.92 },
  { x: -0.06, y: 0.84 }, { x: 0.06, y: 0.84 },
  { x: -0.12, y: 0.76 }, { x: 0, y: 0.76 }, { x: 0.12, y: 0.76 },
  { x: -0.18, y: 0.68 }, { x: -0.06, y: 0.68 }, { x: 0.06, y: 0.68 }, { x: 0.18, y: 0.68 },
];

const defaultState = () => ({
  phase: "lobby", players: { 1: null, 2: null }, scores: { 1: Array(TOTAL_FRAMES).fill(null), 2: Array(TOTAL_FRAMES).fill(null) },
  current: P1, currentFrame: 0, currentRoll: 0, pinsUp: Array(TOTAL_PINS).fill(true),
  version: 0, moveCount: 0, winner: null,
});

const sanitize = (data) => {
  if (!data) return defaultState();
  const d = { ...defaultState(), ...data };
  d.players = sanitizePlayers(d.players);
  if (!d.scores || typeof d.scores !== "object") d.scores = { 1: Array(TOTAL_FRAMES).fill(null), 2: Array(TOTAL_FRAMES).fill(null) };
  [1, 2].forEach(p => { if (!Array.isArray(d.scores[p])) d.scores[p] = Array(TOTAL_FRAMES).fill(null); });
  if (!Array.isArray(d.pinsUp)) d.pinsUp = Array(TOTAL_PINS).fill(true);
  return d;
};

const fbSave = async (p, d) => { try { await set(ref(db, p), d); } catch (e) { console.error(e); } };
const fbDel = async () => { try { await remove(ref(db, "bolos")); } catch (e) { console.error(e); } };

// Physics simulation — returns array of knocked pin indices
const simulateThrow = (params, pinsUp) => {
  const { posX, force, spin, weight, runUp } = params;
  // force 0-100, spin -50 to 50, weight 6-16, posX -1 to 1, runUp 0-1
  const effectivePower = (force / 100) * (0.7 + weight / 50) * (0.8 + runUp * 0.2);
  // Ball trajectory: start at posX, curve based on spin
  const spinFactor = (spin / 50) * 0.3;
  const knocked = [];

  pinsUp.forEach((up, i) => {
    if (!up) return;
    const pin = PIN_POSITIONS[i];
    // Ball position at pin's Y depth
    const progress = pin.y;
    const ballX = posX * 0.3 + spinFactor * progress * progress;
    const dist = Math.abs(ballX - pin.x);
    // Heavier balls knock wider, more force knocks wider
    const knockRadius = 0.08 * effectivePower;
    // Add some scatter for realism
    const scatter = (Math.sin(i * 7.3 + force * 0.1 + spin * 0.05) * 0.5 + 0.5) * 0.03;
    if (dist < knockRadius + scatter) {
      knocked.push(i);
      // Chain reaction — nearby pins can also fall
      pinsUp.forEach((up2, j) => {
        if (!up2 || j === i || knocked.includes(j)) return;
        const p2 = PIN_POSITIONS[j];
        const d2 = Math.sqrt((pin.x - p2.x) ** 2 + (pin.y - p2.y) ** 2);
        if (d2 < 0.1 * effectivePower && Math.random() < 0.5 * effectivePower) knocked.push(j);
      });
    }
  });
  return [...new Set(knocked)];
};

// Calculate total score for a player
const calcTotal = (frames) => {
  if (!frames) return 0;
  let total = 0;
  for (const f of frames) {
    if (f === null) continue;
    if (Array.isArray(f)) total += f.reduce((a, b) => a + (b || 0), 0);
    else total += f;
  }
  return total;
};

// ═══ 2D Lane View ═══
const Lane2D = ({ pinsUp, ballAnim, params }) => {
  const W = 280, H = 420;
  const laneW = 160;
  const lx = (W - laneW) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[280px]" style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.3))" }}>
      {/* Lane */}
      <rect x={lx} y={20} width={laneW} height={H - 40} rx={8} fill="#d4a76a" stroke="#b8935a" strokeWidth={2} />
      {/* Gutters */}
      <rect x={lx - 12} y={20} width={12} height={H - 40} rx={3} fill="#444" />
      <rect x={lx + laneW} y={20} width={12} height={H - 40} rx={3} fill="#444" />
      {/* Lane lines */}
      {[0.33, 0.5, 0.67].map((p, i) => (
        <line key={i} x1={lx + laneW * p} y1={30} x2={lx + laneW * p} y2={H - 30} stroke="#c49660" strokeWidth={1} strokeDasharray="8,4" />
      ))}
      {/* Arrows */}
      {[0.2, 0.35, 0.5, 0.65, 0.8].map((p, i) => (
        <polygon key={i} points={`${lx + laneW * p},${H * 0.55} ${lx + laneW * p - 4},${H * 0.58} ${lx + laneW * p + 4},${H * 0.58}`} fill="#b8935a" />
      ))}
      {/* Pins */}
      {PIN_POSITIONS.map((pin, i) => {
        const px = W / 2 + pin.x * laneW * 2.5;
        const py = 30 + (1 - pin.y) * (H * 0.35);
        return pinsUp[i] ? (
          <g key={i}>
            <circle cx={px} cy={py} r={7} fill="white" stroke="#ccc" strokeWidth={1.5} />
            <circle cx={px} cy={py - 2} r={2} fill="#e11d48" />
          </g>
        ) : (
          <g key={i} style={{ opacity: 0.2 }}>
            <circle cx={px} cy={py} r={6} fill="#666" />
            <line x1={px - 5} y1={py - 5} x2={px + 5} y2={py + 5} stroke="#888" strokeWidth={1.5} />
          </g>
        );
      })}
      {/* Ball */}
      {ballAnim && (
        <circle cx={W / 2 + (params?.posX || 0) * laneW * 0.4} cy={H - 60 - ballAnim.progress * (H - 120)} r={10 + (params?.weight || 10) * 0.3}
          fill="url(#ballGrad)" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
        </circle>
      )}
      <defs>
        <radialGradient id="ballGrad"><stop offset="30%" stopColor="#1e1b4b" /><stop offset="100%" stopColor="#0f0a2a" /></radialGradient>
      </defs>
    </svg>
  );
};

// ═══ 3D Lane View ═══
const Lane3D = ({ pinsUp, ballAnim, params }) => {
  const W = 360, H = 400;
  // Perspective transform helpers
  const proj = (x, depth) => {
    const scale = 0.3 + depth * 0.7;
    const cx = W / 2;
    return { px: cx + (x - cx) * scale, scale };
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[360px]" style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.3))" }}>
      {/* Lane with perspective */}
      <polygon points={`${W / 2 - 30},30 ${W / 2 + 30},30 ${W / 2 + 120},${H - 20} ${W / 2 - 120},${H - 20}`} fill="#d4a76a" stroke="#b8935a" strokeWidth={2} />
      {/* Gutters */}
      <polygon points={`${W / 2 - 30},30 ${W / 2 - 38},30 ${W / 2 - 132},${H - 20} ${W / 2 - 120},${H - 20}`} fill="#444" />
      <polygon points={`${W / 2 + 30},30 ${W / 2 + 38},30 ${W / 2 + 132},${H - 20} ${W / 2 + 120},${H - 20}`} fill="#444" />
      {/* Lane lines */}
      {[0.35, 0.5, 0.65].map((p, i) => {
        const topX = W / 2 + (p - 0.5) * 60;
        const botX = W / 2 + (p - 0.5) * 240;
        return <line key={i} x1={topX} y1={35} x2={botX} y2={H - 25} stroke="#c49660" strokeWidth={0.8} strokeDasharray="6,4" />;
      })}
      {/* Pins (at top, smaller due to perspective) */}
      {PIN_POSITIONS.map((pin, i) => {
        const depth = 1 - pin.y; // 0 = far (top), 1 = near
        const normDepth = depth * 0.25; // pins are at the far end
        const laneWidthAtDepth = 60 + normDepth * 180;
        const px = W / 2 + pin.x * laneWidthAtDepth * 2;
        const py = 35 + normDepth * (H - 60);
        const sz = 3 + normDepth * 5;
        return pinsUp[i] ? (
          <g key={i}>
            <ellipse cx={px} cy={py} rx={sz} ry={sz * 1.6} fill="white" stroke="#ddd" strokeWidth={1} />
            <circle cx={px} cy={py - sz * 0.8} r={sz * 0.5} fill="#e11d48" />
          </g>
        ) : (
          <g key={i} style={{ opacity: 0.15 }}>
            <ellipse cx={px} cy={py} rx={sz * 0.7} ry={sz} fill="#666" />
          </g>
        );
      })}
      {/* Ball */}
      {ballAnim && (() => {
        const progress = ballAnim.progress;
        const depth = 1 - progress; // 1 = near, 0 = far
        const laneWidthAtDepth = 60 + depth * 180;
        const bx = W / 2 + (params?.posX || 0) * laneWidthAtDepth * 0.35;
        const by = H - 40 - progress * (H - 80);
        const bSize = 6 + depth * 10 + (params?.weight || 10) * 0.2;
        return <circle cx={bx} cy={by} r={bSize} fill="#1e1b4b" stroke="#312e81" strokeWidth={1}
          style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }} />;
      })()}
    </svg>
  );
};

// ═══ MAIN COMPONENT ═══
export default function Bolos({ onBack }) {
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState(null);
  const [joinName, setJoinName] = useState("");
  const [gs, setGs] = useState(defaultState());
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [tab, setTab] = useState("board");
  const [viewMode, setViewMode] = useState("3d"); // "2d" | "3d"
  const chatEndRef = useRef(null);

  // Throw parameters
  const [weight, setWeight] = useState(10);    // 6-16 lbs
  const [force, setForce] = useState(70);      // 0-100
  const [spin, setSpin] = useState(0);          // -50 to 50
  const [posX, setPosX] = useState(0);          // -1 to 1
  const [runUp, setRunUp] = useState(0.5);      // 0-1

  // Animation
  const [ballAnim, setBallAnim] = useState(null);
  const [throwing, setThrowing] = useState(false);
  const animRef = useRef(null);

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
    await fbSave(CHAT_REF, [{ type: "system", text: `🎳 ${myName.trim()} ha creado la sala.`, ts: Date.now() }]);
    setMyId(P1); setMyColor(c);
  };

  const joinRoom = async () => {
    if (!joinName.trim() || !gs.players[1]) return;
    const c2 = gs.players[1].color === "green" ? "yellow" : "green";
    const u = { ...gs, players: { ...gs.players, 2: { name: joinName.trim(), color: c2 } }, phase: "playing", current: P1, currentFrame: 0, currentRoll: 0, pinsUp: Array(TOTAL_PINS).fill(true), version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, u);
    const m = [...(chatMsgs || []), { type: "system", text: `🎳 ${joinName.trim()} se ha unido. ¡A jugar!`, ts: Date.now() }];
    await fbSave(CHAT_REF, m);
    setMyId(P2); setMyName(joinName.trim()); setMyColor(c2);
  };

  const handleThrow = useCallback(async () => {
    if (throwing || gs.current !== myId || gs.phase !== "playing" || gs.winner) return;
    setThrowing(true);

    const params = { posX, force, spin, weight, runUp };
    const knocked = simulateThrow(params, gs.pinsUp);
    const pinsKnocked = knocked.length;
    const allUp = gs.pinsUp.filter(Boolean).length;

    // Animate ball
    let start = null;
    const duration = 1200 - force * 4; // faster with more force
    const animate = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setBallAnim({ progress });
      if (progress < 1) { animRef.current = requestAnimationFrame(animate); }
      else {
        setBallAnim(null);
        finishThrow(knocked, pinsKnocked, allUp, params);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, [throwing, gs, myId, posX, force, spin, weight, runUp]);

  const finishThrow = async (knocked, pinsKnocked, allUp, params) => {
    const newPins = [...gs.pinsUp];
    knocked.forEach(i => { newPins[i] = false; });

    const isStrike = gs.currentRoll === 0 && pinsKnocked === allUp;
    const isSpare = gs.currentRoll === 1 && newPins.filter(Boolean).length === 0;

    // Update frame scores
    const scores = { ...gs.scores };
    const pScores = [...(scores[gs.current] || Array(TOTAL_FRAMES).fill(null))];
    if (!pScores[gs.currentFrame]) pScores[gs.currentFrame] = [];
    const frameArr = [...(Array.isArray(pScores[gs.currentFrame]) ? pScores[gs.currentFrame] : [])];
    frameArr.push(pinsKnocked);
    pScores[gs.currentFrame] = frameArr;
    scores[gs.current] = pScores;

    // Determine next state
    let nextCurrent = gs.current;
    let nextFrame = gs.currentFrame;
    let nextRoll = gs.currentRoll + 1;
    let nextPins = newPins;
    let finished = false;

    if (isStrike || nextRoll >= 2 || isSpare) {
      // Turn switches to other player or next frame
      const otherPlayer = gs.current === P1 ? P2 : P1;
      if (gs.current === P2) {
        // Both have played this frame
        nextFrame = gs.currentFrame + 1;
        nextCurrent = P1;
      } else {
        nextCurrent = otherPlayer;
      }
      nextRoll = 0;
      nextPins = Array(TOTAL_PINS).fill(true);

      if (nextFrame >= TOTAL_FRAMES && gs.current === P2) {
        finished = true;
      }
    }

    const emoji = isStrike ? "🎳 ¡STRIKE!" : isSpare ? "✨ ¡SPARE!" : `${pinsKnocked} bolo${pinsKnocked !== 1 ? 's' : ''}`;
    const msg = { type: "system", text: `${pName(gs.current)} — ${emoji}`, ts: Date.now() };
    const newMsgs = [...(chatMsgs || []), msg];

    let ns = { ...gs, scores, pinsUp: nextPins, current: nextCurrent, currentFrame: Math.min(nextFrame, TOTAL_FRAMES - 1), currentRoll: nextRoll, moveCount: (gs.moveCount || 0) + 1, version: (gs.version || 0) + 1 };

    if (finished) {
      const t1 = calcTotal(scores[1]), t2 = calcTotal(scores[2]);
      ns.winner = t1 > t2 ? P1 : t2 > t1 ? P2 : 0; // 0 = tie
      ns.phase = "over";
      const winMsg = ns.winner === 0 ? "🤝 ¡Empate!" : `🏆 ¡${pName(ns.winner, ns)} gana con ${Math.max(t1, t2)} puntos!`;
      newMsgs.push({ type: "system", text: winMsg, ts: Date.now() });
    }

    await fbSave(GAME_REF, ns);
    await fbSave(CHAT_REF, newMsgs);
    setThrowing(false);
  };

  const playAgain = async () => {
    const ns = { ...gs, scores: { 1: Array(TOTAL_FRAMES).fill(null), 2: Array(TOTAL_FRAMES).fill(null) }, current: P1, currentFrame: 0, currentRoll: 0, pinsUp: Array(TOTAL_PINS).fill(true), winner: null, phase: "playing", moveCount: 0, version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, ns);
    await fbSave(CHAT_REF, [...(chatMsgs || []), { type: "system", text: "🔄 ¡Nueva partida!", ts: Date.now() }]);
  };
  const fullReset = async () => { await fbDel(); setGs(defaultState()); setChatMsgs([]); setMyId(null); setMyName(""); setMyColor(null); setJoinName(""); };
  const sendChat = async () => { if (!chatInput.trim() || !myId) return; await fbSave(CHAT_REF, [...(chatMsgs || []), { type: "player", player: myId, name: myName, text: chatInput.trim(), ts: Date.now() }]); setChatInput(""); };

  // Slider component
  const Slider = ({ label, value, onChange, min, max, step = 1, unit = "", color = "#f97316" }) => (
    <div className="mb-2">
      <div className="flex justify-between mb-0.5">
        <span className="text-white/50 text-xs" style={{ fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
        <span className="text-white/70 text-xs font-semibold" style={{ fontFamily: "'DM Sans',sans-serif" }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) 100%)` }} />
    </div>
  );

  // ═══ LOBBY ═══
  if (!myId) {
    const roomExists = !!(gs.players && gs.players[1]);
    const roomFull = !!(gs.players && gs.players[1] && gs.players[2]);
    return (
      <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: BG }}>
        <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
        <div className="relative z-10 p-8 rounded-3xl max-w-md w-full mx-4" style={{ ...PANEL, animation: "fadeUp 0.5s ease-out" }}>
          <h1 className="text-3xl font-black text-center mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#f97316,#dc2626,#f97316)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Bolos</h1>
          <p className="text-center text-white/35 text-sm mb-7" style={{ fontFamily: "'DM Sans',sans-serif" }}>Bowling · Multijugador</p>
          {!roomExists && (<div style={{ animation: "fadeUp 0.4s ease-out" }}>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} value={myName} onChange={e => setMyName(e.target.value)} placeholder="Ej: Pro Bowler" />
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-3">Elige tu color</label>
            <div className="flex gap-3 mb-6">{["green", "yellow"].map(c => (<button key={c} onClick={() => setMyColor(c)} className={`flex-1 py-3.5 rounded-xl text-white font-bold transition-all hover:scale-105 ${myColor === c ? 'ring-2 ring-white/40 scale-105' : 'opacity-60'}`} style={{ background: colorGrad(c) }}>{c === "green" ? "🟢 Verde" : "🟡 Amarillo"}</button>))}</div>
            <button onClick={createRoom} disabled={!myName.trim() || !myColor} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{ background: "linear-gradient(135deg,#dc2626,#f97316)" }}>Crear sala 🚀</button>
          </div>)}
          {roomExists && !roomFull && (<div style={{ animation: "fadeUp 0.4s ease-out" }}>
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl" style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.12)" }}><div className="w-3 h-3 rounded-full" style={{ background: "#f97316", animation: "winPulse 1.2s infinite alternate" }} /><span className="text-white/70 text-sm"><span className="text-white font-semibold">{gs.players[1]?.name}</span> está esperando...</span></div>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Ej: Strike King" />
            <button onClick={joinRoom} disabled={!joinName.trim()} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{ background: "linear-gradient(135deg,#dc2626,#f97316)" }}>Unirse 🎯</button>
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
  if (gs.phase === "setup" && !gs.players[2]) return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{ background: BG }}>
      <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
      <div className="relative z-10 p-8 rounded-3xl max-w-sm w-full mx-4 text-center" style={{ ...PANEL, animation: "fadeUp 0.5s ease-out" }}>
        <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(249,115,22,0.5)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
        <h2 className="text-xl font-bold text-white/90 mb-2" style={{ fontFamily: "'Outfit',sans-serif" }}>Esperando rival...</h2>
        <p className="text-white/40 text-sm mb-5">Comparte la URL con otro jugador</p>
        <button onClick={fullReset} className="mt-3 px-5 py-2 rounded-lg text-white/30 text-xs hover:text-white/60 transition-all">Cancelar</button>
      </div>
    </div>);

  // ═══ GAME ═══
  const isMyTurn = gs.current === myId && !gs.winner;
  const params = { posX, force, spin, weight, runUp };
  const LaneComponent = viewMode === "3d" ? Lane3D : Lane2D;

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: BG }}>
      <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
      <Orb color="radial-gradient(circle,#f97316,transparent)" size="280px" x="85%" y="-8%" dur={10} delay={3} />
      <div className="relative z-10 flex flex-col items-center w-full max-w-5xl mx-auto px-2 sm:px-4 py-3 sm:py-6 min-h-screen pt-12">
        <h1 className="text-xl sm:text-2xl font-black mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#f97316,#dc2626,#f97316)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Bolos 🎳</h1>

        {/* Scoreboard */}
        <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-2xl w-full justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[P1, P2].map(pid => (<div key={pid} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ background: gs.players[pid] ? colorGrad(gs.players[pid].color) : "#555" }} /><span className={`text-xs sm:text-sm font-semibold truncate max-w-[80px] sm:max-w-none ${pid === myId ? 'text-white/90' : 'text-white/50'}`}>{pName(pid)}{pid === myId ? " (tú)" : ""}</span><span className="text-white font-bold text-base">{calcTotal(gs.scores[pid])}</span>{pid === P1 && <span className="text-white/15 mx-1">—</span>}</div>))}
          <span className="text-white/25 text-xs ml-2">Frame {Math.min((gs.currentFrame || 0) + 1, TOTAL_FRAMES)}/{TOTAL_FRAMES}</span>
        </div>

        {/* Turn + View toggle */}
        <div className="flex items-center gap-3 mb-2">
          {!gs.winner && gs.phase === "playing" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: isMyTurn ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.03)", border: isMyTurn ? "1px solid rgba(249,115,22,0.15)" : "1px solid rgba(255,255,255,0.05)" }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: gs.players[gs.current] ? colorGrad(gs.players[gs.current].color) : "#888", animation: "winPulse 1s infinite alternate" }} />
              <span className="text-white/60 text-xs sm:text-sm">{isMyTurn ? <span className="text-white font-semibold">¡Tu turno!</span> : <>Turno de <span className="text-white font-semibold">{pName(gs.current)}</span></>}</span>
            </div>)}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <button onClick={() => setViewMode("3d")} className={`px-3 py-1 text-xs font-semibold transition-all ${viewMode === "3d" ? "text-white bg-white/10" : "text-white/30"}`}>3D</button>
            <button onClick={() => setViewMode("2d")} className={`px-3 py-1 text-xs font-semibold transition-all ${viewMode === "2d" ? "text-white bg-white/10" : "text-white/30"}`}>2D</button>
          </div>
        </div>

        {/* Tabs mobile */}
        <div className="flex sm:hidden w-full gap-1 mb-2 px-1">
          {[{ id: "board", label: "🎳 Bolera" }, { id: "chat", label: "💬 Chat" }].map(t => (<button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'text-white' : 'text-white/35'}`} style={{ background: tab === t.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", border: tab === t.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.04)" }}>{t.label}</button>))}
        </div>

        <div className="flex flex-col lg:flex-row items-start justify-center gap-4 w-full">
          {/* Lane + Controls */}
          <div className={`flex flex-col sm:flex-row items-center sm:items-start gap-4 w-full lg:w-auto ${tab !== "board" ? "hidden sm:flex" : "flex"}`}>
            {/* Lane */}
            <div className="p-3 rounded-2xl" style={{ background: "linear-gradient(145deg,rgba(20,24,48,0.95),rgba(10,14,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
              <LaneComponent pinsUp={gs.pinsUp || Array(TOTAL_PINS).fill(true)} ballAnim={ballAnim} params={params} />
              {/* Pins standing count */}
              <div className="text-center mt-2">
                <span className="text-white/40 text-xs">{(gs.pinsUp || []).filter(Boolean).length} bolos en pie</span>
              </div>
            </div>

            {/* Controls */}
            {isMyTurn && !throwing && (
              <div className="w-full sm:w-56 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", animation: "fadeUp 0.3s ease-out" }}>
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3" style={{ fontFamily: "'DM Sans',sans-serif" }}>Configura tu tiro</p>
                <Slider label="Peso" value={weight} onChange={setWeight} min={6} max={16} unit=" lb" color="#f97316" />
                <Slider label="Fuerza" value={force} onChange={setForce} min={20} max={100} unit="%" color="#ef4444" />
                <Slider label="Efecto" value={spin} onChange={setSpin} min={-50} max={50} unit="" color="#a78bfa" />
                <Slider label="Posición" value={posX} onChange={setPosX} min={-1} max={1} step={0.05} unit="" color="#38bdf8" />
                <Slider label="Impulso" value={runUp} onChange={setRunUp} min={0} max={1} step={0.1} unit="" color="#4ade80" />
                <button onClick={handleThrow}
                  className="w-full mt-3 py-3 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.03] active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg,#dc2626,#f97316)", boxShadow: "0 4px 20px rgba(249,115,22,0.3)", fontFamily: "'Outfit',sans-serif" }}>
                  🎳 ¡Tirar!
                </button>
              </div>
            )}
            {throwing && (
              <div className="w-full sm:w-56 p-4 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(249,115,22,0.5)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              </div>
            )}
            {!isMyTurn && !gs.winner && gs.phase === "playing" && (
              <div className="w-full sm:w-56 p-4 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white/40 text-sm">Esperando a que {pName(gs.current)} tire...</p>
              </div>
            )}
          </div>

          {/* Chat */}
          <ChatBox chatMsgs={chatMsgs} chatInput={chatInput} setChatInput={setChatInput} sendChat={sendChat} myId={myId} players={gs.players} tab={tab} accentGrad="linear-gradient(135deg,#dc2626,#f97316)" />
        </div>

        {/* Result */}
        {gs.winner !== null && gs.winner !== undefined && gs.phase === "over" && (
          <div className="mt-4 flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", animation: "bounceIn 0.5s ease-out" }}>
            <div className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>
              {gs.winner === 0 ? "🤝 ¡Empate!" : gs.winner === myId ? "🏆 ¡Has ganado!" : `😔 ${pName(gs.winner)} gana`}
            </div>
            <div className="text-white/40 text-sm">{pName(P1)}: {calcTotal(gs.scores[1])} pts — {pName(P2)}: {calcTotal(gs.scores[2])} pts</div>
            <div className="flex gap-2.5">
              <button onClick={playAgain} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:scale-105 transition-all" style={{ background: "linear-gradient(135deg,#dc2626,#f97316)" }}>Otra vez</button>
              <button onClick={fullReset} className="px-4 py-2 rounded-xl text-white/50 text-sm font-semibold hover:text-white/80 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>Nueva sala</button>
            </div>
          </div>)}
      </div>
    </div>);
}
