document.addEventListener("DOMContentLoaded", () => {
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

	streakBadge.textContent = `Đã hoàn thành: ${completedSessions} phiên`;

	function updateTimerUI() {
		const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
		const seconds = (timeLeft % 60).toString().padStart(2, "0");
		const formattedTime = `${minutes}:${seconds}`;
		timerDisplay.textContent = formattedTime;
		document.title = `(${formattedTime}) Phòng Tự Học - DIEUNW`;
	}

	modeButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			clearInterval(timerInterval);
			timerInterval = null;

			modeButtons.forEach(b => b.classList.remove("active"));
			btn.classList.add("active");

			const mins = parseInt(btn.getAttribute("data-time"), 10);
			currentMode = btn.getAttribute("data-mode");
			timeLeft = mins * 60;

			btnStart.style.display = "inline-block";
			btnPause.style.display = "none";
			timerStatus.textContent = currentMode === "focus"
				? "Sẵn sàng tập trung cao độ!"
				: "Thời gian thư giãn nghỉ ngơi!";
			updateTimerUI();
		});
	});

	btnStart.addEventListener("click", () => {
		if (timerInterval) return;
		btnStart.style.display = "none";
		btnPause.style.display = "inline-block";
		timerStatus.textContent = currentMode === "focus"
			? "Đang trong giờ học tập trung..."
			: "Đang nghỉ ngơi...";

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

	btnPause.addEventListener("click", () => {
		clearInterval(timerInterval);
		timerInterval = null;
		btnStart.style.display = "inline-block";
		btnPause.style.display = "none";
		timerStatus.textContent = "Đã tạm dừng đồng hồ.";
	});

	btnReset.addEventListener("click", () => {
		clearInterval(timerInterval);
		timerInterval = null;
		const activeBtn = document.querySelector(".mode-btn.active");
		timeLeft = (parseInt(activeBtn?.getAttribute("data-time"), 10) || 25) * 60;

		btnStart.style.display = "inline-block";
		btnPause.style.display = "none";
		timerStatus.textContent = "Đã đặt lại thời gian.";
		updateTimerUI();
	});

	function playBellSound() {
		try {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			const ctx = new AudioCtx();
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(880, ctx.currentTime);
			gain.gain.setValueAtTime(0.25, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + 0.65);
		} catch {}
	}

	function handleTimerComplete() {
		playBellSound();
		if (currentMode === "focus") {
			completedSessions++;
			localStorage.setItem("dieunw_study_sessions", String(completedSessions));
			streakBadge.textContent = `Đã hoàn thành: ${completedSessions} phiên`;
			timerStatus.textContent = "Chúc mừng bạn đã hoàn thành 1 phiên tập trung! Hãy nghỉ ngơi nhé.";
		} else {
			timerStatus.textContent = "Hết giờ nghỉ ngơi rồi! Quay lại bàn học thôi nào!";
		}
		btnStart.style.display = "inline-block";
		btnPause.style.display = "none";
	}

	// 2. CHỦ ĐỀ NỀN THEO THEME (giữ nguyên các class khác trên body)
	const themeSelector = document.getElementById("theme-selector");
	const THEME_CLASSES = ["theme-dark", "theme-forest", "theme-sunset"];

	function applyStudyTheme(value) {
		document.body.classList.remove(...THEME_CLASSES);
		if (value && value !== "default") {
			document.body.classList.add(`theme-${value}`);
		}
		if (themeSelector) themeSelector.value = value || "default";
		localStorage.setItem("dieunw_study_theme", value || "default");
	}

	const savedTheme = localStorage.getItem("dieunw_study_theme") || "default";
	applyStudyTheme(savedTheme);

	themeSelector.addEventListener("change", e => {
		applyStudyTheme(e.target.value);
	});

	// 3. TRÌNH PHÁT NHẠC PLAYLIST + ĐĨA THAN XOAY + NỐT NHẠC BAY + TỐC ĐỘ + REPLAY
	const audioPanel = document.getElementById("audio-player-panel");
	const audioPlayer = document.getElementById("bg-audio-player");
	const customAudioInput = document.getElementById("custom-audio-upload");
	const audioFileName = document.getElementById("audio-file-name");
	const btnPrevAudio = document.getElementById("btn-prev-audio");
	const btnToggleAudio = document.getElementById("btn-toggle-audio");
	const btnNextAudio = document.getElementById("btn-next-audio");
	const btnReplayPlaylist = document.getElementById("btn-replay-playlist");
	const speedButtons = [...document.querySelectorAll(".audio-speed-btn")];
	const audioVolume = document.getElementById("audio-volume");
	const playlistEl = document.getElementById("audio-playlist");

	let tracks = [];
	let currentIndex = -1;
	let replayPlaylist = false;
	let currentSpeed = 1;

	audioPlayer.volume = Number(audioVolume.value || 0.5);

	function syncPlayingVisuals() {
		const isPlaying = !audioPlayer.paused && !audioPlayer.ended && Boolean(audioPlayer.src);
		audioPanel.classList.toggle("is-playing", isPlaying);
		btnToggleAudio.textContent = isPlaying ? "⏸" : "▶";
	}

	function updateTrackHeading() {
		if (!tracks.length || currentIndex < 0 || !tracks[currentIndex]) {
			audioFileName.textContent = "Chưa có bài hát nào trong playlist";
			return;
		}
		const current = tracks[currentIndex];
		audioFileName.textContent = `Đang phát (${currentIndex + 1}/${tracks.length}): ${current.name}`;
	}

	function renderPlaylist() {
		playlistEl.replaceChildren();
		playlistEl.hidden = tracks.length === 0;
		tracks.forEach((track, idx) => {
			const li = document.createElement("li");
			li.className = "audio-track-item" + (idx === currentIndex ? " active" : "");

			const titleBtn = document.createElement("span");
			titleBtn.className = "audio-track-title";
			titleBtn.textContent = `${idx + 1}. ${track.name}`;
			titleBtn.title = track.name;
			titleBtn.addEventListener("click", () => {
				loadAndPlayTrack(idx, true);
			});

			const removeBtn = document.createElement("button");
			removeBtn.type = "button";
			removeBtn.className = "audio-track-remove";
			removeBtn.textContent = "×";
			removeBtn.title = "Xóa khỏi playlist";
			removeBtn.setAttribute("aria-label", `Xóa ${track.name}`);
			removeBtn.addEventListener("click", e => {
				e.stopPropagation();
				removeTrackAt(idx);
			});

			li.append(titleBtn, removeBtn);
			playlistEl.appendChild(li);
		});
		updateTrackHeading();
	}

	function loadAndPlayTrack(index, autoplay = true) {
		if (!tracks.length) {
			currentIndex = -1;
			audioPlayer.pause();
			audioPlayer.removeAttribute("src");
			audioPlayer.load();
			syncPlayingVisuals();
			renderPlaylist();
			return;
		}
		const bounded = ((index % tracks.length) + tracks.length) % tracks.length;
		currentIndex = bounded;
		const track = tracks[currentIndex];
		if (audioPlayer.src !== track.url) {
			audioPlayer.src = track.url;
		}
		audioPlayer.volume = Number(audioVolume.value || 0.5);
		audioPlayer.playbackRate = currentSpeed;
		renderPlaylist();
		if (autoplay) {
			audioPlayer.play().then(syncPlayingVisuals).catch(syncPlayingVisuals);
		} else {
			syncPlayingVisuals();
		}
	}

	function removeTrackAt(index) {
		const [removed] = tracks.splice(index, 1);
		if (removed?.url) {
			try { URL.revokeObjectURL(removed.url); } catch {}
		}
		if (!tracks.length) {
			loadAndPlayTrack(-1, false);
			return;
		}
		if (index < currentIndex) {
			currentIndex--;
			renderPlaylist();
		} else if (index === currentIndex) {
			const nextIdx = Math.min(index, tracks.length - 1);
			const wasPlaying = !audioPlayer.paused;
			loadAndPlayTrack(nextIdx, wasPlaying);
		} else {
			renderPlaylist();
		}
	}

	customAudioInput.addEventListener("change", e => {
		const files = Array.from(e.target.files || []);
		if (!files.length) return;
		const firstNewIndex = tracks.length;
		files.forEach(file => {
			tracks.push({
				name: file.name,
				url: URL.createObjectURL(file)
			});
		});
		customAudioInput.value = "";
		if (currentIndex === -1) {
			loadAndPlayTrack(0, true);
		} else if (audioPlayer.paused && !audioPlayer.src) {
			loadAndPlayTrack(firstNewIndex, true);
		} else {
			renderPlaylist();
		}
	});

	btnToggleAudio.addEventListener("click", () => {
		if (!tracks.length) {
			customAudioInput.click();
			return;
		}
		if (currentIndex < 0) {
			loadAndPlayTrack(0, true);
			return;
		}
		if (audioPlayer.paused) {
			audioPlayer.playbackRate = currentSpeed;
			audioPlayer.play().then(syncPlayingVisuals).catch(syncPlayingVisuals);
		} else {
			audioPlayer.pause();
			syncPlayingVisuals();
		}
	});

	btnPrevAudio.addEventListener("click", () => {
		if (!tracks.length) return;
		if (audioPlayer.currentTime > 3) {
			audioPlayer.currentTime = 0;
			if (audioPlayer.paused) audioPlayer.play().catch(() => {});
			return;
		}
		const prevIdx = currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1;
		loadAndPlayTrack(prevIdx, true);
	});

	btnNextAudio.addEventListener("click", () => {
		if (!tracks.length) return;
		const nextIdx = (currentIndex + 1) % tracks.length;
		loadAndPlayTrack(nextIdx, true);
	});

	btnReplayPlaylist.addEventListener("click", () => {
		replayPlaylist = !replayPlaylist;
		btnReplayPlaylist.classList.toggle("active", replayPlaylist);
		btnReplayPlaylist.setAttribute("aria-pressed", String(replayPlaylist));
		btnReplayPlaylist.title = replayPlaylist ? "Đang bật lặp lại playlist" : "Lặp lại playlist";
	});

	speedButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			const speed = parseFloat(btn.getAttribute("data-speed")) || 1;
			currentSpeed = speed;
			audioPlayer.playbackRate = speed;
			speedButtons.forEach(b => b.classList.toggle("active", b === btn));
		});
	});

	audioVolume.addEventListener("input", e => {
		audioPlayer.volume = Number(e.target.value);
	});

	audioPlayer.addEventListener("play", syncPlayingVisuals);
	audioPlayer.addEventListener("pause", syncPlayingVisuals);
	audioPlayer.addEventListener("ended", () => {
		if (!tracks.length) {
			syncPlayingVisuals();
			return;
		}
		if (currentIndex + 1 < tracks.length) {
			loadAndPlayTrack(currentIndex + 1, true);
		} else if (replayPlaylist) {
			loadAndPlayTrack(0, true);
		} else {
			syncPlayingVisuals();
		}
	});

	// 4. DANH SÁCH VIỆC CẦN LÀM (TO-DO LIST - an toàn XSS)
	const todoInput = document.getElementById("todo-input");
	const btnAddTodo = document.getElementById("btn-add-todo");
	const todoList = document.getElementById("todo-list");

	let tasks = [];
	try {
		const raw = JSON.parse(localStorage.getItem("dieunw_study_tasks") || "[]");
		if (Array.isArray(raw)) tasks = raw;
	} catch {}

	function saveTasks() {
		localStorage.setItem("dieunw_study_tasks", JSON.stringify(tasks));
	}

	function renderTasks() {
		todoList.replaceChildren();
		tasks.forEach((task, index) => {
			const li = document.createElement("li");
			li.className = `todo-item ${task.done ? "completed" : ""}`;

			const textSpan = document.createElement("span");
			textSpan.style.cursor = "pointer";
			textSpan.textContent = `${task.done ? "✔" : "⬜"} ${task.text || ""}`;
			textSpan.addEventListener("click", () => {
				tasks[index].done = !tasks[index].done;
				saveTasks();
				renderTasks();
			});

			const actions = document.createElement("div");
			actions.className = "todo-actions";
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.title = "Xóa";
			delBtn.textContent = "🗑️";
			delBtn.addEventListener("click", () => {
				tasks.splice(index, 1);
				saveTasks();
				renderTasks();
			});

			actions.appendChild(delBtn);
			li.append(textSpan, actions);
			todoList.appendChild(li);
		});
	}

	function addTask() {
		const text = todoInput.value.trim();
		if (!text) return;
		tasks.push({ text, done: false });
		saveTasks();
		todoInput.value = "";
		renderTasks();
	}

	btnAddTodo.addEventListener("click", addTask);
	todoInput.addEventListener("keypress", e => {
		if (e.key === "Enter") addTask();
	});

	renderTasks();
	syncPlayingVisuals();
});