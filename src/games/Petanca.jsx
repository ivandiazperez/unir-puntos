import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../firebase";
import { ref, set, onValue, remove } from "firebase/database";
import { STYLES, Orbs, Orb, colorGrad, BG, PANEL, BackButton, P1, P2, sanitizePlayers, ChatBox } from "./shared.jsx";

const GAME_REF = "petanca/game";
const CHAT_REF = "petanca/chat";
const BALLS_PER_PLAYER = 3;
const TOTAL_ROUNDS = 3;
const FIELD_W = 340;
const FIELD_H = 500;
const BALL_R = 10;
const JACK_R = 6;

// Simulate a parabolic throw landing position
// angle: direction in degrees (0=straight, neg=left, pos=right)
// force: 0-100, height: 0-100 (parabola arc height)
// Returns {x, y} landing position on field (0,0 = bottom center, y increases upward)
const simulateThrow = (params) => {
  const { angle, force, height, spin } = params;
  // Base distance from force (normalized to field)
  const dist = (force / 100) * (FIELD_H * 0.75) + FIELD_H * 0.1;
  // Direction offset from angle
  const angleRad = (angle / 180) * Math.PI;
  const dx = Math.sin(angleRad) * dist * 0.6;
  // Higher arc = more accurate but less distance modifier
  const heightFactor = 1 - (height / 100) * 0.15;
  const dy = dist * heightFactor;
  // Spin causes lateral drift after landing
  const spinDrift = (spin / 50) * 25;
  // Add slight randomness for realism
  const rx = (Math.random() - 0.5) * 18;
  const ry = (Math.random() - 0.5) * 18;
  // Final position (centered on field bottom)
  const x = FIELD_W / 2 + dx + spinDrift + rx;
  const y = FIELD_H - 40 - dy + ry;
  // Clamp to field
  return {
    x: Math.max(BALL_R + 10, Math.min(FIELD_W - BALL_R - 10, x)),
    y: Math.max(BALL_R + 10, Math.min(FIELD_H - 50, y)),
  };
};

const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

// Check collisions between new ball and existing balls/jack, apply basic push
const resolveCollisions = (newBall, balls, jack) => {
  const updated = balls.map(b => ({ ...b }));
  const updatedJack = { ...jack };
  // Check against each existing ball
  updated.forEach(b => {
    const d = dist(newBall, b);
    if (d < BALL_R * 2) {
      const overlap = BALL_R * 2 - d;
      const nx = (b.x - newBall.x) / (d || 1);
      const ny = (b.y - newBall.y) / (d || 1);
      b.x += nx * overlap * 0.7;
      b.y += ny * overlap * 0.7;
      b.x = Math.max(BALL_R + 10, Math.min(FIELD_W - BALL_R - 10, b.x));
      b.y = Math.max(BALL_R + 10, Math.min(FIELD_H - 50, b.y));
    }
  });
  // Check against jack
  const dj = dist(newBall, updatedJack);
  if (dj < BALL_R + JACK_R) {
    const overlap = BALL_R + JACK_R - dj;
    const nx = (updatedJack.x - newBall.x) / (dj || 1);
    const ny = (updatedJack.y - newBall.y) / (dj || 1);
    updatedJack.x += nx * overlap * 0.5;
    updatedJack.y += ny * overlap * 0.5;
    updatedJack.x = Math.max(JACK_R + 10, Math.min(FIELD_W - JACK_R - 10, updatedJack.x));
    updatedJack.y = Math.max(JACK_R + 10, Math.min(FIELD_H - 50, updatedJack.y));
  }
  return { balls: updated, jack: updatedJack };
};

// Score a round: player whose ball is closest to jack gets 1 point per ball closer than opponent's closest
const scoreRound = (balls, jack) => {
  const p1Balls = balls.filter(b => b.player === P1);
  const p2Balls = balls.filter(b => b.player === P2);
  if (!p1Balls.length || !p2Balls.length) return { 1: 0, 2: 0 };
  const p1Dists = p1Balls.map(b => dist(b, jack)).sort((a, b) => a - b);
  const p2Dists = p2Balls.map(b => dist(b, jack)).sort((a, b) => a - b);
  const p1Closest = p1Dists[0];
  const p2Closest = p2Dists[0];
  let s1 = 0, s2 = 0;
  if (p1Closest < p2Closest) {
    p1Dists.forEach(d => { if (d < p2Closest) s1++; });
  } else {
    p2Dists.forEach(d => { if (d < p1Closest) s2++; });
  }
  return { 1: s1, 2: s2 };
};

const defaultState = () => ({
  phase: "lobby", players: { 1: null, 2: null }, scores: { 1: 0, 2: 0 },
  current: P1, round: 0, ballsThrown: { 1: 0, 2: 0 },
  balls: [], jack: { x: FIELD_W / 2, y: FIELD_H * 0.25 },
  version: 0, moveCount: 0, winner: null, roundScores: [],
});

const sanitize = (data) => {
  if (!data) return defaultState();
  const d = { ...defaultState(), ...data };
  d.players = sanitizePlayers(d.players);
  if (!d.scores || typeof d.scores !== "object") d.scores = { 1: 0, 2: 0 };
  if (!d.ballsThrown || typeof d.ballsThrown !== "object") d.ballsThrown = { 1: 0, 2: 0 };
  if (!Array.isArray(d.balls)) d.balls = [];
  if (!d.jack || typeof d.jack !== "object") d.jack = { x: FIELD_W / 2, y: FIELD_H * 0.25 };
  if (!Array.isArray(d.roundScores)) d.roundScores = [];
  return d;
};

const fbSave = async (p, d) => { try { await set(ref(db, p), d); } catch (e) { console.error(e); } };
const fbDel = async () => { try { await remove(ref(db, "petanca")); } catch (e) { console.error(e); } };

// Random jack position for each round
const randomJack = () => ({
  x: FIELD_W * 0.3 + Math.random() * FIELD_W * 0.4,
  y: FIELD_H * 0.15 + Math.random() * FIELD_H * 0.25,
});

// ═══ FIELD VIEW ═══
const Field = ({ balls, jack, animBall, animProgress }) => {
  // Parabola: ball rises then falls
  const paraY = animBall && animProgress !== null
    ? (() => {
        const t = animProgress;
        const arcHeight = (animBall.height || 50) * 1.5;
        return -4 * arcHeight * t * (t - 1); // peaks at t=0.5
      })()
    : 0;

  const animX = animBall ? FIELD_W / 2 + (animBall.landX - FIELD_W / 2) * (animProgress || 0) : 0;
  const animY = animBall ? (FIELD_H - 30) + (animBall.landY - (FIELD_H - 30)) * (animProgress || 0) : 0;
  const animSize = animBall ? BALL_R + paraY * 0.06 : BALL_R;
  const shadowScale = animBall ? 1 - paraY * 0.005 : 1;

  return (
    <svg viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} className="w-full max-w-[340px] rounded-xl"
      style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.3))" }}>
      {/* Field background — dirt/gravel */}
      <defs>
        <radialGradient id="fieldGrad" cx="50%" cy="40%"><stop offset="0%" stopColor="#8B7355" /><stop offset="100%" stopColor="#6B5B45" /></radialGradient>
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" /><feColorMatrix type="saturate" values="0" /><feBlend in="SourceGraphic" mode="multiply" /></filter>
        <radialGradient id="jackGrad"><stop offset="30%" stopColor="#fef08a" /><stop offset="100%" stopColor="#ca8a04" /></radialGradient>
      </defs>
      <rect width={FIELD_W} height={FIELD_H} rx={12} fill="url(#fieldGrad)" />
      <rect width={FIELD_W} height={FIELD_H} rx={12} fill="url(#fieldGrad)" style={{ opacity: 0.3, filter: "url(#grain)" }} />
      {/* Field border lines */}
      <rect x={8} y={8} width={FIELD_W - 16} height={FIELD_H - 16} rx={8} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="6,4" />
      {/* Throwing zone */}
      <rect x={FIELD_W / 2 - 30} y={FIELD_H - 35} width={60} height={25} rx={4} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />
      <text x={FIELD_W / 2} y={FIELD_H - 18} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize={8} fontFamily="'DM Sans',sans-serif">TIRO</text>
      {/* Distance circles from jack */}
      {[40, 80, 120].map(r => (
        <circle key={r} cx={jack.x} cy={jack.y} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} strokeDasharray="3,3" />
      ))}
      {/* Jack (boliche) */}
      <circle cx={jack.x} cy={jack.y} r={JACK_R} fill="url(#jackGrad)" stroke="#a16207" strokeWidth={1.5}>
        <animate attributeName="r" values={`${JACK_R};${JACK_R + 1};${JACK_R}`} dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={jack.x} y={jack.y + 14} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={7} fontFamily="'DM Sans',sans-serif">boliche</text>
      {/* Thrown balls */}
      {balls.map((ball, i) => {
        const isP1 = ball.player === P1;
        const fill = isP1 ? "#22c55e" : "#eab308";
        const stroke = isP1 ? "#15803d" : "#a16207";
        const d = dist(ball, jack);
        return (
          <g key={i}>
            {/* Shadow */}
            <ellipse cx={ball.x + 2} cy={ball.y + 3} rx={BALL_R * 0.9} ry={BALL_R * 0.5} fill="rgba(0,0,0,0.2)" />
            {/* Ball */}
            <circle cx={ball.x} cy={ball.y} r={BALL_R} fill={fill} stroke={stroke} strokeWidth={1.5} />
            {/* Shine */}
            <circle cx={ball.x - 3} cy={ball.y - 3} r={3} fill="rgba(255,255,255,0.3)" />
            {/* Distance label */}
            <text x={ball.x} y={ball.y + BALL_R + 10} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={7} fontFamily="'DM Sans',sans-serif">{Math.round(d)}px</text>
          </g>
        );
      })}
      {/* Animated ball in flight */}
      {animBall && animProgress !== null && (
        <g>
          <ellipse cx={animX + 2} cy={animY + 3} rx={BALL_R * shadowScale * 0.8} ry={BALL_R * shadowScale * 0.4} fill="rgba(0,0,0,0.15)" />
          <circle cx={animX} cy={animY - paraY} r={animSize} fill={animBall.player === P1 ? "#22c55e" : "#eab308"} stroke={animBall.player === P1 ? "#15803d" : "#a16207"} strokeWidth={1.5} />
          <circle cx={animX - 3} cy={animY - paraY - 3} r={3} fill="rgba(255,255,255,0.4)" />
        </g>
      )}
    </svg>
  );
};

// ═══ MAIN ═══
export default function Petanca({ onBack }) {
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [myColor, setMyColor] = useState(null);
  const [joinName, setJoinName] = useState("");
  const [gs, setGs] = useState(defaultState());
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [tab, setTab] = useState("board");
  const chatEndRef = useRef(null);

  // Throw params
  const [angle, setAngle] = useState(0);
  const [force, setForce] = useState(50);
  const [height, setHeight] = useState(50);
  const [spin, setSpin] = useState(0);

  // Animation
  const [animBall, setAnimBall] = useState(null);
  const [animProgress, setAnimProgress] = useState(null);
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
    const jack = randomJack();
    const f = { ...defaultState(), players: { 1: { name: myName.trim(), color: c }, 2: null }, phase: "setup", jack, version: 1 };
    await fbSave(GAME_REF, f);
    await fbSave(CHAT_REF, [{ type: "system", text: `🥎 ${myName.trim()} ha creado la sala.`, ts: Date.now() }]);
    setMyId(P1); setMyColor(c);
  };

  const joinRoom = async () => {
    if (!joinName.trim() || !gs.players[1]) return;
    const c2 = gs.players[1].color === "green" ? "yellow" : "green";
    const u = { ...gs, players: { ...gs.players, 2: { name: joinName.trim(), color: c2 } }, phase: "playing", current: P1, version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, u);
    const m = [...(chatMsgs || []), { type: "system", text: `🥎 ${joinName.trim()} se ha unido. ¡A jugar! Ronda 1/${TOTAL_ROUNDS}`, ts: Date.now() }];
    await fbSave(CHAT_REF, m);
    setMyId(P2); setMyName(joinName.trim()); setMyColor(c2);
  };

  const handleThrow = useCallback(async () => {
    if (throwing || gs.current !== myId || gs.phase !== "playing" || gs.winner) return;
    setThrowing(true);

    const params = { angle, force, height, spin };
    const landing = simulateThrow(params);

    // Animate
    const ballInfo = { player: myId, landX: landing.x, landY: landing.y, height };
    setAnimBall(ballInfo);
    let start = null;
    const duration = 800 + (height / 100) * 600;
    const animate = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setAnimProgress(p);
      if (p < 1) { animRef.current = requestAnimationFrame(animate); }
      else { finishThrow(landing, params); }
    };
    animRef.current = requestAnimationFrame(animate);
  }, [throwing, gs, myId, angle, force, height, spin]);

  const finishThrow = async (landing, params) => {
    setAnimBall(null); setAnimProgress(null);
    const newBall = { x: landing.x, y: landing.y, player: gs.current };
    const { balls: updatedBalls, jack: updatedJack } = resolveCollisions(newBall, gs.balls || [], gs.jack);
    const allBalls = [...updatedBalls, newBall];

    const bt = { ...gs.ballsThrown, [gs.current]: (gs.ballsThrown[gs.current] || 0) + 1 };
    const d = dist(newBall, updatedJack);
    const msgs = [...(chatMsgs || []), { type: "system", text: `🥎 ${pName(gs.current)} lanza — ${Math.round(d)}px del boliche`, ts: Date.now() }];

    // Determine next turn
    let nextCurrent = gs.current === P1 ? P2 : P1;
    let roundOver = bt[P1] >= BALLS_PER_PLAYER && bt[P2] >= BALLS_PER_PLAYER;

    // If one player has thrown all balls, other keeps throwing
    if (bt[gs.current] >= BALLS_PER_PLAYER && bt[nextCurrent] < BALLS_PER_PLAYER) {
      nextCurrent = nextCurrent; // other player continues
    } else if (bt[nextCurrent] >= BALLS_PER_PLAYER && bt[gs.current] < BALLS_PER_PLAYER) {
      nextCurrent = gs.current; // current player continues
    }

    let ns = { ...gs, balls: allBalls, jack: updatedJack, ballsThrown: bt, current: nextCurrent, moveCount: (gs.moveCount || 0) + 1, version: (gs.version || 0) + 1 };

    if (roundOver) {
      const rs = scoreRound(allBalls, updatedJack);
      const newScores = { 1: (gs.scores[1] || 0) + rs[1], 2: (gs.scores[2] || 0) + rs[2] };
      const rScores = [...(gs.roundScores || []), rs];
      const nextRound = (gs.round || 0) + 1;

      const scorer = rs[1] > rs[2] ? P1 : rs[2] > rs[1] ? P2 : 0;
      const scoreMsg = scorer === 0 ? "🤝 Ronda empatada" : `✨ ${pName(scorer)} gana la ronda (+${Math.max(rs[1], rs[2])})`;
      msgs.push({ type: "system", text: scoreMsg, ts: Date.now() });

      if (nextRound >= TOTAL_ROUNDS) {
        // Game over
        const w = newScores[1] > newScores[2] ? P1 : newScores[2] > newScores[1] ? P2 : 0;
        ns = { ...ns, scores: newScores, roundScores: rScores, round: nextRound, winner: w, phase: "over" };
        const winMsg = w === 0 ? "🤝 ¡Empate final!" : `🏆 ¡${pName(w)} gana ${newScores[w]} a ${newScores[w === P1 ? P2 : P1]}!`;
        msgs.push({ type: "system", text: winMsg, ts: Date.now() });
      } else {
        // Next round
        const newJack = randomJack();
        ns = { ...ns, scores: newScores, roundScores: rScores, round: nextRound, balls: [], jack: newJack, ballsThrown: { 1: 0, 2: 0 }, current: P1 };
        msgs.push({ type: "system", text: `📍 Ronda ${nextRound + 1}/${TOTAL_ROUNDS} — Nuevo boliche lanzado`, ts: Date.now() });
      }
    }

    await fbSave(GAME_REF, ns);
    await fbSave(CHAT_REF, msgs);
    setThrowing(false);
  };

  const playAgain = async () => {
    const jack = randomJack();
    const ns = { ...gs, scores: { 1: 0, 2: 0 }, balls: [], jack, ballsThrown: { 1: 0, 2: 0 }, current: P1, round: 0, winner: null, phase: "playing", moveCount: 0, roundScores: [], version: (gs.version || 0) + 1 };
    await fbSave(GAME_REF, ns);
    await fbSave(CHAT_REF, [...(chatMsgs || []), { type: "system", text: "🔄 ¡Nueva partida! Ronda 1", ts: Date.now() }]);
  };
  const fullReset = async () => { await fbDel(); setGs(defaultState()); setChatMsgs([]); setMyId(null); setMyName(""); setMyColor(null); setJoinName(""); };
  const sendChat = async () => { if (!chatInput.trim() || !myId) return; await fbSave(CHAT_REF, [...(chatMsgs || []), { type: "player", player: myId, name: myName, text: chatInput.trim(), ts: Date.now() }]); setChatInput(""); };

  const Slider = ({ label, value, onChange, min, max, step = 1, unit = "", color = "#eab308" }) => (
    <div className="mb-2">
      <div className="flex justify-between mb-0.5"><span className="text-white/50 text-xs" style={{ fontFamily: "'DM Sans',sans-serif" }}>{label}</span><span className="text-white/70 text-xs font-semibold">{typeof value === 'number' ? (step < 1 ? value.toFixed(1) : value) : value}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
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
          <h1 className="text-3xl font-black text-center mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#eab308,#a16207,#eab308)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Petanca</h1>
          <p className="text-center text-white/35 text-sm mb-7" style={{ fontFamily: "'DM Sans',sans-serif" }}>Pétanque · Multijugador</p>
          {!roomExists && (<div style={{ animation: "fadeUp 0.4s ease-out" }}>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} value={myName} onChange={e => setMyName(e.target.value)} placeholder="Ej: Marcel" />
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-3">Elige tu color</label>
            <div className="flex gap-3 mb-6">{["green", "yellow"].map(c => (<button key={c} onClick={() => setMyColor(c)} className={`flex-1 py-3.5 rounded-xl text-white font-bold transition-all hover:scale-105 ${myColor === c ? 'ring-2 ring-white/40 scale-105' : 'opacity-60'}`} style={{ background: colorGrad(c) }}>{c === "green" ? "🟢 Verde" : "🟡 Amarillo"}</button>))}</div>
            <button onClick={createRoom} disabled={!myName.trim() || !myColor} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{ background: "linear-gradient(135deg,#a16207,#eab308)" }}>Crear sala 🚀</button>
          </div>)}
          {roomExists && !roomFull && (<div style={{ animation: "fadeUp 0.4s ease-out" }}>
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl" style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.12)" }}><div className="w-3 h-3 rounded-full" style={{ background: "#eab308", animation: "winPulse 1.2s infinite alternate" }} /><span className="text-white/70 text-sm"><span className="text-white font-semibold">{gs.players[1]?.name}</span> está esperando...</span></div>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2">Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Ej: Pierre" />
            <button onClick={joinRoom} disabled={!joinName.trim()} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{ background: "linear-gradient(135deg,#a16207,#eab308)" }}>Unirse 🎯</button>
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
        <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(234,179,8,0.5)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
        <h2 className="text-xl font-bold text-white/90 mb-2" style={{ fontFamily: "'Outfit',sans-serif" }}>Esperando rival...</h2>
        <p className="text-white/40 text-sm mb-5">Comparte la URL con otro jugador</p>
        <button onClick={fullReset} className="mt-3 px-5 py-2 rounded-lg text-white/30 text-xs hover:text-white/60 transition-all">Cancelar</button>
      </div>
    </div>);

  // ═══ GAME ═══
  const isMyTurn = gs.current === myId && !gs.winner && gs.phase === "playing";
  const myBallsLeft = BALLS_PER_PLAYER - (gs.ballsThrown?.[myId] || 0);

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: BG }}>
      <style>{STYLES}</style><Orbs /><BackButton onClick={onBack} />
      <Orb color="radial-gradient(circle,#eab308,transparent)" size="280px" x="85%" y="-8%" dur={10} delay={3} />
      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl mx-auto px-2 sm:px-4 py-3 sm:py-6 min-h-screen pt-12">
        <h1 className="text-xl sm:text-2xl font-black mb-1" style={{ fontFamily: "'Outfit',sans-serif", background: "linear-gradient(90deg,#eab308,#a16207,#eab308)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" }}>Petanca 🥎</h1>

        {/* Scoreboard */}
        <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-2xl w-full justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[P1, P2].map(pid => (<div key={pid} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ background: gs.players[pid] ? colorGrad(gs.players[pid].color) : "#555" }} /><span className={`text-xs sm:text-sm font-semibold truncate max-w-[80px] sm:max-w-none ${pid === myId ? 'text-white/90' : 'text-white/50'}`}>{pName(pid)}{pid === myId ? " (tú)" : ""}</span><span className="text-white font-bold text-base">{gs.scores?.[pid] || 0}</span>{pid === P1 && <span className="text-white/15 mx-1">—</span>}</div>))}
          <span className="text-white/25 text-xs ml-2">Ronda {Math.min((gs.round || 0) + 1, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}</span>
        </div>

        {/* Turn */}
        {!gs.winner && gs.phase === "playing" && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl" style={{ background: isMyTurn ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.03)", border: isMyTurn ? "1px solid rgba(234,179,8,0.15)" : "1px solid rgba(255,255,255,0.05)" }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: gs.players[gs.current] ? colorGrad(gs.players[gs.current].color) : "#888", animation: "winPulse 1s infinite alternate" }} />
            <span className="text-white/60 text-xs sm:text-sm">{isMyTurn ? <span className="text-white font-semibold">¡Tu turno! ({myBallsLeft} bola{myBallsLeft !== 1 ? 's' : ''} restante{myBallsLeft !== 1 ? 's' : ''})</span> : <>Turno de <span className="text-white font-semibold">{pName(gs.current)}</span></>}</span>
          </div>)}

        {/* Tabs */}
        <div className="flex sm:hidden w-full gap-1 mb-2 px-1">
          {[{ id: "board", label: "🥎 Campo" }, { id: "chat", label: "💬 Chat" }].map(t => (<button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'text-white' : 'text-white/35'}`} style={{ background: tab === t.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", border: tab === t.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.04)" }}>{t.label}</button>))}
        </div>

        <div className="flex flex-col lg:flex-row items-start justify-center gap-4 w-full">
          <div className={`flex flex-col sm:flex-row items-center sm:items-start gap-4 w-full lg:w-auto ${tab !== "board" ? "hidden sm:flex" : "flex"}`}>
            {/* Field */}
            <div className="p-3 rounded-2xl" style={{ background: "linear-gradient(145deg,rgba(20,24,48,0.95),rgba(10,14,26,0.98))", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
              <Field balls={gs.balls || []} jack={gs.jack || { x: FIELD_W / 2, y: FIELD_H * 0.25 }} animBall={animBall} animProgress={animProgress} />
            </div>

            {/* Controls */}
            {isMyTurn && !throwing && (
              <div className="w-full sm:w-56 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", animation: "fadeUp 0.3s ease-out" }}>
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Configura tu tiro</p>
                <Slider label="Ángulo" value={angle} onChange={setAngle} min={-30} max={30} unit="°" color="#eab308" />
                <Slider label="Fuerza" value={force} onChange={setForce} min={10} max={100} unit="%" color="#ef4444" />
                <Slider label="Altura (parábola)" value={height} onChange={setHeight} min={10} max={100} unit="%" color="#38bdf8" />
                <Slider label="Efecto lateral" value={spin} onChange={setSpin} min={-50} max={50} unit="" color="#a78bfa" />
                <button onClick={handleThrow}
                  className="w-full mt-3 py-3 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.03] active:scale-[0.97]"
                  style={{ background: "linear-gradient(135deg,#a16207,#eab308)", boxShadow: "0 4px 20px rgba(234,179,8,0.3)", fontFamily: "'Outfit',sans-serif" }}>
                  🥎 ¡Lanzar!
                </button>
              </div>
            )}
            {throwing && (
              <div className="w-full sm:w-56 p-4 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent" style={{ borderColor: "rgba(234,179,8,0.5)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
              </div>
            )}
            {!isMyTurn && !gs.winner && gs.phase === "playing" && (
              <div className="w-full sm:w-56 p-4 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white/40 text-sm">Esperando a que {pName(gs.current)} lance...</p>
              </div>
            )}
          </div>

          {/* Chat */}
          <ChatBox chatMsgs={chatMsgs} chatInput={chatInput} setChatInput={setChatInput} sendChat={sendChat} myId={myId} players={gs.players} tab={tab} accentGrad="linear-gradient(135deg,#a16207,#eab308)" />
        </div>

        {/* Result */}
        {gs.winner !== null && gs.winner !== undefined && gs.phase === "over" && (
          <div className="mt-4 flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", animation: "bounceIn 0.5s ease-out" }}>
            <div className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>{gs.winner === 0 ? "🤝 ¡Empate!" : gs.winner === myId ? "🏆 ¡Has ganado!" : `😔 ${pName(gs.winner)} gana`}</div>
            <div className="text-white/40 text-sm">{pName(P1)}: {gs.scores?.[1] || 0} pts — {pName(P2)}: {gs.scores?.[2] || 0} pts</div>
            <div className="flex gap-2.5">
              <button onClick={playAgain} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:scale-105 transition-all" style={{ background: "linear-gradient(135deg,#a16207,#eab308)" }}>Otra vez</button>
              <button onClick={fullReset} className="px-4 py-2 rounded-xl text-white/50 text-sm font-semibold hover:text-white/80 transition-all" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>Nueva sala</button>
            </div>
          </div>)}
      </div>
    </div>);
}
