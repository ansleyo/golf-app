"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: string; suit: Suit };
type Player = { name: string; cards: Card[]; topUsed: boolean[]; score: number };
type Game = { players: Player[]; draw: Card[]; discard: Card[]; turn: number; maxPlayers: number; started: boolean };

const suits: Suit[] = ["♠", "♥", "♦", "♣"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const names = ["You", "Maya", "Noah", "Jules"];
const cardValue = (card: Card) => card.rank === "A" ? 1 : card.rank === "K" ? 0 : Number(card.rank) || 10;
const suitColor = (suit: Suit) => suit === "♥" || suit === "♦" ? "red" : "black";
function CardFace({ card }: { card: Card }) {
  return <>
    <span className="corner corner-top">{card.rank}</span>
    <span className="single-suit">{card.suit}</span>
    <span className="corner corner-bottom">{card.rank}</span>
  </>;
}

function shuffle<T>(values: T[]) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function makeGame(count: number, _randomize = true, localName = "You"): Game {
  const cards = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
  return { players: [{ name: localName, cards: [], topUsed: [false, false], score: 0 }], draw: cards, discard: [], turn: 0, maxPlayers: count, started: false };
}

function dealRound(game: Game): Game {
  const deck = shuffle(suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit }))));
  const players = game.players.map((player) => ({ ...player, cards: deck.splice(0, 4), topUsed: [false, false] }));
  return { ...game, players, draw: deck, discard: [deck.pop()!], turn: 0, started: true };
}

export default function Home() {
  const [count, setCount] = useState(3);
  const [game, setGame] = useState(() => makeGame(3, false));
  const [held, setHeld] = useState<Card | null>(null);
  const [source, setSource] = useState<"draw" | "discard" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState("Draw a card to begin.");
  const [screen, setScreen] = useState<"landing" | "game">("landing");
  const [profileName, setProfileName] = useState("");
  const [avatar, setAvatar] = useState("⛳");
  const [roomInput, setRoomInput] = useState("");
  const [activeRoom, setActiveRoom] = useState("");
  const [localPlayer, setLocalPlayer] = useState(0);
  const [connectionError, setConnectionError] = useState("");
  const remoteChange = useRef(false);
  const roomChannel = useRef<RealtimeChannel | null>(null);
  const roomCode = activeRoom || "GOLF-DEMO";

  useEffect(() => {
    setGame(makeGame(3, false));
  }, []);

  useEffect(() => {
    if (!activeRoom) return;
    const applyRemoteState = (state: Game) => {
      remoteChange.current = true;
      setGame(state);
    };
    const channel = supabase.channel(`golf-room-${activeRoom}`).on(
      "broadcast",
      { event: "game-state" },
      ({ payload }) => applyRemoteState(payload.state as Game)
    ).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "golf_rooms", filter: `code=eq.${activeRoom}` },
      ({ new: updated }) => {
        const state = updated.state as Game;
        applyRemoteState(state);
      }
    ).subscribe();
    roomChannel.current = channel;
    return () => { roomChannel.current = null; supabase.removeChannel(channel); };
  }, [activeRoom]);

  useEffect(() => {
    if (!activeRoom) return;
    if (remoteChange.current) { remoteChange.current = false; return; }
    void supabase.from("golf_rooms").update({ state: game, updated_at: new Date().toISOString() }).eq("code", activeRoom);
    void roomChannel.current?.send({ type: "broadcast", event: "game-state", payload: { state: game } });
  }, [game, activeRoom]);

  const start = (players = count) => {
    setGame((current) => activeRoom ? dealRound(current) : makeGame(players, true, profileName.trim() || "You")); setHeld(null); setSource(null); setRevealed(false); setNotice("New round — draw a card to begin.");
  };
  const enterGame = async (event: React.FormEvent, joining = false) => {
    event.preventDefault();
    if (!profileName.trim() || (joining && !roomInput.trim())) return;
    setConnectionError("");
    if (!joining) {
      const code = `GOLF-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const newGame = makeGame(count, true, profileName.trim());
      const { error } = await supabase.from("golf_rooms").insert({ code, state: newGame });
      if (error) { setConnectionError("Couldn’t create a table. Please try again."); return; }
      setGame(newGame); setLocalPlayer(0); setActiveRoom(code); setScreen("game"); return;
    }
    const code = roomInput.trim().toUpperCase();
    const { data, error } = await supabase.from("golf_rooms").select("state").eq("code", code).single();
    if (error || !data) { setConnectionError("That room code wasn’t found."); return; }
    const roomGame = data.state as Game;
    if (roomGame.started) { setConnectionError("That game has already started."); return; }
    if (roomGame.players.length >= roomGame.maxPlayers) { setConnectionError("That table is already full."); return; }
    const seat = roomGame.players.length;
    const joinedGame: Game = { ...roomGame, players: [...roomGame.players, { name: profileName.trim(), cards: [], topUsed: [false, false], score: 0 }] };
    const { error: updateError } = await supabase.from("golf_rooms").update({ state: joinedGame, updated_at: new Date().toISOString() }).eq("code", code);
    if (updateError) { setConnectionError("Couldn’t join that table. Please try again."); return; }
    setGame(joinedGame); setCount(joinedGame.maxPlayers); setLocalPlayer(seat); setActiveRoom(code); setScreen("game");
  };
  const draw = (from: "draw" | "discard") => {
    if (held || revealed || game.turn !== localPlayer) return;
    if (from === "draw" && game.draw.length === 0) { finish(); return; }
    const pile = from === "draw" ? game.draw : game.discard;
    if (!pile.length) return;
    const card = pile[pile.length - 1];
    setGame((g) => ({ ...g, [from]: g[from].slice(0, -1) }));
    setHeld(card); setSource(from); setNotice("Swap it into a card position, or discard it.");
  };
  const finish = () => {
    setRevealed(true); setHeld(null); setSource(null);
    setGame((g) => ({ ...g, players: g.players.map((p) => ({ ...p, score: p.score + p.cards.reduce((total, c) => total + cardValue(c), 0) })) }));
    setNotice("Draw pile empty — cards revealed and scores added.");
  };
  const discardHeld = () => {
    if (!held || game.turn !== localPlayer) return;
    const finalDraw = game.draw.length === 0;
    setGame((g) => ({ ...g, discard: [...g.discard, held], turn: (g.turn + 1) % g.players.length, players: finalDraw ? g.players.map((p) => ({ ...p, score: p.score + p.cards.reduce((total, c) => total + cardValue(c), 0) })) : g.players }));
    setHeld(null); setSource(null); setRevealed(finalDraw); setNotice(finalDraw ? "Draw pile empty — cards revealed and scores added." : "Card discarded. Next player’s turn.");
  };
  const swap = (playerIndex: number, cardIndex: number) => {
    if (!held || playerIndex !== game.turn || playerIndex !== localPlayer || revealed) return;
    const isTop = cardIndex < 2;
    if (isTop && game.players[playerIndex].topUsed[cardIndex]) { setNotice("That top card has already been swapped once."); return; }
    const old = game.players[playerIndex].cards[cardIndex];
    const finalDraw = game.draw.length === 0;
    setGame((g) => ({ ...g, discard: [...g.discard, old], turn: (g.turn + 1) % g.players.length, players: g.players.map((p, pIndex) => {
      const updated = pIndex !== playerIndex ? p : { ...p, cards: p.cards.map((c, i) => i === cardIndex ? held : c), topUsed: isTop ? p.topUsed.map((used, i) => i === cardIndex ? true : used) : p.topUsed };
      return finalDraw ? { ...updated, score: updated.score + updated.cards.reduce((total, c) => total + cardValue(c), 0) } : updated;
    }) }));
    setHeld(null); setSource(null); setRevealed(finalDraw); setNotice(finalDraw ? "Draw pile empty — cards revealed and scores added." : "Swap complete. Next player’s turn.");
  };

  if (screen === "landing") return <main className="landing-page">
    <nav><div className="brand"><span>⌁</span> GOLF NIGHT</div><div className="room">A CARD GAME FOR 2–4 FRIENDS</div></nav>
    <section className="landing-hero"><div><p className="eyebrow">Your table is waiting</p><h1>Bring your<br/><i>best game.</i></h1><p>Set up your player, then start a table or join your friends with their room code.</p><div className="mini-cards"><span>♠</span><span>♥</span><span>♦</span></div></div>
      <form className="join-card" onSubmit={(event) => enterGame(event)}><p className="eyebrow">Step 1 of 2</p><h2>Make it yours.</h2><label>Your display name<input autoFocus maxLength={16} value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="e.g. Ansley"/></label><span className="label">Choose an avatar</span><div className="avatar-picker">{["⛳", "🌞", "🍀", "🦋", "🌼", "🪩"].map((item) => <button type="button" aria-label={`Use ${item} avatar`} className={avatar === item ? "chosen" : ""} onClick={() => setAvatar(item)} key={item}>{item}</button>)}</div><span className="label">How many people are playing?</span><div className="size-picker">{[2, 3, 4].map((size) => <button type="button" className={count === size ? "chosen" : ""} onClick={() => setCount(size)} key={size}>{size}</button>)}</div><button className="primary" disabled={!profileName.trim()} type="submit">Create a new table <span>→</span></button><div className="or"><span/>or<span/></div><label>Have a room code?<div className="join-row"><input value={roomInput} onChange={(event) => setRoomInput(event.target.value.toUpperCase())} placeholder="GOLF-XXXX"/><button type="button" onClick={(event) => enterGame(event as unknown as React.FormEvent, true)} disabled={!profileName.trim() || !roomInput.trim()}>Join</button></div></label>{connectionError && <p className="connection-error">{connectionError}</p>}<small className="form-note">Your friends can join with a room code from any device.</small></form>
    </section>
  </main>;

  if (!game.started) return <main className="lobby-page">
    <nav><div className="brand"><span>⌁</span> GOLF NIGHT</div><div className="room">ROOM <strong>{roomCode}</strong> <button onClick={() => navigator.clipboard?.writeText(roomCode)}>Copy</button></div></nav>
    <section className="waiting-room"><p className="eyebrow">Room {roomCode}</p><h1>The table is<br/><i>getting warm.</i></h1><p className="waiting-copy">Share your room code. The game begins when all {game.maxPlayers} seats are filled.</p><div className="seats">{Array.from({ length: game.maxPlayers }, (_, index) => { const player = game.players[index]; return <div className={`seat ${player ? "filled" : ""}`} key={index}><span>{player ? (index === localPlayer ? avatar : player.name[0]) : "+"}</span><b>{player?.name || "Waiting for a friend"}</b><small>{player ? "ready at the table" : "room code required"}</small></div>; })}</div>{game.players.length === game.maxPlayers ? localPlayer === 0 ? <button className="primary begin" onClick={() => start()}>Deal the cards <span>→</span></button> : <p className="host-note">Everyone&apos;s here. Waiting for the host to deal.</p> : <p className="host-note">{game.maxPlayers - game.players.length} more {game.maxPlayers - game.players.length === 1 ? "friend" : "friends"} needed.</p>}</section>
  </main>;

  return <main>
    <nav><div className="brand"><span>⌁</span> GOLF NIGHT</div><div className="room">ROOM <strong>{roomCode}</strong> <button onClick={() => navigator.clipboard?.writeText(roomCode)}>Copy</button></div></nav>
    <section className="hero"><p className="eyebrow">A four-card game for friends</p><h1>Keep your score<br/><i>under par.</i></h1><p className="sub">Draw smart. Swap wisely. The lowest total wins.</p></section>
    <section className="table">
      <div className="table-top"><div><span className="live-dot"/> LIVE TABLE <small>• {game.players.length} PLAYERS</small></div>{localPlayer === 0 && <button className="outline" onClick={() => start()}>New round</button>}</div>
      <div className="turn-banner"><span>✦</span><b>{revealed ? "ROUND COMPLETE" : `${game.players[game.turn].name.toUpperCase()}’S TURN`}</b><em>{notice}</em></div>
      <div className="players">
        {game.players.map((player, pIndex) => <article className={`player ${pIndex === game.turn && !revealed ? "active" : ""}`} key={player.name}>
          <header><div className="avatar">{pIndex === localPlayer ? avatar : player.name[0]}</div><div><b>{player.name}</b><small>{pIndex === game.turn && !revealed ? "playing now" : "at the table"}</small></div><strong>{player.score} <small>PTS</small></strong></header>
          <div className="cards">{player.cards.map((card, cIndex) => {
            const visible = revealed || (pIndex === localPlayer && cIndex >= 2) || (pIndex === localPlayer && cIndex < 2 && player.topUsed[cIndex]);
            const sideways = cIndex < 2 && player.topUsed[cIndex];
            return <button aria-label={`${player.name} card ${cIndex + 1}`} disabled={!held || pIndex !== game.turn || pIndex !== localPlayer} onClick={() => swap(pIndex, cIndex)} className={`card ${visible ? suitColor(card.suit) : "back"} ${sideways ? "sideways" : ""}`} key={cIndex}>{visible ? <CardFace card={card}/> : <span className="back-mark">✦</span>}</button>;
          })}</div>
          {revealed && <p className="round-score">Round: {player.cards.reduce((total, c) => total + cardValue(c), 0)}</p>}
        </article>)}
      </div>
      <div className="piles">
        <button className="pile draw" onClick={() => draw("draw")} disabled={!!held || revealed || game.turn !== localPlayer}><span className="stack one"/><span className="stack two"/><span className="card back">✦</span><b>DRAW</b><small>{game.draw.length} cards</small></button>
        <div className="held"><span>IN HAND</span>{held ? <div className={`card ${suitColor(held.suit)}`}><CardFace card={held}/></div> : <div className="empty">—</div>} {held && <button className="discard-button" onClick={discardHeld}>Discard card</button>}</div>
        <button className="pile" onClick={() => draw("discard")} disabled={!!held || revealed || game.turn !== localPlayer}><span className={`card ${suitColor(game.discard.at(-1)!.suit)}`}><CardFace card={game.discard.at(-1)!}/></span><b>DISCARD</b><small>pick up top card</small></button>
      </div>
    </section>
    <section className="how"><div><p className="eyebrow">How to play</p><h2>Small cards. Big moves.</h2></div><div className="rules"><p><b>01</b> Your bottom two cards are always visible to you.</p><p><b>02</b> Draw or take discard, then swap—or discard.</p><p><b>03</b> Top cards can be swapped once, then turn sideways.</p><p><b>04</b> When the draw pile empties, lowest total wins.</p></div></section>
    <footer><span>PLAY WITH 2–4 FRIENDS</span><div><button className={count === 2 ? "selected" : ""} onClick={() => { setCount(2); start(2); }}>2</button><button className={count === 3 ? "selected" : ""} onClick={() => { setCount(3); start(3); }}>3</button><button className={count === 4 ? "selected" : ""} onClick={() => { setCount(4); start(4); }}>4</button></div></footer>
  </main>;
}
