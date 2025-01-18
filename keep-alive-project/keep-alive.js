// keep-alive.js
const axios = require('axios');

// URL of the server to ping
const serverURL = 'https://mp4streamtap.onrender.com';

// Function to ping the server
const pingServer = async () => {
    try {
        const response = await axios.get(serverURL);
        console.log(`Server pinged successfully: ${response.status} - ${response.statusText}`);
    } catch (error) {
        console.error('Error pinging server:', error.message);
    }
};

// Ping the server every minute
setInterval(() => {
    console.log('Pinging the server...');
    pingServer();
}, 60 * 1000); // 60 seconds
