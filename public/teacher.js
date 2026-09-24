const ROOM_CODE_KEY = "readyfreddy.teacherRoomCode";

const roomCodeText = document.getElementById("roomCode");
const teacherStatus = document.getElementById("teacherStatus");
const readyCount = document.getElementById("readyCount");
const studentList = document.getElementById("studentList");
const resetBtn = document.getElementById("resetBtn");
const resetModal = document.getElementById("resetModal");
const cancelResetBtn = document.getElementById("cancelResetBtn");
const confirmResetBtn = document.getElementById("confirmResetBtn");

let socket;

function openResetModal() {
    resetModal.classList.remove("hidden");
    confirmResetBtn.focus();
}

function closeResetModal() {
    resetModal.classList.add("hidden");
}

function renderState(state) {
    readyCount.textContent = `${state.readyCount} / ${state.totalCount}`;

    studentList.innerHTML = "";

    if (!state.students.length) {
        const empty = document.createElement("li");
        empty.textContent = "No students connected yet.";
        studentList.appendChild(empty);
        return;
    }

    state.students.forEach((student, index) => {
        const item = document.createElement("li");

        const label = document.createElement("span");
        label.textContent = `Student ${index + 1}${student.connected ? "" : " (offline)"}`;

        const badge = document.createElement("span");
        badge.className = `badge ${student.ready ? "ready" : "not-ready"}`;
        badge.textContent = student.ready ? "Ready" : "Not ready";

        item.appendChild(label);
        item.appendChild(badge);
        studentList.appendChild(item);
    });
}

function initConnection() {
    const rememberedCode = String(localStorage.getItem(ROOM_CODE_KEY) || "").trim().toUpperCase();

    socket = io({
        auth: {
            role: "teacher",
            roomCode: rememberedCode,
        },
    });

    socket.on("connect", () => {
        teacherStatus.textContent = "Connected";
    });

    socket.on("teacher:room-assigned", (roomCode) => {
        roomCodeText.textContent = roomCode;
        localStorage.setItem(ROOM_CODE_KEY, roomCode);
    });

    socket.on("connect_error", () => {
        teacherStatus.textContent = "Could not connect";
    });

    socket.on("state:update", (state) => {
        renderState(state);
    });

    socket.on("disconnect", () => {
        teacherStatus.textContent = "Disconnected, retrying...";
    });

    resetBtn.onclick = () => {
        if (!socket || !socket.connected) {
            return;
        }

        openResetModal();
    };
}

cancelResetBtn.addEventListener("click", closeResetModal);

confirmResetBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
        closeResetModal();
        return;
    }

    socket.emit("teacher:reset");
    closeResetModal();
});

resetModal.addEventListener("click", (event) => {
    if (event.target === resetModal) {
        closeResetModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !resetModal.classList.contains("hidden")) {
        closeResetModal();
    }
});

initConnection();
