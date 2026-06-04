import type { Card, GameState, MoveChoice, PlayerState, Rank, RoomState, Suit } from './types';
import { SUIT_SCORE } from './types';

const SUITS: Suit[] = ['spades', 'clubs', 'hearts', 'diamonds'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function rankToValue(rank: Rank): number {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return Number(rank);
}

export function roomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${suit}-${rank}-${crypto.randomUUID()}`,
      suit,
      rank,
      value: rankToValue(rank),
    })),
  );
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function draw(deck: Card[], count: number): { drawn: Card[]; deck: Card[] } {
  return {
    drawn: deck.slice(0, count),
    deck: deck.slice(count),
  };
}

export function createInitialGame(roomCodeValue: string, hostName: string, guestName = '玩家2'): GameState {
  let deck = shuffle(createDeck());
  const p1Draw = draw(deck, 5);
  deck = p1Draw.deck;
  const p2Draw = draw(deck, 5);
  deck = p2Draw.deck;
  const publicDraw = draw(deck, 1);
  deck = publicDraw.deck;

  const players: PlayerState[] = [
    { id: 'p1', name: hostName, hand: p1Draw.drawn, captured: [], isHost: true },
    { id: 'p2', name: guestName, hand: p2Draw.drawn, captured: [], isHost: false },
  ];

  return {
    roomCode: roomCodeValue,
    status: 'playing',
    deck,
    publicCards: publicDraw.drawn,
    players,
    currentPlayerIndex: 0,
    turnEndsAt: Date.now() + 30000,
    winnerId: null,
    log: ['游戏开始'],
  };
}

export function createLobbyRoom(roomCodeValue: string, hostName: string): RoomState {
  return {
    roomCode: roomCodeValue,
    status: 'lobby',
    players: [{ id: 'p1', name: hostName, seat: 0 }],
    game: null,
    updatedAt: Date.now(),
  };
}

export function startRoomGame(room: RoomState): RoomState {
  const host = room.players.find((player) => player.id === 'p1');
  const guest = room.players.find((player) => player.id === 'p2');
  if (!host || !guest) {
    throw new Error('房间人数不足，无法开始');
  }

  return {
    ...room,
    status: 'playing',
    game: createInitialGame(room.roomCode, host.name, guest.name),
    updatedAt: Date.now(),
  };
}

export function findValidCaptures(handCard: Card, publicCards: Card[]): Card[][] {
  const result: Card[][] = [];

  function dfs(start: number, chosen: Card[], total: number) {
    if (total + handCard.value === 14) {
      result.push([...chosen]);
      return;
    }
    if (total + handCard.value > 14) return;

    for (let i = start; i < publicCards.length; i += 1) {
      chosen.push(publicCards[i]);
      dfs(i + 1, chosen, total + publicCards[i].value);
      chosen.pop();
    }
  }

  dfs(0, [], 0);
  return result;
}

function refillHand(player: PlayerState, deck: Card[]): { player: PlayerState; deck: Card[] } {
  const need = Math.max(0, 5 - player.hand.length);
  const drawn = deck.slice(0, need);
  return {
    player: { ...player, hand: [...player.hand, ...drawn] },
    deck: deck.slice(need),
  };
}

export function calculateScore(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + SUIT_SCORE[card.suit], 0);
}

export function applyMove(state: GameState, move: MoveChoice | null): GameState {
  if (state.status !== 'playing') return state;

  const players = state.players.map((player) => ({ ...player, hand: [...player.hand], captured: [...player.captured] }));
  const currentPlayer = players[state.currentPlayerIndex];
  let publicCards = [...state.publicCards];
  let deck = [...state.deck];
  const log = [...state.log];

  if (move) {
    const handIndex = currentPlayer.hand.findIndex((card) => card.id === move.handCardId);
    if (handIndex >= 0) {
      const handCard = currentPlayer.hand[handIndex];
      const chosenPublic = publicCards.filter((card) => move.publicCardIds.includes(card.id));
      const total = handCard.value + chosenPublic.reduce((sum, card) => sum + card.value, 0);
      if (chosenPublic.length > 0 && total === 14) {
        currentPlayer.hand.splice(handIndex, 1);
        currentPlayer.captured.push(handCard, ...chosenPublic);
        publicCards = publicCards.filter((card) => !move.publicCardIds.includes(card.id));
        log.push(`${currentPlayer.name} 收走了 ${handCard.rank} 与 ${chosenPublic.map((c) => c.rank).join('、')}`);
      } else if (deck.length === 0) {
        currentPlayer.hand.splice(handIndex, 1);
        publicCards.push(handCard);
        log.push(`${currentPlayer.name} 打出了 ${handCard.rank}`);
      } else {
        const drawn = deck[0];
        if (drawn) {
          publicCards.push(drawn);
          deck = deck.slice(1);
          log.push(`${currentPlayer.name} 未凑成 14，向公共区补了 1 张牌`);
        }
      }
    }
  } else {
    const drawn = deck[0];
    if (drawn) {
      publicCards.push(drawn);
      deck = deck.slice(1);
      log.push(`${currentPlayer.name} 超时或放弃操作，向公共区补了 1 张牌`);
    }
  }

  if (deck.length > 0) {
    const refill = refillHand(currentPlayer, deck);
    players[state.currentPlayerIndex] = refill.player;
    deck = refill.deck;
  } else {
    players[state.currentPlayerIndex] = currentPlayer;
  }

  const nextPlayerIndex = (state.currentPlayerIndex + 1) % players.length;
  const handsEmpty = players.every((player) => player.hand.length === 0);
  const finished = deck.length === 0 && handsEmpty;

  let winnerId: string | null = null;
  if (finished) {
    const [a, b] = players;
    const scoreA = calculateScore(a.captured);
    const scoreB = calculateScore(b.captured);
    winnerId = scoreA === scoreB ? 'draw' : scoreA > scoreB ? a.id : b.id;
    log.push(`游戏结束：${a.name} ${scoreA} 分，${b.name} ${scoreB} 分`);
  }

  return {
    ...state,
    deck,
    publicCards,
    players,
    currentPlayerIndex: finished ? state.currentPlayerIndex : nextPlayerIndex,
    turnEndsAt: finished ? null : Date.now() + 30000,
    status: finished ? 'finished' : 'playing',
    winnerId,
    log,
  };
}
