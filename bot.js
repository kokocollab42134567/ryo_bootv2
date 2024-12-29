// Import necessary modules
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');

// Lexica API setup
const LEXICA_API_URL = 'https://lexica.art/api/v1/search';

// Function to fetch image from Lexica API
const fetchImageFromLexica = async (inputText) => {
    try {
        const response = await axios.get(LEXICA_API_URL, {
            params: { q: inputText },
            timeout: 20000, // Set a timeout of 20 seconds
        });

        // Retrieve the first image URL from the search results
        const imageUrl = response.data.images?.[0]?.src || null;
        return imageUrl;
    } catch (error) {
        console.error('Error fetching image from Lexica:', error);
        return null;
    }
};

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

        if (!message.key.fromMe && message.message && !message.key.remoteJid.endsWith('@g.us')) {
            const sender = message.key.remoteJid; // Chat ID

            // Safely extract the text message
            const text =
                message.message.conversation ||
                message.message.extendedTextMessage?.text ||
                message.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
                '';

            console.log(`Message from ${sender}: ${text}`);

            if (text.trim()) {
                // Fetch an image using the Lexica API
                const imageUrl = await fetchImageFromLexica(text);

                if (imageUrl) {
                    // Send the fetched image
                    await sock.sendMessage(sender, { image: { url: imageUrl }, caption: "Here is an image from Lexica based on your input!" });
                    console.log(`Replied to ${sender} with an image: ${imageUrl}`);
                } else {
                    // Send an error message
                    await sock.sendMessage(sender, { text: "Sorry, I couldn't find an image for your request." });
                    console.log(`Failed to fetch an image for ${sender}`);
                }
            } else {
                console.log('Received a message with no text content.');
            }
        }
    });

    return sock;
};

// Start the bot
startSock().catch(err => {
    console.error('Error starting the bot:', err);
});
