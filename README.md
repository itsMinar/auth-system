# Auth System

A production-ready, zero-dependency authentication system built with **TypeScript**, **Express**, **Drizzle ORM**, and **PostgreSQL**.

## Features

- **Email/Password** authentication with bcrypt (12 rounds)
- **JWT Access + Refresh Tokens** with automatic rotation and reuse detection
- **OAuth 2.0** — Google & GitHub (no Passport.js, raw fetch)
- **Email Verification** with secure token hashing
- **Password Reset** flow with 1-hour expiring tokens
- **Session Management** — view and revoke individual sessions
- **Rate Limiting** — strict limits on auth endpoints, per IP+email
- **Zod Validation** on all request bodies
- **Structured error responses** with error codes
- **Graceful shutdown** with connection draining

---

## Project Structure

```
src/
├── config/
│   └── env.ts                  # Zod-validated env config
├── db/
│   ├── index.ts                # Drizzle client + pool
│   └── schema.ts               # All table definitions + relations
├── middleware/
│   ├── authenticate.ts         # JWT bearer auth guard
│   ├── errorHandler.ts         # Global error + 404 handlers
│   ├── rateLimiter.ts          # Express rate limit configs
│   └── validate.ts             # Zod request validation
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts  # Route handlers
│   │   ├── auth.router.ts      # Express router
│   │   ├── auth.schemas.ts     # Zod schemas
│   │   ├── auth.service.ts     # All business logic
│   │   └── oauth.providers.ts  # Google + GitHub OAuth
│   └── users/
│       └── users.router.ts     # Profile management
├── types/
│   └── index.ts                # Shared TypeScript types
├── utils/
│   ├── crypto.ts               # Secure token generation + hashing
│   ├── email.ts                # Nodemailer email service
│   ├── errors.ts               # AppError class + error codes
│   ├── jwt.ts                  # Sign/verify access + refresh tokens
│   ├── password.ts             # bcrypt + strength validation
│   └── response.ts             # API response helpers
├── app.ts                      # Express app factory
└── index.ts                    # Entry point + graceful shutdown
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values. At minimum you need:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/auth_db
APP_URL=http://localhost:3000
CLIENT_URL=http://localhost:5173
JWT_ACCESS_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_REFRESH_SECRET=<generate separately>
```

### 3. Run database migrations

```bash
npm run db:generate   # Generate migration files from schema
npm run db:migrate    # Apply migrations to DB
```

### 4. Start the server

```bash
npm run dev     # Development (tsx watch)
npm run build   # Compile TypeScript
npm start       # Run compiled output
```

---

## API Reference

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | — | Register with email + password |
| `POST` | `/api/auth/login` | — | Login, returns token pair |
| `POST` | `/api/auth/refresh` | — | Rotate refresh token |
| `POST` | `/api/auth/logout` | — | Revoke refresh token |
| `POST` | `/api/auth/logout-all` | ✓ | Revoke all sessions |
| `GET` | `/api/auth/verify-email?token=` | — | Verify email address |
| `POST` | `/api/auth/resend-verification` | ✓ | Resend verification email |
| `POST` | `/api/auth/forgot-password` | — | Send password reset email |
| `POST` | `/api/auth/reset-password` | — | Reset password with token |
| `PUT` | `/api/auth/change-password` | ✓ | Change password (authenticated) |
| `GET` | `/api/auth/sessions` | ✓ | List active sessions |
| `DELETE` | `/api/auth/sessions/:id` | ✓ | Revoke a specific session |
| `GET` | `/api/auth/oauth/google` | — | Start Google OAuth flow |
| `GET` | `/api/auth/oauth/google/callback` | — | Google OAuth callback |
| `GET` | `/api/auth/oauth/github` | — | Start GitHub OAuth flow |
| `GET` | `/api/auth/oauth/github/callback` | — | GitHub OAuth callback |

### User Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users/me` | ✓ | Get current user profile |
| `PATCH` | `/api/users/me` | ✓ | Update name / avatarUrl |
| `DELETE` | `/api/users/me` | ✓ | Soft-delete account |

### Request/Response Format

**Register:**
```json
POST /api/auth/register
{ "email": "user@example.com", "password": "Str0ng!Pass", "name": "Alice" }

201 → { "success": true, "data": { "user": {...}, "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 } } }
```

**Login:**
```json
POST /api/auth/login
{ "email": "user@example.com", "password": "Str0ng!Pass" }

200 → { "success": true, "data": { "user": {...}, "tokens": {...} } }
```

**Refresh:**
```json
POST /api/auth/refresh
{ "refreshToken": "<refresh_token>" }

200 → { "success": true, "data": { "tokens": {...} } }
```

**Authenticated requests:**
```
Authorization: Bearer <accessToken>
```

**Error format:**
```json
{ "success": false, "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" } }
```

---

## Security Design

### Token Security
- **Access tokens** — short-lived (15m), signed HS256, verified on every request
- **Refresh tokens** — stored as SHA-256 hash in DB (never the raw token)
- **Token rotation** — each refresh issues a new pair; old token is revoked
- **Reuse detection** — if a revoked refresh token is used, the entire token family is revoked (detects theft)

### Password Security
- bcrypt with cost factor 12
- Strength validation: 8+ chars, uppercase, lowercase, number, special char
- Timing-safe comparison (dummy hash checked even for missing users)

### OAuth Security
- CSRF state parameter validated on every callback
- State stored server-side with 10-minute TTL
- OAuth emails marked as pre-verified
- Existing accounts linked by email (no duplicate users)

### API Security
- Helmet for security headers
- Rate limiting: 10 req/15min on auth endpoints (per IP+email)
- 10KB body size limit
- Zod validation on all inputs

---

## OAuth Setup

### Google
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add `http://localhost:3000/api/auth/oauth/google/callback` as authorized redirect URI
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` in `.env`

### GitHub
1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Create a new OAuth app
3. Set callback URL to `http://localhost:3000/api/auth/oauth/github/callback`
4. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL` in `.env`

---

## Email Setup

The system uses Nodemailer. In development with no SMTP config, emails are logged to the console.

For production, configure SMTP in `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password   # Use Gmail App Password, not your account password
SMTP_FROM="My App <no-reply@myapp.com>"
```

---

## Database Schema

```
users
  id, email, name, avatar_url, password_hash,
  email_verified, is_active, created_at, updated_at, last_login_at

oauth_accounts
  id, user_id → users, provider, provider_account_id,
  access_token, refresh_token, expires_at

refresh_tokens
  id (= jti), user_id → users, token_hash, family,
  user_agent, ip_address, is_revoked, expires_at

verification_tokens
  id, user_id → users, token_hash, type (email_verification|password_reset),
  expires_at, used_at
```

---

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong, unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (64+ bytes)
- [ ] Enable SSL on your PostgreSQL connection
- [ ] Configure SMTP for real emails
- [ ] Set up a reverse proxy (nginx/caddy) with HTTPS
- [ ] Replace in-memory OAuth state store with Redis
- [ ] Add structured logging (pino/winston)
- [ ] Set up a cron job to clean expired tokens from DB
- [ ] Configure `CLIENT_URL` to your frontend domain for CORS
