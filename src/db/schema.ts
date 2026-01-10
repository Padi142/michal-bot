import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const debtors = sqliteTable("debtors", {
    id: int().primaryKey({ autoIncrement: true }),
    debtor_name: text().notNull(),
    amount_owed: int().notNull(),
    date: text().default(sql`(CURRENT_DATE)`),
});
