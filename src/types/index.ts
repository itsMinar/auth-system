import { Request } from "express";
import { User } from "../db/schema";

// ── Authenticated Request ─────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user: Pick<User, "id" | "email" | "name" | "emailVerified">;
}

// ── JWT Payloads ──────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;      // userId
  email: string;
  type: "access";
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;      // userId
  jti: string;      // token id (uuid)
  family: string;   // rotation family
  type: "refresh";
  iat?: number;
  exp?: number;
}

// ── Auth Responses ────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token TTL in seconds
}

export interface AuthResponse {
  user: PublicUser;
  tokens: TokenPair;
}

// ── Public User (safe to expose) ──────────────────────────────────────────────

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export type OAuthProvider = "google" | "github";

export interface OAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// ── API Response Envelope ─────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
