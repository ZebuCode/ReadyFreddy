const SESSION_KEY = "readyfreddy.sessionId";
const ROOM_CODE_KEY = "readyfreddy.roomCode";
const NAME_KEY = "readyfreddy.studentName";
const CHECKMARK_DRAW_MS = 260;

let sessionId = localStorage.getItem(SESSION_KEY) || "";
let roomCode = localStorage.getItem(ROOM_CODE_KEY) || "";
let studentName = localStorage.getItem(NAME_KEY) || "";
let currentReady = false;
let socket;

const joinSection = document.getElementById("joinSection");
const studentControls = document.getElementById("studentControls");
const roomCodeInput = document.getElementById("roomCodeInput");
const joinBtn = document.getElementById("joinBtn");
const joinError = document.getElementById("joinError");
const activeRoomCode = document.getElementById("activeRoomCode");

const readyToggleRow = document.getElementById("readyToggleRow");
const readyCheckbox = document.getElementById("readyCheckbox");
const readyCheckboxLabel = document.querySelector(".ready-checkbox-label");
const button = document.getElementById("readyButton");
const previousExerciseBtn = document.getElementById("previousExerciseBtn");
const statusText = document.getElementById("statusText");
const counterText = document.getElementById("counterText");
const exerciseProgressText = document.getElementById("exerciseProgressText");
const nameModal = document.getElementById("nameModal");
const studentNameInput = document.getElementById("studentNameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const nameError = document.getElementById("nameError");

let currentExerciseDone = 0;
let currentTotalExercises = 0;
let requireName = false;
let hasName = false;
let hasSubmittedNameThisVisit = false;
let isCompletingExercise = false;
let completeExerciseTimer = null;

function clearExerciseCompletionTimer() {
    if (completeExerciseTimer) {
        clearTimeout(completeExerciseTimer);
        completeExerciseTimer = null;
    }
}

function normalizeRoomCode(value) {
    return String(value || "").trim().toUpperCase();
}

function normalizeName(value) {
    return String(value || "").trim().slice(0, 40);
}

function openNameModal() {
    nameModal.classList.remove("hidden");
    studentNameInput.value = studentName;
    nameError.textContent = "";
    studentNameInput.focus();
}

function closeNameModal() {
    nameModal.classList.add("hidden");
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
    if (requireName && !hasName) {
        readyToggleRow.classList.remove("completed");
        readyToggleRow.classList.remove("hidden");
        readyCheckbox.checked = false;
        readyCheckbox.disabled = true;
        readyCheckboxLabel.textContent = "Ready?";
        readyCheckboxLabel.classList.remove("checked");
        button.classList.add("hidden");
        button.disabled = true;
        previousExerciseBtn.classList.add("hidden");
        previousExerciseBtn.classList.remove("reserved-space");
        statusText.textContent = "Set your name to continue";
        return;
    }

    if (currentTotalExercises > 0) {
        const allDone = currentExerciseDone >= currentTotalExercises;
        const nextExerciseNumber = Math.min(currentExerciseDone + 1, currentTotalExercises);
        const showAnimatedCheck = isCompletingExercise && !allDone;
        const showReadyState = allDone || showAnimatedCheck;

        readyToggleRow.classList.toggle("completed", allDone);
        readyToggleRow.classList.remove("hidden");
        readyCheckbox.checked = showReadyState;
        readyCheckbox.disabled = allDone;
        readyCheckboxLabel.textContent = allDone ? "ALL DONE" : (showReadyState ? "Ready!" : "Ready?");
        readyCheckboxLabel.classList.toggle("checked", showReadyState);

        button.classList.add("hidden");
        button.disabled = true;
        statusText.textContent = `Completed ${currentExerciseDone} / ${currentTotalExercises} exercises`;
        previousExerciseBtn.classList.remove("hidden");
        if (currentExerciseDone > 0) {
            previousExerciseBtn.classList.remove("reserved-space");
            previousExerciseBtn.disabled = false;
        } else {
            previousExerciseBtn.classList.add("reserved-space");
            previousExerciseBtn.disabled = true;
        }
        return;
    }

    const isReadyChecked = Boolean(currentReady);
    readyToggleRow.classList.remove("completed");
    readyToggleRow.classList.remove("hidden");
    readyCheckbox.checked = currentReady;
    readyCheckbox.disabled = false;
    readyCheckboxLabel.textContent = isReadyChecked ? "Ready!" : "Ready?";
    readyCheckboxLabel.classList.toggle("checked", isReadyChecked);
    button.classList.add("hidden");
    button.disabled = false;
    statusText.textContent = currentReady ? "You are marked ready" : "You are marked not ready";
    previousExerciseBtn.classList.add("hidden");
    previousExerciseBtn.classList.remove("reserved-space");
}

button.addEventListener("click", () => {
    if (currentTotalExercises > 0) {
        if (socket && socket.connected && currentExerciseDone < currentTotalExercises) {
            socket.emit("student:complete-exercise");
        }
        return;
    }

});

readyCheckbox.addEventListener("change", () => {
    if (currentTotalExercises > 0) {
        if (!readyCheckbox.checked) {
            renderButton();
            return;
        }

        if (isCompletingExercise || currentExerciseDone >= currentTotalExercises) {
            renderButton();
            return;
        }

        isCompletingExercise = true;
        renderButton();

        clearExerciseCompletionTimer();
        completeExerciseTimer = setTimeout(() => {
            completeExerciseTimer = null;
            isCompletingExercise = false;

            if (socket && socket.connected) {
                socket.emit("student:complete-exercise");
            }

            renderButton();
        }, CHECKMARK_DRAW_MS);

        if (!socket || !socket.connected) {
            isCompletingExercise = false;
            clearExerciseCompletionTimer();
            renderButton();
        }

        return;
    }

    currentReady = Boolean(readyCheckbox.checked);
    renderButton();
    if (socket && socket.connected) {
        socket.emit("student:set-ready", { ready: currentReady });
    }
});

previousExerciseBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
        return;
    }

    if (currentTotalExercises <= 0 || currentExerciseDone <= 0) {
        return;
    }

    socket.emit("student:undo-exercise");
});

function connectStudent() {
    joinError.textContent = "";
    roomCode = normalizeRoomCode(roomCodeInput.value);
    hasSubmittedNameThisVisit = false;

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
            name: "",
        },
    });

    socket.on("connect", () => {
        showControls();
        localStorage.setItem(ROOM_CODE_KEY, roomCode);
        statusText.textContent = "Connected";
    });

    socket.on("disconnect", () => {
        isCompletingExercise = false;
        clearExerciseCompletionTimer();
        statusText.textContent = "Connection lost, retrying...";
    });

    socket.on("session:assigned", (id) => {
        sessionId = id;
        localStorage.setItem(SESSION_KEY, id);
    });

    socket.on("state:update", (state) => {
        counterText.textContent = `${state.readyCount} / ${state.totalCount} students are ready`;
        requireName = Boolean(state.requireName);

        if (!sessionId) {
            return;
        }

        const me = state.students.find((student) => student.id === sessionId);
        if (!me) {
            return;
        }

        const serverName = normalizeName(me.name);

        if (requireName) {
            if (!hasSubmittedNameThisVisit) {
                hasName = false;
                openNameModal();
            } else {
                studentName = serverName;
                hasName = Boolean(serverName);
                if (hasName) {
                    localStorage.setItem(NAME_KEY, studentName);
                    closeNameModal();
                }
            }
        } else {
            studentName = serverName;
            hasName = Boolean(serverName);
            closeNameModal();
        }

        currentReady = Boolean(me.ready);
        currentExerciseDone = Number(me.completedExercises || 0);
        currentTotalExercises = Number(state.totalExercises || 0);

        if (currentTotalExercises > 0) {
            const nextExerciseNumber = Math.min(currentExerciseDone + 1, currentTotalExercises);
            const stepNumber = currentExerciseDone >= currentTotalExercises ? currentTotalExercises : nextExerciseNumber;
            if (currentExerciseDone >= currentTotalExercises) {
                exerciseProgressText.textContent = `Current excercise: ${stepNumber} / ${currentTotalExercises}`;
                exerciseProgressText.classList.remove("hidden");
                exerciseProgressText.classList.add("keep-space-hidden");
            } else {
                exerciseProgressText.textContent = `Current excercise: ${stepNumber} / ${currentTotalExercises}`;
                exerciseProgressText.classList.remove("keep-space-hidden");
                exerciseProgressText.classList.remove("hidden");
            }
        } else {
            exerciseProgressText.classList.remove("keep-space-hidden");
            exerciseProgressText.classList.add("hidden");
        }

        renderButton();
    });

    socket.on("auth:error", (msg) => {
        showJoin();
        joinError.textContent = msg || "Invalid class code";
        statusText.textContent = "Not connected";
        localStorage.removeItem(ROOM_CODE_KEY);
    });
}

saveNameBtn.addEventListener("click", () => {
    const name = normalizeName(studentNameInput.value);
    if (!name) {
        nameError.textContent = "Please enter your name";
        return;
    }

    hasSubmittedNameThisVisit = true;
    hasName = true;
    studentName = name;
    localStorage.setItem(NAME_KEY, name);
    nameError.textContent = "";
    closeNameModal();
    renderButton();

    if (socket && socket.connected) {
        socket.emit("student:set-name", { name });
    }
});

studentNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        saveNameBtn.click();
    }
});

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
