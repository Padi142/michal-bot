import { Bot } from "gramio";
import { generateResponseForOwner, sendTelegramMessageToOwner } from "./main_bot";
import { generateResponseForGuest, sendTelegramMessageToChat } from "./guest_bot";


export const bot = new Bot(Bun.env.BOT_TOKEN!)
    .command("start", async (context) => {
        context.send("AHOJ! Jsi kamarád??")
    }).on("message", async (context) => {
        console.log("Received message:", context.text);

        const chatId = context.chatId;
        const userMessage = context.text || "";

        if (chatId + '' === Bun.env.OWNER_CHAT_ID) {
            await context.sendChatAction("typing");
            const botOwnerResponse = await generateResponseForOwner(chatId, userMessage);
            await sendTelegramMessageToOwner(botOwnerResponse);

            return;
        }

        await context.sendChatAction("typing");
        const userName = context.from?.username || "unknown";
        const botResponse = await generateResponseForGuest(chatId, userMessage, userName);
        await sendTelegramMessageToChat(chatId, botResponse);
    })
    .onStart(({ info }) => console.log(`✨ Bot ${info.username} was started!`));

bot.start();



