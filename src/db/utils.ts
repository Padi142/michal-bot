import { debtors, todos, videoIdeas } from "./schema";

export function mapStringToTableName(table: string) {
    switch (table) {
        case "debtors":
            return debtors;
        case "video_ideas":
            return videoIdeas;
        case "todos":
            return todos;
        default:
            throw new Error(`Unknown table name: ${table}`);
    }
}

export function extractSchemaInfo(table: any): { tableName: string; columns: Record<string, { type: string; notNull: boolean; primaryKey: boolean; autoIncrement: boolean; default: any }> } {
    const tableName = table[Symbol.for("drizzle:Name")];
    const columns: Record<string, { type: string; notNull: boolean; primaryKey: boolean; autoIncrement: boolean; default: any }> = {};

    for (const [colName, col] of Object.entries(table)) {
        if (colName.startsWith("Symbol(")) continue;
        if (typeof col !== "object" || col === null) continue;

        columns[colName] = {
            type: (col as any).columnType || "unknown",
            notNull: (col as any).notNull ?? false,
            primaryKey: (col as any).primary ?? false,
            autoIncrement: (col as any).autoIncrement ?? false,
            default: (col as any).default !== undefined ? String((col as any).default) : undefined,
        };
    }

    return { tableName, columns };
}