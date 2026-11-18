document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const MUSIC_API = `${API_BASE}/api/music`;

	const toggleUploadBtn = document.getElementById("btn-toggle-music-upload");
	const uploadPanel = document.getElementById("music-upload-panel");
	const cancelUploadBtn = document.getElementById("btn-cancel-music-upload");
	const uploadForm = document.getElementById("music-upload-form");
	const audioFileInput = document.getElementById("music-audio-file");
	const audioFilenameEl = document.getElementById("music-audio-filename");
	const coverFileInput = document.getElementById("music-cover-file");
	const coverFilenameEl = document.getElementById("music-cover-filename");
	const coverPreviewEl = document.getElementById("music-cover-preview");
	const coverClearBtn = document.getElementById("music-cover-clear");
	const progressMount = document.getElementById("music-upload-progress");

	const searchInput = document.getElementById("music-search-input");
	const genreChips = document.querySelectorAll(".music-genre-chip");
	const trackListEl = document.getElementById("music-track-list");

	const deckBar = document.getElementById("music-deck-bar");
	const deckCover = document.getElementById("deck-cover");
	const deckTitle = document.getElementById("deck-title");
	const deckArtist = document.getElementById("deck-artist");
	const deckPrevBtn = document.getElementById("deck-prev-btn");
	const deckPlayBtn = document.getElementById("deck-play-btn");
	const deckNextBtn = document.getElementById("deck-next-btn");
	const deckCurTimeEl = document.getElementById("deck-current-time");
	const deckDurTimeEl = document.getElementById("deck-duration-time");
	const deckSeekSlider = document.getElementById("deck-seek-slider");
	const deckSendGlobalBtn = document.getElementById("deck-send-global-btn");
	const hubAudio = document.getElementById("music-hub-audio");

	let currentUser = null;
	let allTracks = [];
	let filteredTracks = [];
	let activeGenre = "";
	let searchKeyword = "";
	let activeTrackId = null;
	let compressedCoverDataUrl = "";
	let progressBar = null;
	let isSeeking = false;
	const countedPlays = new Set();

	function notify(message, type = "info") {
		if (typeof window.dieunwToast === "function") {
			window.dieunwToast(message, type);
		}
	}

	async function askConfirm(message) {
		if (typeof window.dieunwConfirm === "function") {
			return window.dieunwConfirm(message);
		}
		return window.confirm(message);
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

	function formatDuration(sec) {
		const s = Math.max(0, Math.floor(Number(sec) || 0));
		const m = Math.floor(s / 60);
		const r = s % 60;
		return `${m}:${String(r).padStart(2, "0")}`;
	}

	function uploadWithProgress(url, { method = "POST", body, headers = {} }, onPercent) {
		if (typeof window.dieunwUploadWithProgress === "function") {
			return window.dieunwUploadWithProgress(url, { method, body, headers }, onPercent);
		}
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open(method, url, true);
			xhr.withCredentials = true;
			Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
			xhr.upload.onprogress = (ev) => {
				if (ev.lengthComputable && typeof onPercent === "function") {
					onPercent(Math.round((ev.loaded / ev.total) * 100));
				}
			};
			xhr.onload = () => {
				let parsed = {};
				try { parsed = JSON.parse(xhr.responseText || "{}"); } catch {}
				if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
				else reject(new Error(parsed.error || `Lỗi máy chủ (${xhr.status})`));
			};
			xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải nhạc."));
			xhr.send(body);
		});
	}

	async function compressCover(file) {
		if (typeof window.dieunwCompressImage === "function") {
			const res = await window.dieunwCompressImage(file, 720, 0.84);
			if (typeof res === "string") return res;
			if (res instanceof Blob) {
				return await new Promise((resolve) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result || ""));
					reader.readAsDataURL(res);
				});
			}
		}
		return await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("Không đọc được ảnh bìa."));
			reader.onload = () => {
				const img = new Image();
				img.onerror = () => reject(new Error("Ảnh bìa không hợp lệ."));
				img.onload = () => {
					const maxDim = 720;
					let { width, height } = img;
					if (width > maxDim || height > maxDim) {
						const ratio = Math.min(maxDim / width, maxDim / height);
						width = Math.round(width * ratio);
						height = Math.round(height * ratio);
					}
					const canvas = document.createElement("canvas");
					canvas.width = width;
					canvas.height = height;
					canvas.getContext("2d").drawImage(img, 0, 0, width, height);
					resolve(canvas.toDataURL("image/webp", 0.84));
				};
				img.src = String(reader.result || "");
			};
			reader.readAsDataURL(file);
		});
	}

	function updateProgress(pct, label) {
		if (progressBar) {
			if (typeof progressBar.update === "function") progressBar.update(pct, label);
			else if (typeof progressBar.setProgress === "function") progressBar.setProgress(pct, label);
		} else if (progressMount) {
			progressMount.innerHTML = `
				<div class="dieunw-progress-wrap">
					<div class="dieunw-progress-meta"><span>${label || "Đang tải lên..."}</span><span>${Math.round(pct)}%</span></div>
					<div class="dieunw-progress-track"><div class="dieunw-progress-fill" style="width:${Math.min(100, Math.max(0, pct))}%"></div></div>
				</div>
			`;
		}
	}

	function resetProgress() {
		if (progressBar && typeof progressBar.reset === "function") progressBar.reset();
		else if (progressBar && typeof progressBar.hide === "function") progressBar.hide();
		else if (progressMount) progressMount.innerHTML = "";
	}

	if (progressMount && typeof window.dieunwCreateProgressBar === "function") {
		progressBar = window.dieunwCreateProgressBar(progressMount);
	}

	toggleUploadBtn?.addEventListener("click", () => {
		uploadPanel.hidden = !uploadPanel.hidden;
		if (!uploadPanel.hidden) {
			document.getElementById("music-title-input")?.focus();
		}
	});
	cancelUploadBtn?.addEventListener("click", () => {
		uploadPanel.hidden = true;
	});

	audioFileInput?.addEventListener("change", () => {
		const f = audioFileInput.files?.[0];
		audioFilenameEl.textContent = f ? `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)` : "Chưa chọn tệp âm thanh";
		const titleInput = document.getElementById("music-title-input");
		if (f && titleInput && !titleInput.value.trim()) {
			titleInput.value = f.name.replace(/\.[^.]+$/, "");
		}
	});

	function clearCover() {
		compressedCoverDataUrl = "";
		if (coverFileInput) coverFileInput.value = "";
		if (coverFilenameEl) coverFilenameEl.textContent = "Mặc định logo DIEUNW";
		if (coverPreviewEl) {
			coverPreviewEl.src = "";
			coverPreviewEl.hidden = true;
		}
		if (coverClearBtn) coverClearBtn.hidden = true;
	}

	coverFileInput?.addEventListener("change", async () => {
		const f = coverFileInput.files?.[0];
		if (!f) {
			clearCover();
			return;
		}
		coverFilenameEl.textContent = `${f.name} (đang tối ưu...)`;
		try {
			compressedCoverDataUrl = await compressCover(f);
			coverFilenameEl.textContent = f.name;
			coverPreviewEl.src = compressedCoverDataUrl;
			coverPreviewEl.hidden = false;
			coverClearBtn.hidden = false;
		} catch (err) {
			clearCover();
			notify(err.message || "Không thể xử lý ảnh bìa.", "error");
		}
	});
	coverClearBtn?.addEventListener("click", clearCover);

	// Đăng bài hát mới lên Kho nhạc
	uploadForm?.addEventListener("submit", async (e) => {
		e.preventDefault();
		const formEl = e.currentTarget;
		const audioFile = audioFileInput?.files?.[0];
		if (!audioFile) {
			notify("Bạn cần chọn một tệp âm thanh để tải lên.", "warning");
			return;
		}
		const title = document.getElementById("music-title-input").value.trim();
		const artist = document.getElementById("music-artist-input").value.trim() || currentUser?.name || "Thành viên DIEUNW";
		const genre = document.getElementById("music-genre-select").value || "Khác";
		if (!title) {
			notify("Vui lòng nhập tên bài hát.", "warning");
			return;
		}

		const submitBtn = document.getElementById("btn-submit-music");
		submitBtn.disabled = true;
		submitBtn.textContent = "Đang tải lên...";

		try {
			const fd = new FormData();
			fd.append("title", title);
			fd.append("artist", artist);
			fd.append("genre", genre);
			fd.append("audio", audioFile);
			if (compressedCoverDataUrl) fd.append("coverData", compressedCoverDataUrl);

			updateProgress(5, "Đang tải bài hát lên máy chủ...");
			const res = await uploadWithProgress(MUSIC_API, {
				method: "POST",
				body: fd
			}, (pct) => updateProgress(pct, `Đang tải lên (${pct}%)...`));

			updateProgress(100, "Đã tải lên thành công!");
			formEl.reset();
			audioFilenameEl.textContent = "Chưa chọn tệp âm thanh";
			clearCover();
			resetProgress();
			uploadPanel.hidden = true;

			if (res?.track) {
				allTracks.unshift(res.track);
				applyFilters();
			} else {
				await loadTracks();
			}
			notify("Đã đăng bài hát lên Kho nhạc DIEUNW!", "success");
		} catch (err) {
			resetProgress();
			notify(err.message || "Không thể đăng bài hát.", "error");
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = "Tải lên Kho nhạc";
		}
	});

	function getActiveTrack() {
		return allTracks.find(t => String(t.id) === String(activeTrackId)) || null;
	}

	function playTrack(track) {
		if (!track || !hubAudio) return;
		const src = resolveMedia(track.audioUrl || track.audio_url);
		if (!src) {
			notify("Bài hát không có đường dẫn phát hợp lệ.", "error");
			return;
		}

		window.dieunwPauseGlobalMusic?.();

		if (String(activeTrackId) === String(track.id) && hubAudio.src) {
			if (hubAudio.paused) hubAudio.play().catch(() => {});
			else hubAudio.pause();
			syncCardsAndDeckUI();
			return;
		}

		activeTrackId = track.id;
		hubAudio.src = src;
		hubAudio.play().catch(() => {});

		if (deckBar) deckBar.hidden = false;
		if (deckCover) deckCover.src = resolveMedia(track.coverUrl || track.cover_url) || "./DIEU.png";
		if (deckTitle) deckTitle.textContent = track.title || "Không rõ tiêu đề";
		if (deckArtist) deckArtist.textContent = track.artist || track.authorName || "Thành viên DIEUNW";

		if (!countedPlays.has(String(track.id))) {
			countedPlays.add(String(track.id));
			fetch(`${MUSIC_API}/${encodeURIComponent(track.id)}/play`, {
				method: "POST",
				credentials: "include"
			}).then(r => r.ok ? r.json() : null).then(data => {
				if (data && typeof data.plays === "number") {
					track.plays = data.plays;
					const playBadge = document.querySelector(`.music-track-card[data-track-id="${track.id}"] .track-plays-count`);
					if (playBadge) playBadge.textContent = `${data.plays} lượt nghe`;
				}
			}).catch(() => {});
		}

		syncCardsAndDeckUI();
	}

	function playRelativeTrack(step) {
		const list = filteredTracks.length ? filteredTracks : allTracks;
		if (!list.length) return;
		const idx = list.findIndex(t => String(t.id) === String(activeTrackId));
		const nextIdx = idx === -1 ? 0 : ((idx + step + list.length) % list.length);
		playTrack(list[nextIdx]);
	}

	function syncCardsAndDeckUI() {
		const isPlaying = Boolean(hubAudio && !hubAudio.paused && hubAudio.src);
		if (deckPlayBtn) deckPlayBtn.textContent = isPlaying ? "⏸" : "▶";

		document.querySelectorAll(".music-track-card").forEach(card => {
			const isThis = String(card.dataset.trackId) === String(activeTrackId);
			card.classList.toggle("is-active", isThis);
			const iconSpan = card.querySelector(".music-cover-overlay");
			if (iconSpan) iconSpan.textContent = isThis && isPlaying ? "⏸" : "▶";
		});
	}

	deckPlayBtn?.addEventListener("click", () => {
		const tr = getActiveTrack();
		if (tr) playTrack(tr);
		else if (filteredTracks[0]) playTrack(filteredTracks[0]);
	});
	deckPrevBtn?.addEventListener("click", () => playRelativeTrack(-1));
	deckNextBtn?.addEventListener("click", () => playRelativeTrack(1));

	deckSendGlobalBtn?.addEventListener("click", () => {
		const tr = getActiveTrack();
		if (!tr) return;
		if (typeof window.dieunwPlayGlobalTrack === "function") {
			hubAudio?.pause();
			window.dieunwPlayGlobalTrack({
				id: tr.id,
				title: tr.title,
				artist: tr.artist || tr.authorName || "",
				audioUrl: resolveMedia(tr.audioUrl || tr.audio_url),
				coverUrl: resolveMedia(tr.coverUrl || tr.cover_url)
			}, filteredTracks.map(item => ({
				id: item.id,
				title: item.title,
				artist: item.artist || item.authorName || "",
				audioUrl: resolveMedia(item.audioUrl || item.audio_url),
				coverUrl: resolveMedia(item.coverUrl || item.cover_url)
			})));
			notify(`Đã chuyển "${tr.title}" sang đĩa nhạc góc trên!`, "success");
		} else {
			notify("Trình phát toàn web chưa sẵn sàng.", "info");
		}
	});

	hubAudio?.addEventListener("play", syncCardsAndDeckUI);
	hubAudio?.addEventListener("pause", syncCardsAndDeckUI);
	hubAudio?.addEventListener("ended", () => playRelativeTrack(1));
	hubAudio?.addEventListener("loadedmetadata", () => {
		if (deckDurTimeEl) deckDurTimeEl.textContent = formatDuration(hubAudio.duration);
	});
	hubAudio?.addEventListener("timeupdate", () => {
		if (!hubAudio.duration || isSeeking) return;
		const pct = (hubAudio.currentTime / hubAudio.duration) * 100;
		if (deckCurTimeEl) deckCurTimeEl.textContent = formatDuration(hubAudio.currentTime);
		if (deckDurTimeEl) deckDurTimeEl.textContent = formatDuration(hubAudio.duration);
		if (deckSeekSlider) deckSeekSlider.value = String(pct);

		const activeCardSlider = document.querySelector(`.music-track-card[data-track-id="${activeTrackId}"] .track-seek-slider`);
		const activeCardCur = document.querySelector(`.music-track-card[data-track-id="${activeTrackId}"] .track-cur-time`);
		if (activeCardSlider) activeCardSlider.value = String(pct);
		if (activeCardCur) activeCardCur.textContent = formatDuration(hubAudio.currentTime);
	});

	deckSeekSlider?.addEventListener("input", () => {
		isSeeking = true;
		if (hubAudio?.duration) {
			const target = (parseFloat(deckSeekSlider.value) / 100) * hubAudio.duration;
			if (deckCurTimeEl) deckCurTimeEl.textContent = formatDuration(target);
		}
	});
	deckSeekSlider?.addEventListener("change", () => {
		if (hubAudio?.duration) {
			hubAudio.currentTime = (parseFloat(deckSeekSlider.value) / 100) * hubAudio.duration;
		}
		isSeeking = false;
	});

	function createTrackCard(track) {
		const card = document.createElement("article");
		card.className = `music-track-card ${String(track.id) === String(activeTrackId) ? "is-active" : ""}`;
		card.dataset.trackId = track.id;

		const coverBtn = document.createElement("button");
		coverBtn.type = "button";
		coverBtn.className = "music-cover-btn";
		coverBtn.title = "Phát / Tạm dừng";
		const img = document.createElement("img");
		img.src = resolveMedia(track.coverUrl || track.cover_url) || "./DIEU.png";
		img.alt = "";
		img.loading = "lazy";
		const overlay = document.createElement("span");
		overlay.className = "music-cover-overlay";
		overlay.textContent = String(track.id) === String(activeTrackId) && !hubAudio.paused ? "⏸" : "▶";
		coverBtn.append(img, overlay);
		coverBtn.addEventListener("click", () => playTrack(track));

		const body = document.createElement("div");
		body.className = "music-track-body";

		const top = document.createElement("div");
		top.className = "music-track-top";
		const titleWrap = document.createElement("div");
		const h3 = document.createElement("h3");
		h3.className = "music-track-title";
		h3.textContent = track.title || "Không rõ tên";
		const artistP = document.createElement("p");
		artistP.className = "music-track-artist";
		artistP.textContent = `${track.artist || "Ẩn danh"} · Đăng bởi ${track.authorName || track.name || "Thành viên"}`;
		titleWrap.append(h3, artistP);

		const genreTag = document.createElement("span");
		genreTag.className = "music-genre-tag";
		genreTag.textContent = track.genre || "Âm nhạc";
		top.append(titleWrap, genreTag);

		const progressRow = document.createElement("div");
		progressRow.className = "music-progress-row";
		const curTimeSpan = document.createElement("span");
		curTimeSpan.className = "music-time-label track-cur-time";
		curTimeSpan.textContent = "0:00";

		const seekSlider = document.createElement("input");
		seekSlider.type = "range";
		seekSlider.className = "dieunw-slider track-seek-slider";
		seekSlider.min = "0";
		seekSlider.max = "100";
		seekSlider.step = "0.5";
		seekSlider.value = "0";
		seekSlider.style.flex = "1";
		seekSlider.addEventListener("change", () => {
			if (String(activeTrackId) !== String(track.id)) {
				playTrack(track);
				return;
			}
			if (hubAudio.duration) {
				hubAudio.currentTime = (parseFloat(seekSlider.value) / 100) * hubAudio.duration;
			}
		});

		const playsSpan = document.createElement("span");
		playsSpan.className = "music-time-label track-plays-count";
		playsSpan.style.minWidth = "72px";
		playsSpan.style.textAlign = "right";
		playsSpan.textContent = `${Number(track.plays || 0)} lượt nghe`;
		progressRow.append(curTimeSpan, seekSlider, playsSpan);

		const actions = document.createElement("div");
		actions.className = "music-track-actions";

		const likeBtn = document.createElement("button");
		likeBtn.type = "button";
		likeBtn.className = `music-action-btn ${track.likedByMe ? "liked" : ""}`;
		likeBtn.textContent = `♥ ${Number(track.likes || 0)} Thích`;
		likeBtn.addEventListener("click", async () => {
			if (!currentUser) {
				notify("Bạn cần đăng nhập để thả tim bài hát.", "warning");
				return;
			}
			const nextLiked = !Boolean(track.likedByMe);
			likeBtn.disabled = true;
			try {
				const res = await fetch(`${MUSIC_API}/${encodeURIComponent(track.id)}/like`, {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ liked: nextLiked })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.error || "Không thể thích bài hát.");
				track.likedByMe = nextLiked;
				track.likes = Number(data.likes ?? (nextLiked ? Number(track.likes || 0) + 1 : Math.max(0, Number(track.likes || 0) - 1)));
				likeBtn.classList.toggle("liked", nextLiked);
				likeBtn.textContent = `♥ ${track.likes} Thích`;
			} catch (err) {
				notify(err.message || "Lỗi cập nhật lượt thích.", "error");
			} finally {
				likeBtn.disabled = false;
			}
		});

		const globalBtn = document.createElement("button");
		globalBtn.type = "button";
		globalBtn.className = "music-action-btn";
		globalBtn.textContent = "Phát nền toàn web";
		globalBtn.addEventListener("click", () => {
			if (typeof window.dieunwPlayGlobalTrack === "function") {
				hubAudio?.pause();
				window.dieunwPlayGlobalTrack({
					id: track.id,
					title: track.title,
					artist: track.artist || track.authorName || "",
					audioUrl: resolveMedia(track.audioUrl || track.audio_url),
					coverUrl: resolveMedia(track.coverUrl || track.cover_url)
				});
				notify(`Đang phát "${track.title}" trên đĩa nhạc góc trên!`, "success");
			}
		});

		actions.append(likeBtn, globalBtn);

		const ownerId = String(track.userId || track.user_id || "");
		const canDelete = currentUser && (String(currentUser.id) === ownerId || currentUser.isAdmin || currentUser.isModerator);
		if (canDelete) {
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.className = "music-action-btn delete";
			delBtn.textContent = "Xóa";
			delBtn.addEventListener("click", async () => {
				const ok = await askConfirm(`Bạn muốn xóa bài hát "${track.title}" khỏi Kho nhạc?`);
				if (!ok) return;
				delBtn.disabled = true;
				try {
					const res = await fetch(`${MUSIC_API}/${encodeURIComponent(track.id)}`, {
						method: "DELETE",
						credentials: "include"
					});
					const data = await res.json();
					if (!res.ok) throw new Error(data.error || "Không thể xóa bài hát.");
					allTracks = allTracks.filter(t => String(t.id) !== String(track.id));
					applyFilters();
					notify("Đã xóa bài hát khỏi Kho nhạc.", "success");
				} catch (err) {
					notify(err.message || "Không thể xóa bài hát.", "error");
					delBtn.disabled = false;
				}
			});
			actions.append(delBtn);
		}

		body.append(top, progressRow, actions);
		card.append(coverBtn, body);
		return card;
	}

	function applyFilters() {
		const q = searchKeyword.trim().toLowerCase();
		filteredTracks = allTracks.filter(t => {
			const matchGenre = !activeGenre || (t.genre || "") === activeGenre;
			const matchQuery = !q
				|| (t.title || "").toLowerCase().includes(q)
				|| (t.artist || "").toLowerCase().includes(q)
				|| (t.authorName || t.name || "").toLowerCase().includes(q);
			return matchGenre && matchQuery;
		});

		trackListEl.innerHTML = "";
		if (!filteredTracks.length) {
			trackListEl.innerHTML = "<p class='empty-text'>Chưa tìm thấy bài hát phù hợp. Hãy thử đăng một bài nhạc mới nhé!</p>";
			return;
		}
		const frag = document.createDocumentFragment();
		filteredTracks.forEach(tr => frag.appendChild(createTrackCard(tr)));
		trackListEl.appendChild(frag);
		syncCardsAndDeckUI();
	}

	async function loadTracks() {
		try {
			const res = await fetch(MUSIC_API, { credentials: "include" });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Không thể tải Kho nhạc.");
			allTracks = Array.isArray(data.tracks) ? data.tracks : [];
			applyFilters();
		} catch (err) {
			trackListEl.innerHTML = `<p style="color:#b42318; text-align:center;">${err.message || "Không thể tải danh sách nhạc."}</p>`;
		}
	}

	searchInput?.addEventListener("input", () => {
		searchKeyword = searchInput.value;
		applyFilters();
	});

	genreChips.forEach(chip => {
		chip.addEventListener("click", () => {
			genreChips.forEach(c => c.classList.remove("active"));
			chip.classList.add("active");
			activeGenre = chip.dataset.genre || "";
			applyFilters();
		});
	});

	fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
		.then(r => r.ok ? r.json() : { user: null })
		.then(data => {
			currentUser = data.user || null;
			if (toggleUploadBtn) toggleUploadBtn.hidden = !Boolean(currentUser?.id);
		})
		.catch(() => {})
		.finally(() => loadTracks());
});