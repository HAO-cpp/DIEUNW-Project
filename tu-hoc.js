document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = (window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.startsWith("192.168.") || window.location.port === "4174")) ? window.location.origin : "https://dieunw.onrender.com";

    function notify(message, type = "info") {
        if (typeof window.dieunwToast === "function") {
            window.dieunwToast(message, type);
        }
    }

    function resolveMedia(url) {
        if (typeof window.dieunwResolveMedia === "function") {
            return window.dieunwResolveMedia(url);
        }
        const raw = String(url || "").trim();
        if (!raw) return "";
        if (raw.startsWith("/uploads/")) return `${API_BASE}${raw}`;
        return raw;
    }

    // 1. ĐỒNG HỒ POMODORO
    let timerInterval = null;
    let timeLeft = 25 * 60;
    let currentMode = "focus";
    let completedSessions = parseInt(localStorage.getItem("dieunw_study_sessions"), 10) || 0;

    const timerDisplay = document.getElementById("timer-display");
    const timerStatus = document.getElementById("timer-status-text");
    const streakBadge = document.getElementById("study-streak-badge");
    const btnStart = document.getElementById("btn-start-timer");
    const btnPause = document.getElementById("btn-pause-timer");
    const btnReset = document.getElementById("btn-reset-timer");
    const modeButtons = document.querySelectorAll(".mode-btn");

    if (streakBadge) streakBadge.innerText = `Đã hoàn thành: ${completedSessions} phiên`;

    function updateTimerUI() {
        const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
        const seconds = (timeLeft % 60).toString().padStart(2, "0");
        const formattedTime = `${minutes}:${seconds}`;
        if (timerDisplay) timerDisplay.innerText = formattedTime;
        document.title = `(${formattedTime}) Phòng Tự Học - DIEUNW`;
    }

    modeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            clearInterval(timerInterval);
            timerInterval = null;

            modeButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const mins = parseInt(btn.getAttribute("data-time"), 10) || 25;
            currentMode = btn.getAttribute("data-mode") || "focus";
            timeLeft = mins * 60;

            if (btnStart) btnStart.style.display = "inline-block";
            if (btnPause) btnPause.style.display = "none";
            if (timerStatus) {
                timerStatus.innerText = currentMode === "focus"
                    ? "Sẵn sàng tập trung cao độ!"
                    : "Thời gian thư giãn nghỉ ngơi!";
            }
            updateTimerUI();
        });
    });

    btnStart?.addEventListener("click", () => {
        if (timerInterval) return;
        btnStart.style.display = "none";
        if (btnPause) btnPause.style.display = "inline-block";
        if (timerStatus) {
            timerStatus.innerText = currentMode === "focus"
                ? "Đang trong giờ học tập trung..."
                : "Đang nghỉ ngơi...";
        }

        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerUI();
            } else {
                clearInterval(timerInterval);
                timerInterval = null;
                handleTimerComplete();
            }
        }, 1000);
    });

    btnPause?.addEventListener("click", () => {
        clearInterval(timerInterval);
        timerInterval = null;
        if (btnStart) btnStart.style.display = "inline-block";
        btnPause.style.display = "none";
        if (timerStatus) timerStatus.innerText = "Đã tạm dừng đồng hồ.";
    });

    btnReset?.addEventListener("click", () => {
        clearInterval(timerInterval);
        timerInterval = null;
        const activeBtn = document.querySelector(".mode-btn.active");
        timeLeft = (parseInt(activeBtn?.getAttribute("data-time"), 10) || 25) * 60;

        if (btnStart) btnStart.style.display = "inline-block";
        if (btnPause) btnPause.style.display = "none";
        if (timerStatus) timerStatus.innerText = "Đã đặt lại thời gian.";
        updateTimerUI();
    });

    function handleTimerComplete() {
        playBellSound();
        if (currentMode === "focus") {
            completedSessions++;
            localStorage.setItem("dieunw_study_sessions", String(completedSessions));
            if (streakBadge) streakBadge.innerText = `Đã hoàn thành: ${completedSessions} phiên`;
            notify("Chúc mừng bạn đã hoàn thành 1 phiên tập trung! Hãy nghỉ ngơi nhé.", "success");
        } else {
            notify("Hết giờ nghỉ ngơi rồi! Quay lại bàn học thôi nào!", "info");
        }
        if (btnStart) btnStart.style.display = "inline-block";
        if (btnPause) btnPause.style.display = "none";
        if (timerStatus) timerStatus.innerText = "Hoàn thành phiên!";
    }

    function playBellSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.55);
        } catch {}
    }

    // 2. ĐỒNG BỘ CHỦ ĐỀ SÁNG / TỐI PHÒNG TỰ HỌC & NAVBAR
    const themeSelector = document.getElementById("theme-selector");
    const navThemeBtn = document.querySelector(".nav-theme-toggle");

    function applyStudyTheme(val, syncGlobal = true) {
        const mode = val || "default";
        document.body.classList.remove("theme-dark", "theme-forest", "theme-sunset");
        if (mode !== "default") {
            document.body.classList.add(`theme-${mode}`);
        }
        const isDark = mode === "dark";
        document.documentElement.classList.toggle("dark-mode", isDark);
        document.body.classList.toggle("dark-mode", isDark);
        localStorage.setItem("dieunw_study_theme", mode);

        if (syncGlobal) {
            localStorage.setItem("dieunw_theme", isDark ? "dark" : "light");
            localStorage.setItem("darkMode", isDark ? "1" : "0");
        }
        if (navThemeBtn) {
            navThemeBtn.textContent = isDark ? "☀️" : "🌙";
            navThemeBtn.setAttribute("aria-pressed", String(isDark));
        }
        if (themeSelector && themeSelector.value !== mode) {
            themeSelector.value = mode;
        }
    }

    const globalDark = document.documentElement.classList.contains("dark-mode")
        || document.body.classList.contains("dark-mode")
        || localStorage.getItem("dieunw_theme") === "dark";
    const initialStudyTheme = localStorage.getItem("dieunw_study_theme") || (globalDark ? "dark" : "default");
    applyStudyTheme(initialStudyTheme, false);

    themeSelector?.addEventListener("change", (e) => applyStudyTheme(e.target.value, true));

    // nav-profile.js now handles theme toggle centrally — removed duplicate listener
    // navThemeBtn click listener removed to avoid conflict

    // 3. TRÌNH PHÁT NHẠC PLAYLIST + KHO NHẠC ONLINE + SHUFFLE + ĐĨA QUAY
    const audioPanel = document.getElementById("audio-player-panel");
    const audioPlayer = document.getElementById("bg-audio-player");
    const customAudioInput = document.getElementById("custom-audio-upload");
    const audioFileName = document.getElementById("audio-file-name");
    const btnToggleAudio = document.getElementById("btn-toggle-audio");
    const btnPrevAudio = document.getElementById("btn-prev-audio");
    const btnNextAudio = document.getElementById("btn-next-audio");
    const btnReplayPlaylist = document.getElementById("btn-replay-playlist");
    const speedButtons = document.querySelectorAll(".audio-speed-btn[data-speed]");
    const audioVolume = document.getElementById("audio-volume");
    const playlistEl = document.getElementById("audio-playlist");

    const librarySelect = document.getElementById("pomodoro-library-select");
    const btnAddLibrary = document.getElementById("btn-add-library-track");
    const btnLoadAllLibrary = document.getElementById("btn-load-all-library");

    let playlist = [];
    let currentTrackIndex = -1;
    let loopPlaylist = false;
    let shufflePlaylist = false;
    let libraryTracks = [];

    // Tự động chèn nút Shuffle kế bên nút Replay nếu chưa có
    let btnShufflePlaylist = document.getElementById("btn-shuffle-playlist");
    if (!btnShufflePlaylist && btnReplayPlaylist?.parentElement) {
        btnShufflePlaylist = document.createElement("button");
        btnShufflePlaylist.type = "button";
        btnShufflePlaylist.id = "btn-shuffle-playlist";
        btnShufflePlaylist.className = "audio-ctrl-btn";
        btnShufflePlaylist.title = "Phát ngẫu nhiên";
        btnShufflePlaylist.setAttribute("aria-pressed", "false");
        btnShufflePlaylist.textContent = "🔀";
        btnReplayPlaylist.insertAdjacentElement("afterend", btnShufflePlaylist);
    }

    if (audioVolume && audioPlayer) {
        const savedVol = parseFloat(localStorage.getItem("dieunw_study_volume"));
        if (!Number.isNaN(savedVol)) {
            audioVolume.value = String(Math.min(1, Math.max(0, savedVol)));
        }
        audioPlayer.volume = parseFloat(audioVolume.value) || 0.5;
    }

    function syncPlayStateUI() {
        const isPlaying = Boolean(audioPlayer && !audioPlayer.paused && audioPlayer.src);
        if (btnToggleAudio) btnToggleAudio.textContent = isPlaying ? "⏸" : "▶";
        if (audioPanel) audioPanel.classList.toggle("is-playing", isPlaying);
    }

    function renderPlaylist() {
        if (!playlistEl) return;
        playlistEl.innerHTML = "";
        if (!playlist.length) {
            playlistEl.hidden = true;
            if (audioFileName) audioFileName.textContent = "Chưa có bài hát nào trong playlist";
            return;
        }
        playlistEl.hidden = false;
                playlist.forEach((track, idx) => {
            const li = document.createElement("li");
            li.className = `audio-playlist-item ${idx === currentTrackIndex ? "active" : ""}`;

            const playBtn = document.createElement("button");
            playBtn.type = "button";
            playBtn.className = "audio-playlist-select";
            playBtn.textContent = `${idx + 1}. ${track.title}${track.source === "library" ? " (Kho nhạc)" : ""}`;
            playBtn.addEventListener("click", () => playTrackAt(idx));

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "audio-playlist-remove";
            delBtn.title = "Xóa khỏi playlist";
            delBtn.textContent = "×";
            delBtn.addEventListener("click", () => removeTrackAt(idx));

            li.append(playBtn, delBtn);
            playlistEl.appendChild(li);
        });
    }

    function getRandomNextIndex() {
        if (playlist.length <= 1) return 0;
        let next = currentTrackIndex;
        while (next === currentTrackIndex) {
            next = Math.floor(Math.random() * playlist.length);
        }
        return next;
    }

    function playTrackAt(idx) {
        if (!playlist.length || !audioPlayer) return;
        const normalized = ((idx % playlist.length) + playlist.length) % playlist.length;
        const track = playlist[normalized];
        if (!track?.url) return;

        currentTrackIndex = normalized;
        if (typeof window.dieunwPauseGlobalMusic === "function") {
            window.dieunwPauseGlobalMusic();
        }
        audioPlayer.src = track.url;
        audioPlayer.playbackRate = parseFloat(document.querySelector(".audio-speed-btn[data-speed].active")?.dataset.speed || "1");
        audioPlayer.volume = parseFloat(audioVolume?.value || "0.5");
        audioPlayer.play().catch(() => {});

        if (audioFileName) audioFileName.textContent = `♪ Đang phát: ${track.title}`;
        renderPlaylist();
        syncPlayStateUI();
    }

    function removeTrackAt(idx) {
        const removed = playlist[idx];
        if (removed?.isObjectUrl) {
            try { URL.revokeObjectURL(removed.url); } catch {}
        }
        playlist.splice(idx, 1);

        if (!playlist.length) {
            currentTrackIndex = -1;
            audioPlayer?.pause();
            if (audioPlayer) audioPlayer.removeAttribute("src");
            syncPlayStateUI();
        } else if (idx === currentTrackIndex) {
            playTrackAt(idx % playlist.length);
        } else if (idx < currentTrackIndex) {
            currentTrackIndex--;
        }
        renderPlaylist();
    }

    customAudioInput?.addEventListener("change", (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const startIndex = playlist.length;
        files.forEach(file => {
            playlist.push({
                id: `local-${Date.now()}-${Math.random()}`,
                title: file.name.replace(/\.[^.]+$/, ""),
                url: URL.createObjectURL(file),
                source: "local",
                isObjectUrl: true
            });
        });
        e.target.value = "";
        playTrackAt(startIndex);
        notify(`Đã thêm ${files.length} bài nhạc từ máy.`, "success");
    });

    fetch(`${API_BASE}/api/music`, { credentials: "include" })
        .then(res => res.ok ? res.json() : { tracks: [] })
        .then(data => {
            libraryTracks = Array.isArray(data.tracks) ? data.tracks : [];
            if (!librarySelect) return;
            libraryTracks.forEach(tr => {
                const opt = document.createElement("option");
                opt.value = tr.id;
                opt.textContent = `${tr.title} — ${tr.artist || tr.authorName || "Thành viên"}`;
                librarySelect.appendChild(opt);
            });
        })
        .catch(() => {});

    btnAddLibrary?.addEventListener("click", () => {
        const pickedId = librarySelect?.value;
        if (!pickedId) {
            notify("Hãy chọn một bài từ Kho nhạc DIEUNW trước nhé.", "warning");
            return;
        }
        const tr = libraryTracks.find(item => String(item.id) === String(pickedId));
        if (!tr) return;
        const idx = playlist.length;
        playlist.push({
            id: `lib-${tr.id}-${Date.now()}`,
            title: `${tr.title}${tr.artist ? ` - ${tr.artist}` : ""}`,
            url: resolveMedia(tr.audioUrl || tr.audio_url),
            source: "library",
            isObjectUrl: false
        });
        if (currentTrackIndex === -1 || audioPlayer?.paused) {
            playTrackAt(idx);
        } else {
            renderPlaylist();
        }
        notify(`Đã thêm "${tr.title}" vào playlist.`, "success");
    });

    btnLoadAllLibrary?.addEventListener("click", () => {
        if (!libraryTracks.length) {
            notify("Kho nhạc hiện chưa có bài hát nào.", "info");
            return;
        }
        const startIndex = playlist.length;
        libraryTracks.forEach(tr => {
            playlist.push({
                id: `lib-${tr.id}-${Math.random()}`,
                title: `${tr.title}${tr.artist ? ` - ${tr.artist}` : ""}`,
                url: resolveMedia(tr.audioUrl || tr.audio_url),
                source: "library",
                isObjectUrl: false
            });
        });
        playTrackAt(shufflePlaylist ? getRandomNextIndex() : startIndex);
        notify(`Đã nạp ${libraryTracks.length} bài hát từ Kho nhạc DIEUNW!`, "success");
    });

    btnToggleAudio?.addEventListener("click", () => {
        if (!playlist.length) {
            notify("Hãy thêm nhạc từ máy hoặc từ Kho nhạc DIEUNW trước nhé!", "info");
            return;
        }
        if (currentTrackIndex === -1) {
            playTrackAt(shufflePlaylist ? getRandomNextIndex() : 0);
            return;
        }
        if (audioPlayer.paused) {
            window.dieunwPauseGlobalMusic?.();
            audioPlayer.play().catch(() => {});
        } else {
            audioPlayer.pause();
        }
        syncPlayStateUI();
    });

    btnPrevAudio?.addEventListener("click", () => {
        if (!playlist.length) return;
        playTrackAt(shufflePlaylist ? getRandomNextIndex() : currentTrackIndex - 1);
    });

    btnNextAudio?.addEventListener("click", () => {
        if (!playlist.length) return;
        playTrackAt(shufflePlaylist ? getRandomNextIndex() : currentTrackIndex + 1);
    });

    btnReplayPlaylist?.addEventListener("click", () => {
        loopPlaylist = !loopPlaylist;
        btnReplayPlaylist.setAttribute("aria-pressed", String(loopPlaylist));
        btnReplayPlaylist.classList.toggle("active", loopPlaylist);
        notify(loopPlaylist ? "Đã bật lặp lại playlist." : "Đã tắt lặp lại playlist.", "info");
    });

    btnShufflePlaylist?.addEventListener("click", () => {
        shufflePlaylist = !shufflePlaylist;
        btnShufflePlaylist.setAttribute("aria-pressed", String(shufflePlaylist));
        btnShufflePlaylist.classList.toggle("active", shufflePlaylist);
        notify(shufflePlaylist ? "Đã bật phát ngẫu nhiên." : "Đã tắt phát ngẫu nhiên.", "info");
    });

    speedButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            speedButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            if (audioPlayer) {
                audioPlayer.playbackRate = parseFloat(btn.dataset.speed || "1") || 1;
            }
        });
    });

    audioVolume?.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (audioPlayer) audioPlayer.volume = val;
        localStorage.setItem("dieunw_study_volume", String(val));
    });

    audioPlayer?.addEventListener("play", syncPlayStateUI);
    audioPlayer?.addEventListener("pause", syncPlayStateUI);
    audioPlayer?.addEventListener("ended", () => {
        if (!playlist.length) return;
        if (shufflePlaylist) {
            playTrackAt(getRandomNextIndex());
        } else if (currentTrackIndex < playlist.length - 1) {
            playTrackAt(currentTrackIndex + 1);
        } else if (loopPlaylist) {
            playTrackAt(0);
        } else {
            syncPlayStateUI();
        }
    });

    // 4. DANH SÁCH VIỆC CẦN LÀM
    const todoInput = document.getElementById("todo-input");
    const btnAddTodo = document.getElementById("btn-add-todo");
    const todoList = document.getElementById("todo-list");

    let tasks = [];
    try {
        tasks = JSON.parse(localStorage.getItem("dieunw_study_tasks") || "[]");
        if (!Array.isArray(tasks)) tasks = [];
    } catch {
        tasks = [];
    }

    function saveTasks() {
        localStorage.setItem("dieunw_study_tasks", JSON.stringify(tasks));
    }

    function renderTasks() {
        if (!todoList) return;
        todoList.innerHTML = "";
        tasks.forEach((task, index) => {
            const li = document.createElement("li");
            li.className = `todo-item ${task.done ? "completed" : ""}`;

            const label = document.createElement("span");
            label.style.cursor = "pointer";
            label.textContent = `${task.done ? "✓" : "○"} ${task.text}`;
            label.addEventListener("click", () => {
                tasks[index].done = !tasks[index].done;
                saveTasks();
                renderTasks();
            });

            const actions = document.createElement("div");
            actions.className = "todo-actions";
            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.title = "Xóa";
            delBtn.textContent = "Xóa";
            delBtn.addEventListener("click", () => {
                tasks.splice(index, 1);
                saveTasks();
                renderTasks();
            });
            actions.appendChild(delBtn);
                        li.append(label, actions);
            todoList.appendChild(li);
        });
    }

    function addTask() {
        const text = (todoInput?.value || "").trim();
        if (!text) return;
        tasks.push({ text, done: false });
        saveTasks();
        if (todoInput) todoInput.value = "";
        renderTasks();
    }

    btnAddTodo?.addEventListener("click", addTask);
    todoInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") addTask();
    });

    renderTasks();
});