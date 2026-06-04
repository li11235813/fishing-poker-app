export type Suit = 'spades' | 'clubs' | 'hearts' | 'diamonds';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number;
}

export interface PlayerState {
  id: string;
  name: string;
  hand: Card[];
  captured: Card[];
  isHost: boolean;
}

export interface MoveChoice {
  handCardId: string;
  publicCardIds: string[];
}

export interface GameState {
  roomCode: string;
  status: 'lobby' | 'playing' | 'finished';
  deck: Card[];
  publicCards: Card[];
  players: PlayerState[];
  currentPlayerIndex: number;
  turnEndsAt: number | null;
  winnerId: string | null;
  log: string[];
}

export interface RoomPlayer {
  id: string;
  name: string;
  seat: 0 | 1;
}

export interface RoomState {
  roomCode: string;
  status: 'lobby' | 'playing' | 'finished';
  players: RoomPlayer[];
  game: GameState | null;
  updatedAt: number;
}

export const SUIT_LABEL: Record<Suit, string> = {
  spades: '♠',
  clubs: '♣',
  hearts: '♥',
  diamonds: '♦',
};

export const SUIT_SCORE: Record<Suit, number> = {
  spades: 4,
  clubs: 3,
  hearts: 2,
  diamonds: 1,
};
