const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const activeRooms = new Map();

function getRoomsList() {
    const list = [];
    for (const [roomId, roomInfo] of activeRooms.entries()) {
        const room = io.sockets.adapter.rooms.get(roomId);
        const size = room ? room.size : 0;
        // Keep rooms that have users, or were just created (we allow a tiny grace period, but showing all is fine)
        list.push({ id: roomId, name: roomInfo.name, size: size });
    }
    return list;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    let currentRoomId = null;

    // Send active rooms to the new user
    socket.emit('rooms-list', getRoomsList());

    socket.on('create-room', (roomName) => {
        const roomId = 'room-' + Math.random().toString(36).substr(2, 6);
        activeRooms.set(roomId, { name: roomName || 'İsimsiz Oda' });
        socket.emit('room-created', roomId);
        io.emit('rooms-list', getRoomsList());
    });

    socket.on('join-room', (roomId) => {
        const roomInfo = activeRooms.get(roomId);
        if (!roomInfo) {
            socket.emit('room-error', 'Oda bulunamadı veya kapatıldı.');
            return;
        }

        const room = io.sockets.adapter.rooms.get(roomId);
        if (room && room.size >= 2) {
            socket.emit('room-full');
            return;
        }

        socket.join(roomId);
        currentRoomId = roomId;
        console.log(`Socket ${socket.id} joined room ${roomId}`);
        
        io.emit('rooms-list', getRoomsList());
        socket.to(roomId).emit('user-connected', socket.id);
    });

    socket.on('disconnect', () => {
        console.log(`Socket ${socket.id} disconnected`);
        if (currentRoomId) {
            socket.to(currentRoomId).emit('user-disconnected', socket.id);
            
            // Cleanup empty rooms
            const room = io.sockets.adapter.rooms.get(currentRoomId);
            if (!room || room.size === 0) {
                activeRooms.delete(currentRoomId);
            }
            io.emit('rooms-list', getRoomsList());
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
