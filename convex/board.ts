import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const themeValidator = {
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
};

async function migrateLegacyBoardId(ctx: MutationCtx, newBoardId: string) {
  const legacyItems = await ctx.db
    .query("items")
    .withIndex("by_boardId", (q) => q.eq("boardId", "main"))
    .collect();

  for (const item of legacyItems) {
    await ctx.db.patch(item._id, { boardId: newBoardId });
  }

  const legacyCheckpoints = await ctx.db
    .query("checkpoints")
    .withIndex("by_boardId", (q) => q.eq("boardId", "main"))
    .collect();

  for (const checkpoint of legacyCheckpoints) {
    await ctx.db.patch(checkpoint._id, { boardId: newBoardId });
  }
}

export const listBoards = query({
  args: {},
  handler: async (ctx) => {
    const boards = await ctx.db.query("boards").collect();
    return boards.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const ensureDefaultBoard = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("boards").first();
    if (existing) return existing._id;

    const boardId = await ctx.db.insert("boards", {
      name: "Untitled",
      sortOrder: 0,
      updatedAt: Date.now(),
    });

    await migrateLegacyBoardId(ctx, boardId);
    return boardId;
  },
});

export const createBoard = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const boards = await ctx.db.query("boards").collect();
    const maxOrder = boards.reduce((max, board) => Math.max(max, board.sortOrder), -1);

    return await ctx.db.insert("boards", {
      name: args.name?.trim() || "Untitled",
      sortOrder: maxOrder + 1,
      updatedAt: Date.now(),
    });
  },
});

export const renameBoard = mutation({
  args: { id: v.id("boards"), name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Board name cannot be empty");
    await ctx.db.patch(args.id, { name, updatedAt: Date.now() });
  },
});

export const updateBoardTheme = mutation({
  args: {
    id: v.id("boards"),
    theme: v.object(themeValidator),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      theme: args.theme,
      updatedAt: Date.now(),
    });
  },
});

export const deleteBoard = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    const boards = await ctx.db.query("boards").collect();
    if (boards.length <= 1) {
      throw new Error("Cannot delete the last board");
    }

    const boardId = args.id;
    const items = await ctx.db
      .query("items")
      .withIndex("by_boardId", (q) => q.eq("boardId", boardId))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_boardId", (q) => q.eq("boardId", boardId))
      .collect();
    for (const checkpoint of checkpoints) {
      await ctx.db.delete(checkpoint._id);
    }

    await ctx.db.delete(args.id);
  },
});

export const getItems = query({
  args: { boardId: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("items")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .collect();
    return await Promise.all(items.map(async (item) => ({
      ...item,
      content: item.storageId ? (await ctx.storage.getUrl(item.storageId) ?? item.content) : item.content,
    })));
  },
});

export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

const portValidator = v.union(
  v.literal("n"),
  v.literal("e"),
  v.literal("s"),
  v.literal("w"),
);

export const saveItem = mutation({
  args: {
    id: v.optional(v.id("items")),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("rect"),
      v.literal("arrow"),
      v.literal("connector"),
      v.literal("frame"),
      v.literal("sticky"),
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
    fromId: v.optional(v.string()),
    toId: v.optional(v.string()),
    fromPort: v.optional(portValidator),
    toPort: v.optional(portValidator),
    waypoints: v.optional(v.array(v.number())),
    directed: v.optional(v.boolean()),
    groupId: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    rotation: v.optional(v.number()),
    flipX: v.optional(v.boolean()),
    flipY: v.optional(v.boolean()),
    crop: v.optional(v.object({ x: v.number(), y: v.number(), width: v.number(), height: v.number() })),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    if (id) {
      await ctx.db.patch(id, data);
      return id;
    } else {
      return await ctx.db.insert("items", data);
    }
  },
});

export const deleteItem = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const clearItemGroup = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { groupId: undefined });
  },
});

export const createCheckpoint = mutation({
  args: { boardId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("items")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .collect();

    const checkpointItems = items.map(
      ({
        type,
        x,
        y,
        width,
        height,
        content,
        color,
        fontFamily,
        fontSize,
        zIndex,
        fromId,
        toId,
        fromPort,
        toPort,
        waypoints,
        directed,
        groupId,
        _id,
        storageId,
        rotation,
        flipX,
        flipY,
        crop,
      }) => ({
        type,
        x,
        y,
        width,
        height,
        content,
        color,
        fontFamily,
        fontSize,
        zIndex,
        fromId,
        toId,
        fromPort,
        toPort,
        waypoints,
        directed,
        groupId,
        sourceId: _id,
        storageId,
        rotation,
        flipX,
        flipY,
        crop,
      }),
    );

    return await ctx.db.insert("checkpoints", {
      boardId: args.boardId,
      name: args.name,
      items: checkpointItems,
    });
  },
});

export const getCheckpoints = query({
  args: { boardId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .order("desc")
      .collect();
  },
});

export const restoreCheckpoint = mutation({
  args: { checkpointId: v.id("checkpoints") },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db.get(args.checkpointId);
    if (!checkpoint) throw new Error("Checkpoint not found");

    const currentItems = await ctx.db
      .query("items")
      .withIndex("by_boardId", (q) => q.eq("boardId", checkpoint.boardId))
      .collect();

    for (const item of currentItems) {
      await ctx.db.delete(item._id);
    }

    const idMap = new Map<string, string>();
    const nodes = checkpoint.items.filter((item) => item.type !== "connector");
    const connectors = checkpoint.items.filter((item) => item.type === "connector");

    // Recreate nodes first, then remap group and connector topology to their new ids.
    for (const item of nodes) {
      const sourceId = item.sourceId;
      const data = { ...item };
      delete data.sourceId;
      delete data.groupId;
      const newId = await ctx.db.insert("items", {
        ...data,
        boardId: checkpoint.boardId,
      });
      if (sourceId) idMap.set(sourceId, newId);
    }
    for (const item of nodes) {
      if (!item.sourceId || !item.groupId) continue;
      const newId = idMap.get(item.sourceId);
      const newGroupId = idMap.get(item.groupId);
      if (newId && newGroupId) await ctx.db.patch(newId as Id<"items">, { groupId: newGroupId });
    }
    for (const item of connectors) {
      const fromId = item.fromId;
      const toId = item.toId;
      const data = { ...item };
      delete data.sourceId;
      delete data.fromId;
      delete data.toId;
      delete data.groupId;
      const mappedFrom = fromId ? idMap.get(fromId) : undefined;
      const mappedTo = toId ? idMap.get(toId) : undefined;
      if (!mappedFrom || !mappedTo) continue;
      await ctx.db.insert("items", {
        ...data,
        boardId: checkpoint.boardId,
        fromId: mappedFrom,
        toId: mappedTo,
      });
    }
  },
});
