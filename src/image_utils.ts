import { bot } from ".";

/**
 * Downloads the highest quality image from Telegram
 */
export async function downloadTelegramImage(photos: any[]): Promise<Buffer | null> {
    if (photos.length === 0) return null;

    try {
        // Get the highest quality photo (last in array)
        const photo = photos[photos.length - 1];
        if (!photo) throw new Error("Photo not found");

        const file = await bot.api.getFile({ file_id: photo.fileId });
        const fileUrl = `https://api.telegram.org/file/bot${Bun.env.BOT_TOKEN}/${file.file_path}`;

        // Download the image
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        console.log(`Downloaded image: ${imageBuffer.length} bytes`);
        return imageBuffer;
    } catch (error) {
        console.error("Failed to download image:", error);
        return null;
    }
}
