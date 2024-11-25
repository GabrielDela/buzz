const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

let rooms = {}; // { code: { master: socketId, players: [], queue: [] } }

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

app.get('/game', (req, res) => {
    res.sendFile(join(__dirname, 'game.html'));
});

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('disconnect', () => {
        for (const code in rooms) {
            const room = rooms[code];

            if (room.master === socket.id) {
                io.to(code).emit('game-ended');
                delete rooms[code];
            } else {

                try {
                    let leaver = room.players.filter(p => p.socketId === socket.id)[0];
                    room.players = room.players.filter(p => p.socketId !== socket.id);
                    leaver.active = false;
                    room.players.push(leaver);

                    io.to(code).emit('update-players', room.players);
                }
                catch (e) { }
            }
        }
        console.log(`User ${socket.id} disconnected.`);
    });

    socket.on('create-room', () => {
        const code = "B" + generateSixDigitNumber();

        if (rooms[code]) {
            socket.emit('room-error', 'Room already exists.');
            return;
        }

        rooms[code] = { master: socket.id, players: [], queue: [], started: false };
        socket.join(code);
        socket.emit('room-created', code);
    });

    socket.on('join-room', ({ uuid, code, username }) => {
        const room = rooms[code];

        if (!room) {
            socket.emit('room-error', 'Room does not exist.');
            return;
        }

        let index = room.players.findIndex(p => p.uuid === uuid);

        if (index === -1) {
            room.players.push({ uuid: uuid, socketId: socket.id, username, score: 0, active: true });
        } else {
            let player = room.players[index];
            player.socketId = socket.id;
            player.username = username;
            player.active = true;

            room.players[index] = player;
        }

        if (room.started) {
            socket.emit('game-started');
        }
        else {
            socket.emit('waiting-for-host');
        }

        io.to(code).emit('update-players', room.players);
        socket.join(code);
    });

    socket.on('start-game', (code) => {
        const room = rooms[code];

        console.log(room)

        if (room && room.master === socket.id) {
            rooms[code].started = true;

            console.log(rooms[code].started)

            io.to(code).emit('game-started');
        }
    });

    socket.on('buzz', (request) => {
        const room = rooms[request.code];
        if (room) {
            if (!room.queue.some(q => q.uuid === request.uuid)) {
                room.queue.push({ uuid: request.uuid, username: request.username });
                io.to(room.master).emit('update-queue', room.queue);
            }
        }
    });

    socket.on('validate', ({ code, success }) => {
        const room = rooms[code];
        if (room && room.queue.length > 0) {
            const player = room.queue.shift();

            io.to(room.master).emit('update-queue', room.queue);

            const playerData = room.players.find(p => p.uuid === player.uuid);

            if (success) {
                if (playerData) {
                    playerData.score += 1; // Incrémenter le score
                    io.to(code).emit('update-players', room.players); // Mettre à jour les scores pour tous
                }
            }

            io.to(playerData.socketId).emit('answered', playerData.score);
        }
    });

    socket.on('reset', (code) => {
        const room = rooms[code];
        if (room && room.master === socket.id) {
            room.queue = [];
            io.to(room.master).emit('update-queue', room.queue);
            io.to(code).emit('reset');
        }
    });

    socket.on('leave', () => {
        let user = room.players.filter(p => p.socketId === socket.id)[0];
        room.players = room.players.filter(p => p.socketId !== socket.id);
        user.active = false;
        room.players.push(user);

        io.to(code).emit('update-players', room.players);
    });
});

server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
});

function generateSixDigitNumber() {
    return Math.floor(100000 + Math.random() * 900000);
}