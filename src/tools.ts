import { tool } from "ai";
import z from "zod";
import { db } from "./db/client";
import { debtors } from "./db/schema";
import { eq } from "drizzle-orm";
import { extractSchemaInfo, getUserFriendRecord, mapStringToTableName } from "./db/utils";

import * as schema from "./db/schema";
import Sandbox from "@e2b/code-interpreter";
import { sendTelegramImageToOwner, sendTelegramMarkdownToOwner, sendTelegramMessageToOwner } from "./main_bot";
import { sendTelegramMessageToChat } from "./guest_bot";
import { webSearch } from "@exalabs/ai-sdk";

const db_crud = tool({
    description: "Allows basic CRUD operations on the database. Check the schema for table structures before using this tool.",
    inputSchema: z.object({
        operation: z.enum(["create", "read", "update", "delete"]).describe("The CRUD operation to perform. Query selects and returns all records. When using delete, ask for clear confirmation."),
        table: z.enum(["debtors", "video_ideas", "todos", "friends", "whatFriendsWantFromMe"]).describe("The table to perform the operation on."),
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
                todos: extractSchemaInfo(schema.todos),
                friends: extractSchemaInfo(schema.friends),
                whatFriendsWantFromMe: extractSchemaInfo(schema.whatFriendsWantFromMe),
            };
        } catch (error) {
            console.error("Error in getDbSchema tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

const runCode = tool({
    description: "Run runs the code you provide. The user will see the code as well as the results. Use this to complete requests that you otherwise could not do.",
    inputSchema: z.object({
        code: z.string().describe("The code to be executed."),
        language: z.enum(["python", "bash", "typescript", "javascript"]).default("python").describe("The programming language of the code. Defaults to python."),
    }),
    execute: async ({ code, language }) => {
        try {
            console.log("Executing code:", code);
            sendTelegramMarkdownToOwner("```\n" + code + "\n```");
            const sandbox = await Sandbox.create()
            const { text, results, logs, error } = await sandbox.runCode(code, { language });
            sandbox.kill()

            console.log("Code execution results:", { text, results, logs, error });
            sendTelegramMarkdownToOwner("Results: \n " + "```\n" + JSON.stringify({ text, results, logs, error }) + "\n```");

            if (error) {
                return { error: String(error) };
            }

            return { output: text, results, logs };
        } catch (error) {
            console.error("Error in runCode tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

const sendMessage = tool({
    description: "Send a message to a user via Telegram. Use when necessary to notify the owner.",
    inputSchema: z.object({
        message: z.string().describe("The message text to send"),
    }),
    execute: async ({ message }) => {
        try {

            console.log(`Sending message:`, message);
            const result = await sendTelegramMessageToOwner(message);
            return result;
        } catch (error) {
            console.error("Error in sendMessage tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

const sendImage = tool({
    description: "Send an image to a user via Telegram from a URL .",
    inputSchema: z.object({
        imageUrl: z.string().describe("The URL of the image to send"),
        caption: z.string().optional().describe("Optional caption for the image"),
    }),
    execute: async ({ imageUrl, caption }) => {
        try {
            console.log(`Sending image:`, imageUrl);
            const result = await sendTelegramImageToOwner(imageUrl, caption);
            return result;
        } catch (error) {
            console.error("Error in sendImage tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

const sendMessageToFriend = tool({
    description: "Send a message to a friend via Telegram. Use when explicitly told to do so. Message must be in Czech. Always get the chatId from the friends table before using this tool.",
    inputSchema: z.object({
        chatId: z.number().describe("The chat ID of the friend to send the message to"),
        message: z.string().describe("The message text to send"),
    }),
    execute: async ({ chatId, message }) => {
        try {

            console.log(`Sending message to friend chatId=${chatId}:`, message);
            const result = await sendTelegramMessageToChat(chatId, message);
            await sendTelegramMessageToOwner(`Sent message to friend (chatId=${chatId}):\n${message}`);
            return { success: true, result };
        } catch (error) {
            console.error("Error in sendMessageToFriend tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

export const allTools = {
    db_crud,
    getDbSchema,
    runCode,
    sendMessage,
    sendImage,
    sendMessageToFriend,
    webSearch: webSearch(),
};

const guestCreateFriendRequest = tool({
    description: "Create a friend request entry in the friends table for a guest user.",
    inputSchema: z.object({
        name: z.string().describe("The name of the friend."),
        handle: z.string().describe("The handle of the friend."),
        chatId: z.number().describe("The chat ID of the friend."),
    }),
    execute: async ({ name, handle, chatId }) => {
        try {
            console.log(`Creating friend request for name=${name}, chatId=${chatId}`);
            const result = await db.insert(schema.friends).values({
                name,
                handle,
                chatId,
                approved: false,
            }).returning();

            await sendTelegramMessageToOwner(`New friend request from guest:\nName: ${name}\nHandle: @${handle}\nChat ID: ${chatId}`);

            return result;
        } catch (error) {
            console.error("Error in guestCreateFriendRequest tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

const guestGetTheirRequests = tool({
    description: "Get all friend requests made by the guest user.",
    inputSchema: z.object({
        chatId: z.number().describe("The chat ID of the guest user."),
    }),
    execute: async ({ chatId }) => {
        try {
            console.log(`Getting friend requests for chatId=${chatId}`);
            const records = await db.select().from(schema.friends).where(eq(schema.friends.chatId, chatId));
            return records;
        } catch (error) {
            console.error("Error in guestGetTheirRequests tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});


const guestCreateRequestFromFriend = tool({
    description: "Allows my friends to create requests for me. Can be anything from that I owe them something or they want to remind me something.",
    inputSchema: z.object({
        chatId: z.number().describe("The chat ID of the friend creating the request."),
        requestText: z.string().describe("The text of the request."),
    }),
    execute: async ({ chatId, requestText }) => {
        try {
            console.log(`Creating request from friend chatId=${chatId}:`, requestText);

            const record = await getUserFriendRecord(chatId);
            if (!record || !record.approved) {
                throw new Error(`Chat ID ${chatId} is not an approved friend.`);
            }

            const result = await db.insert(schema.whatFriendsWantFromMe).values({
                friendId: record.id,
                request: requestText,
            }).returning();

            await sendTelegramMessageToOwner(`New request from friend (${record.handle}):\n${requestText}`);

            return result;
        } catch (error) {
            console.error("Error in guestCreateRequestFromFriend tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

const guestFetchTheirRequestsFromFriends = tool({
    description: "Fetch all requests made by friends for the guest user.",
    inputSchema: z.object({
        chatId: z.number().describe("The chat ID of the guest user."),
    }),
    execute: async ({ chatId }) => {
        try {
            console.log(`Fetching requests from friends for chatId=${chatId}`);

            const friendRecord = await getUserFriendRecord(chatId);
            if (!friendRecord || !friendRecord.approved) {
                throw new Error(`Chat ID ${chatId} is not an approved friend.`);
            }

            const records = await db.select()
                .from(schema.whatFriendsWantFromMe)
                .where(eq(schema.whatFriendsWantFromMe.friendId, friendRecord.id));

            return records;
        } catch (error) {
            console.error("Error in guestFetchTheirRequestsFromFriends tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

const guestSetPronouns = tool({
    description: "Set pronouns for the guest user in their friend record. Only if they are a friend already.",
    inputSchema: z.object({
        chatId: z.number().describe("The chat ID of the guest user."),
        pronouns: z.string().describe("The pronouns to set for the guest user."),
    }),
    execute: async ({ chatId, pronouns }) => {
        try {
            console.log(`Setting pronouns for chatId=${chatId} to ${pronouns}`);

            const friendRecord = await getUserFriendRecord(chatId);
            if (!friendRecord || !friendRecord.approved) {
                throw new Error(`Chat ID ${chatId} is not an approved friend.`);
            }

            const result = await db.update(schema.friends)
                .set({ pronouns })
                .where(eq(schema.friends.id, friendRecord.id))
                .returning();

            return result;
        } catch (error) {
            console.error("Error in guestSetPronouns tool:", error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
});

export const guestTools = {
    guestCreateFriendRequest,
    guestGetTheirRequests,
    guestCreateRequestFromFriend,
    guestFetchTheirRequestsFromFriends,
    guestSetPronouns,
};