import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const convertToOgg = (base64Data, originalMime) => {
    return new Promise((resolve, reject) => {
        const tempDir = os.tmpdir();
        const fileId = crypto.randomUUID();

        // Determine extension from mime or default to .bin
        let ext = 'bin';
        if (originalMime) {
            const parts = originalMime.split('/');
            if (parts.length > 1) ext = parts[1].split(';')[0];
        }

        const inputPath = path.join(tempDir, `${fileId}_input.${ext}`);
        const outputPath = path.join(tempDir, `${fileId}_output.ogg`); // .ogg is container

        // Write input file
        // Helper to handle data URI if present, though service usually strips it. 
        // We assume clean base64 here as service cleans it? 
        // Actually service cleans it *inside* sendMessage, so we should clean it here or pass clean data.
        // Let's assume we pass clean Buffer.

        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(inputPath, buffer);

        ffmpeg(inputPath)
            .toFormat('ogg')
            .audioCodec('libopus')
            // WhatsApp recommended settings for voice notes
            .audioBitrate('64k')
            .audioChannels(1) // Mono is usually better for voice notes
            .audioFrequency(48000) // Opus usually likes 48k
            .on('end', () => {
                try {
                    const convertedBuffer = fs.readFileSync(outputPath);
                    const convertedBase64 = convertedBuffer.toString('base64');

                    // Cleanup
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);

                    resolve({
                        base64: convertedBase64,
                        mimetype: 'audio/ogg; codecs=opus',
                        filename: `${fileId}.ogg`
                    });
                } catch (err) {
                    reject(err);
                }
            })
            .on('error', (err) => {
                // Try to cleanup
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                reject(err);
            })
            .save(outputPath);
    });
};
