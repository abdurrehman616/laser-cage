// Messages between the game and the online server (JSON over WebSocket).
// Shared by both sides so they can't drift apart.
import type { Look, Phase } from '../game/match';

export const PROTOCOL = 1;

export interface SeatInfo { id: number; name: string; color: string; rainbow: boolean; look: Look; bot: boolean }
export interface PlayerSnap { id: number; x?: number; z?: number; a?: number; al: boolean }   // x/z/a left out while hidden

export type ClientMsg =
  | { t: 'join'; v: number; name: string; color: string; rainbow: boolean; look: Look }
  | { t: 'rejoin'; v: number; token: string }
  | { t: 'pos'; x: number; z: number; a: number }          // my position + aim (hide phase only)
  | { t: 'leave' }
  | { t: 'ping'; at: number };

export type NetEvent =
  | { type: 'round'; round: number; final: boolean }
  | { type: 'phase'; phase: Phase }
  | { type: 'tick'; sec: number }
  | { type: 'lock' }
  | { type: 'fire'; shots: { from: number; x: number; z: number; hit: number | null }[]; victims: number[] }
  | { type: 'drop'; fell: number[] }
  | { type: 'sudden'; level: number }
  | { type: 'over'; winner: number | null };

export interface FullState {
  round: number; ring: number; sudden: number; phase: Phase; t: number; tt: number;
  players: { id: number; alive: boolean; how: 'shot' | 'fell' | null; kills: number; survived: number; killedBy: number | null }[];
  out: number[][];
}

export type ServerMsg =
  | { t: 'hello'; v: number; online: boolean; region: string }
  | { t: 'queue'; players: number; max: number; startsIn: number }
  | { t: 'start'; you: number; token: string; arena: string; seats: SeatInfo[]; state?: FullState }
  | { t: 'snap'; ph: Phase; tl: number; tt: number; ps: PlayerSnap[] }
  | { t: 'ev'; e: NetEvent }
  | { t: 'pong'; at: number }
  | { t: 'error'; message: string };
