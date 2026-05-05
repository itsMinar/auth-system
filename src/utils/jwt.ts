import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env";
import { AccessTokenPayload, RefreshTokenPayload, TokenPair } from "../types";
import { AppError } from "./errors";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDurationToSeconds(duration: string): number {
  const units: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // default 15m
  return parseInt(match[1]) * (units[match[2]] ?? 60);
}

// ── Access Token ──────────────────────────────────────────────────────────────

export function signAccessToken(
  userId: string,
  email: string
): { token: string; expiresIn: number } {
  const expiresIn = parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN);

  const payload: AccessTokenPayload = {
    sub: userId,
    email,
    type: "access",
  };

  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn,
    algorithm: "HS256",
  });

  return { token, expiresIn };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    }) as AccessTokenPayload;

    if (payload.type !== "access") {
      throw AppError.invalidToken("Wrong token type");
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError("TOKEN_EXPIRED", "Access token has expired", 401);
    }
    throw AppError.invalidToken();
  }
}

// ── Refresh Token ─────────────────────────────────────────────────────────────

export function signRefreshToken(
  userId: string,
  family: string
): { token: string; jti: string; expiresAt: Date } {
  const jti = uuidv4();
  const expiresIn = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const payload: RefreshTokenPayload = {
    sub: userId,
    jti,
    family,
    type: "refresh",
  };

  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn,
    algorithm: "HS256",
  });

  return { token, jti, expiresAt };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
    }) as RefreshTokenPayload;

    if (payload.type !== "refresh") {
      throw AppError.invalidToken("Wrong token type");
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError("TOKEN_EXPIRED", "Refresh token has expired", 401);
    }
    throw AppError.invalidToken("Invalid refresh token");
  }
}

// ── Build Token Pair ──────────────────────────────────────────────────────────

export function buildTokenPair(
  userId: string,
  email: string,
  family?: string
): { tokenPair: TokenPair; jti: string; expiresAt: Date; family: string } {
  const tokenFamily = family ?? uuidv4();
  const { token: accessToken, expiresIn } = signAccessToken(userId, email);
  const {
    token: refreshToken,
    jti,
    expiresAt,
  } = signRefreshToken(userId, tokenFamily);

  return {
    tokenPair: { accessToken, refreshToken, expiresIn },
    jti,
    expiresAt,
    family: tokenFamily,
  };
}
