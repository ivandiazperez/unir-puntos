import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { ref, set, onValue, remove } from "firebase/database";
import { STYLES, Orb, Orbs, colorGrad, BG, PANEL, BackButton, P1, P2, sanitizePlayers } from "./shared";

const ROWS = 6, COLS = 7, EMPTY = 0;
const GAME_REF = "unir-puntos/game";
const CHAT_REF = "unir-puntos/chat";

const createBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));

const checkWin = (board, player) => {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c] !== player) continue;
    for (const [dr, dc] of dirs) {
      let cells = [[r, c]];
      for (let i = 1; i < 4; i++) {
        const nr = r+dr*i, nc = c+dc*i;
        if (nr<0||nr>=ROWS||nc<0||nc>=COLS||board[nr][nc]!==player) break;
        cells.push([nr, nc]);
      }
      if (cells.length === 4) return cells;
    }
  }
  return null;
};
const isFull = (board) => board[0].every(c => c !== EMPTY);
const getDropRow = (board, col) => { for (let r=ROWS-1;r>=0;r--) if(board[r][col]===EMPTY) return r; return -1; };

const defaultState = () => ({
  phase:"lobby", board:createBoard(), current:P1, winner:null, winCells:null,
  lastMove:null, isDraw:false, players:{1:null,2:null}, scores:{1:0,2:0}, moveCount:0, version:0,
});

const sanitize = (data) => {
  if (!data) return defaultState();
  const d = { ...defaultState(), ...data };
  d.players = sanitizePlayers(d.players);
  if (!d.board||!Array.isArray(d.board)||d.board.length!==ROWS) d.board = createBoard();
  if (!d.scores) d.scores = {1:0,2:0};
  if (d.winCells&&!Array.isArray(d.winCells)) d.winCells = null;
  return d;
};

const Piece = ({ color, isWinning, isLast, isNew }) => {
  const palette = {
    green:{bg:"radial-gradient(circle at 35% 35%,#4ade80,#16a34a,#065f27)",glow:"0 0 20px rgba(74,222,128,0.5),inset 0 -3px 6px rgba(0,0,0,0.3)"},
    yellow:{bg:"radial-gradient(circle at 35% 35%,#fbbf24,#f59e0b,#b45309)",glow:"0 0 20px rgba(251,191,36,0.5),inset 0 -3px 6px rgba(0,0,0,0.3)"},
  };
  const s = palette[color]; if(!s) return null;
  return (
    <div className="absolute inset-1 rounded-full" style={{background:s.bg,boxShadow:s.glow,
      animation:isNew?"dropPiece 0.45s cubic-bezier(0.34,1.2,0.64,1) forwards":isWinning?"winPulse 0.8s ease-in-out infinite alternate":"none",opacity:isNew?0:1}}>
      {isLast&&!isWinning&&<div className="absolute inset-0 rounded-full border-2 border-white/50" style={{animation:"ringPulse 1.5s ease-in-out infinite"}}/>}
      <div className="absolute rounded-full" style={{width:"38%",height:"22%",top:"14%",left:"22%",background:"linear-gradient(180deg,rgba(255,255,255,0.45),transparent)",borderRadius:"50%"}}/>
    </div>
  );
};

const fbSave = async (path, data) => { try{await set(ref(db,path),data)}catch(e){console.error(e)} };
const fbDel = async () => { try{await remove(ref(db,"unir-puntos"))}catch(e){console.error(e)} };

export default function UnirPuntos({ onBack }) {
  const [myId,setMyId]=useState(null);
  const [myName,setMyName]=useState("");
  const [myColor,setMyColor]=useState(null);
  const [joinName,setJoinName]=useState("");
  const [gs,setGs]=useState(defaultState());
  const [chatMsgs,setChatMsgs]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [hoverCol,setHoverCol]=useState(-1);
  const [animCell,setAnimCell]=useState(null);
  const [animating,setAnimating]=useState(false);
  const [tab,setTab]=useState("board");
  const [aiHint,setAiHint]=useState(null); // column number suggested by AI
  const [aiLoading,setAiLoading]=useState(false);
  const chatEndRef=useRef(null);
  const prevMC=useRef(0);
  const hintRequested=useRef(false);

  const isIvan=(name)=>{
    const n=(name||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    return n==="ivan"||n==="iván";
  };

  const pName=(pid,s=gs)=>s.players[pid]?.name||`Jugador ${pid}`;

  // Ask Claude for the best move
  const requestAiHint=async(board,myPlayer)=>{
    if(aiLoading)return;
    setAiLoading(true);setAiHint(null);
    try{
      const boardStr=board.map((row,r)=>row.map(c=>c===0?"·":c===myPlayer?"X":"O").join(" ")).join("\n");
      const response=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:100,
          messages:[{role:"user",content:`You are a Connect Four expert. The board is 6 rows × 7 columns (columns 0-6). X is me, O is opponent. "·" is empty. Pieces fall to the bottom.

Board (row 0 = top):
${boardStr}

Which single column (0-6) is the best move for X? Consider: winning moves, blocking opponent wins, center control, and setting up future wins. Reply with ONLY the column number, nothing else.`}]
        })
      });
      const data=await response.json();
      const text=(data.content||[]).map(c=>c.text||"").join("").trim();
      const col=parseInt(text);
      if(!isNaN(col)&&col>=0&&col<COLS&&getDropRow(board,col)>=0){
        setAiHint(col);
      }
    }catch(e){console.error("AI hint error:",e);}
    setAiLoading(false);
  };

  useEffect(()=>{
    const u1=onValue(ref(db,GAME_REF),(snap)=>{
      const d=sanitize(snap.val());
      if(d.lastMove&&d.moveCount>prevMC.current){setAnimCell(d.lastMove);setTimeout(()=>setAnimCell(null),480);}
      prevMC.current=d.moveCount||0; setGs(d);
    });
    const u2=onValue(ref(db,CHAT_REF),(snap)=>{const d=snap.val();if(d)setChatMsgs(d);});
    return()=>{u1();u2();};
  },[]);

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[chatMsgs]);

  // Request AI hint when it becomes Iván's turn
  useEffect(()=>{
    if(gs.phase==="playing"&&!gs.winner&&!gs.isDraw&&gs.current===myId&&isIvan(myName)&&!aiLoading){
      // Only request once per turn (reset when moveCount changes)
      if(!hintRequested.current){
        hintRequested.current=true;
        requestAiHint(gs.board,myId);
      }
    }
  },[gs.current,gs.moveCount,gs.phase,myId,myName]);

  // Reset hint flag when turn changes
  useEffect(()=>{
    hintRequested.current=false;
    setAiHint(null);
  },[gs.moveCount]);

  const createRoom=async()=>{if(!myName.trim())return;const c=myColor||"green";const f={...defaultState(),players:{1:{name:myName.trim(),color:c},2:null},version:1};await fbSave(GAME_REF,f);await fbSave(CHAT_REF,[{type:"system",text:`🎮 ${myName.trim()} ha creado la sala.`,ts:Date.now()}]);setMyId(P1);setMyColor(c);prevMC.current=0;};
  const joinRoom=async()=>{if(!joinName.trim()||!gs.players[1])return;const c2=gs.players[1].color==="green"?"yellow":"green";const u={...gs,players:{...gs.players,2:{name:joinName.trim(),color:c2}},phase:"playing",version:(gs.version||0)+1};await fbSave(GAME_REF,u);const m=[...(chatMsgs||[]),{type:"system",text:`🎮 ${joinName.trim()} se ha unido. ¡A jugar!`,ts:Date.now()}];await fbSave(CHAT_REF,m);setMyId(P2);setMyName(joinName.trim());setMyColor(c2);prevMC.current=0;};

  const handleDrop=async(col)=>{
    if(animating||gs.winner||gs.isDraw||gs.phase!=="playing"||gs.current!==myId)return;
    const row=getDropRow(gs.board,col);if(row<0)return;setAnimating(true);
    const nb=gs.board.map(r=>[...r]);nb[row][col]=gs.current;
    let ns={...gs,board:nb,lastMove:{row,col},moveCount:(gs.moveCount||0)+1,version:(gs.version||0)+1};
    const win=checkWin(nb,gs.current);
    if(win){ns.winner=gs.current;ns.winCells=win;ns.scores={...gs.scores,[gs.current]:(gs.scores[gs.current]||0)+1};ns.phase="over";}
    else if(isFull(nb)){ns.isDraw=true;ns.phase="over";}
    else ns.current=gs.current===P1?P2:P1;
    setAnimCell({row,col});prevMC.current=ns.moveCount;await fbSave(GAME_REF,ns);
    if(win){const m=[...(chatMsgs||[]),{type:"system",text:`🏆 ¡${pName(gs.current,ns)} ha ganado!`,ts:Date.now()}];await fbSave(CHAT_REF,m);}
    else if(ns.isDraw){const m=[...(chatMsgs||[]),{type:"system",text:"🤝 ¡Empate!",ts:Date.now()}];await fbSave(CHAT_REF,m);}
    setTimeout(()=>{setAnimating(false);setAnimCell(null);},480);
  };

  const playAgain=async()=>{const ns={...gs,board:createBoard(),current:P1,winner:null,winCells:null,lastMove:null,isDraw:false,phase:"playing",moveCount:0,version:(gs.version||0)+1};await fbSave(GAME_REF,ns);const m=[...(chatMsgs||[]),{type:"system",text:"🔄 ¡Nueva partida!",ts:Date.now()}];await fbSave(CHAT_REF,m);prevMC.current=0;};
  const fullReset=async()=>{await fbDel();setGs(defaultState());setChatMsgs([]);setMyId(null);setMyName("");setMyColor(null);setJoinName("");prevMC.current=0;};
  const sendChat=async()=>{if(!chatInput.trim()||!myId)return;const m=[...(chatMsgs||[]),{type:"player",player:myId,name:myName,text:chatInput.trim(),ts:Date.now()}];await fbSave(CHAT_REF,m);setChatInput("");};
  const isWC=(r,c)=>gs.winCells?.some(([wr,wc])=>wr===r&&wc===c);

  // ═══ LOBBY ═══
  if(!myId){
    const roomExists=!!(gs.players&&gs.players[1]);
    const roomFull=!!(gs.players&&gs.players[1]&&gs.players[2]);
    return(
      <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{background:BG}}>
        <style>{STYLES}</style><Orbs/><BackButton onClick={onBack}/>
        <div className="relative z-10 p-8 rounded-3xl max-w-md w-full mx-4" style={{...PANEL,animation:"fadeUp 0.5s ease-out"}}>
          <h1 className="text-3xl font-black text-center mb-1" style={{fontFamily:"'Outfit',sans-serif",background:"linear-gradient(90deg,#4ade80,#fbbf24,#4ade80)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 3s linear infinite"}}>Unir Puntos</h1>
          <p className="text-center text-white/35 text-sm mb-7" style={{fontFamily:"'DM Sans',sans-serif"}}>Conecta 4 en línea · Multijugador</p>
          {!roomExists&&(<div style={{animation:"fadeUp 0.4s ease-out"}}>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2" style={{fontFamily:"'DM Sans',sans-serif"}}>Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",fontFamily:"'DM Sans',sans-serif"}} value={myName} onChange={e=>setMyName(e.target.value)} placeholder="Ej: María"/>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-3" style={{fontFamily:"'DM Sans',sans-serif"}}>Elige tu color</label>
            <div className="flex gap-3 mb-6">{["green","yellow"].map(c=>(<button key={c} onClick={()=>setMyColor(c)} className={`flex-1 py-3.5 rounded-xl text-white font-bold transition-all hover:scale-105 ${myColor===c?'ring-2 ring-white/40 scale-105':'opacity-60'}`} style={{background:colorGrad(c),fontFamily:"'Outfit',sans-serif"}}>{c==="green"?"🟢 Verde":"🟡 Amarillo"}</button>))}</div>
            <button onClick={createRoom} disabled={!myName.trim()||!myColor} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{background:"linear-gradient(135deg,#4c1d95,#1e3a5f)",fontFamily:"'Outfit',sans-serif"}}>Crear sala 🚀</button>
          </div>)}
          {roomExists&&!roomFull&&(<div style={{animation:"fadeUp 0.4s ease-out"}}>
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl" style={{background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.12)"}}><div className="w-3 h-3 rounded-full" style={{background:"#4ade80",animation:"winPulse 1.2s ease-in-out infinite alternate"}}/><span className="text-white/70 text-sm" style={{fontFamily:"'DM Sans',sans-serif"}}><span className="text-white font-semibold">{gs.players[1]?.name}</span> está esperando...</span></div>
            <label className="block text-white/60 text-xs uppercase tracking-wider mb-2" style={{fontFamily:"'DM Sans',sans-serif"}}>Tu nombre</label>
            <input className="w-full mb-4 px-4 py-3 rounded-xl text-white outline-none" style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",fontFamily:"'DM Sans',sans-serif"}} value={joinName} onChange={e=>setJoinName(e.target.value)} placeholder="Ej: Carlos"/>
            <button onClick={joinRoom} disabled={!joinName.trim()} className="w-full py-3.5 rounded-xl text-white font-bold transition-all hover:scale-[1.03] disabled:opacity-30" style={{background:"linear-gradient(135deg,#4c1d95,#1e3a5f)",fontFamily:"'Outfit',sans-serif"}}>Unirse 🎯</button>
          </div>)}
          {roomFull&&(<div className="text-center" style={{animation:"fadeUp 0.4s ease-out"}}>
            <p className="text-white/50 text-sm mb-4" style={{fontFamily:"'DM Sans',sans-serif"}}>Partida en curso entre <span className="text-white font-semibold">{gs.players[1]?.name}</span> y <span className="text-white font-semibold">{gs.players[2]?.name}</span>.</p>
            <div className="flex gap-3">
              <button onClick={()=>{setMyId(P1);setMyName(gs.players[1]?.name||"J1");setMyColor(gs.players[1]?.color||"green");}} className="flex-1 py-3 rounded-xl text-white font-semibold hover:scale-105 transition-all" style={{background:colorGrad(gs.players[1]?.color||"green"),fontFamily:"'Outfit',sans-serif"}}>Soy {gs.players[1]?.name}</button>
              <button onClick={()=>{setMyId(P2);setMyName(gs.players[2]?.name||"J2");setMyColor(gs.players[2]?.color||"yellow");}} className="flex-1 py-3 rounded-xl text-white font-semibold hover:scale-105 transition-all" style={{background:colorGrad(gs.players[2]?.color||"yellow"),fontFamily:"'Outfit',sans-serif"}}>Soy {gs.players[2]?.name}</button>
            </div>
            <button onClick={fullReset} className="mt-3 w-full py-2.5 rounded-xl text-white/40 text-sm hover:text-white/70 transition-all" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",fontFamily:"'DM Sans',sans-serif"}}>Reiniciar todo</button>
          </div>)}
        </div>
      </div>);
  }

  // ═══ WAITING ═══
  if(gs.phase==="lobby"&&myId===P1) return(
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center" style={{background:BG}}>
      <style>{STYLES}</style><Orbs/><BackButton onClick={onBack}/>
      <div className="relative z-10 p-8 rounded-3xl max-w-sm w-full mx-4 text-center" style={{...PANEL,animation:"fadeUp 0.5s ease-out"}}>
        <div className="w-10 h-10 mx-auto mb-5 rounded-full border-2 border-t-transparent" style={{borderColor:"rgba(76,29,149,0.5)",borderTopColor:"transparent",animation:"spin 1s linear infinite"}}/>
        <h2 className="text-xl font-bold text-white/90 mb-2" style={{fontFamily:"'Outfit',sans-serif"}}>Esperando rival...</h2>
        <p className="text-white/40 text-sm mb-5" style={{fontFamily:"'DM Sans',sans-serif"}}>Comparte la URL con otro jugador</p>
        <button onClick={fullReset} className="mt-3 px-5 py-2 rounded-lg text-white/30 text-xs hover:text-white/60 transition-all">Cancelar</button>
      </div>
    </div>);

  // ═══ GAME ═══
  const isMyTurn=gs.current===myId;
  const curGrad=gs.players[gs.current]?colorGrad(gs.players[gs.current].color):"#888";
  const CELL=typeof window!=="undefined"&&window.innerWidth<640?44:56;
  const GAP=3;

  return(
    <div className="relative min-h-screen w-full overflow-hidden" style={{background:BG}}>
      <style>{STYLES}</style><Orbs/><BackButton onClick={onBack}/>
      <Orb color="radial-gradient(circle,#06b6d4,transparent)" size="280px" x="85%" y="-8%" dur={10} delay={3}/>
      <div className="relative z-10 flex flex-col items-center w-full max-w-2xl mx-auto px-2 sm:px-4 py-3 sm:py-6 min-h-screen pt-12">
        <h1 className="text-xl sm:text-2xl font-black mb-1" style={{fontFamily:"'Outfit',sans-serif",background:"linear-gradient(90deg,#4ade80,#fbbf24,#4ade80)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 3s linear infinite"}}>Unir Puntos</h1>
        {/* Scoreboard */}
        <div className="flex items-center gap-3 sm:gap-4 mb-2 px-3 sm:px-5 py-2 rounded-2xl w-full justify-center" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
          {[P1,P2].map(pid=>(<div key={pid} className="flex items-center gap-1.5 sm:gap-2"><div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full" style={{background:gs.players[pid]?colorGrad(gs.players[pid].color):"#555",boxShadow:pid===myId?"0 0 10px rgba(255,255,255,0.2)":"none"}}/><span className={`text-xs sm:text-sm font-semibold truncate max-w-[70px] sm:max-w-none ${pid===myId?'text-white/90':'text-white/50'}`} style={{fontFamily:"'DM Sans',sans-serif"}}>{pName(pid)}{pid===myId?" (tú)":""}</span><span className="text-white font-bold text-base sm:text-lg">{gs.scores[pid]}</span>{pid===P1&&<span className="text-white/15 text-base mx-0.5">—</span>}</div>))}
        </div>
        {/* Tabs mobile */}
        <div className="flex sm:hidden w-full gap-1 mb-2 px-1">
          {[{id:"board",label:"🎮 Tablero"},{id:"chat",label:`💬 Chat${(chatMsgs||[]).filter(m=>m.type==="player").length>0?` (${(chatMsgs||[]).filter(m=>m.type==="player").length})`:""}`}].map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab===t.id?'text-white':'text-white/35'}`} style={{background:tab===t.id?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.02)",border:tab===t.id?"1px solid rgba(255,255,255,0.1)":"1px solid rgba(255,255,255,0.04)",fontFamily:"'DM Sans',sans-serif"}}>{t.label}</button>))}
        </div>
        <div className="flex flex-col lg:flex-row items-start justify-center gap-4 w-full">
          {/* Board */}
          <div className={`flex flex-col items-center w-full lg:w-auto ${tab!=="board"?"hidden sm:flex":"flex"}`}>
            {!gs.winner&&!gs.isDraw&&gs.phase==="playing"&&(<div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl" style={{background:isMyTurn?"rgba(74,222,128,0.06)":"rgba(255,255,255,0.03)",border:isMyTurn?"1px solid rgba(74,222,128,0.12)":"1px solid rgba(255,255,255,0.05)"}}><div className="w-2.5 h-2.5 rounded-full" style={{background:curGrad,animation:"winPulse 1s ease-in-out infinite alternate"}}/><span className="text-white/60 text-xs sm:text-sm" style={{fontFamily:"'DM Sans',sans-serif"}}>{isMyTurn?<span className="text-white font-semibold">¡Tu turno!</span>:<>Turno de <span className="text-white font-semibold">{pName(gs.current)}</span></>}</span></div>)}
            <div className="p-1.5 sm:p-2.5 rounded-2xl sm:rounded-3xl" style={{background:"linear-gradient(145deg,rgba(20,24,48,0.95),rgba(10,14,26,0.98))",border:"1px solid rgba(255,255,255,0.06)",boxShadow:"0 25px 60px rgba(0,0,0,0.5)"}}>
              <div className="flex mb-0.5 px-0.5" style={{gap:`${GAP}px`}}>
                {Array.from({length:COLS}).map((_,c)=>{
                  const show=hoverCol===c&&isMyTurn&&!gs.winner&&!gs.isDraw&&getDropRow(gs.board,c)>=0;
                  const isHinted=aiHint===c&&isMyTurn&&isIvan(myName);
                  return(<div key={c} className="flex items-center justify-center cursor-pointer relative" style={{width:`${CELL}px`,height:`${Math.round(CELL*0.5)}px`}} onMouseEnter={()=>setHoverCol(c)} onMouseLeave={()=>setHoverCol(-1)} onClick={()=>handleDrop(c)}>
                    {show&&<div className="rounded-full" style={{width:`${Math.round(CELL*0.38)}px`,height:`${Math.round(CELL*0.38)}px`,background:myColor?colorGrad(myColor):"#555",opacity:0.5,animation:"bob 1.2s ease-in-out infinite"}}/>}
                    {isHinted&&!show&&<div className="rounded-full" style={{width:`${Math.round(CELL*0.28)}px`,height:`${Math.round(CELL*0.28)}px`,background:"radial-gradient(circle,rgba(168,85,247,0.7),rgba(168,85,247,0.2))",boxShadow:"0 0 12px rgba(168,85,247,0.5)",animation:"bob 1.5s ease-in-out infinite"}}/>}
                  </div>);
                })}
              </div>
              {aiLoading&&isMyTurn&&isIvan(myName)&&<div className="text-center mb-0.5"><span className="text-purple-400/40 text-xs" style={{fontFamily:"'DM Sans',sans-serif",animation:"winPulse 1.5s infinite alternate"}}>✨</span></div>}
              <div className="rounded-xl sm:rounded-2xl p-0.5 sm:p-1" style={{background:"linear-gradient(180deg,rgba(15,23,42,0.4),rgba(20,24,48,0.5))",border:"1px solid rgba(255,255,255,0.03)"}}>
                {gs.board.map((row,r)=>(<div key={r} className="flex" style={{gap:`${GAP}px`,marginBottom:r<ROWS-1?`${GAP}px`:0}}>{row.map((cell,c)=>{
                  const hintTarget=aiHint===c&&isMyTurn&&isIvan(myName)&&getDropRow(gs.board,c)===r&&cell===EMPTY;
                  return(<div key={c} className="relative rounded-full transition-colors duration-200" style={{width:`${CELL}px`,height:`${CELL}px`,background:hintTarget?"radial-gradient(circle,rgba(168,85,247,0.12),rgba(10,14,26,0.75))":"radial-gradient(circle,rgba(10,14,26,0.95),rgba(10,14,26,0.75))",boxShadow:hintTarget?"inset 0 2px 6px rgba(0,0,0,0.5),0 0 8px rgba(168,85,247,0.15)":"inset 0 2px 6px rgba(0,0,0,0.5)",cursor:isMyTurn&&!gs.winner&&!gs.isDraw?"pointer":"default"}} onMouseEnter={()=>setHoverCol(c)} onMouseLeave={()=>setHoverCol(-1)} onClick={()=>handleDrop(c)}>
                    {cell!==EMPTY&&<Piece color={gs.players[cell]?.color||"green"} isWinning={isWC(r,c)} isLast={gs.lastMove?.row===r&&gs.lastMove?.col===c} isNew={animCell?.row===r&&animCell?.col===c}/>}
                    {hoverCol===c&&isMyTurn&&getDropRow(gs.board,c)===r&&cell===EMPTY&&!gs.winner&&!gs.isDraw&&!animating&&<div className="absolute inset-1 rounded-full" style={{background:myColor?colorGrad(myColor):"#555",opacity:0.1}}/>}
                    {hintTarget&&!animating&&<div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-2 h-2 rounded-full" style={{background:"rgba(168,85,247,0.5)",boxShadow:"0 0 8px rgba(168,85,247,0.4)",animation:"winPulse 1.2s ease-in-out infinite alternate"}}/></div>}
                  </div>);
                })}</div>))}
              </div>
            </div>
            {(gs.winner||gs.isDraw)&&(<div className="mt-3 flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",animation:"bounceIn 0.5s ease-out"}}><div className="text-lg sm:text-xl font-bold text-white" style={{fontFamily:"'Outfit',sans-serif"}}>{gs.isDraw?"🤝 ¡Empate!":gs.winner===myId?"🏆 ¡Has ganado!":`😔 ${pName(gs.winner)} gana`}</div><div className="flex gap-2.5"><button onClick={playAgain} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:scale-105 transition-all" style={{background:"linear-gradient(135deg,#4c1d95,#1e3a5f)",fontFamily:"'Outfit',sans-serif"}}>Otra vez</button><button onClick={fullReset} className="px-4 py-2 rounded-xl text-white/50 text-sm font-semibold hover:text-white/80 transition-all" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)"}}>Nueva sala</button></div></div>)}
          </div>
          {/* Chat */}
          <div className={`w-full lg:w-72 flex flex-col rounded-2xl overflow-hidden flex-shrink-0 ${tab!=="chat"?"hidden sm:flex":"flex"}`} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",height:tab==="chat"?"calc(100vh - 200px)":"420px",maxHeight:"480px",animation:"fadeUp 0.6s ease-out 0.15s both"}}>
            <div className="px-4 py-2 flex items-center justify-between" style={{borderBottom:"1px solid rgba(255,255,255,0.05)"}}><span className="text-white/60 text-sm font-semibold" style={{fontFamily:"'DM Sans',sans-serif"}}>💬 Chat</span><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-400" style={{animation:"winPulse 2s ease-in-out infinite alternate"}}/><span className="text-white/30 text-xs" style={{fontFamily:"'DM Sans',sans-serif"}}>en vivo</span></div></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{scrollbarWidth:"thin",scrollbarColor:"rgba(255,255,255,0.08) transparent"}}>
              {(chatMsgs||[]).map((msg,i)=>msg.type==="system"?<div key={i} className="text-center text-white/25 text-xs py-1" style={{fontFamily:"'DM Sans',sans-serif"}}>{msg.text}</div>:(<div key={i} className={`flex gap-2 items-start ${msg.player===myId?'flex-row-reverse':''}`} style={{animation:"fadeUp 0.25s ease-out"}}><div className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" style={{background:gs.players[msg.player]?colorGrad(gs.players[msg.player].color):"#555"}}/><div><div className={`text-white/40 text-xs mb-0.5 ${msg.player===myId?'text-right':''}`} style={{fontFamily:"'DM Sans',sans-serif"}}>{msg.name}</div><div className="text-white/85 text-sm px-3 py-1.5 rounded-xl" style={{background:msg.player===myId?"rgba(76,29,149,0.15)":"rgba(255,255,255,0.05)",fontFamily:"'DM Sans',sans-serif"}}>{msg.text}</div></div></div>))}
              <div ref={chatEndRef}/>
            </div>
            <div className="p-2.5 flex gap-2" style={{borderTop:"1px solid rgba(255,255,255,0.05)"}}><input className="flex-1 px-3 py-2 rounded-xl text-white text-sm outline-none" style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.06)",fontFamily:"'DM Sans',sans-serif"}} placeholder="Mensaje..." value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()}/><button onClick={sendChat} className="px-3.5 py-2 rounded-xl text-white text-sm font-semibold hover:scale-105 transition-all" style={{background:"linear-gradient(135deg,#4c1d95,#1e3a5f)"}}>➤</button></div>
          </div>
        </div>
      </div>
    </div>);
}
