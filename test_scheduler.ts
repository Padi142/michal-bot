// Mock the bot object
const mockGetChat = async ({ chat_id }: { chat_id: number }) => {
    if (chat_id === -1) {
        throw new Error("Chat not found");
    }
    return { id: chat_id };
};

const mockBot = {
    api: {
        getChat: mockGetChat,
    },
};

// Mock the imports
jest.mock(".", () => ({ bot: mockBot }));

import { scheduleMessage, getPendingScheduledMessages } from "./src/scheduler";

// Mock Bun.env for testing
Bun.env.OWNER_CHAT_ID = "123456789";

async function testScheduler() {
    // Test with a valid chat ID (replace with a real chat ID for testing)
    const validChatId = parseInt(Bun.env.OWNER_CHAT_ID || "0", 10);
    const invalidChatId = -1;
    
    console.log("Scheduling message to valid chat ID:", validChatId);
    await scheduleMessage(validChatId, "Test message to valid chat ID", new Date(Date.now() + 10000));
    
    console.log("Scheduling message to invalid chat ID:", invalidChatId);
    await scheduleMessage(invalidChatId, "Test message to invalid chat ID", new Date(Date.now() + 20000));
    
    // Wait for messages to be processed
    console.log("Waiting for messages to be processed...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Check pending messages
    const pendingMessages = await getPendingScheduledMessages();
    console.log("Pending messages:", pendingMessages);
    
    // Check all messages (including failed ones)
    const { db } = await import("./src/db/client");
    const allMessages = await db.query.scheduledMessages.findMany();
    console.log("All messages:", allMessages);
}

testScheduler().catch(console.error);