"use client";

import { useEffect, useMemo, useState } from "react";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: string; suit: Suit };
type Player = { name: string; cards: Card[]; topUsed: boolean[]; score: number };

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

function makeGame(count: number, randomize = true) {
  const cards = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
  // The first render must be identical on Next's server and in the browser.
  // Subsequent new games are shuffled from the button click.
  const deck = randomize ? shuffle(cards) : cards;
  const players = names.slice(0, count).map((name) => ({ name, cards: deck.splice(0, 4), topUsed: [false, false], score: 0 }));
  return { players, draw: deck, discard: [deck.pop()!], turn: 0 };
}

export default function Home() {
  const [count, setCount] = useState(3);
  const [game, setGame] = useState(() => makeGame(3, false));
  const [held, setHeld] = useState<Card | null>(null);
  const [source, setSource] = useState<"draw" | "discard" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState("Draw a card to begin.");
  const roomCode = useMemo(() => "GOLF-DEMO", []);

  useEffect(() => {
    setGame(makeGame(3));
  }, []);

  const start = (players = count) => {
    setGame(makeGame(players)); setHeld(null); setSource(null); setRevealed(false); setNotice("New round — draw a card to begin.");
  };
  const draw = (from: "draw" | "discard") => {
    if (held || revealed) return;
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
    if (!held) return;
    const finalDraw = game.draw.length === 0;
    setGame((g) => ({ ...g, discard: [...g.discard, held], turn: (g.turn + 1) % g.players.length, players: finalDraw ? g.players.map((p) => ({ ...p, score: p.score + p.cards.reduce((total, c) => total + cardValue(c), 0) })) : g.players }));
    setHeld(null); setSource(null); setRevealed(finalDraw); setNotice(finalDraw ? "Draw pile empty — cards revealed and scores added." : "Card discarded. Next player’s turn.");
  };
  const swap = (playerIndex: number, cardIndex: number) => {
    if (!held || playerIndex !== game.turn || revealed) return;
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

  return <main>
    <nav><div className="brand"><span>⌁</span> GOLF NIGHT</div><div className="room">ROOM <strong>{roomCode}</strong> <button onClick={() => navigator.clipboard?.writeText(roomCode)}>Copy</button></div></nav>
    <section className="hero"><p className="eyebrow">A four-card game for friends</p><h1>Keep your score<br/><i>under par.</i></h1><p className="sub">Draw smart. Swap wisely. The lowest total wins.</p></section>
    <section className="table">
      <div className="table-top"><div><span className="live-dot"/> LIVE TABLE <small>• {game.players.length} PLAYERS</small></div><button className="outline" onClick={() => start()}>New game</button></div>
      <div className="turn-banner"><span>✦</span><b>{revealed ? "ROUND COMPLETE" : `${game.players[game.turn].name.toUpperCase()}’S TURN`}</b><em>{notice}</em></div>
      <div className="players">
        {game.players.map((player, pIndex) => <article className={`player ${pIndex === game.turn && !revealed ? "active" : ""}`} key={player.name}>
          <header><div className="avatar">{player.name[0]}</div><div><b>{player.name}</b><small>{pIndex === game.turn && !revealed ? "playing now" : "at the table"}</small></div><strong>{player.score} <small>PTS</small></strong></header>
          <div className="cards">{player.cards.map((card, cIndex) => {
            const visible = revealed || (pIndex === 0 && cIndex >= 2) || (pIndex === 0 && cIndex < 2 && player.topUsed[cIndex]);
            const sideways = cIndex < 2 && player.topUsed[cIndex];
            return <button aria-label={`${player.name} card ${cIndex + 1}`} disabled={!held || pIndex !== game.turn} onClick={() => swap(pIndex, cIndex)} className={`card ${visible ? suitColor(card.suit) : "back"} ${sideways ? "sideways" : ""}`} key={cIndex}>{visible ? <CardFace card={card}/> : <span className="back-mark">✦</span>}</button>;
          })}</div>
          {revealed && <p className="round-score">Round: {player.cards.reduce((total, c) => total + cardValue(c), 0)}</p>}
        </article>)}
      </div>
      <div className="piles">
        <button className="pile draw" onClick={() => draw("draw")} disabled={!!held || revealed}><span className="stack one"/><span className="stack two"/><span className="card back">✦</span><b>DRAW</b><small>{game.draw.length} cards</small></button>
        <div className="held"><span>IN HAND</span>{held ? <div className={`card ${suitColor(held.suit)}`}><CardFace card={held}/></div> : <div className="empty">—</div>} {held && <button className="discard-button" onClick={discardHeld}>Discard card</button>}</div>
        <button className="pile" onClick={() => draw("discard")} disabled={!!held || revealed}><span className={`card ${suitColor(game.discard.at(-1)!.suit)}`}><CardFace card={game.discard.at(-1)!}/></span><b>DISCARD</b><small>pick up top card</small></button>
      </div>
    </section>
    <section className="how"><div><p className="eyebrow">How to play</p><h2>Small cards. Big moves.</h2></div><div className="rules"><p><b>01</b> Your bottom two cards are always visible to you.</p><p><b>02</b> Draw or take discard, then swap—or discard.</p><p><b>03</b> Top cards can be swapped once, then turn sideways.</p><p><b>04</b> When the draw pile empties, lowest total wins.</p></div></section>
    <footer><span>PLAY WITH 2–4 FRIENDS</span><div><button className={count === 2 ? "selected" : ""} onClick={() => { setCount(2); start(2); }}>2</button><button className={count === 3 ? "selected" : ""} onClick={() => { setCount(3); start(3); }}>3</button><button className={count === 4 ? "selected" : ""} onClick={() => { setCount(4); start(4); }}>4</button></div></footer>
  </main>;
}
