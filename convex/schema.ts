import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const themeValidator = v.object({
  id: v.string(),
  name: v.string(),
  backgroundColor: v.string(),
  textColor: v.string(),
  accentColor: v.string(),
  mutedColor: v.string(),
  surfaceColor: v.string(),
  fontFamily: v.string(),
  isDark: v.optional(v.boolean()),
  category: v.optional(
    v.union(v.literal("light"), v.literal("dark"), v.literal("editorial")),
  ),
});

export default defineSchema({
  boards: defineTable({
    name: v.string(),
    theme: v.optional(themeValidator),
    sortOrder: v.number(),
    updatedAt: v.number(),
  }).index("by_sortOrder", ["sortOrder"]),

  items: defineTable({
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("rect"),
      v.literal("arrow"),
    ),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    content: v.string(),
    color: v.optional(v.string()),
    fontFamily: v.optional(v.string()),
    fontSize: v.optional(v.number()),
    zIndex: v.optional(v.number()),
    boardId: v.string(),
  }).index("by_boardId", ["boardId"]),

  checkpoints: defineTable({
    boardId: v.string(),
    name: v.string(),
    items: v.array(
      v.object({
        type: v.union(
          v.literal("text"),
          v.literal("image"),
          v.literal("rect"),
          v.literal("arrow"),
        ),
        x: v.number(),
        y: v.number(),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        content: v.string(),
        color: v.optional(v.string()),
        fontFamily: v.optional(v.string()),
        fontSize: v.optional(v.number()),
        zIndex: v.optional(v.number()),
      }),
    ),
  }).index("by_boardId", ["boardId"]),
});
