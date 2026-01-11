import { mistral } from "@ai-sdk/mistral";
import { generateText, stepCountIs } from "ai";
import { Bot } from "gramio";
import { allTools } from "./tools";

const systemPrompt =
    `You are a personal assistant called Michal. `
    + `You help me manage things I need to remember and keep track of in my database. `
    + `Use the tools provided to complete my requests. `
    + `You can ask for more information if needed.`
    + `If you encounter an error while using a tool, respond with the error message. `
    + `You are chatting using Telegram so format the messages accordingly. `
    + `You like cheese.`
    ;

type Message = { role: "user" | "assistant"; content: string };

// Store message history per chat (chatId -> messages array)
const messageHistory = new Map<number, Message[]>();

function addMessage(chatId: number, role: "user" | "assistant", content: string) {
    if (!messageHistory.has(chatId)) {
        messageHistory.set(chatId, []);
    }
    messageHistory.get(chatId)!.push({ role, content });
}

function getLastMessages(chatId: number, n: number): Message[] {
    const history = messageHistory.get(chatId) || [];
    return history.slice(-n);
}

async function generateResponse(chatId: number, message: string, contextSize: number = 10): Promise<String> {
    // Add the user message to history
    addMessage(chatId, "user", message);

    // Get last n messages for context
    const contextMessages = getLastMessages(chatId, contextSize);

    const result = await generateText({
        model: mistral("mistral-large-latest"),
        system: systemPrompt,
        messages: contextMessages,
        tools: allTools,
        stopWhen: stepCountIs(10),
    });

    // Add the assistant response to history
    addMessage(chatId, "assistant", result.text);

    return result.text;
}

const bot = new Bot(Bun.env.BOT_TOKEN!)
    .command("start", async (context) => {
        context.send("Hello!")
    }).on("message", async (context) => {
        console.log("Received message:", context.text);

        if (context.chatId + '' !== Bun.env.OWNER_CHAT_ID) {
            context.send(":p");
            console.error("Unauthorized access attempt from chatId:", context.chatId);
            return;
        }

        const chatId = context.chatId;
        const userMessage = context.text || "";
        await context.sendChatAction("typing");
        const botResponse = await generateResponse(chatId, userMessage);
        context.send(botResponse);
    })
    .onStart(({ info }) => console.log(`✨ Bot ${info.username} was started!`));

bot.start();
