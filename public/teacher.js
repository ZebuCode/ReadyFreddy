const ROOM_CODE_KEY = "readyfreddy.teacherRoomCode";
const CUSTOM_SESSIONS_KEY = "readyfreddy.teacherCustomSessions";

const roomCodeText = document.getElementById("roomCode");
const currentSessionNameText = document.getElementById("currentSessionName");
const resetSessionProgressBtn = document.getElementById("resetSessionProgressBtn");
const teacherStatus = document.getElementById("teacherStatus");
const readyCount = document.getElementById("readyCount");
const studentList = document.getElementById("studentList");
const copyAllEmbedsBtn = document.getElementById("copyAllEmbedsBtn");
const copyNameEmbedBtn = document.getElementById("copyNameEmbedBtn");
const copyHelpEmbedBtn = document.getElementById("copyHelpEmbedBtn");
const resetBtn = document.getElementById("resetBtn");
const manageSessionsBtn = document.getElementById("manageSessionsBtn");
const configureExercisesBtn = document.getElementById("configureExercisesBtn");
const exerciseAmountInput = document.getElementById("exerciseAmount");
const sessionNameRow = document.getElementById("sessionNameRow");
const sessionNameInput = document.getElementById("sessionNameInput");
const requireNameCheckbox = document.getElementById("requireNameCheckbox");
const enableHelpButtonCheckbox = document.getElementById("enableHelpButtonCheckbox");
const enableHelpButtonRow = enableHelpButtonCheckbox.closest("label");
const removeExerciseBtn = document.getElementById("removeExerciseBtn");
const cancelExerciseBtn = document.getElementById("cancelExerciseBtn");
const saveExerciseBtn = document.getElementById("saveExerciseBtn");
const exerciseSummary = document.getElementById("exerciseSummary");
const exerciseIdentifierSection = document.getElementById("exerciseIdentifierSection");
const embedButtonsToggleRow = document.getElementById("embedButtonsToggleRow");
const embedButtonsToggle = document.getElementById("embedButtonsToggle");
const exerciseIdentifierList = document.getElementById("exerciseIdentifierList");
const resetModal = document.getElementById("resetModal");
const sessionTypeModal = document.getElementById("sessionTypeModal");
const manageSessionsModal = document.getElementById("manageSessionsModal");
const deleteSessionModal = document.getElementById("deleteSessionModal");
const resetSessionProgressModal = document.getElementById("resetSessionProgressModal");
const deleteSessionModalText = document.getElementById("deleteSessionModalText");
const exerciseModal = document.getElementById("exerciseModal");
const cancelResetBtn = document.getElementById("cancelResetBtn");
const confirmResetBtn = document.getElementById("confirmResetBtn");
const cancelSessionTypeBtn = document.getElementById("cancelSessionTypeBtn");
const simpleSessionBtn = document.getElementById("simpleSessionBtn");
const customSessionBtn = document.getElementById("customSessionBtn");
const customSessionsList = document.getElementById("customSessionsList");
const importCustomSessionsBtn = document.getElementById("importCustomSessionsBtn");
const exportCustomSessionsBtn = document.getElementById("exportCustomSessionsBtn");
const closeManageSessionsBtn = document.getElementById("closeManageSessionsBtn");
const cancelDeleteSessionBtn = document.getElementById("cancelDeleteSessionBtn");
const confirmDeleteSessionBtn = document.getElementById("confirmDeleteSessionBtn");
const cancelResetSessionProgressBtn = document.getElementById("cancelResetSessionProgressBtn");
const confirmResetSessionProgressBtn = document.getElementById("confirmResetSessionProgressBtn");

let socket;
let roomCodeTooltip;
let showExerciseIdentifiers = false;
let pendingCustomSessionStart = false;
let customSessions = [];
let pendingSwitchRoomCode = "";
let switchSessionFallbackTimerId = 0;
let roomCodePendingDeletion = "";
let latestTeacherState = null;
let showEmbedButtons = false;

function normalizeSessionName(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 60);
}

function getInitialTeacherRoomCode() {
    const params = new URLSearchParams(window.location.search);
    const queryRoomCode = String(params.get("roomCode") || "").trim().toUpperCase();
    if (queryRoomCode) {
        return queryRoomCode;
    }

    return String(localStorage.getItem(ROOM_CODE_KEY) || "").trim().toUpperCase();
}

function updateTeacherUrlState(roomCode) {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return;
    }

    const nextUrl = `/teacher?roomCode=${encodeURIComponent(normalizedCode)}`;
    window.history.replaceState({}, "", nextUrl);
}

function resolveBasePath() {
    const pathname = String(window.location.pathname || "");
    const normalized = pathname.replace(/\/+$/, "");

    if (normalized.endsWith("/student")) {
        return normalized.slice(0, -"/student".length) || "";
    }
    if (normalized.endsWith("/teacher")) {
        return normalized.slice(0, -"/teacher".length) || "";
    }
    if (normalized.endsWith("/index.html")) {
        return normalized.slice(0, -"/index.html".length) || "";
    }

    return normalized;
}

function getSocketIoPath() {
    const basePath = resolveBasePath();
    return `${basePath || ""}/socket.io`;
}

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

async function copyAllEmbedsCode() {
    const classIdentifier = String(roomCodeText.textContent || "").trim().toUpperCase();
    const embedCode = getAllEmbedsCode(classIdentifier);
    const originalText = copyAllEmbedsBtn.textContent;

    if (!embedCode) {
        withLockedButtonWidth(
            copyAllEmbedsBtn,
            () => {
                copyAllEmbedsBtn.textContent = "No embeds";
            },
            () => {
                copyAllEmbedsBtn.textContent = originalText;
            }
        );
        return;
    }

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(embedCode);
            withLockedButtonWidth(
                copyAllEmbedsBtn,
                () => {
                    copyAllEmbedsBtn.textContent = "Copied";
                },
                () => {
                    copyAllEmbedsBtn.textContent = originalText;
                }
            );
        } else {
            throw new Error("Clipboard API unavailable");
        }
    } catch (error) {
        console.error("Failed to copy all embed codes:", error);
        withLockedButtonWidth(
            copyAllEmbedsBtn,
            () => {
                copyAllEmbedsBtn.textContent = "Failed";
            },
            () => {
                copyAllEmbedsBtn.textContent = originalText;
            }
        );
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
    const currentRoomCode = String(roomCodeText.textContent || "").trim().toUpperCase();
    const customSession = getCustomSessionByRoomCode(currentRoomCode);
    const shouldShowSessionName = pendingCustomSessionStart || Boolean(customSession);
    sessionNameRow.classList.toggle("hidden", !shouldShowSessionName);
    sessionNameInput.value = shouldShowSessionName
        ? normalizeSessionName(customSession && customSession.sessionName)
        : "";

    exerciseModal.classList.remove("hidden");
    if (shouldShowSessionName && !sessionNameInput.value) {
        sessionNameInput.focus();
        return;
    }

    exerciseAmountInput.focus();
}

function closeExerciseModal() {
    exerciseModal.classList.add("hidden");
}

function openSessionTypeModal() {
    sessionTypeModal.classList.remove("hidden");
    simpleSessionBtn.focus();
}

function closeSessionTypeModal() {
    sessionTypeModal.classList.add("hidden");
}

function openManageSessionsModal() {
    renderCustomSessionsList();
    manageSessionsModal.classList.remove("hidden");
    closeManageSessionsBtn.focus();
}

function closeManageSessionsModal() {
    manageSessionsModal.classList.add("hidden");
}

function openDeleteSessionModal(roomCode) {
    roomCodePendingDeletion = String(roomCode || "").trim().toUpperCase();
    if (!roomCodePendingDeletion) {
        return;
    }

    deleteSessionModalText.textContent = `Delete session ${roomCodePendingDeletion} from your saved custom sessions list?`;
    deleteSessionModal.classList.remove("hidden");
    confirmDeleteSessionBtn.focus();
}

function closeDeleteSessionModal() {
    roomCodePendingDeletion = "";
    deleteSessionModal.classList.add("hidden");
}

function openResetSessionProgressModal() {
    resetSessionProgressModal.classList.remove("hidden");
    confirmResetSessionProgressBtn.focus();
}

function closeResetSessionProgressModal() {
    resetSessionProgressModal.classList.add("hidden");
}

function switchToManagedSession(roomCode) {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return;
    }

    showExerciseIdentifiers = true;
    pendingCustomSessionStart = false;
    pendingSwitchRoomCode = normalizedCode;
    teacherStatus.textContent = "Switching session...";
    localStorage.setItem(ROOM_CODE_KEY, normalizedCode);

    if (switchSessionFallbackTimerId) {
        window.clearTimeout(switchSessionFallbackTimerId);
    }

    switchSessionFallbackTimerId = window.setTimeout(() => {
        const fallbackUrl = `/teacher?roomCode=${encodeURIComponent(normalizedCode)}`;
        window.location.assign(fallbackUrl);
    }, 450);

    if (socket && socket.connected) {
        socket.emit("teacher:switch-session", { roomCode: normalizedCode, createIfMissing: true });
    }
}

function formatExerciseProgress(done, total) {
    if (total > 0) {
        return `${done} / ${total}`;
    }

    return `${done}`;
}

function getStudentCompletedExerciseNumbers(student) {
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

function formatTimestamp(timestamp) {
    if (!Number.isFinite(timestamp)) {
        return "Unknown date";
    }

    return new Date(timestamp).toLocaleString();
}

function saveCustomSessions() {
    localStorage.setItem(CUSTOM_SESSIONS_KEY, JSON.stringify(customSessions));
}

function sanitizeCustomSessionEntry(session) {
    if (!session || typeof session !== "object") {
        return null;
    }

    const roomCode = String(session.roomCode || "").trim().toUpperCase();
    if (!roomCode) {
        return null;
    }

    return {
        roomCode,
        createdAt: Number(session.createdAt) || Date.now(),
        totalExercises: Math.max(0, Math.floor(Number(session.totalExercises) || 0)),
        requireName: Boolean(session.requireName),
        enableHelpButton: Boolean(session.enableHelpButton),
        sessionName: normalizeSessionName(session.sessionName),
    };
}

function loadCustomSessions() {
    try {
        const raw = localStorage.getItem(CUSTOM_SESSIONS_KEY);
        if (!raw) {
            customSessions = [];
            return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            customSessions = [];
            return;
        }

        customSessions = parsed
            .map((session) => sanitizeCustomSessionEntry(session))
            .filter((session) => session);
    } catch (error) {
        console.error("Failed to load custom sessions:", error);
        customSessions = [];
    }
}

function getCustomSessionByRoomCode(roomCode) {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return null;
    }

    return customSessions.find((entry) => entry.roomCode === normalizedCode) || null;
}

function syncShowExerciseIdentifiersForRoom(roomCode) {
    const session = getCustomSessionByRoomCode(roomCode);
    showExerciseIdentifiers = Boolean(session);
}

function syncCurrentSessionNameLabel(roomCode) {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    const session = getCustomSessionByRoomCode(normalizedCode);
    const sessionName = normalizeSessionName(session && session.sessionName);
    const showResetButton = Boolean(normalizedCode) && normalizedCode !== "------";
    currentSessionNameText.textContent = sessionName ? `Session name: ${sessionName}` : "";
    currentSessionNameText.classList.toggle("hidden", !sessionName);
    resetSessionProgressBtn.classList.toggle("hidden", !showResetButton);
}

function addCustomSession(roomCode, sessionName) {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return;
    }

    const existingIndex = customSessions.findIndex((session) => session.roomCode === normalizedCode);
    const nextSession = {
        roomCode: normalizedCode,
        createdAt: Date.now(),
        totalExercises: 0,
        requireName: false,
        enableHelpButton: false,
        sessionName: normalizeSessionName(sessionName),
    };

    if (existingIndex >= 0) {
        customSessions.splice(existingIndex, 1);
    }

    customSessions.unshift(nextSession);
    saveCustomSessions();
}

function updateCustomSessionSettings(roomCode, totalExercises, requireName, enableHelpButton, sessionName) {
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return;
    }

    const session = customSessions.find((entry) => entry.roomCode === normalizedCode);
    if (!session) {
        return;
    }

    session.totalExercises = Math.max(0, Math.floor(Number(totalExercises) || 0));
    session.requireName = Boolean(requireName);
    session.enableHelpButton = Boolean(enableHelpButton);
    session.sessionName = normalizeSessionName(sessionName);
    saveCustomSessions();
    syncCurrentSessionNameLabel(normalizedCode);
}

function applyCustomSessionSettingsToRoom(roomCode) {
    const session = getCustomSessionByRoomCode(roomCode);
    if (!session || !socket || !socket.connected) {
        return;
    }

    const amount = Math.max(0, Math.floor(Number(session.totalExercises) || 0));
    const requireName = Boolean(session.requireName);
    const enableHelpButton = requireName && Boolean(session.enableHelpButton);

    socket.emit("teacher:set-total-exercises", { amount });
    socket.emit("teacher:set-require-name", { requireName });
    socket.emit("teacher:set-enable-help-button", { enableHelpButton });

    exerciseAmountInput.value = String(amount);
    requireNameCheckbox.checked = requireName;
    enableHelpButtonCheckbox.checked = enableHelpButton;
    syncHelpCheckboxAvailability();
}

function renderCustomSessionsList() {
    customSessionsList.innerHTML = "";

    if (!customSessions.length) {
        const empty = document.createElement("li");
        empty.className = "small muted";
        empty.textContent = "No custom sessions yet.";
        customSessionsList.appendChild(empty);
        return;
    }

    customSessions.forEach((session) => {
        const item = document.createElement("li");
        item.className = "custom-session-list-item";
        const openSessionButton = document.createElement("button");
        openSessionButton.type = "button";
        openSessionButton.className = "custom-session-item-btn";
        openSessionButton.addEventListener("click", () => {
            switchToManagedSession(session.roomCode);
            closeManageSessionsModal();
        });

        const code = document.createElement("div");
        code.className = "custom-session-code";
        const sessionName = normalizeSessionName(session.sessionName);
        code.textContent = sessionName || session.roomCode;

        const meta = document.createElement("div");
        meta.className = "custom-session-meta";
        const identifier = sessionName ? `${session.roomCode} • ` : "";
        meta.textContent = `${identifier}${session.totalExercises} excercises • ${formatTimestamp(session.createdAt)}`;

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn ghost custom-session-delete-btn";
        deleteButton.setAttribute("aria-label", `Delete session ${session.roomCode}`);
        deleteButton.title = `Delete session ${session.roomCode}`;
        deleteButton.innerHTML = '<span class="icon-glyph" aria-hidden="true">&#128465;</span>';
        deleteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            openDeleteSessionModal(session.roomCode);
        });

        openSessionButton.appendChild(code);
        openSessionButton.appendChild(meta);
        item.appendChild(openSessionButton);
        item.appendChild(deleteButton);
        customSessionsList.appendChild(item);
    });
}

function buildCustomSessionsExportFileName() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `readyfreddy-custom-sessions-${timestamp}.json`;
}

function exportCustomSessions() {
    const originalText = exportCustomSessionsBtn ? exportCustomSessionsBtn.textContent : "Export";
    const payload = {
        exportedAt: new Date().toISOString(),
        sessions: customSessions.map((session) => ({ ...session })),
    };

    try {
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = buildCustomSessionsExportFileName();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);

        withLockedButtonWidth(
            exportCustomSessionsBtn,
            () => {
                exportCustomSessionsBtn.textContent = "Exported";
            },
            () => {
                exportCustomSessionsBtn.textContent = originalText;
            }
        );
    } catch (error) {
        console.error("Failed to export custom sessions:", error);
        withLockedButtonWidth(
            exportCustomSessionsBtn,
            () => {
                exportCustomSessionsBtn.textContent = "Export failed";
            },
            () => {
                exportCustomSessionsBtn.textContent = originalText;
            }
        );
    }
}

function parseImportedCustomSessions(jsonText) {
    const parsed = JSON.parse(jsonText);
    const sourceSessions = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === "object" && Array.isArray(parsed.sessions) ? parsed.sessions : null);

    if (!sourceSessions) {
        throw new Error("Import file must be an array or an object with a sessions array");
    }

    return sourceSessions
        .map((session) => sanitizeCustomSessionEntry(session))
        .filter((session) => session);
}

function mergeImportedCustomSessions(importedSessions) {
    const seen = new Set();
    const merged = [];

    importedSessions.forEach((session) => {
        if (seen.has(session.roomCode)) {
            return;
        }

        seen.add(session.roomCode);
        merged.push(session);
    });

    customSessions.forEach((session) => {
        if (seen.has(session.roomCode)) {
            return;
        }

        seen.add(session.roomCode);
        merged.push(session);
    });

    customSessions = merged;
}

function importCustomSessions() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".json,application/json";

    picker.addEventListener("change", async () => {
        const originalText = importCustomSessionsBtn ? importCustomSessionsBtn.textContent : "Import";
        const selectedFile = picker.files && picker.files[0];
        if (!selectedFile) {
            return;
        }

        try {
            const importedSessions = parseImportedCustomSessions(await selectedFile.text());
            mergeImportedCustomSessions(importedSessions);
            saveCustomSessions();
            renderCustomSessionsList();

            const currentRoomCode = String(roomCodeText.textContent || "").trim().toUpperCase();
            syncShowExerciseIdentifiersForRoom(currentRoomCode);
            syncCurrentSessionNameLabel(currentRoomCode);

            withLockedButtonWidth(
                importCustomSessionsBtn,
                () => {
                    importCustomSessionsBtn.textContent = "Imported";
                },
                () => {
                    importCustomSessionsBtn.textContent = originalText;
                }
            );
        } catch (error) {
            console.error("Failed to import custom sessions:", error);
            withLockedButtonWidth(
                importCustomSessionsBtn,
                () => {
                    importCustomSessionsBtn.textContent = "Import failed";
                },
                () => {
                    importCustomSessionsBtn.textContent = originalText;
                }
            );
        }
    });

    picker.click();
}

function getExerciseEmbedCode(classIdentifier, exerciseIdentifier) {
    const embedUrl = `${window.location.origin}/embed-exercise?class=${encodeURIComponent(classIdentifier)}&exercise=${encodeURIComponent(exerciseIdentifier)}`;
    return `<iframe src="${embedUrl}" width="72" height="70" style="border:0;max-width:100%;" title="ReadyFreddy Excercise ${exerciseIdentifier}" loading="lazy"></iframe>`;
}

function getHelpEmbedCode(classIdentifier) {
    const embedUrl = `${window.location.origin}/embed-help?class=${encodeURIComponent(classIdentifier)}`;
    return `<iframe src="${embedUrl}" width="72" height="72" style="border:0;max-width:100%;" title="ReadyFreddy Help Button ${classIdentifier}" loading="lazy"></iframe>`;
}

function getNamePromptEmbedCode(classIdentifier) {
    const embedUrl = `${window.location.origin}/embed-name?class=${encodeURIComponent(classIdentifier)}`;
    return `<iframe src="${embedUrl}" width="350" height="140" style="border:0;max-width:100%;" title="ReadyFreddy Name Prompt ${classIdentifier}" loading="lazy"></iframe>`;
}

function getAllEmbedsCode(classIdentifier) {
    const normalizedIdentifier = String(classIdentifier || "").trim().toUpperCase();
    if (!normalizedIdentifier || normalizedIdentifier === "------") {
        return "";
    }

    const session = getCustomSessionByRoomCode(normalizedIdentifier);
    const configuredTotalExercises = session ? Math.max(0, Math.floor(Number(session.totalExercises) || 0)) : 0;
    const stateTotalExercises = latestTeacherState
        ? Math.max(0, Math.floor(Number(latestTeacherState.totalExercises) || 0))
        : 0;
    const totalExercises = Math.max(configuredTotalExercises, stateTotalExercises);
    const exerciseIdPadding = String(Math.max(1, totalExercises)).length;

    const sections = [];

    if (copyNameEmbedBtn && !copyNameEmbedBtn.classList.contains("hidden")) {
        sections.push(`<!-- ReadyFreddy Name Embed (${normalizedIdentifier}) -->\n${getNamePromptEmbedCode(normalizedIdentifier)}`);
    }

    if (copyHelpEmbedBtn && !copyHelpEmbedBtn.classList.contains("hidden")) {
        sections.push(`<!-- ReadyFreddy Help Embed (${normalizedIdentifier}) -->\n${getHelpEmbedCode(normalizedIdentifier)}`);
    }

    if (totalExercises > 0) {
        const exerciseEmbeds = [];
        for (let index = 1; index <= totalExercises; index += 1) {
            const exerciseIdentifier = `${normalizedIdentifier}-${String(index).padStart(exerciseIdPadding, "0")}`;
            exerciseEmbeds.push(`<div>Excercise ${index}</div>\n${getExerciseEmbedCode(normalizedIdentifier, exerciseIdentifier)}`);
        }

        sections.push(exerciseEmbeds.join("\n\n"));
    }

    return sections.join("\n\n");
}

function withLockedButtonWidth(button, updateText, restoreText) {
    if (!button) {
        return;
    }

    const lockedWidth = button.offsetWidth;
    button.style.width = `${lockedWidth}px`;
    updateText();

    window.setTimeout(() => {
        restoreText();
        button.style.width = "";
    }, 1200);
}

async function copyExerciseEmbedCode(button, classIdentifier, exerciseIdentifier) {
    const embedCode = getExerciseEmbedCode(classIdentifier, exerciseIdentifier);

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(embedCode);
        } else {
            throw new Error("Clipboard API unavailable");
        }

        button.textContent = "Copied";
    } catch (error) {
        console.error("Failed to copy embed code:", error);
        button.textContent = "Failed";
    }

    window.setTimeout(() => {
        button.textContent = "Embed";
    }, 1200);
}

async function copyHelpEmbedCode() {
    const classIdentifier = String(roomCodeText.textContent || "").trim().toUpperCase();
    if (!classIdentifier || classIdentifier === "------") {
        return;
    }

    const embedCode = getHelpEmbedCode(classIdentifier);
    const originalText = copyHelpEmbedBtn.textContent;

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(embedCode);
            withLockedButtonWidth(
                copyHelpEmbedBtn,
                () => {
                    copyHelpEmbedBtn.textContent = "Copied";
                },
                () => {
                    copyHelpEmbedBtn.textContent = originalText;
                }
            );
        } else {
            throw new Error("Clipboard API unavailable");
        }
    } catch (error) {
        console.error("Failed to copy help embed code:", error);
        withLockedButtonWidth(
            copyHelpEmbedBtn,
            () => {
                copyHelpEmbedBtn.textContent = "Failed";
            },
            () => {
                copyHelpEmbedBtn.textContent = originalText;
            }
        );
    }
}

async function copyNamePromptEmbedCode() {
    const classIdentifier = String(roomCodeText.textContent || "").trim().toUpperCase();
    if (!classIdentifier || classIdentifier === "------") {
        return;
    }

    const embedCode = getNamePromptEmbedCode(classIdentifier);
    const originalText = copyNameEmbedBtn.textContent;

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(embedCode);
            withLockedButtonWidth(
                copyNameEmbedBtn,
                () => {
                    copyNameEmbedBtn.textContent = "Copied";
                },
                () => {
                    copyNameEmbedBtn.textContent = originalText;
                }
            );
        } else {
            throw new Error("Clipboard API unavailable");
        }
    } catch (error) {
        console.error("Failed to copy name prompt embed code:", error);
        withLockedButtonWidth(
            copyNameEmbedBtn,
            () => {
                copyNameEmbedBtn.textContent = "Failed";
            },
            () => {
                copyNameEmbedBtn.textContent = originalText;
            }
        );
    }
}

function renderExerciseIdentifiers(roomCode, totalExercises, students) {
    exerciseIdentifierList.innerHTML = "";

    const classIdentifier = String(roomCode || "").trim().toUpperCase();
    const customSession = getCustomSessionByRoomCode(classIdentifier);
    const sessionTotalExercises = customSession ? Math.max(0, Math.floor(Number(customSession.totalExercises) || 0)) : 0;
    const targetExercises = Math.max(0, Math.floor(Number(totalExercises) || 0), sessionTotalExercises);

    if (!classIdentifier || targetExercises <= 0) {
        exerciseIdentifierSection.classList.add("hidden");
        return;
    }

    const exerciseIdPadding = String(targetExercises).length;
    const studentList = Array.isArray(students) ? students : [];
    const studentCount = studentList.length;

    for (let index = 1; index <= targetExercises; index += 1) {
        const item = document.createElement("li");
        const left = document.createElement("div");
        left.className = "exercise-identifier-left";
        const label = document.createElement("div");
        const exerciseIdentifier = `${classIdentifier}-${String(index).padStart(exerciseIdPadding, "0")}`;
        label.textContent = `Excercise ${index} (${exerciseIdentifier})`;
        const doneCount = studentList.filter((student) => {
            const completedNumbers = getStudentCompletedExerciseNumbers(student);
            if (completedNumbers.length) {
                return completedNumbers.includes(index);
            }

            return Number(student.completedExercises || 0) >= index;
        }).length;
        const meta = document.createElement("div");
        meta.className = "exercise-identifier-meta";
        meta.textContent = `${doneCount} / ${studentCount} students done`;

        const embedButton = document.createElement("button");
        embedButton.type = "button";
        embedButton.className = "btn ghost exercise-embed-btn";
        embedButton.classList.toggle("hidden", !showEmbedButtons);
        embedButton.textContent = "Embed";
        embedButton.addEventListener("click", () => {
            copyExerciseEmbedCode(embedButton, classIdentifier, exerciseIdentifier);
        });

        left.appendChild(label);
        left.appendChild(meta);
        item.appendChild(left);
        item.appendChild(embedButton);
        exerciseIdentifierList.appendChild(item);
    }

    if (customSession) {
        customSession.totalExercises = Math.max(customSession.totalExercises, targetExercises);
        saveCustomSessions();
    }

    exerciseIdentifierSection.classList.remove("hidden");
}

function renderState(state) {
    const totalExercises = Math.max(0, Math.floor(Number(state.totalExercises || 0)));
    const classIdentifier = String(state.roomCode || "").trim().toUpperCase();
    const customSession = getCustomSessionByRoomCode(classIdentifier);
    const isCustomSession = Boolean(customSession);
    const customSessionTotalExercises = customSession
        ? Math.max(0, Math.floor(Number(customSession.totalExercises || 0)))
        : 0;
    const effectiveTotalExercises = Math.max(totalExercises, customSessionTotalExercises);
    const hasExercises = effectiveTotalExercises > 0;

    readyCount.textContent = `${state.readyCount} / ${state.totalCount}`;
    exerciseAmountInput.value = String(effectiveTotalExercises);
    requireNameCheckbox.checked = Boolean(state.requireName);
    enableHelpButtonCheckbox.checked = Boolean(state.enableHelpButton);
    syncHelpCheckboxAvailability();
    copyNameEmbedBtn.classList.toggle("hidden", !showEmbedButtons || !(isCustomSession && Boolean(state.requireName)));
    copyHelpEmbedBtn.classList.toggle("hidden", !showEmbedButtons || !(isCustomSession && Boolean(state.enableHelpButton)));
    const hasEmbedOptions = hasExercises || (isCustomSession && (Boolean(state.requireName) || Boolean(state.enableHelpButton)));
    copyAllEmbedsBtn.classList.toggle("hidden", !showEmbedButtons || !hasEmbedOptions);
    embedButtonsToggleRow.classList.toggle("hidden", !hasEmbedOptions);
    embedButtonsToggle.checked = showEmbedButtons;
    syncCurrentSessionNameLabel(classIdentifier);

    if (hasExercises) {
        exerciseSummary.textContent = `${state.completedExercises} / ${Math.max(0, effectiveTotalExercises * state.totalCount)} total exercises done`;
        exerciseSummary.classList.remove("hidden");
    } else {
        exerciseSummary.classList.add("hidden");
    }

    if (effectiveTotalExercises > 0) {
        renderExerciseIdentifiers(state.roomCode, effectiveTotalExercises, state.students);
    } else {
        exerciseIdentifierSection.classList.add("hidden");
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
        const studentCompletedExercises = Math.max(0, Math.floor(Number(student.completedExercises || 0)));
        const isExerciseReady = hasExercises && studentCompletedExercises >= effectiveTotalExercises;
        const isReady = hasExercises ? isExerciseReady : Boolean(student.ready);

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
            badge.className = `badge ${isReady ? "ready" : "not-ready"}`;
            badge.textContent = isReady ? "Ready" : "Not ready";
        }

        if (hasExercises) {
            const progress = document.createElement("span");
            progress.className = "badge progress";
            progress.textContent = `${formatExerciseProgress(studentCompletedExercises, effectiveTotalExercises)} exercises`;
            right.appendChild(progress);
        }

        right.appendChild(badge);
        item.appendChild(label);
        item.appendChild(right);
        studentList.appendChild(item);
    });
}

function initConnection() {
    const rememberedCode = getInitialTeacherRoomCode();
    loadCustomSessions();
    syncShowExerciseIdentifiersForRoom(rememberedCode);

    socket = io({
        path: getSocketIoPath(),
        auth: {
            role: "teacher",
            roomCode: rememberedCode,
        },
    });

    socket.on("connect", () => {
        teacherStatus.textContent = "Connected";
    });

    socket.on("teacher:room-assigned", (roomCode) => {
        const normalizedAssignedCode = String(roomCode || "").trim().toUpperCase();
        roomCodeText.textContent = roomCode;
        localStorage.setItem(ROOM_CODE_KEY, normalizedAssignedCode);
        updateTeacherUrlState(normalizedAssignedCode);
        teacherStatus.textContent = "Connected";

        if (pendingSwitchRoomCode && pendingSwitchRoomCode === normalizedAssignedCode) {
            pendingSwitchRoomCode = "";
            if (switchSessionFallbackTimerId) {
                window.clearTimeout(switchSessionFallbackTimerId);
                switchSessionFallbackTimerId = 0;
            }
        }

        if (pendingCustomSessionStart) {
            addCustomSession(roomCode, sessionNameInput.value);
            pendingCustomSessionStart = false;
        }

        syncShowExerciseIdentifiersForRoom(normalizedAssignedCode);
        syncCurrentSessionNameLabel(normalizedAssignedCode);
        applyCustomSessionSettingsToRoom(normalizedAssignedCode);
    });

    socket.on("connect_error", () => {
        teacherStatus.textContent = "Could not connect";
    });

    socket.on("teacher:session-switch-error", (message) => {
        pendingSwitchRoomCode = "";
        if (switchSessionFallbackTimerId) {
            window.clearTimeout(switchSessionFallbackTimerId);
            switchSessionFallbackTimerId = 0;
        }
        teacherStatus.textContent = message || "Could not switch session";
    });

    socket.on("state:update", (state) => {
        latestTeacherState = state;
        renderState(state);
    });

    socket.on("disconnect", () => {
        teacherStatus.textContent = "Disconnected, retrying...";
    });

    resetBtn.onclick = () => {
        if (!socket || !socket.connected) {
            return;
        }

        openSessionTypeModal();
    };

    configureExercisesBtn.onclick = () => {
        if (!socket || !socket.connected) {
            return;
        }

        openExerciseModal();
    };

    manageSessionsBtn.onclick = () => {
        openManageSessionsModal();
    };

    copyHelpEmbedBtn.onclick = () => {
        copyHelpEmbedCode();
    };

    copyNameEmbedBtn.onclick = () => {
        copyNamePromptEmbedCode();
    };

    copyAllEmbedsBtn.onclick = () => {
        copyAllEmbedsCode();
    };

    resetSessionProgressBtn.onclick = () => {
        if (!socket || !socket.connected) {
            return;
        }

        openResetSessionProgressModal();
    };

    saveExerciseBtn.onclick = () => {
        if (!socket || !socket.connected) {
            return;
        }

        const amount = Math.max(0, Math.floor(Number(exerciseAmountInput.value) || 0));
        const requireName = Boolean(requireNameCheckbox.checked);
        const enableHelpButton = requireName && Boolean(enableHelpButtonCheckbox.checked);
        const sessionName = normalizeSessionName(sessionNameInput.value);
        socket.emit("teacher:set-total-exercises", { amount });
        socket.emit("teacher:set-require-name", { requireName });
        socket.emit("teacher:set-enable-help-button", { enableHelpButton });
        updateCustomSessionSettings(roomCodeText.textContent, amount, requireName, enableHelpButton, sessionName);
        closeExerciseModal();
    };
}

requireNameCheckbox.addEventListener("change", syncHelpCheckboxAvailability);
embedButtonsToggle.addEventListener("change", () => {
    showEmbedButtons = Boolean(embedButtonsToggle.checked);
    if (latestTeacherState) {
        renderState(latestTeacherState);
    }
});

cancelResetBtn.addEventListener("click", closeResetModal);
cancelExerciseBtn.addEventListener("click", closeExerciseModal);
removeExerciseBtn.addEventListener("click", () => {
    exerciseAmountInput.value = "0";
});
cancelSessionTypeBtn.addEventListener("click", closeSessionTypeModal);
closeManageSessionsBtn.addEventListener("click", closeManageSessionsModal);
importCustomSessionsBtn.addEventListener("click", importCustomSessions);
exportCustomSessionsBtn.addEventListener("click", exportCustomSessions);
cancelDeleteSessionBtn.addEventListener("click", closeDeleteSessionModal);
cancelResetSessionProgressBtn.addEventListener("click", closeResetSessionProgressModal);
confirmDeleteSessionBtn.addEventListener("click", () => {
    if (!roomCodePendingDeletion) {
        closeDeleteSessionModal();
        return;
    }

    const deletedRoomCode = roomCodePendingDeletion;
    const currentRoomCode = String(roomCodeText.textContent || "").trim().toUpperCase();
    const deletedCurrentSession = deletedRoomCode === currentRoomCode;

    customSessions = customSessions.filter((entry) => entry.roomCode !== roomCodePendingDeletion);
    saveCustomSessions();
    syncCurrentSessionNameLabel(currentRoomCode);
    renderCustomSessionsList();
    closeDeleteSessionModal();

    if (deletedCurrentSession && socket && socket.connected) {
        showExerciseIdentifiers = false;
        pendingCustomSessionStart = false;
        socket.emit("teacher:new-session");
    }
});

confirmResetSessionProgressBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
        closeResetSessionProgressModal();
        return;
    }

    socket.emit("teacher:reset-session-progress");
    closeResetSessionProgressModal();
});

confirmResetBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
        closeResetModal();
        return;
    }

    showExerciseIdentifiers = false;
    pendingCustomSessionStart = false;
    socket.emit("teacher:new-session");
    closeResetModal();
});

simpleSessionBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
        closeSessionTypeModal();
        return;
    }

    showExerciseIdentifiers = false;
    pendingCustomSessionStart = false;
    socket.emit("teacher:new-session");
    closeSessionTypeModal();
    openExerciseModal();
});

customSessionBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
        closeSessionTypeModal();
        return;
    }

    showExerciseIdentifiers = true;
    pendingCustomSessionStart = true;
    socket.emit("teacher:create-custom-session");
    closeSessionTypeModal();
    openExerciseModal();
});

resetModal.addEventListener("click", (event) => {
    if (event.target === resetModal) {
        closeResetModal();
    }
});

sessionTypeModal.addEventListener("click", (event) => {
    if (event.target === sessionTypeModal) {
        closeSessionTypeModal();
    }
});

manageSessionsModal.addEventListener("click", (event) => {
    if (event.target === manageSessionsModal) {
        closeManageSessionsModal();
    }
});

deleteSessionModal.addEventListener("click", (event) => {
    if (event.target === deleteSessionModal) {
        closeDeleteSessionModal();
    }
});

resetSessionProgressModal.addEventListener("click", (event) => {
    if (event.target === resetSessionProgressModal) {
        closeResetSessionProgressModal();
    }
});

exerciseModal.addEventListener("click", (event) => {
    if (event.target === exerciseModal) {
        closeExerciseModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sessionTypeModal.classList.contains("hidden")) {
        closeSessionTypeModal();
        return;
    }

    if (event.key === "Escape" && !manageSessionsModal.classList.contains("hidden")) {
        closeManageSessionsModal();
        return;
    }

    if (event.key === "Escape" && !deleteSessionModal.classList.contains("hidden")) {
        closeDeleteSessionModal();
        return;
    }

    if (event.key === "Escape" && !resetSessionProgressModal.classList.contains("hidden")) {
        closeResetSessionProgressModal();
        return;
    }

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
