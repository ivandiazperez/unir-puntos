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
