import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  role: text("role").notNull().default("editor"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const resultAudit = sqliteTable("result_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  category: text("category").notNull(),
  result: text("result").notNull().default(""),
  set1: text("set_1").notNull().default(""),
  set2: text("set_2").notNull().default(""),
  set3: text("set_3").notNull().default(""),
  userId: integer("user_id").notNull().references(() => users.id),
  submissionId: integer("submission_id"),
  createdAt: text("created_at").notNull(),
});

export const qrAccessTokens = sqliteTable("qr_access_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  kind: text("kind").notNull(),
  reference: text("reference").notNull(),
  label: text("label").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  expiresAt: text("expires_at"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
});

export const scoreUploads = sqliteTable("score_uploads", {
  photoKey: text("photo_key").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  photoMime: text("photo_mime").notNull(),
  photoSize: integer("photo_size").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
});

export const scoreSubmissions = sqliteTable("score_submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicCode: text("public_code").notNull().unique(),
  gameId: text("game_id").notNull(),
  categoryCode: text("category_code").notNull(),
  scorekeeperName: text("scorekeeper_name").notNull(),
  refereeName: text("referee_name").notNull().default(""),
  courtManagerName: text("court_manager_name").notNull().default(""),
  result: text("result").notNull().default(""),
  set1: text("set_1").notNull().default(""),
  set2: text("set_2").notNull().default(""),
  set3: text("set_3").notNull().default(""),
  photoKey: text("photo_key").notNull(),
  photoMime: text("photo_mime").notNull(),
  photoSize: integer("photo_size").notNull(),
  status: text("status").notNull().default("pending"),
  submittedAt: text("submitted_at").notNull(),
  reviewedAt: text("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewNote: text("review_note").notNull().default(""),
});

export const rankingResolutions = sqliteTable("ranking_resolutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryCode: text("category_code").notNull(),
  groupCode: text("group_code").notNull(),
  teamA: text("team_a").notNull(),
  teamB: text("team_b").notNull(),
  resolutionType: text("resolution_type").notNull(),
  preferredTeamCode: text("preferred_team_code").notNull().default(""),
  playoffGameId: text("playoff_game_id").notNull().default(""),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => ({ pair: uniqueIndex("ranking_resolutions_pair_unique").on(table.categoryCode, table.groupCode, table.teamA, table.teamB) }));
