const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room ${roomId}`);
        
        // Notify others in the room
        socket.to(roomId).emit('user-connected', socket.id);

        socket.on('disconnect', () => {
            console.log(`Socket ${socket.id} disconnected`);
            socket.to(roomId).emit('user-disconnected', socket.id);
        });

        socket.on('signal', (message) => {
            if (message.to) {
                socket.to(message.to).emit('signal', socket.id, message);
            } else {
                socket.to(roomId).emit('signal', socket.id, message);
            }
        });

        socket.on('screen-share-info', (data) => {
            socket.to(roomId).emit('screen-share-info', data);
        });
        
        socket.on('screen-share-stopped', () => {
            socket.to(roomId).emit('screen-share-stopped');
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CineSync server running on http://localhost:${PORT}`);
});
