const SESSION_KEY = "readyfreddy.sessionId";
const ROOM_CODE_KEY = "readyfreddy.roomCode";

let sessionId = localStorage.getItem(SESSION_KEY) || "";
let roomCode = localStorage.getItem(ROOM_CODE_KEY) || "";
let currentReady = false;
let socket;

const joinSection = document.getElementById("joinSection");
const studentControls = document.getElementById("studentControls");
const roomCodeInput = document.getElementById("roomCodeInput");
const joinBtn = document.getElementById("joinBtn");
const joinError = document.getElementById("joinError");
const activeRoomCode = document.getElementById("activeRoomCode");

const button = document.getElementById("readyButton");
const statusText = document.getElementById("statusText");
const counterText = document.getElementById("counterText");

function normalizeRoomCode(value) {
    return String(value || "").trim().toUpperCase();
}

function showControls() {
    joinSection.classList.add("hidden");
    studentControls.classList.remove("hidden");
    activeRoomCode.textContent = roomCode || "------";
}

function showJoin() {
    joinSection.classList.remove("hidden");
    studentControls.classList.add("hidden");
}

function renderButton() {
    button.classList.toggle("ready", currentReady);
    button.classList.toggle("not-ready", !currentReady);
    button.textContent = currentReady ? "Ready" : "Not ready";
    button.setAttribute("aria-pressed", String(currentReady));
    statusText.textContent = currentReady ? "You are marked ready" : "You are marked not ready";
}

button.addEventListener("click", () => {
    currentReady = !currentReady;
    renderButton();
    if (socket && socket.connected) {
        socket.emit("student:set-ready", { ready: currentReady });
    }
});

function connectStudent() {
    joinError.textContent = "";
    roomCode = normalizeRoomCode(roomCodeInput.value);

    if (!roomCode) {
        joinError.textContent = "Enter a class code";
        return;
    }

    roomCodeInput.value = roomCode;

    if (socket) {
        socket.disconnect();
    }

    socket = io({
        auth: {
            role: "student",
            sessionId,
            roomCode,
        },
    });

    socket.on("connect", () => {
        showControls();
        localStorage.setItem(ROOM_CODE_KEY, roomCode);
        statusText.textContent = "Connected";
    });

    socket.on("disconnect", () => {
        statusText.textContent = "Connection lost, retrying...";
    });

    socket.on("session:assigned", (id) => {
        sessionId = id;
        localStorage.setItem(SESSION_KEY, id);
    });

    socket.on("state:update", (state) => {
        counterText.textContent = `${state.readyCount} / ${state.totalCount} ready`;

        if (!sessionId) {
            return;
        }

        const me = state.students.find((student) => student.id === sessionId);
        if (!me) {
            return;
        }

        currentReady = Boolean(me.ready);
        renderButton();
    });

    socket.on("auth:error", (msg) => {
        showJoin();
        joinError.textContent = msg || "Invalid class code";
        statusText.textContent = "Not connected";
        localStorage.removeItem(ROOM_CODE_KEY);
    });
}

joinBtn.addEventListener("click", connectStudent);
roomCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        connectStudent();
    }
});

if (roomCode) {
    roomCodeInput.value = roomCode;
}

renderButton();
showJoin();
