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

type Message = { role: "user" | "assistant"; content: string };

const baseSystemPrompt =
    `You are a personal assistant called Michal. `
    + `You help me manage things I need to remember and keep track of in my database. `
    + `Use the tools provided to complete my requests. `
    + `You can ask for more information if needed. `
    + `If you encounter an error while using a tool, respond with the error message. `
    + `You are allowed to use the tools as many times as needed to complete the request. `
    + `You are chatting using Telegram. Reply with text without any markdown formatting. `
    + `You like cheese. You are a rat. Make subtle references to rats and cheese in your responses from time to time.`;

const DEFAULT_CONTEXT_SIZE = 12;
const MIN_CONTEXT_SIZE = 1;
const MAX_CONTEXT_SIZE = 100;
const MAX_STORED_MESSAGES_PER_CHAT = 400;

// Store message history per chat (chatId -> messages array)
const ownerMessageHistory = new Map<number, Message[]>();
const ownerContextSizeByChat = new Map<number, number>();

function getDefaultContextSize(): number {
    const rawValue = Bun.env.OWNER_CONTEXT_SIZE;
    const parsed = rawValue ? Number.parseInt(rawValue, 10) : NaN;

    if (!Number.isInteger(parsed)) {
        return DEFAULT_CONTEXT_SIZE;
    }

    return Math.min(MAX_CONTEXT_SIZE, Math.max(MIN_CONTEXT_SIZE, parsed));
}

function addOwnerMessage(chatId: number, role: "user" | "assistant", content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
        return;
    }

    if (!ownerMessageHistory.has(chatId)) {
        ownerMessageHistory.set(chatId, []);
    }

    const history = ownerMessageHistory.get(chatId)!;
    history.push({ role, content: trimmedContent });

    if (history.length > MAX_STORED_MESSAGES_PER_CHAT) {
        const overflow = history.length - MAX_STORED_MESSAGES_PER_CHAT;
        history.splice(0, overflow);
    }
}

function getLastOwnerMessages(chatId: number): Message[] {
    const history = ownerMessageHistory.get(chatId) || [];
    const contextSize = getOwnerContextSize(chatId);
    return history.slice(-contextSize);
}

async function loadSoulPrompt(): Promise<string> {
    try {
        const soulFile = Bun.file("SOUL.md");
        if (!(await soulFile.exists())) {
            return "";
        }

        const content = (await soulFile.text()).trim();
        return content;
    } catch (error) {
        console.error("Failed to load SOUL.md:", error);
        return "";
    }
}

async function buildOwnerSystemPrompt(): Promise<string> {
    const soulPrompt = await loadSoulPrompt();
    const promptSections = [
        baseSystemPrompt,
        `Current date and time is: ${new Date().toISOString()}`,
    ];

    if (soulPrompt) {
        promptSections.push(`SOUL.md instructions:\n${soulPrompt}`);
    }

    return promptSections.join("\n\n");
}

export function getOwnerContextSize(chatId: number): number {
    return ownerContextSizeByChat.get(chatId) ?? getDefaultContextSize();
}

export function setOwnerContextSize(chatId: number, contextSize: number): { success: true; contextSize: number } | { success: false; error: string } {
    if (!Number.isInteger(contextSize)) {
        return { success: false, error: "Context size must be an integer." };
    }

    if (contextSize < MIN_CONTEXT_SIZE || contextSize > MAX_CONTEXT_SIZE) {
        return {
            success: false,
            error: `Context size must be between ${MIN_CONTEXT_SIZE} and ${MAX_CONTEXT_SIZE}.`,
        };
    }

    ownerContextSizeByChat.set(chatId, contextSize);
    return { success: true, contextSize };
}

export function clearOwnerContext(chatId: number): number {
    const previousLength = ownerMessageHistory.get(chatId)?.length || 0;
    ownerMessageHistory.set(chatId, []);
    return previousLength;
}

export function getOwnerContextStats(chatId: number): { contextSize: number; storedMessages: number } {
    return {
        contextSize: getOwnerContextSize(chatId),
        storedMessages: ownerMessageHistory.get(chatId)?.length || 0,
    };
}

export async function generateResponseForOwner(
    chatId: number,
    message: string,
    imageBuffer?: Buffer,
): Promise<string> {
    const userContextParts: string[] = [];

    if (message.trim()) {
        userContextParts.push(message.trim());
    }

    // If there's an image, perform OCR and append the extracted content.
    if (imageBuffer) {
        console.log(message);
        const ocrResult = await handleImageOCR(imageBuffer, message || undefined);
        console.log("OCR Result:", ocrResult);
        userContextParts.push(`Image OCR context: ${ocrResult}`);
    }

    const combinedUserMessage = userContextParts.join("\n\n").trim() || "User sent an empty message.";
    addOwnerMessage(chatId, "user", combinedUserMessage);

    const contextMessages = getLastOwnerMessages(chatId);
    const ownerSystemPrompt = await buildOwnerSystemPrompt();

    const result = await generateText({
        model: getLanguageModel(),
        system: ownerSystemPrompt,
        messages: contextMessages as any, // Type compatibility with AI SDK
        tools: allTools,
        stopWhen: stepCountIs(20),
    });

    addOwnerMessage(chatId, "assistant", result.text);

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
