const params = new URLSearchParams(window.location.search);
const roomCode = String(params.get("class") || "").trim().toUpperCase();
const exerciseId = String(params.get("exercise") || "").trim();

const embedError = document.getElementById("embedError");
const embedNameRow = document.getElementById("embedNameRow");
const embedNameInput = document.getElementById("embedNameInput");
const embedSaveNameBtn = document.getElementById("embedSaveNameBtn");
const embedDoneRow = document.getElementById("embedDoneRow");
const embedDoneCheckbox = document.getElementById("embedDoneCheckbox");
const embedDoneLabel = document.getElementById("embedDoneLabel");

const SESSION_STORAGE_PREFIX = "readyfreddy.embed.session.";
const NAME_STORAGE_PREFIX = "readyfreddy.embed.name.";

let socket;
let sessionId = "";
let studentName = "";
let requiresName = false;
let isMarkedDone = false;
let hasReceivedState = false;
let isSubmitting = false;
let targetExerciseNumber = 1;
let pendingCheckedState = null;
let isBlockedByMissingName = false;

function setError(message) {
    embedError.textContent = message;
    embedError.classList.toggle("hidden", !message);
}

function setDoneState(done) {
    isMarkedDone = done;
    embedDoneCheckbox.checked = done;
    embedDoneCheckbox.disabled = !hasReceivedState || isSubmitting || isBlockedByMissingName;
    embedDoneLabel.textContent = done ? "Done" : "Ready?";
    embedDoneLabel.classList.toggle("checked", done);
    embedDoneRow.classList.toggle("completed", done);
}

function setNamePromptVisibility(show) {
    embedNameRow.classList.toggle("hidden", !show);
    embedSaveNameBtn.classList.toggle("hidden", !show);
    embedDoneRow.classList.toggle("hidden", show);
    if (show) {
        embedNameInput.focus();
    }
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

function inferTargetExerciseNumber() {
    const match = /-(\d+)$/.exec(exerciseId);
    if (match && match[1]) {
        const parsed = Math.max(1, Math.floor(Number(match[1]) || 1));
        targetExerciseNumber = parsed;
        return;
    }

    targetExerciseNumber = 1;
}

function initStoredData() {
    sessionId = String(localStorage.getItem(`${SESSION_STORAGE_PREFIX}${roomCode}`) || "");
    studentName = normalizeName(localStorage.getItem(`${NAME_STORAGE_PREFIX}${roomCode}`) || "");
    setDoneState(false);
}

function getCompletedExerciseNumbers(student) {
    if (!student || !Array.isArray(student.completedExerciseNumbers)) {
        return [];
    }

    const unique = new Set();
    student.completedExerciseNumbers.forEach((entry) => {
        const parsed = Math.max(0, Math.floor(Number(entry) || 0));
        if (parsed > 0) {
            unique.add(parsed);
        }
    });
    return Array.from(unique);
}

function updateStatusFromState(state) {
    hasReceivedState = true;
    requiresName = Boolean(state.requireName);
    const currentStudent = state.students.find((student) => student.id === sessionId);
    const completedNumbers = getCompletedExerciseNumbers(currentStudent);
    const fallbackCompletedCount = Math.max(0, Math.floor(Number(currentStudent && currentStudent.completedExercises ? currentStudent.completedExercises : 0)));
    const currentExerciseIsDone = completedNumbers.length
        ? completedNumbers.includes(targetExerciseNumber)
        : fallbackCompletedCount >= targetExerciseNumber;

    if (currentStudent && normalizeName(currentStudent.name)) {
        studentName = normalizeName(currentStudent.name);
        localStorage.setItem(`${NAME_STORAGE_PREFIX}${roomCode}`, studentName);
    }

    if (isSubmitting && pendingCheckedState === currentExerciseIsDone) {
        isSubmitting = false;
        pendingCheckedState = null;
        setDoneState(currentExerciseIsDone);
        setError("");
    }

    if (!isSubmitting) {
        setDoneState(currentExerciseIsDone);
    }

    const needsName = requiresName && !studentName;
    const shouldShowNameForm = false;
    isBlockedByMissingName = needsName;
    setNamePromptVisibility(shouldShowNameForm);

    if (!shouldShowNameForm) {
        setError("");
    }

    if (!isMarkedDone) {
        setDoneState(false);
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

    socket.on("state:update", (state) => {
        updateStatusFromState(state);
    });

    socket.on("auth:error", (message) => {
        if (isSessionResetMessage(message)) {
            clearStoredSessionState();
            embedNameInput.value = "";
            setError("");
            setDoneState(false);
            embedDoneCheckbox.disabled = true;
            return;
        }

        setError("");
        embedDoneCheckbox.disabled = true;
    });

}

function submitNameIfNeeded() {
    if (!requiresName) {
        return true;
    }

    if (studentName) {
        return true;
    }

    const enteredName = normalizeName(embedNameInput.value);
    if (!enteredName) {
        setError("Please enter your name first.");
        embedNameInput.focus();
        return false;
    }

    studentName = enteredName;
    localStorage.setItem(`${NAME_STORAGE_PREFIX}${roomCode}`, studentName);
    if (socket && socket.connected) {
        socket.emit("student:set-name", { name: studentName });
    }

    setNamePromptVisibility(false);
    return true;
}

function saveNameFromInput() {
    if (!requiresName) {
        setNamePromptVisibility(false);
        return;
    }

    if (!socket || !socket.connected) {
        setError("Not connected. Try again in a moment.");
        return;
    }

    const enteredName = normalizeName(embedNameInput.value);
    if (!enteredName) {
        setError("Please enter your name first.");
        embedNameInput.focus();
        return;
    }

    studentName = enteredName;
    localStorage.setItem(`${NAME_STORAGE_PREFIX}${roomCode}`, studentName);
    socket.emit("student:set-name", { name: studentName });
    setError("");
    setNamePromptVisibility(false);
}

embedDoneCheckbox.addEventListener("change", () => {
    setError("");

    if (!socket || !socket.connected) {
        setError("Not connected. Try again in a moment.");
        embedDoneCheckbox.checked = isMarkedDone;
        return;
    }

    if (!hasReceivedState) {
        setError("Still loading class state. Try again in a moment.");
        embedDoneCheckbox.checked = isMarkedDone;
        return;
    }

    if (isBlockedByMissingName) {
        embedDoneCheckbox.checked = isMarkedDone;
        return;
    }

    if (isSubmitting) {
        embedDoneCheckbox.checked = isMarkedDone;
        return;
    }

    if (!submitNameIfNeeded()) {
        embedDoneCheckbox.checked = isMarkedDone;
        return;
    }

    isSubmitting = true;
    pendingCheckedState = embedDoneCheckbox.checked;
    embedDoneCheckbox.disabled = true;
    socket.emit("student:set-exercise-complete", {
        exerciseNumber: targetExerciseNumber,
        completed: embedDoneCheckbox.checked,
    });
});

embedSaveNameBtn.addEventListener("click", () => {
    saveNameFromInput();
});

embedNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        saveNameFromInput();
    }
});

if (!roomCode || !exerciseId) {
    embedDoneCheckbox.disabled = true;
    setError("Missing class or excercise identifier.");
} else {
    inferTargetExerciseNumber();
    initStoredData();
    connect();
}
