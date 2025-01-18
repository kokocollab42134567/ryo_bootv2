const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const queryString = require('query-string');
const http = require('http');

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

    // HTTP server to listen for Render requests
    http.createServer(async (req, res) => {
        const url = req.url;
        const parsed = queryString.parse(url.split('?')[1]);
        const mention = parsed.mention;

        if (mention) {
            const number = `${mention}@s.whatsapp.net`;
            try {
                await sock.sendMessage(number, {
                    text: `Direct mention: Hello @${mention}!`,
                    mentions: [number],
                });
                console.log(`Message sent to ${mention}`);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`Message sent to ${mention}`);
            } catch (error) {
                console.error('Failed to send message:', error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Failed to send message.');
            }
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'No mention parameter provided' }));
        }
    }).listen(3000, () => {
        console.log('HTTP server running on port 3000');
    });

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async (msg) => {
        console.log('Received message:', JSON.stringify(msg, null, 2));
        const message = msg.messages[0];

        if (message.message && message.key.remoteJid.endsWith('@g.us')) {
            const groupId = message.key.remoteJid; // Group ID
            const sender = message.key.participant; // Sender ID
            const text =
                message.message.conversation ||
                message.message.extendedTextMessage?.text ||
                message.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
                '';

            console.log(`Message from ${sender} in group ${groupId}: ${text}`);

            if (text.trim() === '.\u0645\u0646\u0634\u0646') { // Arabic "منشن"
                try {
                    // Fetch group participants
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const participants = groupMetadata.participants;

                    // Prepare the message content
                    const mentions = participants.map(p => p.id || p.jid);
                    const mentionMessage = `\u0645\u0646\u0634\u0646 \u062C\u0645\u0627\u0639\u064A:\n${mentions
                        .map(id => `@${id.split('@')[0]}`)
                        .join('\n')}`;

                    // Send a single message with all mentions
                    await sock.sendMessage(groupId, {
                        text: mentionMessage,
                        mentions
                    });

                    console.log(`Sent a full mention message in group ${groupId}`);
                } catch (error) {
                    console.error('Failed to send mention message:', JSON.stringify(error, null, 2));
                }
            }
        }
    });

    return sock;
};

// Start the bot
startSock().catch((err) => {
    console.error('Error starting the bot:', err);
});
