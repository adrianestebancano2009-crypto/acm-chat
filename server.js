const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let users = {}; 
// Salas fijas que nunca se borran
let rooms = { 
    'GENERAL': { type: 'official' }, 
    'PC': { type: 'official' }, 
    'XBOX': { type: 'official' },
    'PS': { type: 'official' },
    'NINTENDO': { type: 'official' }
};

function getRoomCounts() {
    let counts = {};
    Object.keys(rooms).forEach(r => {
        const clients = io.sockets.adapter.rooms.get(r);
        counts[r] = clients ? clients.size : 0;
    });
    return counts;
}

// Lógica para borrar salas vacías que no sean oficiales
function cleanupRooms() {
    let changed = false;
    Object.keys(rooms).forEach(name => {
        if (rooms[name].type !== 'official') {
            const clients = io.sockets.adapter.rooms.get(name);
            if (!clients || clients.size === 0) {
                delete rooms[name];
                changed = true;
            }
        }
    });
    if (changed) io.emit('update_rooms', { rooms, counts: getRoomCounts() });
}

io.on('connection', (socket) => {
    io.emit('update_total_count', io.engine.clientsCount);

    socket.on('attempt_login', (username) => {
        users[socket.id] = { name: username, id: socket.id, currentRoom: null };
        socket.emit('login_response', { success: true, username, userId: socket.id });
        io.emit('update_online_users', Object.values(users));
        io.emit('update_rooms', { rooms, counts: getRoomCounts() });
    });

    socket.on('join_room', (name) => {
        if (users[socket.id]?.currentRoom) socket.leave(users[socket.id].currentRoom);
        if (!rooms[name]) rooms[name] = { type: 'dynamic' };
        socket.join(name);
        users[socket.id].currentRoom = name;
        io.emit('update_rooms', { rooms, counts: getRoomCounts() });
        cleanupRooms(); 
    });

    socket.on('send_group_message', (data) => {
        io.to(data.room).emit('new_group_message', {
            room: data.room, user: users[socket.id].name, userId: socket.id,
            text: data.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('send_private_message', (data) => {
        const msgBase = {
            fromId: socket.id, fromName: users[socket.id].name,
            toId: data.toId, text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        io.to(data.toId).emit('new_private_message', { ...msgBase, chatWith: socket.id });
        socket.emit('new_private_message', { ...msgBase, chatWith: data.toId });
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        io.emit('update_online_users', Object.values(users));
        io.emit('update_total_count', io.engine.clientsCount);
        setTimeout(cleanupRooms, 1000); // Revisar salas tras desconexión
    });
    // Busca la parte de send_group_message y déjala así:
socket.on('send_group_message', (data) => {
    const user = users[socket.id];
    if (!user) return;

    // COMANDO DE LIMPIEZA TOTAL
    if (data.text.trim() === '/borrartodo') {
        // Enviamos una señal especial a TODOS los usuarios
        io.emit('force_clear_history');
        console.log(`--- LIMPIEZA TOTAL EJECUTADA POR ${user.name} ---`);
        return; // Detenemos aquí para que el comando no aparezca como mensaje
    }

    io.to(data.room).emit('new_group_message', {
        room: data.room,
        user: user.name,
        userId: socket.id,
        text: data.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
});
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
