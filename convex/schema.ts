import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  items: defineTable({
    type: v.string(), // 'text' | 'image'
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    content: v.string(), // text or base64/url
    color: v.optional(v.string()),
    fontFamily: v.optional(v.string()),
    boardId: v.string(), // for multi-board support later, default 'main' for now
  }).index("by_boardId", ["boardId"]),
});
