import { Cron } from "croner";
import { db } from "./db/client";
import { scheduledMessages } from "./db/schema";
import { eq, and, lte } from "drizzle-orm";
import { sendTelegramMessageToOwner } from "./main_bot";

// In-memory map to track active scheduled jobs
const activeJobs: Map<number, Cron> = new Map();

function getOwnerChatId(): number {
    const rawChatId = Bun.env.OWNER_CHAT_ID;
    const ownerChatId = rawChatId ? parseInt(rawChatId, 10) : NaN;

    if (!Number.isFinite(ownerChatId) || ownerChatId <= 0) {
        throw new Error("OWNER_CHAT_ID is not set or invalid.");
    }

    return ownerChatId;
}

/**
 * Schedule a message to be sent at a specific time.
 * Returns the created scheduled message record.
 */
export async function scheduleMessage(
    message: string,
    scheduledFor: Date
): Promise<{ id: number; chatId: number; message: string; scheduledFor: string }> {
    try {
        const isoTime = scheduledFor.toISOString();
        const ownerChatId = getOwnerChatId();

        // Insert into database
        const result = await db.insert(scheduledMessages).values({
            chatId: ownerChatId,
            message,
            scheduledFor: isoTime,
            sent: false,
        }).returning();

        const record = result[0]!;

        console.log(`Scheduled message id=${record.id} for ${isoTime} (owner chatId=${ownerChatId})`);

        // Schedule the cron job
        scheduleJob(record.id, message, scheduledFor);

        return {
            id: record.id,
            chatId: record.chatId,
            message: record.message,
            scheduledFor: isoTime,
        };
    } catch (error) {
        console.error("Error in scheduleMessage:", error);
        throw error;
    }
}

/**
 * Cancel a scheduled message by id.
 */
export async function cancelScheduledMessage(id: number): Promise<boolean> {
    const job = activeJobs.get(id);
    if (job) {
        job.stop();
        activeJobs.delete(id);
    }

    const [deleted] = await db.delete(scheduledMessages)
        .where(eq(scheduledMessages.id, id))
        .returning();

    return !!deleted;
}

/**
 * Get all pending (unsent) scheduled messages.
 */
export async function getPendingScheduledMessages() {
    return db.select().from(scheduledMessages)
        .where(eq(scheduledMessages.sent, false));
}

/**
 * Create a cron job for a scheduled message.
 */
function scheduleJob(id: number, message: string, fireAt: Date) {
    const now = new Date();
    const viennaTime = fireAt.toLocaleString('en-GB', { timeZone: 'Europe/Vienna' });
    const nowViennaTime = now.toLocaleString('en-GB', { timeZone: 'Europe/Vienna' });

    console.log(`[scheduleJob] Message id=${id}, Target (Vienna): ${viennaTime}, Now (Vienna): ${nowViennaTime}`);

    // Don't schedule if already in the past
    if (fireAt <= now) {
        console.log(`Scheduled message id=${id} is in the past, sending immediately`);
        sendScheduledMessage(id, message);
        return;
    }

    const job = new Cron(fireAt, { timezone: 'Europe/Vienna' }, async () => {
        await sendScheduledMessage(id, message);
    });

    activeJobs.set(id, job);
    console.log(`Created cron job for message id=${id}, fires at ${fireAt.toISOString()} (Vienna: ${viennaTime})`);
}

/**
 * Send a scheduled message and mark it as sent.
 */
async function sendScheduledMessage(id: number, message: string) {
    try {
        const ownerChatId = getOwnerChatId();
        await sendTelegramMessageToOwner(`⏰ Reminder: ${message}`);

        // Mark as sent in database
        await db.update(scheduledMessages)
            .set({ sent: true })
            .where(eq(scheduledMessages.id, id));

        // Remove from active jobs
        activeJobs.delete(id);

        console.log(`Sent scheduled message id=${id} to chatId=${ownerChatId}`);
    } catch (error) {
        console.error(`Error sending scheduled message id=${id}:`, error);
    }
}

/**
 * Initialize the scheduler by loading all pending messages from the database
 * and scheduling them. Call this on bot startup.
 */
export async function initializeScheduler() {
    console.log("Initializing scheduler...");

    const pendingMessages = await getPendingScheduledMessages();
    console.log(`Found ${pendingMessages.length} pending scheduled messages`);

    getOwnerChatId();
    for (const msg of pendingMessages) {
        const fireAt = new Date(msg.scheduledFor);
        scheduleJob(msg.id, msg.message, fireAt);
    }

    console.log("Scheduler initialized");
}
