document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";

	// 1. ĐỒNG HỒ POMODORO & LƯU GIỜ TỰ HỌC
	let timerInterval = null;
	let activeModeMinutes = 25;
	let timeLeft = 25 * 60;
	let currentMode = "focus";
	let completedSessions = parseInt(localStorage.getItem("dieunw_study_sessions"), 10) || 0;

	const timerDisplay = document.getElementById("timer-display");
	const timerStatus = document.getElementById("timer-status-text");
	const streakBadge = document.getElementById("study-streak-badge");
	const btnStart = document.getElementById("btn-start-timer");
	const btnPause = document.getElementById("btn-pause-timer");
	const btnReset = document.getElementById("btn-reset-timer");
	const modeButtons = [...document.querySelectorAll(".mode-btn")];

	function updateStreakBadgeText(extraText = "") {
		streakBadge.textContent = `Đã hoàn thành: ${completedSessions} phiên${extraText}`;
	}
	updateStreakBadgeText();

	function updateTimerUI() {
		const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
		const seconds = (timeLeft % 60).toString().padStart(2, "0");
		const formattedTime = `${minutes}:${seconds}`;
		timerDisplay.textContent = formattedTime;
		document.title = `(${formattedTime}) Phòng Tự Học - DIEUNW`;
	}

	function playBellSound() {
		try {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (!AudioCtx) return;
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
		} catch {
			// Bỏ qua nếu trình duyệt chặn âm thanh tự động
		}
	}

	async function recordStudySessionOnServer(minutes) {
		const token = localStorage.getItem("session_token") || localStorage.getItem("dieuNwToken") || "";
		if (!token) return;
		try {
			const res = await fetch(`${API_BASE}/api/study/session`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ minutes })
			});
			if (!res.ok) return;
			const data = await res.json().catch(() => ({}));
			if (data.studyPoints || data.streak) {
				updateStreakBadgeText(` · Chuỗi ${data.streak || 1} ngày · +15đ`);
			}
		} catch {
			// Không làm gián đoạn trải nghiệm học tập nếu mất mạng
		}
	}

	function handleTimerComplete() {
		playBellSound();
		if (currentMode === "focus") {
			completedSessions += 1;
			localStorage.setItem("dieunw_study_sessions", String(completedSessions));
			updateStreakBadgeText();
			recordStudySessionOnServer(activeModeMinutes);
			timerStatus.textContent = `🎉 Tuyệt vời! Bạn vừa hoàn thành phiên tập trung ${activeModeMinutes} phút. Hãy nghỉ ngắn nhé!`;
		} else {
			timerStatus.textContent = "⏰ Hết giờ nghỉ rồi! Sẵn sàng bắt đầu phiên tập trung mới nào!";
		}
		btnStart.style.display = "inline-block";
		btnPause.style.display = "none";
		document.title = "Hoàn thành phiên - DIEUNW";
	}

	modeButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			clearInterval(timerInterval);
			timerInterval = null;
			modeButtons.forEach(b => b.classList.remove("active"));
			btn.classList.add("active");

			activeModeMinutes = parseInt(btn.getAttribute("data-time"), 10) || 25;
			currentMode = btn.getAttribute("data-mode") || "focus";
			timeLeft = activeModeMinutes * 60;

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
				timeLeft -= 1;
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
		activeModeMinutes = parseInt(activeBtn?.getAttribute("data-time") || "25", 10);
		timeLeft = activeModeMinutes * 60;

		btnStart.style.display = "inline-block";
		btnPause.style.display = "none";
		timerStatus.textContent = "Đã đặt lại thời gian.";
		updateTimerUI();
	});

	// 2. CHỦ ĐỀ NỀN & ĐỒNG BỘ DARK MODE TOÀN TRANG
	const themeSelector = document.getElementById("theme-selector");
	const navThemeToggle = document.getElementById("nav-theme-toggle");

	function applyStudyTheme(themeName, syncGlobalDark = true) {
		document.body.classList.remove("theme-dark", "theme-forest", "theme-sunset");
		if (themeName && themeName !== "default") {
			document.body.classList.add(`theme-${themeName}`);
		}
		localStorage.setItem("dieunw_study_theme", themeName || "default");

		if (syncGlobalDark) {
			if (themeName === "dark") {
				document.documentElement.classList.add("dark-mode");
				document.body.classList.add("dark-mode");
				localStorage.setItem("dieunw_dark_mode", "1");
				if (navThemeToggle) navThemeToggle.textContent = "☀";
			} else if (themeName === "default") {
				document.documentElement.classList.remove("dark-mode");
				document.body.classList.remove("dark-mode");
				localStorage.setItem("dieunw_dark_mode", "0");
				if (navThemeToggle) navThemeToggle.textContent = "⏾";
			}
		}
	}

	const savedGlobalDark = localStorage.getItem("dieunw_dark_mode") === "1";
	const savedStudyTheme = localStorage.getItem("dieunw_study_theme") || (savedGlobalDark ? "dark" : "default");
	themeSelector.value = savedGlobalDark && savedStudyTheme === "default" ? "dark" : savedStudyTheme;
	applyStudyTheme(themeSelector.value, false);

	themeSelector.addEventListener("change", event => {
		applyStudyTheme(event.target.value, true);
	});

	if (navThemeToggle) {
		navThemeToggle.addEventListener("click", () => {
			setTimeout(() => {
				const isNowDark = document.documentElement.classList.contains("dark-mode");
				if (isNowDark) {
					themeSelector.value = "dark";
					applyStudyTheme("dark", false);
				} else if (themeSelector.value === "dark") {
					themeSelector.value = "default";
					applyStudyTheme("default", false);
				}
			}, 20);
		});
	}

	// 3. TRÌNH PHÁT NHẠC ĐĨA THAN + PLAYLIST + TỐC ĐỘ
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
	let currentTrackIndex = -1;
	let isReplay = false;
	let playbackRate = 1;

	function syncPlayingState() {
		const isPlaying = Boolean(audioPlayer.src) && !audioPlayer.paused && !audioPlayer.ended;
		audioPanel?.classList.toggle("is-playing", isPlaying);
		btnToggleAudio.textContent = isPlaying ? "⏸" : "▶";
	}

	function renderPlaylist() {
		playlistEl.replaceChildren();
		playlistEl.hidden = tracks.length === 0;
		tracks.forEach((track, idx) => {
			const li = document.createElement("li");
			li.className = `audio-playlist-item${idx === currentTrackIndex ? " active" : ""}`;

			const selectBtn = document.createElement("button");
			selectBtn.type = "button";
			selectBtn.className = "audio-playlist-track";
			selectBtn.textContent = `${idx + 1}. ${track.name}`;
			selectBtn.addEventListener("click", () => playTrackAt(idx));

			const removeBtn = document.createElement("button");
			removeBtn.type = "button";
			removeBtn.className = "audio-playlist-remove";
			removeBtn.setAttribute("aria-label", `Xóa ${track.name}`);
			removeBtn.textContent = "×";
			removeBtn.addEventListener("click", () => removeTrackAt(idx));

			li.append(selectBtn, removeBtn);
			playlistEl.appendChild(li);
		});
	}

	function playTrackAt(index) {
		if (!tracks.length) return;
		const safeIndex = ((index % tracks.length) + tracks.length) % tracks.length;
		currentTrackIndex = safeIndex;
		const track = tracks[currentTrackIndex];
		audioPlayer.src = track.url;
		audioPlayer.volume = Number(audioVolume.value);
		audioPlayer.playbackRate = playbackRate;
		audioFileName.textContent = `🎶 Đang phát: ${track.name}`;
		renderPlaylist();
		audioPlayer.play().catch(() => {});
		syncPlayingState();
	}

	function removeTrackAt(index) {
		const [removed] = tracks.splice(index, 1);
		if (removed?.url) URL.revokeObjectURL(removed.url);

		if (!tracks.length) {
			currentTrackIndex = -1;
			audioPlayer.pause();
			audioPlayer.removeAttribute("src");
			audioFileName.textContent = "Chưa có bài hát nào trong playlist";
			renderPlaylist();
			syncPlayingState();
			return;
		}

		if (index === currentTrackIndex) {
			const nextIdx = index >= tracks.length ? 0 : index;
			playTrackAt(nextIdx);
		} else {
			if (index < currentTrackIndex) currentTrackIndex -= 1;
			renderPlaylist();
		}
	}

	customAudioInput.addEventListener("change", event => {
		const files = [...(event.target.files || [])];
		if (!files.length) return;
		const firstNewIndex = tracks.length;
		files.forEach(file => {
			tracks.push({
				name: file.name,
				url: URL.createObjectURL(file)
			});
		});
		customAudioInput.value = "";
		if (currentTrackIndex === -1) {
			playTrackAt(firstNewIndex);
		} else {
			renderPlaylist();
		}
	});

	btnToggleAudio.addEventListener("click", () => {
		if (!tracks.length) {
			customAudioInput.click();
			return;
		}
		if (currentTrackIndex === -1) {
			playTrackAt(0);
			return;
		}
		if (audioPlayer.paused) {
			audioPlayer.playbackRate = playbackRate;
			audioPlayer.play().catch(() => {});
		} else {
			audioPlayer.pause();
		}
		syncPlayingState();
	});

	btnPrevAudio.addEventListener("click", () => {
		if (!tracks.length) return;
		playTrackAt(currentTrackIndex <= 0 ? tracks.length - 1 : currentTrackIndex - 1);
	});

	btnNextAudio.addEventListener("click", () => {
		if (!tracks.length) return;
		playTrackAt((currentTrackIndex + 1) % tracks.length);
	});

	btnReplayPlaylist.addEventListener("click", () => {
		isReplay = !isReplay;
		btnReplayPlaylist.classList.toggle("active", isReplay);
		btnReplayPlaylist.setAttribute("aria-pressed", String(isReplay));
	});

	speedButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			playbackRate = parseFloat(btn.dataset.speed || "1") || 1;
			audioPlayer.playbackRate = playbackRate;
			speedButtons.forEach(b => b.classList.toggle("active", b === btn));
		});
	});

	audioVolume.addEventListener("input", event => {
		audioPlayer.volume = Number(event.target.value);
	});

	audioPlayer.addEventListener("play", syncPlayingState);
	audioPlayer.addEventListener("pause", syncPlayingState);
	audioPlayer.addEventListener("ended", () => {
		if (!tracks.length) {
			syncPlayingState();
			return;
		}
		if (currentTrackIndex < tracks.length - 1) {
			playTrackAt(currentTrackIndex + 1);
		} else if (isReplay) {
			playTrackAt(0);
		} else {
			syncPlayingState();
		}
	});

	// 4. DANH SÁCH MỤC TIÊU HỌC TẬP (TO-DO LIST AN TOÀN DOM)
	const todoInput = document.getElementById("todo-input");
	const btnAddTodo = document.getElementById("btn-add-todo");
	const todoList = document.getElementById("todo-list");

	let tasks = (() => {
		try {
			return JSON.parse(localStorage.getItem("dieunw_study_tasks") || "[]");
		} catch {
			return [];
		}
	})();

	function saveTasks() {
		localStorage.setItem("dieunw_study_tasks", JSON.stringify(tasks));
	}

	function renderTasks() {
		todoList.replaceChildren();
		if (!tasks.length) {
			const empty = document.createElement("li");
			empty.className = "todo-empty";
			empty.textContent = "Chưa có mục tiêu nào. Thêm bài tập bạn muốn hoàn thành hôm nay nhé!";
			todoList.appendChild(empty);
			return;
		}

		tasks.forEach((task, index) => {
			const li = document.createElement("li");
			li.className = `todo-item${task.done ? " completed" : ""}`;

			const labelBtn = document.createElement("button");
			labelBtn.type = "button";
			labelBtn.className = "todo-toggle-btn";
			labelBtn.textContent = `${task.done ? "✅" : "⬜"} ${task.text}`;
			labelBtn.addEventListener("click", () => {
				tasks[index].done = !tasks[index].done;
				saveTasks();
				renderTasks();
			});

			const actionsDiv = document.createElement("div");
			actionsDiv.className = "todo-actions";
			const deleteBtn = document.createElement("button");
			deleteBtn.type = "button";
			deleteBtn.title = "Xóa";
			deleteBtn.setAttribute("aria-label", `Xóa mục tiêu ${task.text}`);
			deleteBtn.textContent = "🗑️";
			deleteBtn.addEventListener("click", () => {
				tasks.splice(index, 1);
				saveTasks();
				renderTasks();
			});

			actionsDiv.appendChild(deleteBtn);
			li.append(labelBtn, actionsDiv);
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
	todoInput.addEventListener("keypress", event => {
		if (event.key === "Enter") {
			event.preventDefault();
			addTask();
		}
	});

	renderTasks();
	updateTimerUI();
});