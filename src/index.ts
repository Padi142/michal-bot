import { Bot } from "gramio";
import {
    clearOwnerContext,
    generateResponseForOwner,
    getOwnerContextStats,
    setOwnerContextSize,
    sendTelegramMessageToOwner,
} from "./main_bot";
import { generateResponseForGuest, sendTelegramMessageToChat } from "./guest_bot";
import { downloadTelegramImage } from "./image_utils";
import { initializeScheduler } from "./scheduler";


export const bot = new Bot(Bun.env.BOT_TOKEN!)
    .command("start", async (context) => {
        context.send("AHOJ! Jsi kamarád??")
    }).command('model', async (context) => {
        const chatId = context.chatId;
        if (chatId + '' !== Bun.env.OWNER_CHAT_ID) {
            return;
        }
        const args = context.text?.split(' ') || [];
        if (args.length < 2) {
            await sendTelegramMessageToChat(chatId, "Please provide a model name. Usage: /model <model_name>");
            return;
        }

        const modelName = args[1];
        Bun.env.DEFAULT_MODEL = modelName;
        await sendTelegramMessageToChat(chatId, `Default model set to ${modelName}`);
    }).command("contextsize", async (context) => {
        const chatId = context.chatId;
        if (chatId + "" !== Bun.env.OWNER_CHAT_ID) {
            return;
        }

        const args = context.text?.trim().split(/\s+/) || [];
        if (args.length < 2) {
            const stats = getOwnerContextStats(chatId);
            await sendTelegramMessageToChat(
                chatId,
                `Current context size is ${stats.contextSize}. Stored messages: ${stats.storedMessages}. Usage: /contextsize <number>`,
            );
            return;
        }

        const contextSize = Number.parseInt(args[1], 10);
        const result = setOwnerContextSize(chatId, contextSize);
        if (!result.success) {
            await sendTelegramMessageToChat(chatId, result.error);
            return;
        }

        await sendTelegramMessageToChat(chatId, `Context size set to ${result.contextSize}.`);
    }).command("clearcontext", async (context) => {
        const chatId = context.chatId;
        if (chatId + "" !== Bun.env.OWNER_CHAT_ID) {
            return;
        }

        const deletedMessages = clearOwnerContext(chatId);
        await sendTelegramMessageToChat(chatId, `Context cleared. Removed ${deletedMessages} stored message(s).`);
    }).on("message", async (context) => {
        console.log("Received message:", context.text);

        if (context.text?.startsWith("/")) {
            return;
        }

        const chatId = context.chatId;
        let userMessage = context.text || "";
        const photos = context.photo || [];

        if (chatId + '' === Bun.env.OWNER_CHAT_ID) {
            await context.sendChatAction("typing");

            // Handle images for owner bot
            let imageBuffer: Buffer | undefined;
            if (photos.length > 0) {
                console.log(`Owner sent ${photos.length} photo(s). Processing...`);
                imageBuffer = (await downloadTelegramImage(photos)) || undefined;

                if (!imageBuffer) {
                    await sendTelegramMessageToOwner("Sorry, I couldn't process the image.");
                    return;
                }

                userMessage = context.caption || userMessage;
            }

            try {

                const botOwnerResponse = await generateResponseForOwner(chatId, userMessage, imageBuffer);
                await sendTelegramMessageToOwner(botOwnerResponse);
            } catch (error) {
                console.error("Error generating response for owner:", error);
                await sendTelegramMessageToOwner("Error, " + (error instanceof Error ? error.message : String(error)));
            }
            return;
        }

        // Handle images for guest users - check approval first
        let imageBuffer: Buffer | undefined;
        if (photos.length > 0) {
            console.log(`Guest sent ${photos.length} photo(s). Checking approval status...`);

            // Check if user is approved before processing images
            const { getUserFriendRecord } = await import("./db/utils");
            const friendRecord = await getUserFriendRecord(chatId);

            if (friendRecord?.approved) {
                console.log(`Approved friend - processing image...`);
                await context.sendChatAction("upload_photo");
                imageBuffer = (await downloadTelegramImage(photos)) || undefined;

                if (!imageBuffer) {
                    await sendTelegramMessageToChat(chatId, "Sorry, I couldn't process the image.");
                    return;
                }

                userMessage = context.caption || userMessage;
            } else {
                console.log(`Non-approved user sent image, ignoring image.`);
                // Ignore the image, only use caption if present
                userMessage = context.caption || userMessage || "";
            }
        }

        await context.sendChatAction("typing");
        const userName = context.from?.username || "unknown";
        const botResponse = await generateResponseForGuest(chatId, userMessage, userName, imageBuffer);
        await sendTelegramMessageToChat(chatId, botResponse);
    })
    .onStart(async ({ info }) => {
        console.log(`✨ Bot ${info.username} was started!`);
        await initializeScheduler();
    });

bot.start();
