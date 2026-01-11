import { tool } from "ai";
import z from "zod";
import { db } from "./db/client";
import { debtors } from "./db/schema";
import { eq } from "drizzle-orm";
import { extractSchemaInfo, mapStringToTableName } from "./db/utils";

import * as schema from "./db/schema";
import Sandbox from "@e2b/code-interpreter";

const db_crud = tool({
    description: "Allows basic CRUD operations on the database. Check the schema for table structures before using this tool.",
    inputSchema: z.object({
        operation: z.enum(["create", "read", "update", "delete"]).describe("The CRUD operation to perform. Query selects and returns all records."),
        table: z.enum(["debtors", "video_ideas"]).describe("The table to perform the operation on."),
        data: z.record(z.string(), z.any()).optional().describe("The data for the operation. Required for create and update operations. Must follow the table schema."),
    }),
    execute: async ({ operation, table, data }) => {

        try {

            console.log(`Running db_crud tool with input:`, { operation, table, data });

            switch (operation) {
                case "create":
                    if (!data) throw new Error("Data is required for create operation");

                    const insertResult = await db.insert(mapStringToTableName(table)).values(data).returning();
                    return insertResult;

                case "read":
                    const records = await db.select().from(mapStringToTableName(table));
                    return records;

                case "update":
                    if (!data || !data.id) throw new Error("Data with 'id' is required for update operation");

                    const id = data.id;
                    delete data.id;

                    const updateResult = await db.update(mapStringToTableName(table))
                        .set(data)
                        .where(eq(mapStringToTableName(table).id, id))
                        .returning();
                    return updateResult;

                case "delete":
                    if (!data || !data.id) throw new Error("Data with 'id' is required for delete operation");

                    const deleteResult = await db.delete(mapStringToTableName(table))
                        .where(eq(mapStringToTableName(table).id, data.id))
                        .returning();
                    return deleteResult;

                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }

        } catch (error) {
            console.error("Error in db_crud tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});



const getDbSchema = tool({
    description: "Get the database schema",
    inputSchema: z.object({}),
    execute: async ({ }) => {
        console.log('Running getDbSchema tool')
        try {
            return {
                debtors: extractSchemaInfo(schema.debtors),
                videoIdeas: extractSchemaInfo(schema.videoIdeas),
            };
        } catch (error) {
            console.error("Error in getDbSchema tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

const runCode = tool({
    description: "Run runs the code you provide. Can be anything from bash or Python.",
    inputSchema: z.object({
        code: z.string().describe("The code to be executed."),
        language: z.enum(["python", "bash"]).default("python").describe("The programming language of the code. Defaults to python."),
    }),
    execute: async ({ code, language }) => {
        try {
            console.log("Executing code:", code);
            const sandbox = await Sandbox.create()
            const { text, results, logs, error } = await sandbox.runCode(code, { language });
            sandbox.kill()

            console.log("Code execution results:", { text, results, logs, error });

            if (error) {
                return { error: String(error) };
            }

            return results;
        } catch (error) {
            console.error("Error in runCode tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

export const allTools = {
    db_crud,
    getDbSchema,
    runCode,
};