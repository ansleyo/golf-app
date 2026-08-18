"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  COLORS, PHASES, type Card as PhaseCard, type GameState as PhaseState,
  deal as dealPhaseGame, findPhaseMelds, phaseMeldSizes, reduceGame,
} from "../lib/phase10";

type GameType = "golf" | "phase10";
type GolfCard = { id: string; rank: string; suit: "♠" | "♥" | "♦" | "♣" };
type GolfPlayer = { id: string; name: string; avatar: string; cards: GolfCard[]; topUsed: boolean[]; score: number };
type GolfState = { game: "golf"; players: GolfPlayer[]; draw: GolfCard[]; discard: GolfCard[]; turn: number; maxPlayers: number; started: boolean; revealed?: boolean };
type PhaseRoomState = PhaseState & { game: "phase10"; maxPlayers: number; started: boolean };
type RoomState = GolfState | PhaseRoomState;

const suits: GolfCard["suit"][] = ["♠", "♥", "♦", "♣"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const avatars = ["🍺", "💩", "🤠", "👽", "🍸", "67"];
const golfValue = (card: GolfCard) => card.rank === "A" ? 1 : card.rank === "K" ? 0 : Number(card.rank) || 10;
const golfColor = (suit: GolfCard["suit"]) => suit === "♥" || suit === "♦" ? "red" : "black";
const phaseColor = (card: PhaseCard) => card.kind === "wild" ? "wild" : card.kind === "skip" ? "skip" : card.color;
const cardLabel = (card: PhaseCard) => card.kind === "wild" ? "WILD" : card.kind === "skip" ? "SKIP" : String(card.value);

function shuffle<T>(values: T[]) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function makeGolf(count: number, name = "You", avatar = "⛳"): GolfState {
  const cards = suits.flatMap((suit) => ranks.map((rank, i) => ({ rank, suit, id: `${suit}-${rank}-${i}` })));
  return { game: "golf", players: [{ id: "p0", name, avatar, cards: [], topUsed: [false, false], score: 0 }], draw: cards, discard: [], turn: 0, maxPlayers: count, started: false };
}

function dealGolf(state: GolfState): GolfState {
  const deck = shuffle(suits.flatMap((suit) => ranks.map((rank, i) => ({ rank, suit, id: `${suit}-${rank}-${i}-${Math.random()}` }))));
  const players = state.players.map((player) => ({ ...player, cards: deck.splice(0, 4), topUsed: [false, false] }));
  return { ...state, players, draw: deck, discard: [deck.pop()!], turn: 0, started: true, revealed: false };
}

function makePhase(count: number, name = "You", avatar = "⛳"): PhaseRoomState {
  return {
    game: "phase10", maxPlayers: count, started: false, players: [{
      id: "p0", name, avatar, hand: [], phase: 1, score: 0, laidPhase: null, hits: 0, skipped: false,
    }], drawPile: [], discardPile: [], currentPlayer: 0, turnHasDrawn: false, status: "playing", skipTarget: null, round: 1,
  };
}

function dealPhase(state: PhaseRoomState): PhaseRoomState {
  const result = dealPhaseGame(state.players.map((p) => p.id));
  if (!result.ok) throw new Error(result.error);
  return { ...result.state!, game: "phase10", maxPlayers: state.maxPlayers, started: true, players: result.state!.players.map((p, i) => ({ ...p, name: state.players[i].name, avatar: state.players[i].avatar })) };
}

function GolfCardFace({ card }: { card: GolfCard }) {
  return <><span className="corner">{card.rank}</span><span className="single-suit">{card.suit}</span><span className="corner corner-bottom">{card.rank}</span></>;
}

function PhaseCardFace({ card }: { card: PhaseCard }) {
  return <><span className="phase-card-label">{cardLabel(card)}</span>{card.kind === "number" && <span className="phase-card-dot">●</span>}</>;
}

export default function Home() {
  const [gameType, setGameType] = useState<GameType>("golf");
  const [count, setCount] = useState(3);
  const [state, setState] = useState<RoomState>(() => makeGolf(3));
  const [screen, setScreen] = useState<"landing" | "room">("landing");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🍺");
  const [roomInput, setRoomInput] = useState("");
  const [activeRoom, setActiveRoom] = useState("");
  const [localPlayer, setLocalPlayer] = useState(0);
  const [heldGolf, setHeldGolf] = useState<GolfCard | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<string[]>([]);
  const [notice, setNotice] = useState("Draw a card to begin.");
  const [phaseError, setPhaseError] = useState("");
  const [error, setError] = useState("");
  const remoteChange = useRef(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const roomCode = activeRoom || `${gameType === "golf" ? "GOLF" : "PHASE"}-DEMO`;

  useEffect(() => {
    setState(gameType === "golf" ? makeGolf(count) : makePhase(count));
    setHeldGolf(null); setSelectedPhase([]);
  }, [gameType, count]);

  useEffect(() => {
    if (!activeRoom) return;
    const apply = (incoming: RoomState) => { remoteChange.current = true; setState(incoming); };
    const roomChannel = supabase.channel(`card-room-${activeRoom}`).on("broadcast", { event: "game-state" }, ({ payload }) => apply(payload.state as RoomState)).on(
      "postgres_changes", { event: "UPDATE", schema: "public", table: "golf_rooms", filter: `code=eq.${activeRoom}` },
      ({ new: updated }) => apply(updated.state as RoomState),
    ).subscribe();
    channel.current = roomChannel;
    return () => { channel.current = null; supabase.removeChannel(roomChannel); };
  }, [activeRoom]);

  useEffect(() => {
    if (!activeRoom) return;
    if (remoteChange.current) { remoteChange.current = false; return; }
    void supabase.from("golf_rooms").update({ state, updated_at: new Date().toISOString() }).eq("code", activeRoom);
    void channel.current?.send({ type: "broadcast", event: "game-state", payload: { state } });
  }, [state, activeRoom]);

  const resetLocalTurn = () => { setHeldGolf(null); setSelectedPhase([]); };
  const updatePhase = (action: Parameters<typeof reduceGame>[1]) => {
    if (state.game !== "phase10") return;
    const result = reduceGame(state, action);
    if (!result.ok) { setPhaseError(result.error); setNotice(result.error); return; }
    setPhaseError("");
    setState({ ...result.state!, game: "phase10", maxPlayers: state.maxPlayers, started: true }); resetLocalTurn();
  };
  const hitPhase = (targetPlayerId: string, meldId: string) => {
    if (state.game !== "phase10" || selectedPhase.length !== 1) return;
    updatePhase({ type: "hit", targetPlayerId, meldId, cardId: selectedPhase[0] });
  };

  const enterRoom = async (join: boolean) => {
    if (!name.trim() || (join && !roomInput.trim())) return;
    setError("");
    if (!join) {
      const code = `${gameType === "golf" ? "GOLF" : "PHASE"}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const newState = gameType === "golf" ? makeGolf(count, name.trim(), avatar) : makePhase(count, name.trim(), avatar);
      const { error: insertError } = await supabase.from("golf_rooms").insert({ code, state: newState });
      if (insertError) { setError("Could not create a table. Check the Supabase setup."); return; }
      setState(newState); setLocalPlayer(0); setActiveRoom(code); setScreen("room"); return;
    }
    const code = roomInput.trim().toUpperCase();
    const { data, error: readError } = await supabase.from("golf_rooms").select("state").eq("code", code).single();
    if (readError || !data) { setError("That room code was not found."); return; }
    const roomState = data.state as RoomState;
    if (roomState.game !== gameType) { setError("That room is for a different game."); return; }
    if (roomState.started) { setError("That game has already started."); return; }
    if (roomState.players.length >= roomState.maxPlayers) { setError("That table is already full."); return; }
    const id = `p${roomState.players.length}`;
    const player = gameType === "golf"
      ? { id, name: name.trim(), avatar, cards: [], topUsed: [false, false], score: 0 }
      : { id, name: name.trim(), avatar, hand: [], phase: 1 as const, score: 0, laidPhase: null, hits: 0, skipped: false };
    const joined = { ...roomState, players: [...roomState.players, player] } as RoomState;
    const { error: updateError } = await supabase.from("golf_rooms").update({ state: joined, updated_at: new Date().toISOString() }).eq("code", code);
    if (updateError) { setError("Could not join that table."); return; }
    setState(joined); setCount(roomState.maxPlayers); setLocalPlayer(roomState.players.length); setActiveRoom(code); setScreen("room");
  };

  const start = () => {
    try {
      setState(state.game === "golf" ? dealGolf(state) : dealPhase(state));
      resetLocalTurn(); setNotice(state.game === "golf" ? "Draw a card to begin." : "Draw a card, then complete your phase.");
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Could not deal the cards."); }
  };

  const drawGolf = (from: "draw" | "discard") => {
    if (state.game !== "golf" || heldGolf || state.revealed || state.turn !== localPlayer) return;
    const pile = from === "draw" ? state.draw : state.discard;
    if (!pile.length) return;
    const card = pile[pile.length - 1];
    setState({ ...state, [from]: pile.slice(0, -1) });
    setHeldGolf(card); setNotice("Swap it into a position or discard it.");
  };
  const actGolf = (cardIndex?: number) => {
    if (state.game !== "golf" || !heldGolf || state.turn !== localPlayer) return;
    if (cardIndex === undefined) {
      const nextTurn = (state.turn + 1) % state.players.length;
      setState({ ...state, discard: [...state.discard, heldGolf], turn: nextTurn });
      resetLocalTurn(); setNotice("Discarded. Next player's turn."); return;
    }
    const player = state.players[localPlayer];
    if (cardIndex < 2 && player.topUsed[cardIndex]) { setNotice("That top card was already swapped."); return; }
    const old = player.cards[cardIndex];
    const players = state.players.map((p, i) => i === localPlayer ? { ...p, cards: p.cards.map((card, index) => index === cardIndex ? heldGolf : card), topUsed: cardIndex < 2 ? p.topUsed.map((used, index) => index === cardIndex ? true : used) : p.topUsed } : p);
    setState({ ...state, players, discard: [...state.discard, old], turn: (state.turn + 1) % state.players.length });
    resetLocalTurn(); setNotice("Swap complete. Next player's turn.");
  };

  if (screen === "landing") return <main className="landing-page">
    <nav><div className="brand"><span>⌁</span> CARD NIGHT</div><div className="room">TWO GAMES FOR 2–4 FRIENDS</div></nav>
    <section className="landing-hero"><div><p className="eyebrow">Your table is waiting</p><h1>Bring your<br/><i>best game.</i></h1><p>Choose a game, set up your player, then start a table or join your friends.</p><div className="game-picker"><button className={gameType === "golf" ? "chosen" : ""} onClick={() => setGameType("golf")}><b>Golf</b><small>Four cards. Lowest score.</small></button><button className={gameType === "phase10" ? "chosen" : ""} onClick={() => setGameType("phase10")}><b>Phase 10</b><small>Complete all ten phases.</small></button></div></div>
      <div className="join-card"><p className="eyebrow">Step 1 of 2</p><h2>Make it yours.</h2><label>Your display name<input autoFocus maxLength={16} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ansley"/></label><span className="label">Choose an avatar</span><div className="avatar-picker">{avatars.map((item) => <button type="button" aria-label={`Use ${item} avatar`} className={avatar === item ? "chosen" : ""} onClick={() => setAvatar(item)} key={item}>{item}</button>)}</div><span className="label">How many people are playing?</span><div className="size-picker">{[2, 3, 4].map((size) => <button type="button" className={count === size ? "chosen" : ""} onClick={() => setCount(size)} key={size}>{size}</button>)}</div><button className="primary" disabled={!name.trim()} onClick={() => void enterRoom(false)}>Create a {gameType === "golf" ? "Golf" : "Phase 10"} table <span>→</span></button><div className="or"><span/>or<span/></div><label>Have a room code?<div className="join-row"><input value={roomInput} onChange={(event) => setRoomInput(event.target.value.toUpperCase())} placeholder={`${gameType === "golf" ? "GOLF" : "PHASE"}-XXXX`}/><button type="button" onClick={() => void enterRoom(true)} disabled={!name.trim() || !roomInput.trim()}>Join</button></div></label>{error && <p className="connection-error">{error}</p>}<small className="form-note">Friends can join from any device with the room code.</small></div>
    </section>
  </main>;

  if (!state.started) return <main className="lobby-page"><nav><div className="brand"><span>⌁</span> CARD NIGHT</div><div className="room">ROOM <strong>{roomCode}</strong> <button onClick={() => navigator.clipboard?.writeText(roomCode)}>Copy</button></div></nav><section className="waiting-room"><p className="eyebrow">{state.game === "golf" ? "Golf" : "Phase 10"} room {roomCode}</p><h1>The table is<br/><i>getting warm.</i></h1><p className="waiting-copy">Share the room code. The game begins when all {state.maxPlayers} seats are filled.</p><div className="seats">{Array.from({ length: state.maxPlayers }, (_, index) => { const player = state.players[index]; return <div className={`seat ${player ? "filled" : ""}`} key={index}><span>{player?.avatar || "+"}</span><b>{player?.name || "Waiting for a friend"}</b><small>{player ? "ready at the table" : "room code required"}</small></div>; })}</div>{state.players.length === state.maxPlayers ? localPlayer === 0 ? <button className="primary begin" onClick={start}>Deal the cards <span>→</span></button> : <p className="host-note">Everyone's here. Waiting for the host to deal.</p> : <p className="host-note">{state.maxPlayers - state.players.length} more friend{state.maxPlayers - state.players.length === 1 ? "" : "s"} needed.</p>}</section></main>;

  if (state.game === "phase10") {
    const player = state.players[localPlayer];
    const active = state.players[state.currentPlayer];
    const selectedCards = player.hand.filter((card) => selectedPhase.includes(card.id));
    const requiredCards = phaseMeldSizes(player.phase).reduce((sum, size) => sum + size, 0);
    const proposedMelds = findPhaseMelds(player.phase, selectedCards);
    return <main className="phase10-page"><nav><div className="brand"><span>⌁</span> PHASE 10</div><div className="room">ROOM <strong>{roomCode}</strong> <button onClick={() => navigator.clipboard?.writeText(roomCode)}>Copy</button></div></nav><section className="hero"><p className="eyebrow">The classic ten-phase card game</p><h1>Make your<br/><i>phase count.</i></h1><p className="sub">Complete Phase {player.phase}: {PHASES[player.phase - 1]}.</p></section><div className="phase-layout"><section className="table phase-table"><div className="table-top"><div><span className="live-dot"/> LIVE PHASE 10 <small>• {state.players.length} PLAYERS</small></div>{localPlayer === 0 && <button className="outline" onClick={state.status === "round-over" ? () => updatePhase({ type: "next-round" }) : start}>{state.status === "round-over" ? "Next round" : "New round"}</button>}</div><div className="turn-banner"><span>✦</span><b>{state.status !== "playing" ? "ROUND COMPLETE" : `${(active.name || "Player").toUpperCase()}’S TURN`}</b><em>{notice}</em></div><div className="players">{state.players.map((item, pIndex) => <article className={`player ${pIndex === state.currentPlayer && state.status === "playing" ? "active" : ""}`} key={item.id}><header><div className="avatar">{item.avatar || "?"}</div><div><b>{item.name || "Player"}</b><small>Phase {item.phase} · {item.hand.length} cards</small></div><strong>{item.score} <small>PTS</small></strong></header>{item.laidPhase && <div className="melds">{item.laidPhase.map((meld) => <button className="meld" key={meld.id} onClick={() => hitPhase(item.id, meld.id)}>{meld.cards.map((card) => <span className={`phase-card mini ${phaseColor(card)}`} key={card.id}>{cardLabel(card)}</span>)}</button>)}</div>}{pIndex === localPlayer ? <div className="phase-hand">{item.hand.map((card) => <button className={`phase-card ${phaseColor(card)} ${selectedPhase.includes(card.id) ? "selected" : ""}`} key={card.id} onClick={() => setSelectedPhase((selected) => selected.includes(card.id) ? selected.filter((id) => id !== card.id) : [...selected, card.id])}><PhaseCardFace card={card}/></button>)}</div> : <div className="hidden-hand">{Array.from({ length: item.hand.length }, (_, i) => <span className="phase-card back" key={i}>✦</span>)}</div>    }{pIndex !== localPlayer && state.currentPlayer === localPlayer && state.turnHasDrawn && item.id !== player.id && player.hand.some((card) => card.kind === "skip") && <button className="skip-button" onClick={() => updatePhase({ type: "use-skip", targetId: item.id })}>Skip {item.name || "player"}</button>}</article>)}</div><div className="phase-actions"><button className="pile draw" onClick={() => updatePhase({ type: "draw", from: "draw" })} disabled={state.currentPlayer !== localPlayer || state.turnHasDrawn}><span className="card back">✦</span><b>DRAW</b><small>{state.drawPile.length} cards</small></button><button className="pile" onClick={() => updatePhase({ type: "draw", from: "discard" })} disabled={state.currentPlayer !== localPlayer || state.turnHasDrawn}><span className={`phase-card ${state.discardPile.at(-1) ? phaseColor(state.discardPile.at(-1)!) : "back"}`}>{state.discardPile.at(-1) ? <PhaseCardFace card={state.discardPile.at(-1)!}/> : "—"}</span><b>DISCARD</b><small>pick up top card</small></button><button className="primary compact" disabled={!selectedPhase.length || state.currentPlayer !== localPlayer || !state.turnHasDrawn} onClick={() => updatePhase({ type: "discard", cardId: selectedPhase[0] })}>Discard selected</button><button className="primary compact" disabled={!proposedMelds || selectedCards.length !== requiredCards || state.currentPlayer !== localPlayer || !state.turnHasDrawn} onClick={() => updatePhase({ type: "lay-phase", melds: proposedMelds || [] })}>Lay Phase</button></div>{phaseError && <p className="phase-error">{phaseError}</p>}<p className="phase-hint">{!state.turnHasDrawn ? "Draw a card first, then select your phase cards." : `Select exactly ${requiredCards} cards. The game will group them into valid melds automatically.`}</p></section><aside className="phase-sidebar"><p className="eyebrow">Your phases</p><h2>Ten steps<br/><i>to finish.</i></h2><div className="phase-list">{PHASES.map((phase, i) => <div className={`phase-list-item ${i + 1 === player.phase ? "current" : ""} ${i + 1 < player.phase ? "done" : ""}`} key={phase}><span>{i + 1}</span><p>{phase}</p></div>)}</div></aside></div></main>;
  }

  return <main><nav><div className="brand"><span>⌁</span> GOLF NIGHT</div><div className="room">ROOM <strong>{roomCode}</strong> <button onClick={() => navigator.clipboard?.writeText(roomCode)}>Copy</button></div></nav><section className="hero"><p className="eyebrow">A four-card game for friends</p><h1>Keep your score<br/><i>under par.</i></h1><p className="sub">Draw smart. Swap wisely. The lowest total wins.</p></section><section className="table"><div className="table-top"><div><span className="live-dot"/> LIVE GOLF <small>• {state.players.length} PLAYERS</small></div>{localPlayer === 0 && <button className="outline" onClick={start}>New round</button>}</div><div className="turn-banner"><span>✦</span><b>{state.revealed ? "ROUND COMPLETE" : `${state.players[state.turn].name.toUpperCase()}’S TURN`}</b><em>{notice}</em></div><div className="players">{state.players.map((player, pIndex) => <article className={`player ${pIndex === state.turn && !state.revealed ? "active" : ""}`} key={player.id}><header><div className="avatar">{player.avatar}</div><div><b>{player.name}</b><small>{pIndex === state.turn && !state.revealed ? "playing now" : "at the table"}</small></div><strong>{player.score} <small>PTS</small></strong></header><div className="cards">{player.cards.map((card, cIndex) => { const visible = !!state.revealed || (pIndex === localPlayer && cIndex >= 2) || (pIndex === localPlayer && cIndex < 2 && player.topUsed[cIndex]); return <button className={`card ${visible ? golfColor(card.suit) : "back"}`} disabled={!heldGolf || pIndex !== localPlayer || state.turn !== localPlayer} onClick={() => actGolf(cIndex)} key={card.id}>{visible ? <GolfCardFace card={card}/> : "✦"}</button>; })}</div></article>)}</div><div className="piles"><button className="pile draw" onClick={() => drawGolf("draw")} disabled={!!heldGolf || state.turn !== localPlayer}><span className="card back">✦</span><b>DRAW</b><small>{state.draw.length} cards</small></button><div className="held"><span>IN HAND</span>{heldGolf ? <div className={`card ${golfColor(heldGolf.suit)}`}><GolfCardFace card={heldGolf}/></div> : <div className="empty">—</div>}{heldGolf && <button className="discard-button" onClick={() => actGolf()}>Discard card</button>}</div><button className="pile" onClick={() => drawGolf("discard")} disabled={!!heldGolf || state.turn !== localPlayer}><span className={`card ${state.discard.at(-1) ? golfColor(state.discard.at(-1)!.suit) : "back"}`}>{state.discard.at(-1) ? <GolfCardFace card={state.discard.at(-1)!} /> : "—"}</span><b>DISCARD</b><small>pick up top card</small></button></div></section><section className="how"><div><p className="eyebrow">How to play</p><h2>Small cards.<br/>Big moves.</h2></div><div className="rules"><p><b>01</b> Your bottom two cards are visible to you.</p><p><b>02</b> Draw or take discard, then swap or discard.</p><p><b>03</b> Top cards can be swapped once.</p><p><b>04</b> Lowest total wins.</p></div></section></main>;
}
