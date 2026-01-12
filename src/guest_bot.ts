import { mistral } from "@ai-sdk/mistral";
import { generateText, stepCountIs } from "ai";
import { bot } from ".";
import { getUserFriendRecord } from "./db/utils";
import { guestTools } from "./tools";
import { sendTelegramMarkdownToOwner, sendTelegramMessageToOwner } from "./main_bot";


const guestSystemPrompt =
    `You are a helpful assistant called Michal. You take requests from users that want something from the owner (me).`
    + `First of all, if the user is not already a friend, guide them how to become one by creating a friend request using the appropriate tool. If they are not a friend, they are not allowed to do anything else.`
    + ` If they are a friend, help them with their requests using the tools provided.`
    + ` Always ask the user for more information if you need it to complete the request.`
    + ` You are chatting using Telegram. Reply with text without any markdown formatting.`
    + ` You like cheese. You are a rat. You live in a nice house. Make subtle references to rats and cheese in your responses from time to time.`
    + ` Write in Czech.`
    ;

type GuestMessage = { role: "user" | "assistant"; content: string };

// Store message history per chat (chatId -> messages array)
const guestMessageHistory = new Map<number, GuestMessage[]>();

async function addGuestMessage(chatId: number, role: "user" | "assistant", content: string) {
    if (!guestMessageHistory.has(chatId)) {
        guestMessageHistory.set(chatId, []);
    }
    guestMessageHistory.get(chatId)!.push({ role, content });
}

async function getGuestLastMessages(chatId: number, n: number): Promise<GuestMessage[]> {
    const history = guestMessageHistory.get(chatId) || [];
    return history.slice(-n);
}

export async function generateResponseForGuest(chatId: number, userMessage: string, username: string): Promise<string> {
    console.log(`Generating response for guest chatId=${chatId}, message=${userMessage}`);

    // Add user message to history
    await addGuestMessage(chatId, "user", userMessage);

    // Get last messages for context
    const lastMessages = await getGuestLastMessages(chatId, 10);

    const friendRecord = await getUserFriendRecord(chatId);

    if (!friendRecord || !friendRecord.approved) {
        console.log(`Guest chatId=${chatId} is not an approved friend.`);
        await sendTelegramMessageToOwner(`A person with username @${username} and chatId=${chatId} is trying to interact but is not an approved friend.`);
        await sendTelegramMarkdownToOwner(`Message: \`\`\` ${userMessage} \`\`\``);
    }

    // Prepare messages for the AI
    const aiMessages = [
        { role: "system" as const, content: guestSystemPrompt },
        { role: 'system' as const, content: `The user's id is: ${chatId} and username is: ${username}. Their friend record is: ${JSON.stringify(friendRecord)}. Current date and time is: ${new Date().toISOString()}` },
        ...lastMessages.map(m => ({ role: m.role, content: m.content })),
    ];

    // Generate response using Mistral with tools
    const response = await generateText({
        model: mistral("mistral-large-latest"),
        messages: aiMessages,
        tools: guestTools,
        stopWhen: stepCountIs(10),
    });

    const botResponse = response.text.trim();
    console.log(`Generated response for guest chatId=${chatId}: ${botResponse}`);

    // Add bot response to history
    await addGuestMessage(chatId, "assistant", botResponse);

    return botResponse;
}

export const sendTelegramMessageToChat = async (chatId: number, message: string) => {
    try {
        console.log(`Sending message to chatId=${chatId}:`, message);
        const result = await bot.api.sendMessage({
            chat_id: chatId,
            text: message,
        });
        return { success: true, result };
    } catch (error) {
        console.error("Error in sendTelegramMessageToChat:", error);
        return { error: error instanceof Error ? error.message : String(error) };
    }
}