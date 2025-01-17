// Import necessary modules
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

// Function to start the WhatsApp bot
const startSock = async () => {
    // Set up authentication
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    // Initialize the socket
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true // Print QR code in terminal for scanning
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

            if (text.trim() === '.منشن') {
                try {
                    // Fetch group participants
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const participants = groupMetadata.participants;
            
                    // Prepare the message content
                    const mentions = participants.map(p => p.id || p.jid);
                    const mentionMessage = `منشن جماعي:\n${mentions
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
startSock().catch(err => {
    console.error('Error starting the bot:', err);
});
