import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
const grade = v.union(v.literal("ט"), v.literal("י"), v.literal("יא"), v.literal("יב"));
const status = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"),
  v.literal("awaiting_signature"), v.literal("completed"), v.literal("cancelled"));
export default defineSchema({
  users: defineTable({ username: v.string(), passwordHash: v.string(), salt: v.string(),
    displayName: v.string(), active: v.boolean(), createdAt: v.number() }).index("by_username", ["username"]),
  sessions: defineTable({ tokenHash: v.string(), role: v.union(v.literal("commander"), v.literal("cadet")),
    userId: v.optional(v.id("users")), cadetId: v.optional(v.id("cadets")),
    expiresAt: v.number(), revoked: v.boolean(), createdAt: v.number() })
    .index("by_tokenHash", ["tokenHash"]).index("by_user", ["userId"]).index("by_cadet", ["cadetId"]),
  loginAttempts: defineTable({ key: v.string(), count: v.number(), windowStart: v.number(),
    lockedUntil: v.number() }).index("by_key", ["key"]),
  cadets: defineTable({ firstName: v.string(), lastName: v.string(), idNumber: v.optional(v.string()), username: v.optional(v.string()), usernameSentAt: v.optional(v.number()), grade,
    shirtSize: v.optional(v.string()), pantsSize: v.optional(v.string()), shoeSize: v.optional(v.string()),
    jacketSize: v.optional(v.string()), active: v.boolean(), accessCodeHash: v.optional(v.string()),
    accessCodeExpires: v.optional(v.number()), initialSignedAt: v.optional(v.number()),
    commanderNote: v.optional(v.string()), email: v.optional(v.string()), createdAt: v.number() })
    .index("by_email", ["email"]).index("by_username", ["username"]).index("by_grade", ["grade"]),
  otps: defineTable({ cadetId: v.id("cadets"), codeHash: v.string(), expiresAt: v.number(), attempts: v.number(), used: v.boolean(), createdAt: v.number() }).index("by_cadet", ["cadetId"]),
  cadetEquipment: defineTable({ cadetId: v.id("cadets"), itemType: v.string(), size: v.string(), quantity: v.number() })
    .index("by_cadet", ["cadetId"]),
  inventory: defineTable({ itemType: v.string(), size: v.string(), quantity: v.number(), minThreshold: v.number() })
    .index("by_item_size", ["itemType", "size"]),
  inventoryTransactions: defineTable({ itemType: v.string(), size: v.string(), delta: v.number(),
    balanceAfter: v.number(), reason: v.string(), actor: v.string(), requestId: v.optional(v.id("requests")),
    createdAt: v.number() }).index("by_createdAt", ["createdAt"]),
  requests: defineTable({ cadetId: v.id("cadets"), kind: v.union(v.literal("replace"), v.literal("receive")),
    status, idempotencyKey: v.string(), commanderNote: v.optional(v.string()), decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()), completedAt: v.optional(v.number()), createdAt: v.number() })
    .index("by_cadet", ["cadetId"]).index("by_status", ["status"]).index("by_cadet_key", ["cadetId", "idempotencyKey"]),
  requestItems: defineTable({ requestId: v.id("requests"), itemType: v.string(), size: v.string(),
    quantity: v.number(), reason: v.string(), approvedSize: v.optional(v.string()),
    approvedQty: v.optional(v.number()) }).index("by_request", ["requestId"]),
  signatures: defineTable({ cadetId: v.id("cadets"), kind: v.union(v.literal("initial"), v.literal("request")),
    requestId: v.optional(v.id("requests")), image: v.string(), signedAt: v.number() })
    .index("by_cadet", ["cadetId"]).index("by_request", ["requestId"]),
  activityLogs: defineTable({ actor: v.string(), action: v.string(), details: v.string(), createdAt: v.number() })
    .index("by_createdAt", ["createdAt"]),
  notifications: defineTable({ cadetId: v.optional(v.id("cadets")), forCommanders: v.boolean(), title: v.string(),
    body: v.string(), read: v.boolean(), createdAt: v.number() }).index("by_cadet", ["cadetId"]),
  systemSettings: defineTable({ key: v.string(), value: v.any() }).index("by_key", ["key"]),
});
