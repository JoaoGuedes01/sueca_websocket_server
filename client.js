const WebSocket = require('ws');
const socket = new WebSocket('ws://127.0.0.1:5000');

// when the socket opens, send a message to the server to request the deck of cards
socket.addEventListener('open', (event) => {
});

// when the socket closes, log a message to the console
socket.addEventListener('close', (event) => {
  console.log('Connection closed');
});