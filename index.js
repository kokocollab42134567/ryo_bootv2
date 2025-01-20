const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const http = require('http');

// AI Query Function
const queryAI = async (text) => {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-4o-mini',
                prompt: `Does this message \"${text}\" contain a request to mention or mention all users in a group? Please first correct any spelling errors or missing character without writing it and then respond with only \"yes\" or \"no\". Your reply must be only as I say without changing or adding anything. Respond only in English.`,
                max_tokens: 5,
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            }
        );

        const aiResponse = response.data?.choices?.[0]?.text?.trim();
        if (!aiResponse) {
            console.error('Unexpected AI response:', response.data);
            return false;
        }

        console.log(`AI Response: ${aiResponse}`);
        return aiResponse.replace(/[^\w\s]/gi, '').toLowerCase() === 'yes';
    } catch (error) {
        console.error('Error querying AI:', error.message);
        return false;
    }
};

// Function to start WhatsApp Bot
const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`Connection closed. Reason: ${reason}`);

            if (reason === DisconnectReason.loggedOut) {
                console.log('Logged out. Delete the "auth" folder and restart to scan QR code.');
            } else {
                console.log('Reconnecting...');
                await startSock();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connection is open.');
        }
    });

    sock.ev.on('messages.upsert', async (msg) => {
        const message = msg.messages?.[0];
        if (!message?.message || !message.key.remoteJid.endsWith('@g.us')) return;

        const groupId = message.key.remoteJid;
        const sender = message.key.participant;
        const text =
            message.message.conversation ||
            message.message.extendedTextMessage?.text ||
            message.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
            '';

        console.log(`Message from ${sender} in group ${groupId}: ${text}`);

        if (text.trim().startsWith('.')) {
            const isMentionRequest = await queryAI(text);

            if (isMentionRequest) {
                try {
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const mentions = groupMetadata.participants.map((p) => p.id);

                    const mentionMessage = `Group Mention:\n${mentions
                        .map((id) => `@${id.split('@')[0]}`)
                        .join('\n')}`;

                    await sock.sendMessage(groupId, {
                        text: mentionMessage,
                        mentions,
                    });

                    console.log(`AI confirmed. Sent a group mention message in group ${groupId}`);
                } catch (error) {
                    console.error('Error sending group mention message:', error.message);
                }
            } else {
                console.log('AI determined the message is not a mention request.');
            }
        }
    });

    return sock;
};

// Function to start a basic HTTP server
const startServer = () => {
    const port = process.env.SERVER_PORT || 3001;

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const hiParam = url.searchParams.get('hi');

        if (hiParam === 'true') {
            console.log('hi');
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Server is running');
    });

    server.listen(port, () => {
        console.log(`HTTP server is running on port ${port}`);
    });
};

// Function to make HTTP requests every second
const pingOtherServer = (url, interval = 1000) => {
    setInterval(async () => {
        try {
            const response = await axios.get(url);
            console.log(`Pinged server at ${url}. Response: ${response.data}`);
        } catch (error) {
            console.error(`Error pinging server at ${url}:`, error.message);
        }
    }, interval);
};

// Start the bot, the server, and ping the other server
(async () => {
    try {
        await startSock();
        startServer();
        pingOtherServer('https://mp4streamtap.onrender.com/?hi=true', 1000); // Ping every second
    } catch (error) {
        console.error('Error starting the bot or server:', error.message);
    }
})();
