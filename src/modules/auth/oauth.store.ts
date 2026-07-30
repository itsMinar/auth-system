import type { AuthResponse } from '../../types';
import crypto from 'crypto';

interface StateEntry {
  createdAt: number;
}

const stateStore = new Map<string, StateEntry>();
const STATE_TTL_MS = 10 * 60 * 1000;

export function generateOAuthState(): string {
  const state = crypto.randomUUID();
  stateStore.set(state, { createdAt: Date.now() });
  return state;
}

export function validateOAuthState(state: string): boolean {
  const entry = stateStore.get(state);
  if (!entry) return false;
  stateStore.delete(state);
  return Date.now() - entry.createdAt < STATE_TTL_MS;
}

interface CodeEntry {
  authResponse: AuthResponse;
  createdAt: number;
}

const codeStore = new Map<string, CodeEntry>();
const CODE_TTL_MS = 2 * 60 * 1000;

export function generateOAuthCode(authResponse: AuthResponse): string {
  const code = crypto.randomUUID();
  codeStore.set(code, { authResponse, createdAt: Date.now() });
  return code;
}

export function exchangeOAuthCode(code: string): AuthResponse | null {
  const entry = codeStore.get(code);
  if (!entry) return null;
  codeStore.delete(code);
  if (Date.now() - entry.createdAt >= CODE_TTL_MS) return null;
  return entry.authResponse;
}

const CLEANUP_INTERVAL_MS = 60_000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of stateStore) {
    if (now - value.createdAt >= STATE_TTL_MS) stateStore.delete(key);
  }
  for (const [key, value] of codeStore) {
    if (now - value.createdAt >= CODE_TTL_MS) codeStore.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

if (cleanupTimer.unref) {
  cleanupTimer.unref();
}
