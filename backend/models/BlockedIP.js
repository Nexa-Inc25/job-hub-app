/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * BlockedIP Model
 * 
 * Persists IP blocks to MongoDB for durability across restarts
 * and consistency across multiple server instances.
 */

const mongoose = require('mongoose');

const blockedIPSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  reason: {
    type: String,
    required: true
  },
  
  // Null = permanent block
  expiresAt: {
    type: Date,
    default: null
  },
  
  permanent: {
    type: Boolean,
    default: false
  },
  
  // Who blocked this IP (null for auto-blocks)
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // How many times this IP has been blocked
  blockCount: {
    type: Number,
    default: 1
  },
  
  // Last failed attempt details
  lastAttemptDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// TTL index for automatic cleanup of expired blocks
// MongoDB will automatically remove documents where expiresAt < now
blockedIPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static: Check if IP is blocked
blockedIPSchema.statics.isBlocked = async function(ip) {
  const block = await this.findOne({ ip });
  if (!block) return false;
  
  // Permanent blocks
  if (block.permanent) return true;
  
  // Check expiration (MongoDB TTL may have slight delay)
  if (block.expiresAt && new Date() >= block.expiresAt) {
    await this.deleteOne({ ip });
    return false;
  }
  
  return true;
};

// Static: Block an IP
blockedIPSchema.statics.blockIP = async function(ip, options = {}) {
  const {
    reason = 'Automatic block',
    durationMs = 60 * 60 * 1000, // 1 hour default
    permanent = false,
    blockedBy = null,
    escalate = true
  } = options;
  
  const existing = await this.findOne({ ip });
  
  let finalDuration = durationMs;
  let blockCount = 1;
  
  if (existing && escalate && !permanent) {
    // Escalate block duration for repeat offenders
    blockCount = (existing.blockCount || 1) + 1;
    finalDuration = Math.min(
      durationMs * Math.pow(2, blockCount - 1), // Double each time
      24 * 60 * 60 * 1000 // Max 24 hours
    );
  }
  
  const expiresAt = permanent ? null : new Date(Date.now() + finalDuration);
  
  const block = await this.findOneAndUpdate(
    { ip },
    {
      $set: {
        ip,
        reason,
        expiresAt,
        permanent,
        blockedBy,
        blockCount
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true, new: true }
  );
  
  console.error(`[IP BLOCKED] ${ip} - ${reason} - Duration: ${permanent ? 'PERMANENT' : `${Math.ceil(finalDuration / 60000)} minutes`} - Block #${blockCount}`);
  
  return block;
};

// Static: Unblock an IP
blockedIPSchema.statics.unblockIP = async function(ip) {
  const result = await this.deleteOne({ ip });
  if (result.deletedCount > 0) {
    console.log(`[IP UNBLOCKED] ${ip}`);
  }
  return result.deletedCount > 0;
};

// Static: Get all blocked IPs
blockedIPSchema.statics.getBlocked = async function() {
  const now = new Date();
  return this.find({
    $or: [
      { permanent: true },
      { expiresAt: { $gt: now } }
    ]
  }).sort({ createdAt: -1 });
};

// Static: Get block details for an IP
blockedIPSchema.statics.getBlockInfo = async function(ip) {
  const block = await this.findOne({ ip });
  if (!block) return null;
  
  // Check if expired
  if (!block.permanent && block.expiresAt && new Date() >= block.expiresAt) {
    await this.deleteOne({ ip });
    return null;
  }
  
  const remainingMs = block.permanent ? Infinity : block.expiresAt - new Date();
  
  return {
    ip: block.ip,
    reason: block.reason,
    permanent: block.permanent,
    expiresAt: block.expiresAt,
    remainingMinutes: block.permanent ? null : Math.ceil(remainingMs / 60000),
    blockCount: block.blockCount,
    createdAt: block.createdAt
  };
};

module.exports = mongoose.model('BlockedIP', blockedIPSchema);

