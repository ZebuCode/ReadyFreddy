const params = new URLSearchParams(window.location.search);
const roomCode = String(params.get("class") || "").trim().toUpperCase();

const embedNameRow = document.getElementById("embedNameRow");
const embedNameInput = document.getElementById("embedNameInput");
const embedSaveNameBtn = document.getElementById("embedSaveNameBtn");
const embedOfflineState = document.getElementById("embedOfflineState");
const embedNameError = document.getElementById("embedNameError");

const SESSION_STORAGE_PREFIX = "readyfreddy.embed.session.";
const NAME_STORAGE_PREFIX = "readyfreddy.embed.name.";

let socket;
let sessionId = "";
let studentName = "";
let hasReceivedState = false;
let isOffline = false;

function setError(message) {
    embedNameError.textContent = message;
    embedNameError.classList.toggle("hidden", !message);
}

function normalizeName(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 32);
}

function isSessionResetMessage(message) {
    return String(message || "").toLowerCase().includes("session was reset");
}

function clearStoredSessionState() {
    localStorage.removeItem(`${SESSION_STORAGE_PREFIX}${roomCode}`);
    localStorage.removeItem(`${NAME_STORAGE_PREFIX}${roomCode}`);
    sessionId = "";
    studentName = "";
}

function reconnectAfterReset() {
    hasReceivedState = false;
    if (socket) {
        socket.disconnect();
    }
    connect();
}

function setOfflineState(offline) {
    isOffline = Boolean(offline);
    embedOfflineState.classList.toggle("hidden", !isOffline);
    embedNameRow.classList.toggle("hidden", isOffline);

    if (isOffline) {
        embedNameInput.disabled = true;
        embedSaveNameBtn.disabled = true;
    }
}

function setSavedState(saved) {
    if (isOffline) {
        return;
    }

    embedNameInput.disabled = saved;
    embedSaveNameBtn.disabled = saved;
    embedSaveNameBtn.classList.toggle("hidden", saved);
    embedNameRow.classList.remove("hidden");
}

function saveName() {
    if (!socket || !socket.connected) {
        setError("");
        return;
    }

    if (!hasReceivedState) {
        setError("");
        return;
    }

    const enteredName = normalizeName(embedNameInput.value);
    if (!enteredName) {
        setError("");
        embedNameInput.focus();
        return;
    }

    studentName = enteredName;
    localStorage.setItem(`${NAME_STORAGE_PREFIX}${roomCode}`, studentName);
    socket.emit("student:set-name", { name: studentName });
    setError("");
    setSavedState(true);
}

function initStoredData() {
    sessionId = String(localStorage.getItem(`${SESSION_STORAGE_PREFIX}${roomCode}`) || "");
    studentName = normalizeName(localStorage.getItem(`${NAME_STORAGE_PREFIX}${roomCode}`) || "");
    if (studentName) {
        embedNameInput.value = studentName;
        setSavedState(true);
    } else {
        setSavedState(false);
    }
}

function connect() {
    socket = io({
        auth: {
            role: "student",
            roomCode,
            sessionId,
            name: studentName,
        },
    });

    socket.on("session:assigned", (id) => {
        sessionId = String(id || "");
        localStorage.setItem(`${SESSION_STORAGE_PREFIX}${roomCode}`, sessionId);
    });

    socket.on("connect", () => {
        setOfflineState(false);
        setError("");
    });

    socket.on("state:update", (state) => {
        setOfflineState(false);
        hasReceivedState = true;
        const currentStudent = state.students.find((student) => student.id === sessionId);
        const serverName = normalizeName(currentStudent && currentStudent.name ? currentStudent.name : "");

        if (serverName) {
            studentName = serverName;
            localStorage.setItem(`${NAME_STORAGE_PREFIX}${roomCode}`, studentName);
            embedNameInput.value = studentName;
            setSavedState(true);
        } else if (!studentName) {
            setSavedState(false);
        }
    });

    socket.on("auth:error", (message) => {
        if (isSessionResetMessage(message)) {
            clearStoredSessionState();
            embedNameInput.value = "";
            setError("");
            setOfflineState(false);
            setSavedState(false);
            reconnectAfterReset();
            return;
        }

        setError("");
        setOfflineState(true);
    });
}

embedSaveNameBtn.addEventListener("click", () => {
    saveName();
});

embedNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        saveName();
    }
});

if (!roomCode) {
    setError("");
    setOfflineState(true);
} else {
    initStoredData();
    connect();
}
