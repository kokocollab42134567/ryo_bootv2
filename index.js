const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const http = require('http');

// Query AI to determine if the message is a mention request
const queryAI = async (text) => {
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-4o-mini',
                prompt: `Does this message \"${text}\" contain a request to mention or mention all users in a group? Please first correct any spelling errors or missing character without write it and then respond with only \"yes\" or \"no\". Your reply must be only as I say without change or add anything.`,
                max_tokens: 5,
            },
            {
                headers: {
                    Authorization: 'Bearer YOUR_API_KEY', // Replace with your OpenRouter API key
                },
            }
        );

        if (
            response.data &&
            Array.isArray(response.data.choices) &&
            response.data.choices[0]?.text
        ) {
            const aiResponse = response.data.choices[0].text.trim();
            console.log(`AI Pure Response: ${aiResponse}`); // Log the AI response
            return aiResponse.replace(/[^\w\s]/gi, '').toLowerCase() === 'yes';
        } else {
            console.error('Unexpected AI response structure:', response.data);
            return false;
        }
    } catch (error) {
        console.error('Error querying AI:', error.message);
        return false;
    }
};

// Function to start the WhatsApp bot
const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`Connection closed. Reason: ${reason}`);

            if (reason !== DisconnectReason.loggedOut) {
                console.log('Reconnecting...');
                startSock();
            } else {
                console.log('Logged out. Delete the "auth" folder and restart to scan QR code.');
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connection is open.');
        }
    });

    sock.ev.on('messages.upsert', async (msg) => {
        const message = msg.messages[0];
        if (!message.message || !message.key.remoteJid.endsWith('@g.us')) return;

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
                    const participants = groupMetadata.participants;

                    const mentions = participants.map((p) => p.id || p.jid);
                    const mentionMessage = `منشن جماعي:\n${mentions
                        .map((id) => `@${id.split('@')[0]}`)
                        .join('\n')}`;

                    await sock.sendMessage(groupId, {
                        text: mentionMessage,
                        mentions,
                    });

                    console.log(`AI confirmed. Sent a full mention message in group ${groupId}`);
                } catch (error) {
                    console.error('Failed to send mention message:', error);
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

// Start the bot and the server
startSock().catch((err) => {
    console.error('Error starting the bot:', err);
});

startServer();
