const path = require("path");
const { randomUUID } = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ROOM_INACTIVITY_MS = 24 * 60 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();

function createRoom() {
    return {
        students: new Map(),
        connectedStudentSockets: new Map(),
        teacherSockets: new Set(),
        totalExercises: 0,
        requireName: false,
        enableHelpButton: false,
        lastActivityAt: Date.now(),
    };
}

function touchRoom(room) {
    if (!room) {
        return;
    }

    room.lastActivityAt = Date.now();
}

function cleanupInactiveRooms() {
    const now = Date.now();

    rooms.forEach((room, roomCode) => {
        const hasActiveConnections = room.teacherSockets.size > 0 || room.connectedStudentSockets.size > 0;
        const idleFor = now - Number(room.lastActivityAt || 0);

        if (!hasActiveConnections && idleFor >= ROOM_INACTIVITY_MS) {
            rooms.delete(roomCode);
        }
    });
}

function normalizeStudentName(input) {
    if (typeof input !== "string") {
        return "";
    }

    return input.trim().slice(0, 40);
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

function getSafeCompletedExercises(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }

    return Math.max(0, Math.floor(parsed));
}

function normalizeCompletedExerciseNumbers(value, totalExercises) {
    if (!Array.isArray(value)) {
        return [];
    }

    const maxExercise = Math.max(0, Math.floor(Number(totalExercises) || 0));
    const unique = new Set();

    value.forEach((entry) => {
        const parsed = Math.max(0, Math.floor(Number(entry) || 0));
        if (parsed <= 0) {
            return;
        }

        if (maxExercise > 0 && parsed > maxExercise) {
            return;
        }

        unique.add(parsed);
    });

    return Array.from(unique).sort((a, b) => a - b);
}

function ensureStudentCompletedExerciseNumbers(student, room) {
    if (!student) {
        return [];
    }

    const maxExercise = room ? Math.max(0, Math.floor(Number(room.totalExercises) || 0)) : 0;
    const hasExplicitExerciseNumbers = Array.isArray(student.completedExerciseNumbers);
    let completedNumbers = normalizeCompletedExerciseNumbers(student.completedExerciseNumbers, maxExercise);

    if (!hasExplicitExerciseNumbers && !completedNumbers.length) {
        const count = getSafeCompletedExercises(student.completedExercises);
        const cappedCount = maxExercise > 0 ? Math.min(count, maxExercise) : count;
        if (cappedCount > 0) {
            completedNumbers = Array.from({ length: cappedCount }, (_unused, index) => index + 1);
        }
    }

    student.completedExerciseNumbers = completedNumbers;
    student.completedExercises = completedNumbers.length;
    return completedNumbers;
}

function syncStudentReadyWithExercises(student, room) {
    if (!student || !room) {
        return;
    }

    const completedNumbers = ensureStudentCompletedExerciseNumbers(student, room);
    const completedCount = completedNumbers.length;

    if (room.totalExercises > 0) {
        student.ready = completedCount >= room.totalExercises;
    }
}

function buildState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) {
        return {
            roomCode,
            students: [],
            totalCount: 0,
            readyCount: 0,
            totalExercises: 0,
            requireName: false,
            enableHelpButton: false,
            completedExercises: 0,
            updatedAt: Date.now(),
        };
    }

    const studentList = Array.from(room.students.values()).map((student) => {
        const completedExerciseNumbers = ensureStudentCompletedExerciseNumbers(student, room);
        const completedExercises = completedExerciseNumbers.length;

        const derivedReady = room.totalExercises > 0
            ? completedExercises >= room.totalExercises
            : Boolean(student.ready);

        // Keep internal room state aligned with derived state.
        student.ready = derivedReady;

        return {
            id: student.id,
            name: student.name,
            ready: derivedReady,
            needsHelp: room.enableHelpButton ? Boolean(student.needsHelp) : false,
            completedExercises,
            completedExerciseNumbers: completedExerciseNumbers.slice(),
            connected: room.connectedStudentSockets.has(student.id),
            updatedAt: student.updatedAt,
        };
    });

    studentList.sort((a, b) => a.updatedAt - b.updatedAt);

    const readyCount = studentList.filter((student) => student.ready).length;
    const completedExercises = studentList.reduce((sum, student) => sum + (student.completedExercises || 0), 0);

    return {
        roomCode,
        students: studentList,
        totalCount: studentList.length,
        readyCount,
        totalExercises: room.totalExercises,
        requireName: room.requireName,
        enableHelpButton: Boolean(room.enableHelpButton),
        completedExercises,
        updatedAt: Date.now(),
    };
}

function broadcastState(roomCode) {
    const room = rooms.get(roomCode);
    touchRoom(room);
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

app.get("/readyfreddy", (_req, res) => {
    res.redirect("/");
});

app.get("/teacher", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "teacher.html"));
});

app.get("/embed-exercise", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "embed-exercise.html"));
});

app.get("/embed-help", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "embed-help.html"));
});

app.get("/embed-name", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "embed-name.html"));
});

app.get("/exercise-test", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "exercise-test.html"));
});

app.get("/excercise-test", (_req, res) => {
    res.redirect("/exercise-test");
});

io.on("connection", (socket) => {
    const role = socket.handshake.auth && socket.handshake.auth.role;

    if (role === "teacher") {
        const requestedCode = normalizeRoomCode(socket.handshake.auth.roomCode);
        let roomCode = requestedCode;

        if (roomCode && !rooms.has(roomCode)) {
            rooms.set(roomCode, createRoom());
        }

        if (!roomCode) {
            roomCode = generateRoomCode();
            rooms.set(roomCode, createRoom());
        }

        let room = rooms.get(roomCode);
        room.teacherSockets.add(socket.id);
        touchRoom(room);

        socket.data.roomCode = roomCode;
        socket.join(`room:${roomCode}`);
        socket.emit("teacher:room-assigned", roomCode);
        socket.emit("state:update", buildState(roomCode));

        function switchTeacherRoom(nextRoomCode) {
            const normalizedNextCode = normalizeRoomCode(nextRoomCode);
            if (!normalizedNextCode || !rooms.has(normalizedNextCode)) {
                socket.emit("teacher:session-switch-error", "Session not found");
                return false;
            }

            if (normalizedNextCode === roomCode) {
                socket.emit("teacher:room-assigned", roomCode);
                socket.emit("state:update", buildState(roomCode));
                return true;
            }

            room.teacherSockets.delete(socket.id);
            touchRoom(room);
            socket.leave(`room:${roomCode}`);

            roomCode = normalizedNextCode;
            room = rooms.get(roomCode);
            room.teacherSockets.add(socket.id);
            touchRoom(room);
            socket.data.roomCode = roomCode;
            socket.join(`room:${roomCode}`);
            socket.emit("teacher:room-assigned", roomCode);
            socket.emit("state:update", buildState(roomCode));
            return true;
        }

        socket.on("teacher:new-session", () => {
            const oldRoomCode = roomCode;
            const oldRoom = room;

            oldRoom.teacherSockets.delete(socket.id);

            oldRoom.connectedStudentSockets.forEach((studentSocketId) => {
                const studentSocket = io.sockets.sockets.get(studentSocketId);
                if (studentSocket) {
                    studentSocket.emit("auth:error", "Session ended. Ask your teacher for the new class code.");
                    studentSocket.disconnect(true);
                }
            });

            rooms.delete(oldRoomCode);
            socket.leave(`room:${oldRoomCode}`);

            roomCode = generateRoomCode();
            room = createRoom();
            room.teacherSockets.add(socket.id);
            touchRoom(room);
            rooms.set(roomCode, room);

            socket.data.roomCode = roomCode;
            socket.join(`room:${roomCode}`);
            socket.emit("teacher:room-assigned", roomCode);
            socket.emit("state:update", buildState(roomCode));
        });

        socket.on("teacher:create-custom-session", () => {
            const customRoomCode = generateRoomCode();
            rooms.set(customRoomCode, createRoom());
            switchTeacherRoom(customRoomCode);
        });

        socket.on("teacher:switch-session", (payload) => {
            const targetRoomCode = normalizeRoomCode(payload && payload.roomCode);
            const createIfMissing = Boolean(payload && payload.createIfMissing);

            if (createIfMissing && targetRoomCode && !rooms.has(targetRoomCode)) {
                rooms.set(targetRoomCode, createRoom());
            }

            switchTeacherRoom(targetRoomCode);
        });

        socket.on("teacher:set-total-exercises", (payload) => {
            const amount = Number(payload && payload.amount);
            if (!Number.isFinite(amount)) {
                return;
            }

            room.totalExercises = Math.max(0, Math.floor(amount));

            room.students.forEach((student) => {
                let changed = false;
                const previousCompletedCount = getSafeCompletedExercises(student.completedExercises);
                const previousCompletedNumbers = normalizeCompletedExerciseNumbers(
                    student.completedExerciseNumbers,
                    0
                );
                const completedExerciseNumbers = ensureStudentCompletedExerciseNumbers(student, room);
                if (
                    completedExerciseNumbers.length !== previousCompletedCount ||
                    completedExerciseNumbers.join(",") !== previousCompletedNumbers.join(",")
                ) {
                    changed = true;
                }

                const wasReady = student.ready;
                syncStudentReadyWithExercises(student, room);
                if (student.ready !== wasReady) {
                    changed = true;
                }

                if (changed) {
                    student.updatedAt = Date.now();
                }
            });

            broadcastState(roomCode);
        });

        socket.on("teacher:set-require-name", (payload) => {
            room.requireName = Boolean(payload && payload.requireName);
            broadcastState(roomCode);
        });

        socket.on("teacher:set-enable-help-button", (payload) => {
            const enableHelpButton = Boolean(payload && payload.enableHelpButton);
            room.enableHelpButton = enableHelpButton;

            if (!enableHelpButton) {
                room.students.forEach((student) => {
                    if (student.needsHelp) {
                        student.needsHelp = false;
                        student.updatedAt = Date.now();
                    }
                });
            }

            broadcastState(roomCode);
        });

        socket.on("teacher:reset-session-progress", () => {
            room.connectedStudentSockets.forEach((studentSocketId) => {
                const studentSocket = io.sockets.sockets.get(studentSocketId);
                if (studentSocket) {
                    studentSocket.emit("auth:error", "Session was reset. Please rejoin with your class code.");
                    studentSocket.disconnect(true);
                }
            });

            room.students.forEach((student) => {
                const hadProgress = getSafeCompletedExercises(student.completedExercises) > 0
                    || (Array.isArray(student.completedExerciseNumbers) && student.completedExerciseNumbers.length > 0)
                    || Boolean(student.ready)
                    || Boolean(student.needsHelp);

                student.completedExercises = 0;
                student.completedExerciseNumbers = [];
                student.ready = false;
                student.needsHelp = false;

                if (hadProgress) {
                    student.updatedAt = Date.now();
                }
            });

            room.students.clear();
            room.connectedStudentSockets.clear();
            broadcastState(roomCode);
        });

        socket.on("disconnect", () => {
            room.teacherSockets.delete(socket.id);
            touchRoom(room);
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
        const incomingName = normalizeStudentName(socket.handshake.auth.name);
        touchRoom(room);

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
                name: incomingName,
                ready: false,
                needsHelp: false,
                completedExercises: 0,
                completedExerciseNumbers: [],
                updatedAt: Date.now(),
            });
        } else if (incomingName) {
            const existingStudent = room.students.get(sessionId);
            existingStudent.name = incomingName;
            existingStudent.updatedAt = Date.now();
        }

        syncStudentReadyWithExercises(room.students.get(sessionId), room);

        socket.emit("session:assigned", sessionId);
        socket.emit("state:update", buildState(roomCode));
        broadcastState(roomCode);

        socket.on("student:set-ready", (payload) => {
            const student = room.students.get(sessionId);
            if (!student) {
                return;
            }

            if (room.totalExercises > 0) {
                syncStudentReadyWithExercises(student, room);
                broadcastState(roomCode);
                return;
            }

            if (room.requireName && !student.name) {
                return;
            }

            student.ready = Boolean(payload && payload.ready);
            student.updatedAt = Date.now();
            broadcastState(roomCode);
        });

        socket.on("student:set-help", (payload) => {
            const student = room.students.get(sessionId);
            if (!student) {
                return;
            }

            if (!room.enableHelpButton) {
                student.needsHelp = false;
                broadcastState(roomCode);
                return;
            }

            student.needsHelp = Boolean(payload && payload.needsHelp);
            student.updatedAt = Date.now();
            broadcastState(roomCode);
        });

        socket.on("student:complete-exercise", () => {
            const student = room.students.get(sessionId);
            if (!student) {
                return;
            }

            if (room.requireName && !student.name) {
                return;
            }

            const completedExerciseNumbers = ensureStudentCompletedExerciseNumbers(student, room);
            let nextExerciseNumber = 1;
            while (completedExerciseNumbers.includes(nextExerciseNumber)) {
                nextExerciseNumber += 1;
            }

            if (room.totalExercises > 0 && nextExerciseNumber > room.totalExercises) {
                return;
            }

            completedExerciseNumbers.push(nextExerciseNumber);
            completedExerciseNumbers.sort((a, b) => a - b);
            student.completedExerciseNumbers = completedExerciseNumbers;
            syncStudentReadyWithExercises(student, room);
            student.updatedAt = Date.now();
            broadcastState(roomCode);
        });

        socket.on("student:complete-to-exercise", (payload) => {
            const student = room.students.get(sessionId);
            if (!student) {
                return;
            }

            if (room.requireName && !student.name) {
                return;
            }

            const requestedExerciseNumber = Math.max(0, Math.floor(Number(payload && payload.exerciseNumber) || 0));
            if (requestedExerciseNumber <= 0) {
                return;
            }

            const completedExerciseNumbers = ensureStudentCompletedExerciseNumbers(student, room);
            const boundedExerciseNumber = room.totalExercises > 0
                ? Math.min(requestedExerciseNumber, room.totalExercises)
                : requestedExerciseNumber;

            if (completedExerciseNumbers.includes(boundedExerciseNumber)) {
                return;
            }

            completedExerciseNumbers.push(boundedExerciseNumber);
            completedExerciseNumbers.sort((a, b) => a - b);
            student.completedExerciseNumbers = completedExerciseNumbers;
            syncStudentReadyWithExercises(student, room);
            student.updatedAt = Date.now();
            broadcastState(roomCode);
        });

        socket.on("student:set-completed-exercises", (payload) => {
            const student = room.students.get(sessionId);
            if (!student) {
                return;
            }

            if (room.requireName && !student.name) {
                return;
            }

            const requestedCompleted = Math.max(0, Math.floor(Number(payload && payload.completedExercises) || 0));
            const cappedCompleted = room.totalExercises > 0
                ? Math.min(requestedCompleted, room.totalExercises)
                : requestedCompleted;
            const completedExerciseNumbers = ensureStudentCompletedExerciseNumbers(student, room);

            if (completedExerciseNumbers.length === cappedCompleted) {
                return;
            }

            student.completedExerciseNumbers = Array.from({ length: cappedCompleted }, (_unused, index) => index + 1);
            syncStudentReadyWithExercises(student, room);
            student.updatedAt = Date.now();
            broadcastState(roomCode);
        });

        socket.on("student:set-exercise-complete", (payload) => {
            const student = room.students.get(sessionId);
            if (!student) {
                return;
            }

            if (room.requireName && !student.name) {
                return;
            }

            const requestedExerciseNumber = Math.max(0, Math.floor(Number(payload && payload.exerciseNumber) || 0));
            if (requestedExerciseNumber <= 0) {
                return;
            }

            const boundedExerciseNumber = room.totalExercises > 0
                ? Math.min(requestedExerciseNumber, room.totalExercises)
                : requestedExerciseNumber;
            const markCompleted = Boolean(payload && payload.completed);
            const completedExerciseNumbers = ensureStudentCompletedExerciseNumbers(student, room);
            const hasExercise = completedExerciseNumbers.includes(boundedExerciseNumber);

            if (markCompleted && hasExercise) {
                return;
            }

            if (!markCompleted && !hasExercise) {
                return;
            }

            student.completedExerciseNumbers = markCompleted
                ? completedExerciseNumbers.concat([boundedExerciseNumber]).sort((a, b) => a - b)
                : completedExerciseNumbers.filter((entry) => entry !== boundedExerciseNumber);
            syncStudentReadyWithExercises(student, room);
            student.updatedAt = Date.now();
            broadcastState(roomCode);
        });

        socket.on("student:set-name", (payload) => {
            const student = room.students.get(sessionId);
            if (!student) {
                return;
            }

            const name = normalizeStudentName(payload && payload.name);
            if (!name) {
                return;
            }

            student.name = name;
            student.updatedAt = Date.now();
            broadcastState(roomCode);
        });

        socket.on("disconnect", () => {
            const mappedSocketId = room.connectedStudentSockets.get(sessionId);
            if (mappedSocketId === socket.id) {
                room.connectedStudentSockets.delete(sessionId);
            }
            touchRoom(room);
            broadcastState(roomCode);
        });

        return;
    }

    socket.emit("auth:error", "Unknown role");
    socket.disconnect(true);
});

setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL_MS);

server.listen(PORT, () => {
    console.log(`ReadyFreddy running on http://localhost:${PORT}`);
});
