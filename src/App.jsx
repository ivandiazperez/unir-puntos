import { useState } from "react";
import UnirPuntos from "./games/UnirPuntos";
import TresEnRaya from "./games/TresEnRaya";
import HundirFlota from "./games/HundirFlota";
import Bolos from "./games/Bolos";
import Petanca from "./games/Petanca";

const PASSWORD = "puntos2026";

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:wght@400;500;600&display=swap');
@keyframes orbFloat { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(40px,-30px) scale(1.15)} }
@keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
@keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
@keyframes float1 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-12px) rotate(3deg)} }
@keyframes float2 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-8px) rotate(-2deg)} }
@keyframes float3 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-15px) rotate(2deg)} }
@keyframes float4 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-10px) rotate(-1.5deg)} }
.shake { animation: shake 0.45s ease-in-out; }
`;

const Orb = ({ color, size, x, y, dur, delay }) => (
  <div className="absolute rounded-full opacity-20 blur-3xl pointer-events-none"
    style={{ background: color, width: size, height: size, left: x, top: y,
      animation: `orbFloat ${dur}s ease-in-out ${delay}s infinite alternate` }} />
);

const GAMES = [
  {
    id: "unir-puntos",
    title: "Unir Puntos",
    subtitle: "Conecta 4 en línea",
    emoji: "🔴",
    desc: "Tablero 6×7 · Conecta 4 fichas en horizontal, vertical o diagonal para ganar",
    gradient: "linear-gradient(135deg, #059669, #10b981)",
    shadow: "0 8px 30px rgba(16,185,129,0.25)",
    float: "float1",
  },
  {
    id: "tres-en-raya",
    title: "Tres en Raya",
    subtitle: "El clásico X vs O",
    emoji: "❌",
    desc: "Tablero 3×3 · Coloca 3 en línea antes que tu rival",
    gradient: "linear-gradient(135deg, #7c3aed, #a78bfa)",
    shadow: "0 8px 30px rgba(124,58,237,0.25)",
    float: "float2",
  },
  {
    id: "hundir-flota",
    title: "Hundir la Flota",
    subtitle: "Batalla naval",
    emoji: "🚢",
    desc: "Coloca tus barcos y destruye los de tu rival disparando al tablero enemigo",
    gradient: "linear-gradient(135deg, #0369a1, #38bdf8)",
    shadow: "0 8px 30px rgba(56,189,248,0.25)",
    float: "float3",
  },
  {
    id: "bolos",
    title: "Bolos",
    subtitle: "Bowling multijugador",
    emoji: "🎳",
    desc: "Elige peso, efecto, fuerza y trayectoria. Vista 3D o 2D. 10 frames por jugador",
    gradient: "linear-gradient(135deg, #dc2626, #f97316)",
    shadow: "0 8px 30px rgba(249,115,22,0.25)",
    float: "float1",
  },
  {
    id: "petanca",
    title: "Petanca",
    subtitle: "Pétanque / Bocce",
    emoji: "🥎",
    desc: "Lanza tus bolas lo más cerca del boliche. Controla ángulo, fuerza y parábola",
    gradient: "linear-gradient(135deg, #a16207, #eab308)",
    shadow: "0 8px 30px rgba(234,179,8,0.25)",
    float: "float4",
  },
];

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [activeGame, setActiveGame] = useState(null);

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
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(251,191,36,0.12))", border: "1px solid rgba(255,255,255,0.06)" }}>🎮</div>
          </div>
          <h1 className="text-2xl font-extrabold text-center text-white/90 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Game Room</h1>
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

  // ═══ GAME VIEW ═══
  if (activeGame === "unir-puntos") return <UnirPuntos onBack={() => setActiveGame(null)} />;
  if (activeGame === "tres-en-raya") return <TresEnRaya onBack={() => setActiveGame(null)} />;
  if (activeGame === "hundir-flota") return <HundirFlota onBack={() => setActiveGame(null)} />;
  if (activeGame === "bolos") return <Bolos onBack={() => setActiveGame(null)} />;
  if (activeGame === "petanca") return <Petanca onBack={() => setActiveGame(null)} />;

  // ═══ LANDING ═══
  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: "linear-gradient(135deg, #0a0e1a 0%, #141830 50%, #0a0e1a 100%)" }}>
      <style>{STYLES}</style>
      {orbs}
      <Orb color="radial-gradient(circle, #06b6d4, transparent)" size="300px" x="80%" y="70%" dur={10} delay={3} />

      <div className="relative z-10 flex flex-col items-center px-4 py-8 sm:py-14 min-h-screen">
        {/* Header */}
        <div className="text-center mb-10" style={{ animation: "fadeUp 0.5s ease-out" }}>
          <h1 className="text-4xl sm:text-5xl font-black mb-2"
            style={{ fontFamily: "'Outfit', sans-serif",
              background: "linear-gradient(90deg, #4ade80, #fbbf24, #a78bfa, #38bdf8, #4ade80)", backgroundSize: "300% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: "shimmer 4s linear infinite" }}>
            Game Room
          </h1>
          <p className="text-white/40 text-sm sm:text-base" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Elige un juego · Multijugador en tiempo real
          </p>
        </div>

        {/* Game Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-4 w-full max-w-5xl">
          {GAMES.map((game, i) => (
            <button
              key={game.id}
              onClick={() => setActiveGame(game.id)}
              className="group relative p-6 rounded-2xl text-left transition-all duration-300 hover:scale-[1.04] active:scale-[0.98]"
              style={{
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 15px 40px rgba(0,0,0,0.3)",
                animation: `fadeUp 0.5s ease-out ${i * 0.1}s both, ${game.float} 4s ease-in-out ${i * 0.5}s infinite`,
              }}
            >
              {/* Glow on hover */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: game.gradient, opacity: 0, mixBlendMode: "overlay" }} />
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-300"
                style={{ background: game.gradient }} />

              <div className="relative z-10">
                <div className="text-4xl mb-3">{game.emoji}</div>
                <h2 className="text-xl font-bold text-white mb-0.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {game.title}
                </h2>
                <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {game.subtitle}
                </p>
                <p className="text-white/35 text-sm leading-relaxed mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {game.desc}
                </p>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: game.gradient, boxShadow: game.shadow, fontFamily: "'Outfit', sans-serif" }}>
                    Jugar →
                  </div>
                  <div className="px-2 py-1 rounded-md text-xs text-white/30" style={{ background: "rgba(255,255,255,0.04)", fontFamily: "'DM Sans', sans-serif" }}>
                    2 jugadores
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-white/15 text-xs mt-10" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          Todos los juegos son multijugador online en tiempo real
        </p>
      </div>
    </div>
  );
}
