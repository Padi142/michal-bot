import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const debtors = sqliteTable("debtors", {
    id: int().primaryKey({ autoIncrement: true }),
    debtor_name: text().notNull(),
    amount_owed: int().notNull(),
    payed: int({ mode: 'boolean' }).notNull().default(false),
    currency: text().notNull().default('CZK'),
    reason: text().default(''),
    created: text().default(sql`(CURRENT_DATE)`),
});

export const videoIdeas = sqliteTable("video_ideas", {
    id: int().primaryKey({ autoIncrement: true }),
    idea: text().notNull(),
    filmed: int({ mode: 'boolean' }).notNull().default(false),
    created: text().default(sql`(CURRENT_DATE)`),
});

export const todos = sqliteTable("todos", {
    id: int().primaryKey({ autoIncrement: true }),
    task: text().notNull(),
    category: text().default('general'),
    completed: int({ mode: 'boolean' }).notNull().default(false),
    created: text().default(sql`(CURRENT_DATE)`),
});

export const friends = sqliteTable("friends", {
    id: int().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    chatId: int().notNull(),
    handle: text().notNull(),
    approved: int({ mode: 'boolean' }).notNull().default(false),
    added: text().default(sql`(CURRENT_DATE)`),
});

export const whatFriendsWantFromMe = sqliteTable("what_friends_want_from_me", {
    id: int().primaryKey({ autoIncrement: true }),
    friendId: int().notNull(),
    request: text().notNull(),
    fulfilled: int({ mode: 'boolean' }).notNull().default(false),
    created: text().default(sql`(CURRENT_DATE)`),
});