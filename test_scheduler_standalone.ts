import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { scheduledMessages } from "./src/db/schema";
import { eq, and, not } from "drizzle-orm";

// Initialize a test database
const sqlite = new Database(":memory:");
sqlite.exec(`
    CREATE TABLE scheduled_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId INTEGER NOT NULL,
        message TEXT NOT NULL,
        scheduledFor TEXT NOT NULL,
        sent INTEGER DEFAULT 0 NOT NULL,
        failed INTEGER DEFAULT 0 NOT NULL,
        created TEXT DEFAULT CURRENT_DATE
    );
`);
const db = drizzle(sqlite, { schema: { scheduledMessages } });

// Mock the bot object
const mockGetChat = async ({ chat_id }: { chat_id: number }) => {
    if (chat_id === -1) {
        throw new Error("Chat not found");
    }
    return { id: chat_id };
};

const bot = {
    api: {
        getChat: mockGetChat,
    },
};

// Re-implement the scheduler logic for testing
async function validateChatId(chatId: number): Promise<boolean> {
    try {
        await bot.api.getChat({ chat_id: chatId });
        return true;
    } catch (error) {
        console.error(`Invalid chatId=${chatId}:`, error);
        return false;
    }
}

async function sendScheduledMessage(id: number, chatId: number, message: string) {
    try {
        const isValidChat = await validateChatId(chatId);
        if (!isValidChat) {
            console.error(`Failed to send scheduled message id=${id}: Invalid chatId=${chatId}`);
            await db.update(scheduledMessages)
                .set({ failed: true })
                .where(eq(scheduledMessages.id, id));
            return;
        }

        console.log(`Sent scheduled message id=${id} to chatId=${chatId}: ${message}`);

        // Mark as sent in database
        await db.update(scheduledMessages)
            .set({ sent: true })
            .where(eq(scheduledMessages.id, id));
    } catch (error) {
        console.error(`Error sending scheduled message id=${id}:`, error);
        await db.update(scheduledMessages)
            .set({ failed: true })
            .where(eq(scheduledMessages.id, id));
    }
}

async function getPendingScheduledMessages() {
    return db.select().from(scheduledMessages)
        .where(and(
            eq(scheduledMessages.sent, false),
            not(eq(scheduledMessages.failed, true))
        ));
}

async function scheduleMessage(chatId: number, message: string, scheduledFor: Date) {
    const isoTime = scheduledFor.toISOString();

    // Insert into database
    const result = await db.insert(scheduledMessages).values({
        chatId,
        message,
        scheduledFor: isoTime,
        sent: false,
        failed: false,
    }).returning();

    const record = result[0]!;
    console.log(`Scheduled message id=${record.id} for ${isoTime}`);

    // Simulate sending the message after the scheduled time
    setTimeout(async () => {
        await sendScheduledMessage(record.id, record.chatId, record.message);
    }, scheduledFor.getTime() - Date.now());

    return {
        id: record.id,
        chatId: record.chatId,
        message: record.message,
        scheduledFor: isoTime,
    };
}

async function testScheduler() {
    // Test with a valid chat ID
    const validChatId = 123456789;
    const invalidChatId = -1;
    
    console.log("Scheduling message to valid chat ID:", validChatId);
    await scheduleMessage(validChatId, "Test message to valid chat ID", new Date(Date.now() + 2000));
    
    console.log("Scheduling message to invalid chat ID:", invalidChatId);
    await scheduleMessage(invalidChatId, "Test message to invalid chat ID", new Date(Date.now() + 4000));
    
    // Wait for messages to be processed
    console.log("Waiting for messages to be processed...");
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Check pending messages
    const pendingMessages = await getPendingScheduledMessages();
    console.log("Pending messages:", pendingMessages);
    
    // Check all messages (including failed ones)
    const allMessages = await db.query.scheduledMessages.findMany();
    console.log("All messages:", allMessages);
}

testScheduler().catch(console.error);