import { Redis } from 'ioredis';
import GhostSessionModel from '../models/GhostSession';

// Initialize Redis client. If it fails, we fall back to MongoDB.
let redis: Redis | null = null;
try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying and fallback to mongo
      return Math.min(times * 50, 2000);
    }
  });

  redis.on('error', (err) => {
    console.warn('⚠️ Redis error in GhostSessionService. Using MongoDB fallback.', err.message);
    redis = null;
  });
} catch (error) {
  console.warn('⚠️ Failed to initialize Redis for Ghost Sessions. Using MongoDB fallback.');
}

const SESSION_TTL_SECONDS = 15 * 60; // 15 minutes max

export const createGhostSession = async (
  adminId: string, 
  targetUserId: string, 
  reason: string, 
  ip?: string
) => {
  const sessionId = `ghost_${adminId}_${targetUserId}_${Date.now()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  
  const sessionData = {
    id: sessionId,
    adminId,
    targetUserId,
    reason,
    startedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ip: ip || '',
    lastActivity: now.toISOString()
  };

  if (redis) {
    try {
      await redis.hset(`session:${sessionId}`, sessionData);
      await redis.expire(`session:${sessionId}`, SESSION_TTL_SECONDS);
    } catch (err) {
      console.warn('Redis save failed. Falling back to Mongo.');
    }
  }

  // Always save to MongoDB for persistence / fallback / audit
  await GhostSessionModel.create({
    sessionId,
    adminId,
    targetUserId,
    reason,
    startedAt: now,
    expiresAt,
    ip
  });

  return sessionId;
};

export const getGhostSession = async (sessionId: string) => {
  if (redis) {
    try {
      const data = await redis.hgetall(`session:${sessionId}`);
      if (Object.keys(data).length > 0) return data;
    } catch (err) {
      console.warn('Redis get failed. Falling back to Mongo.');
    }
  }

  const session = await GhostSessionModel.findOne({ sessionId }).lean() as any;
  if (session && session.expiresAt > new Date()) {
    return {
      id: session.sessionId,
      adminId: session.adminId,
      targetUserId: session.targetUserId,
      reason: session.reason,
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      ip: session.ip,
      lastActivity: session.lastActivity?.toISOString()
    };
  }

  return null;
};

export const destroyGhostSession = async (sessionId: string) => {
  if (redis) {
    try {
      await redis.del(`session:${sessionId}`);
    } catch (err) {
      console.warn('Redis delete failed.');
    }
  }
  await GhostSessionModel.findOneAndDelete({ sessionId });
};

export const extendGhostSession = async (sessionId: string, additionalMinutes: number = 15) => {
  const currentSession = await getGhostSession(sessionId);
  if (!currentSession) return false;

  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + additionalMinutes * 60 * 1000);
  
  // Hard cap to 30 mins from start
  const startedAt = new Date(currentSession.startedAt);
  const maxExpiresAt = new Date(startedAt.getTime() + 30 * 60 * 1000);
  
  const finalExpiresAt = newExpiresAt > maxExpiresAt ? maxExpiresAt : newExpiresAt;
  const ttlSeconds = Math.max(0, Math.floor((finalExpiresAt.getTime() - now.getTime()) / 1000));

  if (ttlSeconds === 0) return false;

  if (redis) {
    await redis.hset(`session:${sessionId}`, { expiresAt: finalExpiresAt.toISOString() });
    await redis.expire(`session:${sessionId}`, ttlSeconds);
  }

  await GhostSessionModel.findOneAndUpdate({ sessionId }, { expiresAt: finalExpiresAt });
  return true;
};
