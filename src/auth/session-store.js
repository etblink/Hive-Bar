'use strict';

const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const { AuthenticationError } = require('../lib/errors');

const SESSION_COOKIE_NAME = 'hive_bar_session';

function randomToken(byteLength = 32) {
  return randomBytes(byteLength).toString('base64url');
}

function signToken(value, secret) {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(headerValue = '') {
  const cookies = {};
  for (const part of String(headerValue).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name && !Object.hasOwn(cookies, name)) cookies[name] = value;
  }
  return cookies;
}

class ChallengeStore {
  constructor({ ttlMs, origin, now = Date.now, random = randomToken }) {
    this.ttlMs = ttlMs;
    this.origin = origin;
    this.now = now;
    this.random = random;
    this.challenges = new Map();
  }

  issue(account) {
    this.prune();
    const id = this.random(24);
    const nonce = this.random(32);
    const issuedAtMs = this.now();
    const expiresAtMs = issuedAtMs + this.ttlMs;
    const issuedAt = new Date(issuedAtMs).toISOString();
    const expiresAt = new Date(expiresAtMs).toISOString();
    const message = [
      'Hive-Bar verified sign-in',
      `Account: @${account}`,
      `Origin: ${this.origin}`,
      `Nonce: ${nonce}`,
      `Issued: ${issuedAt}`,
      `Expires: ${expiresAt}`,
      'Purpose: Create a server-verified session only; no Hive transaction is authorized.',
    ].join(' | ');
    const challenge = { id, account, message, issuedAt, expiresAt, expiresAtMs };
    this.challenges.set(id, challenge);
    return { id, account, message, issuedAt, expiresAt };
  }

  consume(id, account) {
    const challengeId = String(id || '');
    const challenge = this.challenges.get(challengeId);
    this.challenges.delete(challengeId);

    if (!challenge) {
      throw new AuthenticationError('The sign-in challenge is invalid or has already been used', {
        code: 'AUTH_CHALLENGE_INVALID',
      });
    }
    if (challenge.expiresAtMs <= this.now()) {
      throw new AuthenticationError('The sign-in challenge has expired', {
        code: 'AUTH_CHALLENGE_EXPIRED',
      });
    }
    if (challenge.account !== account) {
      throw new AuthenticationError('The signed account does not match the sign-in challenge', {
        code: 'AUTH_ACCOUNT_MISMATCH',
      });
    }

    return challenge;
  }

  prune() {
    const now = this.now();
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAtMs <= now) this.challenges.delete(id);
    }
  }
}

class SessionStore {
  constructor({ secret, ttlMs, now = Date.now, random = randomToken }) {
    this.secret = secret;
    this.ttlMs = ttlMs;
    this.now = now;
    this.random = random;
    this.sessions = new Map();
  }

  create(account) {
    this.prune();
    const id = this.random(32);
    const issuedAtMs = this.now();
    const session = Object.freeze({
      id,
      account,
      csrfToken: this.random(32),
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(issuedAtMs + this.ttlMs).toISOString(),
      expiresAtMs: issuedAtMs + this.ttlMs,
    });
    this.sessions.set(id, session);
    return { session, token: `${id}.${signToken(id, this.secret)}` };
  }

  get(token) {
    const [id, signature, extra] = String(token || '').split('.');
    if (!id || !signature || extra || !safeEqual(signature, signToken(id, this.secret))) return null;

    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAtMs <= this.now()) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }

  destroy(token) {
    const [id] = String(token || '').split('.');
    if (id) this.sessions.delete(id);
  }

  prune() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAtMs <= now) this.sessions.delete(id);
    }
  }
}

function sessionCookie(token, config) {
  const maxAge = Math.max(0, Math.floor(config.auth.sessionTtlMs / 1000));
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    ...(config.isProduction ? ['Secure'] : []),
  ].join('; ');
}

function clearSessionCookie(config) {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(config.isProduction ? ['Secure'] : []),
  ].join('; ');
}

module.exports = {
  ChallengeStore,
  SESSION_COOKIE_NAME,
  SessionStore,
  clearSessionCookie,
  parseCookies,
  sessionCookie,
};