const path = require("path");
const { randomUUID } = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();

function createRoom() {
    return {
        students: new Map(),
        connectedStudentSockets: new Map(),
        teacherSockets: new Set(),
    };
}

function normalizeRoomCode(input) {
    if (typeof input !== "string") {
        return "";
    }

    return input.trim().toUpperCase();
}

function generateRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    do {
        code = "";
        for (let i = 0; i < 6; i += 1) {
            const index = Math.floor(Math.random() * alphabet.length);
            code += alphabet[index];
        }
    } while (rooms.has(code));

    return code;
}

function buildState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) {
        return {
            roomCode,
            students: [],
            totalCount: 0,
            readyCount: 0,
            updatedAt: Date.now(),
        };
    }

    const studentList = Array.from(room.students.values()).map((student) => ({
        id: student.id,
        ready: student.ready,
        connected: room.connectedStudentSockets.has(student.id),
        updatedAt: student.updatedAt,
    }));

    studentList.sort((a, b) => a.updatedAt - b.updatedAt);

    const readyCount = studentList.filter((student) => student.ready).length;

    return {
        roomCode,
        students: studentList,
        totalCount: studentList.length,
        readyCount,
        updatedAt: Date.now(),
    };
}

function broadcastState(roomCode) {
    io.to(`room:${roomCode}`).emit("state:update", buildState(roomCode));
}

app.use((req, res, next) => {
    if (req.path.endsWith(".html") || req.path.endsWith(".css") || req.path.endsWith(".js")) {
        res.set("Cache-Control", "no-store");
    }
    next();
});

app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "student.html"));
});

app.get("/student", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "student.html"));
});

app.get("/teacher", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "teacher.html"));
});

io.on("connection", (socket) => {
    const role = socket.handshake.auth && socket.handshake.auth.role;

    if (role === "teacher") {
        const requestedCode = normalizeRoomCode(socket.handshake.auth.roomCode);
        let roomCode = requestedCode;

        if (!roomCode || !rooms.has(roomCode)) {
            roomCode = generateRoomCode();
            rooms.set(roomCode, createRoom());
        }

        const room = rooms.get(roomCode);
        room.teacherSockets.add(socket.id);

        socket.data.roomCode = roomCode;
        socket.join(`room:${roomCode}`);
        socket.emit("teacher:room-assigned", roomCode);
        socket.emit("state:update", buildState(roomCode));

        socket.on("teacher:reset", () => {
            room.students.forEach((student) => {
                student.ready = false;
                student.updatedAt = Date.now();
            });
            broadcastState(roomCode);
        });

        socket.on("disconnect", () => {
            room.teacherSockets.delete(socket.id);
        });

        return;
    }

    if (role === "student") {
        const roomCode = normalizeRoomCode(socket.handshake.auth.roomCode);

        if (!roomCode || !rooms.has(roomCode)) {
            socket.emit("auth:error", "Invalid class code");
            socket.disconnect(true);
            return;
        }

        const room = rooms.get(roomCode);
        let sessionId = socket.handshake.auth.sessionId;

        if (!sessionId || typeof sessionId !== "string") {
            sessionId = randomUUID();
        }

        socket.data.sessionId = sessionId;
        socket.data.roomCode = roomCode;
        socket.join(`room:${roomCode}`);

        room.connectedStudentSockets.set(sessionId, socket.id);

        if (!room.students.has(sessionId)) {
            room.students.set(sessionId, {
                id: sessionId,
                ready: false,
                updatedAt: Date.now(),
            });
        }

        socket.emit("session:assigned", sessionId);
        socket.emit("state:update", buildState(roomCode));
        broadcastState(roomCode);

        socket.on("student:set-ready", (payload) => {
            const student = room.students.get(sessionId);
            if (!student) {
                return;
            }

            student.ready = Boolean(payload && payload.ready);
            student.updatedAt = Date.now();
            broadcastState(roomCode);
        });

        socket.on("disconnect", () => {
            room.connectedStudentSockets.delete(sessionId);
            broadcastState(roomCode);
        });

        return;
    }

    socket.emit("auth:error", "Unknown role");
    socket.disconnect(true);
});

server.listen(PORT, () => {
    console.log(`ReadyFreddy running on http://localhost:${PORT}`);
});
