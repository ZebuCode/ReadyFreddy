const params = new URLSearchParams(window.location.search);
const roomCode = String(params.get("class") || "").trim().toUpperCase();

const embedHelpBtn = document.getElementById("embedHelpBtn");
const embedHelpError = document.getElementById("embedHelpError");

const SESSION_STORAGE_PREFIX = "readyfreddy.embed.session.";
const NAME_STORAGE_PREFIX = "readyfreddy.embed.name.";

let socket;
let sessionId = "";
let studentName = "";
let enableHelpButton = false;
let currentNeedsHelp = false;
let hasReceivedState = false;
let hasSavedName = false;

function setError(message) {
    embedHelpError.textContent = message;
    embedHelpError.classList.toggle("hidden", !message);
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

function renderHelpButton() {
    embedHelpBtn.classList.toggle("active", currentNeedsHelp);
    embedHelpBtn.setAttribute("aria-pressed", String(currentNeedsHelp));
    embedHelpBtn.setAttribute("aria-label", currentNeedsHelp ? "Needs help active" : "Need help");
    embedHelpBtn.title = currentNeedsHelp ? "Needs help active" : "Need help";
    embedHelpBtn.disabled = !hasReceivedState || !enableHelpButton || !hasSavedName;
}

function initStoredData() {
    sessionId = String(localStorage.getItem(`${SESSION_STORAGE_PREFIX}${roomCode}`) || "");
    studentName = normalizeName(localStorage.getItem(`${NAME_STORAGE_PREFIX}${roomCode}`) || "");
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

    socket.on("state:update", (state) => {
        hasReceivedState = true;
        enableHelpButton = Boolean(state.enableHelpButton);
        const currentStudent = state.students.find((student) => student.id === sessionId);
        const serverName = normalizeName(currentStudent && currentStudent.name ? currentStudent.name : "");
        if (serverName) {
            studentName = serverName;
            localStorage.setItem(`${NAME_STORAGE_PREFIX}${roomCode}`, studentName);
        }
        hasSavedName = Boolean(serverName);
        currentNeedsHelp = enableHelpButton && Boolean(currentStudent && currentStudent.needsHelp);
        renderHelpButton();
    });

    socket.on("auth:error", (message) => {
        if (isSessionResetMessage(message)) {
            clearStoredSessionState();
        }

        setError("");
        embedHelpBtn.disabled = true;
    });
}

embedHelpBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
        setError("Not connected. Try again in a moment.");
        return;
    }

    if (!hasReceivedState || !enableHelpButton) {
        return;
    }

    if (!hasSavedName) {
        return;
    }

    setError("");
    currentNeedsHelp = !currentNeedsHelp;
    renderHelpButton();
    socket.emit("student:set-help", { needsHelp: currentNeedsHelp });
});

if (!roomCode) {
    embedHelpBtn.disabled = true;
    setError("Missing class identifier.");
} else {
    initStoredData();
    connect();
}
