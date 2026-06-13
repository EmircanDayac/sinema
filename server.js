const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    let currentRoomId = null;

    socket.on('join-room', (roomId) => {
        const room = io.sockets.adapter.rooms.get(roomId);
        if (room && room.size >= 2) {
            socket.emit('room-full');
            return;
        }

        socket.join(roomId);
        currentRoomId = roomId;
        console.log(`Socket ${socket.id} joined room ${roomId}`);
        
        // Notify others in the room
        socket.to(roomId).emit('user-connected', socket.id);
    });

    socket.on('disconnect', () => {
        console.log(`Socket ${socket.id} disconnected`);
        if (currentRoomId) {
            socket.to(currentRoomId).emit('user-disconnected', socket.id);
        }
    });

    socket.on('signal', (message) => {
        if (message.to) {
            socket.to(message.to).emit('signal', socket.id, message);
        } else if (currentRoomId) {
            socket.to(currentRoomId).emit('signal', socket.id, message);
        }
    });

    socket.on('webcam-info', (id) => {
        if (currentRoomId) {
            socket.to(currentRoomId).emit('webcam-info', id);
        }
    });

    socket.on('screen-share-info', (data) => {
        if (currentRoomId) {
            socket.to(currentRoomId).emit('screen-share-info', data);
        }
    });
    
    socket.on('screen-share-stopped', () => {
        if (currentRoomId) {
            socket.to(currentRoomId).emit('screen-share-stopped');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CineSync server running on http://localhost:${PORT}`);
});
