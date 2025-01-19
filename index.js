const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios'); // For sending requests to OpenRouter AI

const queryAI = async (text) => {
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-4o-mini',
                prompt: `Does this message \"${text}\" contain a request to mention or mention all users in a group? Please first correct any spelling errors or missing character without write it  and then respond with only \"yes\" or \"no\".your reply most be only as i say withou change or add any thing.`,
                max_tokens: 5,
            },
            {
                headers: {
                    Authorization: 'Bearer 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', // Replace with your OpenRouter API key
                },
            }
        );

        // Ensure the response structure is as expected
        if (
            response.data &&
            Array.isArray(response.data.choices) &&
            response.data.choices[0]?.text
        ) {
            const aiResponse = response.data.choices[0].text.trim();
            console.log(`AI Pure Response: ${aiResponse}`); // Log the pure AI response
            return aiResponse.replace(/[^\w\s]/gi, '').toLowerCase() === 'yes';// Corrected comparison
        } else {
            console.error('Unexpected AI response structure:', response.data);
            return false; // Default to "no"
        }
    } catch (error) {
        console.error('Error querying AI:', error.message);
        return false; // Default to "no" in case of an error
    }
};

// Function to start the WhatsApp bot
const startSock = async () => {
    // Set up authentication
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    // Initialize the socket
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Print QR code in terminal for scanning
    });

    // Save authentication state
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`Connection closed. Reason: ${reason}`);

            // Reconnect unless logged out
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

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async (msg) => {
        const message = msg.messages[0];
        if (!message.message || !message.key.remoteJid.endsWith('@g.us')) return; // Ignore non-group messages

        const groupId = message.key.remoteJid; // Group ID
        const sender = message.key.participant; // Sender ID
        const text =
            message.message.conversation ||
            message.message.extendedTextMessage?.text ||
            message.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
            '';

        console.log(`Message from ${sender} in group ${groupId}: ${text}`);

        if (text.trim().startsWith('.')) {
            // Send the message to AI for processing
            const isMentionRequest = await queryAI(text);

            if (isMentionRequest) {
                try {
                    // Fetch group participants
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const participants = groupMetadata.participants;

                    // Prepare the message content
                    const mentions = participants.map((p) => p.id || p.jid);
                    const mentionMessage = `منشن جماعي:\n${mentions
                        .map((id) => `@${id.split('@')[0]}`)
                        .join('\n')}`;

                    // Send a single message with all mentions
                    await sock.sendMessage(groupId, {
                        text: mentionMessage,
                        mentions,
                    });

                    console.log(`AI confirmed. Sent a full mention message in group ${groupId}`);
                } catch (error) {
                    console.error('Failed to send mention message:', JSON.stringify(error, null, 2));
                }
            } else {
                console.log('AI determined the message is not a mention request.');
            }
        }
    });

    return sock;
};

// Start the bot
startSock().catch((err) => {
    console.error('Error starting the bot:', err);
});
