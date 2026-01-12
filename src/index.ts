import { Bot } from "gramio";
import { generateResponseForOwner, sendTelegramMessageToOwner } from "./main_bot";
import { generateResponseForGuest, sendTelegramMessageToChat } from "./guest_bot";
import { downloadTelegramImage } from "./image_utils";


export const bot = new Bot(Bun.env.BOT_TOKEN!)
    .command("start", async (context) => {
        context.send("AHOJ! Jsi kamarád??")
    }).on("message", async (context) => {
        console.log("Received message:", context.text);

        const chatId = context.chatId;
        const userMessage = context.text || "";
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
            }

            const botOwnerResponse = await generateResponseForOwner(chatId, userMessage, imageBuffer);
            await sendTelegramMessageToOwner(botOwnerResponse);

            return;
        }

        // Guest users: ignore images
        if (photos.length > 0) {
            console.log(`Guest sent ${photos.length} photo(s). Ignoring attachments for non-owner users.`);
        }

        await context.sendChatAction("typing");
        const userName = context.from?.username || "unknown";
        const botResponse = await generateResponseForGuest(chatId, userMessage, userName);
        await sendTelegramMessageToChat(chatId, botResponse);
    })
    .onStart(({ info }) => console.log(`✨ Bot ${info.username} was started!`));

bot.start();
