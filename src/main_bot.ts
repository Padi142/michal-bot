import { mistral } from "@ai-sdk/mistral";
import { generateText, stepCountIs, type LanguageModel } from "ai";
import { allTools } from "./tools";
import { bot } from ".";
import { openrouter } from "@openrouter/ai-sdk-provider";


export async function handleImageOCR(imageBuffer: Buffer, userPrompt?: string): Promise<string> {
    try {
        const prompt = userPrompt || "Extract and describe all text from this image. If there's no text, describe what you see.";

        const result = await generateText({
            model: mistral("pixtral-12b-2409"),
            messages: [
                {
                    role: "user",
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image', image: imageBuffer }
                    ]
                }
            ],
        });

        return result.text;
    } catch (error) {
        console.error("Failed to process image:", error);
        return `Error processing image: ${error instanceof Error ? error.message : String(error)}`;
    }
}

const systemPrompt =
    `You are a personal assistant called Michal. `
    + `You help me manage things I need to remember and keep track of in my database. `
    + `Use the tools provided to complete my requests. `
    + `You can ask for more information if needed.`
    + `If you encounter an error while using a tool, respond with the error message. You are allowed to use the tools as many times as needed to complete the request. `
    + `You are chatting using Telegram. Reply with text without any markdown formatting.`
    + `You like cheese. You are a rat. Make subtle references to rats and cheese in your responses from time to time.`
    + `Current date and time is: ${new Date().toISOString()}`
    ;

type Message = { role: "user" | "assistant"; content: string | Array<{ type: string; text?: string; image?: Buffer }> };

// Store message history per chat (chatId -> messages array)
const messageHistory = new Map<number, Message[]>();

async function loadMessageHistoryFromTelegram(chatId: number, limit: number = 10): Promise<Message[]> {
    try {
        // Get recent updates to reconstruct conversation history
        const updates = await bot.api.getUpdates({ limit: 100, offset: -100 });

        const messages: Message[] = [];
        for (const update of updates) {
            if (update.message && update.message.chat.id === chatId && update.message.text) {
                const isBot = update.message.from?.is_bot ?? false;
                const role = isBot ? "assistant" : "user";
                messages.push({ role, content: update.message.text });
            }
        }

        return messages.slice(-limit);
    } catch (error) {
        console.error("Failed to load message history from Telegram:", error);
        return [];
    }
}

function addMessage(chatId: number, role: "user" | "assistant", content: string | Array<{ type: string; text?: string; image?: Buffer }>) {
    if (!messageHistory.has(chatId)) {
        messageHistory.set(chatId, []);
    }
    messageHistory.get(chatId)!.push({ role, content });
}

async function getLastMessages(chatId: number, n: number): Promise<Message[]> {
    let history = messageHistory.get(chatId) || [];

    // If we have no history in memory, try to load from Telegram
    if (history.length === 0) {
        console.log("Loading message history from Telegram...");
        const telegramHistory = await loadMessageHistoryFromTelegram(chatId, n);
        if (telegramHistory.length > 0) {
            messageHistory.set(chatId, telegramHistory);
            history = telegramHistory;
        }
    }

    return history.slice(-n);
}

export async function generateResponseForOwner(
    chatId: number,
    message: string,
    imageBuffer?: Buffer,
    contextSize: number = 10
): Promise<string> {
    // If there's an image, first perform OCR
    if (imageBuffer) {
        console.log(message)
        const ocrResult = await handleImageOCR(imageBuffer, message || undefined);
        // Add OCR result as assistant message
        console.log("OCR Result:", ocrResult);
        addMessage(chatId, "user", `User sent an image containing: ${ocrResult}`);
        // return ocrResult;
    }

    // Add the user message to history
    addMessage(chatId, "user", message);

    // Get last n messages for context (will load from Telegram if needed)
    const contextMessages = await getLastMessages(chatId, contextSize);

    const result = await generateText({
        model: getLanguageModel(),
        system: systemPrompt,
        messages: contextMessages as any, // Type compatibility with AI SDK
        tools: allTools,
        stopWhen: stepCountIs(20),
    });

    // Add the assistant response to history
    addMessage(chatId, "assistant", result.text);

    return result.text;
}

export async function sendTelegramMessageToOwner(message: string) {
    try {
        const result = await bot.api.sendMessage({
            chat_id: Bun.env.OWNER_CHAT_ID!,
            text: message,
        });
        console.log(`Message sent to chat:`, message);
        return { success: true, result };
    } catch (error) {
        console.error(`Failed to send message to chat :`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export function escapeMarkdownV2(text: string): string {
    return text.replace(/([{}|.+!=\-])/g, '\\$1');
}

export async function sendTelegramMarkdownToOwner(message: string) {
    try {
        const result = await bot.api.sendMessage({
            chat_id: Bun.env.OWNER_CHAT_ID!,
            text: escapeMarkdownV2(message),
            parse_mode: "MarkdownV2",
        });
        console.log(`Markdown message sent to chat:`, message);
        return { success: true, result };
    } catch (error) {
        console.error(`Failed to send markdown message to chat :`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export async function sendTelegramImageToOwner(imageUrl: string, caption?: string) {
    try {
        const result = await bot.api.sendPhoto({
            chat_id: Bun.env.OWNER_CHAT_ID!,
            photo: imageUrl,
            caption: caption,
        });
        console.log(`Image sent to chat:`, imageUrl);
        return { success: true, result };
    } catch (error) {
        console.error(`Failed to send image to chat :`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function getLanguageModel(): LanguageModel {
    const modelName = Bun.env.DEFAULT_MODEL || "mistral-large-latest";

    if (modelName.includes("mistral")) {
        return mistral(modelName);
    }

    return openrouter(modelName);
}