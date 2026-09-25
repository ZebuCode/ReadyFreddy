const ROOM_CODE_KEY = "readyfreddy.teacherRoomCode";

const roomCodeText = document.getElementById("roomCode");
const teacherStatus = document.getElementById("teacherStatus");
const readyCount = document.getElementById("readyCount");
const studentList = document.getElementById("studentList");
const resetBtn = document.getElementById("resetBtn");
const configureExercisesBtn = document.getElementById("configureExercisesBtn");
const exerciseAmountInput = document.getElementById("exerciseAmount");
const requireNameCheckbox = document.getElementById("requireNameCheckbox");
const enableHelpButtonCheckbox = document.getElementById("enableHelpButtonCheckbox");
const enableHelpButtonRow = enableHelpButtonCheckbox.closest("label");
const removeExerciseBtn = document.getElementById("removeExerciseBtn");
const cancelExerciseBtn = document.getElementById("cancelExerciseBtn");
const saveExerciseBtn = document.getElementById("saveExerciseBtn");
const exerciseSummary = document.getElementById("exerciseSummary");
const resetModal = document.getElementById("resetModal");
const exerciseModal = document.getElementById("exerciseModal");
const cancelResetBtn = document.getElementById("cancelResetBtn");
const confirmResetBtn = document.getElementById("confirmResetBtn");

let socket;
let roomCodeTooltip;

function ensureRoomCodeTooltip() {
    if (roomCodeTooltip) {
        return roomCodeTooltip;
    }

    const tooltip = document.createElement("div");
    tooltip.className = "cursor-tooltip";
    tooltip.textContent = roomCodeText.dataset.tooltip || "Click to copy";
    document.body.appendChild(tooltip);
    roomCodeTooltip = tooltip;
    return tooltip;
}

function showRoomCodeTooltip(event) {
    const tooltip = ensureRoomCodeTooltip();
    tooltip.classList.add("visible");
    moveRoomCodeTooltip(event);
}

function moveRoomCodeTooltip(event) {
    if (!roomCodeTooltip) {
        return;
    }

    roomCodeTooltip.style.left = `${event.clientX}px`;
    roomCodeTooltip.style.top = `${event.clientY}px`;
}

function hideRoomCodeTooltip() {
    if (!roomCodeTooltip) {
        return;
    }

    roomCodeTooltip.classList.remove("visible");
}

async function copyRoomCodeToClipboard() {
    const roomCode = String(roomCodeText.textContent || "").trim();
    if (!roomCode || roomCode === "------") {
        return;
    }

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(roomCode);
        } else {
            const tempInput = document.createElement("input");
            tempInput.value = roomCode;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand("copy");
            document.body.removeChild(tempInput);
        }

    } catch {
        // Keep copy interaction silent if clipboard access fails.
    }
}

function syncHelpCheckboxAvailability() {
    const requireName = Boolean(requireNameCheckbox.checked);

    enableHelpButtonCheckbox.disabled = !requireName;
    enableHelpButtonRow.classList.toggle("disabled-option", !requireName);

    if (!requireName) {
        enableHelpButtonCheckbox.checked = false;
    }
}

function openResetModal() {
    resetModal.classList.remove("hidden");
    confirmResetBtn.focus();
}

function closeResetModal() {
    resetModal.classList.add("hidden");
}

function openExerciseModal() {
    exerciseModal.classList.remove("hidden");
    exerciseAmountInput.focus();
}

function closeExerciseModal() {
    exerciseModal.classList.add("hidden");
}

function formatExerciseProgress(done, total) {
    if (total > 0) {
        return `${done} / ${total}`;
    }

    return `${done}`;
}

function renderState(state) {
    const totalExercises = Number(state.totalExercises || 0);
    const hasExercises = totalExercises > 0;

    readyCount.textContent = `${state.readyCount} / ${state.totalCount}`;
    exerciseAmountInput.value = String(totalExercises);
    requireNameCheckbox.checked = Boolean(state.requireName);
    enableHelpButtonCheckbox.checked = Boolean(state.enableHelpButton);
    syncHelpCheckboxAvailability();

    if (hasExercises) {
        exerciseSummary.textContent = `${state.completedExercises} / ${Math.max(0, totalExercises * state.totalCount)} exercises done`;
        exerciseSummary.classList.remove("hidden");
    } else {
        exerciseSummary.classList.add("hidden");
    }

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
        const name = String(student.name || "").trim();
        label.textContent = `${name || `Student ${index + 1}`}${student.connected ? "" : " (offline)"}`;

        const right = document.createElement("div");
        right.className = "student-list-right";

        const badge = document.createElement("span");
        if (student.needsHelp) {
            badge.className = "badge help";
            badge.textContent = "needs help";
        } else {
            badge.className = `badge ${student.ready ? "ready" : "not-ready"}`;
            badge.textContent = student.ready ? "Ready" : "Not ready";
        }

        if (hasExercises) {
            const progress = document.createElement("span");
            progress.className = "badge progress";
            progress.textContent = `${formatExerciseProgress(student.completedExercises || 0, totalExercises)} exercises`;
            right.appendChild(progress);
        }

        right.appendChild(badge);
        item.appendChild(label);
        item.appendChild(right);
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

    configureExercisesBtn.onclick = () => {
        if (!socket || !socket.connected) {
            return;
        }

        openExerciseModal();
    };

    saveExerciseBtn.onclick = () => {
        if (!socket || !socket.connected) {
            return;
        }

        const amount = Math.max(0, Math.floor(Number(exerciseAmountInput.value) || 0));
        const requireName = Boolean(requireNameCheckbox.checked);
        const enableHelpButton = requireName && Boolean(enableHelpButtonCheckbox.checked);
        socket.emit("teacher:set-total-exercises", { amount });
        socket.emit("teacher:set-require-name", { requireName });
        socket.emit("teacher:set-enable-help-button", { enableHelpButton });
        closeExerciseModal();
    };
}

    requireNameCheckbox.addEventListener("change", syncHelpCheckboxAvailability);

cancelResetBtn.addEventListener("click", closeResetModal);
cancelExerciseBtn.addEventListener("click", closeExerciseModal);
removeExerciseBtn.addEventListener("click", () => {
    exerciseAmountInput.value = "0";
});

confirmResetBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
        closeResetModal();
        return;
    }

    socket.emit("teacher:new-session");
    closeResetModal();
});

resetModal.addEventListener("click", (event) => {
    if (event.target === resetModal) {
        closeResetModal();
    }
});

exerciseModal.addEventListener("click", (event) => {
    if (event.target === exerciseModal) {
        closeExerciseModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !resetModal.classList.contains("hidden")) {
        closeResetModal();
        return;
    }

    if (event.key === "Escape" && !exerciseModal.classList.contains("hidden")) {
        closeExerciseModal();
    }
});

roomCodeText.addEventListener("click", () => {
    copyRoomCodeToClipboard();
});

roomCodeText.addEventListener("mouseenter", (event) => {
    showRoomCodeTooltip(event);
});

roomCodeText.addEventListener("mousemove", (event) => {
    moveRoomCodeTooltip(event);
});

roomCodeText.addEventListener("mouseleave", () => {
    hideRoomCodeTooltip();
});

roomCodeText.addEventListener("blur", () => {
    hideRoomCodeTooltip();
});

initConnection();
