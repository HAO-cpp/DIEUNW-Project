document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = (window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.startsWith("192.168.") || window.location.port === "4174")) ? window.location.origin : "https://dieunw.onrender.com";
	const MUSIC_API = `${API_BASE}/api/music`;
	const PLAYLIST_API = `${API_BASE}/api/playlists`;

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
	let allPlaylists = [];
	let activeQueue = [];
	let activeGenre = "";
	let searchKeyword = "";
	let activeTrackId = null;
	let compressedCoverDataUrl = "";
	let progressBar = null;
	let isSeeking = false;
	let isShuffle = localStorage.getItem("dieunw_music_shuffle") === "1";
	let lastRenderedLyricKey = "";
	const countedPlays = new Set();

	function getAuthHeaders(extra = {}) {
		const token = localStorage.getItem("session_token");
		return {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...extra
		};
	}

	function notify(message, type = "info") {
		if (typeof window.dieunwToast === "function") {
			window.dieunwToast(message, type);
		}
	}

	async function askConfirm(message, title = "Xác nhận", danger = true) {
		if (typeof window.dieunwConfirm === "function") {
			try {
				return await window.dieunwConfirm(message, title, danger);
			} catch {
				return window.confirm(message);
			}
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

	function escapeHtml(val) {
		return String(val ?? "").replace(/[&<>"']/g, ch => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;"
		})[ch]);
	}

	function uploadWithProgress(url, { method = "POST", body, headers = {} }, onPercent) {
		const mergedHeaders = getAuthHeaders(headers);
		if (typeof window.dieunwUploadWithProgress === "function") {
			return window.dieunwUploadWithProgress(url, { method, body, headers: mergedHeaders }, onPercent);
		}
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open(method, url, true);
			xhr.withCredentials = true;
			Object.entries(mergedHeaders).forEach(([k, v]) => xhr.setRequestHeader(k, v));
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

	async function compressCover(file, maxDim = 720) {
		if (typeof window.dieunwCompressImage === "function") {
			const res = await window.dieunwCompressImage(file, maxDim, 0.84);
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
			reader.onerror = () => reject(new Error("Không đọc được ảnh."));
			reader.onload = () => {
				const img = new Image();
				img.onerror = () => reject(new Error("Ảnh không hợp lệ."));
				img.onload = () => {
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
		// =========================================================
	// 1. GIAO DIỆN SPOTIFY LYRIC STAGE (CHỮ BAY LÊN 3/4 RỒI TAN)
	// =========================================================
	const LYRIC_BG_PRESETS = [
		{ id: "aurora", label: "Cực quang", css: "radial-gradient(circle at 20% 20%, #0ea5e9 0%, #1e1b4b 55%, #020617 100%)" },
		{ id: "sunset", label: "Hoàng hôn", css: "linear-gradient(135deg, #450a0a 0%, #9a3412 48%, #1e1b4b 100%)" },
		{ id: "emerald", label: "Rừng đêm", css: "linear-gradient(140deg, #022c22 0%, #065f46 52%, #0f172a 100%)" },
		{ id: "galaxy", label: "Vũ trụ", css: "radial-gradient(circle at 80% 15%, #7e22ce 0%, #1e293b 55%, #090d16 100%)" },
		{ id: "ocean", label: "Biển sâu", css: "linear-gradient(160deg, #0c4a6e 0%, #0369a1 50%, #082f49 100%)" }
	];

	function getSavedLyricTheme() {
		try {
			const raw = JSON.parse(localStorage.getItem("dieunw_spotify_bg") || "null");
			if (raw && typeof raw === "object") return raw;
		} catch {}
		return { mode: "preset", value: LYRIC_BG_PRESETS.css };
	}

	function saveLyricTheme(cfg) {
		localStorage.setItem("dieunw_spotify_bg", JSON.stringify(cfg));
		applyLyricStageBackground();
	}

	function ensureSpotifyOverlay() {
		let overlay = document.getElementById("spotify-lyric-overlay");
		if (overlay) return overlay;

		overlay = document.createElement("section");
		overlay.id = "spotify-lyric-overlay";
		overlay.className = "spotify-lyric-overlay";
		overlay.hidden = true;
		overlay.innerHTML = `
			<div class="spotify-bg-layer" id="spotify-bg-layer"></div>
			<div class="spotify-bg-scrim"></div>
			<div class="spotify-shell">
				<header class="spotify-topbar">
					<button type="button" id="btn-close-spotify" class="spotify-pill-btn">↓ Thu nhỏ</button>
					<div class="spotify-topbar-title">
						<span class="spotify-now-label">ĐANG PHÁT TỪ KHO NHẠC DIEUNW</span>
						<strong id="spotify-top-track-name">--</strong>
					</div>
					<div class="spotify-topbar-actions">
						<button type="button" id="btn-toggle-spotify-bg" class="spotify-pill-btn">🎨 Đổi nền</button>
						<button type="button" id="btn-open-admin-lyric" class="spotify-pill-btn admin-only" hidden>✎ Sửa Lyric (Admin)</button>
					</div>
				</header>

				<div id="spotify-bg-picker" class="spotify-bg-picker" hidden>
					<div class="spotify-bg-picker-row">
						<span>Mẫu nền:</span>
						<div id="spotify-bg-swatches" class="spotify-bg-swatches"></div>
					</div>
					<div class="spotify-bg-picker-row">
						<label>Màu tự chọn: <input type="color" id="spotify-bg-color-input" value="#1769aa"></label>
						<label class="spotify-bg-file-btn">📷 Tải ảnh nền <input type="file" id="spotify-bg-file-input" accept="image/*" hidden></label>
					</div>
				</div>

				<div class="spotify-main-grid">
					<div class="spotify-disc-col">
						<div class="spotify-cover-card">
							<img id="spotify-cover-img" src="./DIEU.avif" alt="">
						</div>
						<div class="spotify-meta-info">
							<div class="spotify-title-line">
								<h2 id="spotify-track-title">--</h2>
								<span id="spotify-lyric-red-badge" class="music-lyric-badge" hidden>LYRIC</span>
							</div>
							<p id="spotify-track-artist">--</p>
						</div>
					</div>

					<div class="spotify-stage-col">
						<div id="spotify-lyric-stage" class="spotify-lyric-stage" aria-live="polite">
							<div id="spotify-lyric-floater" class="spotify-lyric-floater">
								<p id="spotify-lyric-current" class="spotify-lyric-current">♪ Giai điệu đang vang lên...</p>
								<p id="spotify-lyric-next" class="spotify-lyric-next"></p>
							</div>
						</div>
					</div>
				</div>

				<footer class="spotify-player-footer">
					<div class="spotify-seek-wrap">
						<span id="spotify-cur-time">0:00</span>
						<input type="range" id="spotify-seek-slider" min="0" max="100" step="0.2" value="0">
						<span id="spotify-dur-time">0:00</span>
					</div>
					<div class="spotify-controls-row">
						<button type="button" id="spotify-shuffle-btn" class="spotify-ctrl-btn" title="Phát ngẫu nhiên">🔀</button>
						<button type="button" id="spotify-prev-btn" class="spotify-ctrl-btn" title="Bài trước">⏮</button>
						<button type="button" id="spotify-play-btn" class="spotify-play-main-btn" title="Phát / Tạm dừng">▶</button>
						<button type="button" id="spotify-next-btn" class="spotify-ctrl-btn" title="Bài tiếp">⏭</button>
						<button type="button" id="spotify-global-btn" class="spotify-pill-btn">💿 Phát xuyên trang</button>
					</div>
				</footer>
			</div>
		`;
		document.body.appendChild(overlay);

		const swatchesWrap = overlay.querySelector("#spotify-bg-swatches");
		LYRIC_BG_PRESETS.forEach(p => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "spotify-swatch-btn";
			btn.title = p.label;
			btn.style.background = p.css;
			btn.addEventListener("click", () => saveLyricTheme({ mode: "preset", value: p.css }));
			swatchesWrap.appendChild(btn);
		});

		overlay.querySelector("#btn-close-spotify").addEventListener("click", () => {
			overlay.hidden = true;
			document.body.style.overflow = "";
		});

		const bgPicker = overlay.querySelector("#spotify-bg-picker");
		overlay.querySelector("#btn-toggle-spotify-bg").addEventListener("click", () => {
			bgPicker.hidden = !bgPicker.hidden;
		});

		overlay.querySelector("#spotify-bg-color-input").addEventListener("input", (e) => {
			saveLyricTheme({ mode: "color", value: e.target.value });
		});

		overlay.querySelector("#spotify-bg-file-input").addEventListener("change", async (e) => {
			const file = e.target.files?.[0];
			if (!file) return;
			try {
				const dataUrl = await compressCover(file, 1280);
				saveLyricTheme({ mode: "image", value: dataUrl });
				notify("Đã đổi ảnh nền trình phát Lyric!", "success");
			} catch (err) {
				notify(err.message || "Không thể đọc ảnh nền.", "error");
			}
			e.target.value = "";
		});

		overlay.querySelector("#btn-open-admin-lyric").addEventListener("click", () => {
			const tr = getActiveTrack();
			if (tr) openAdminLyricEditor(tr);
		});

		overlay.querySelector("#spotify-shuffle-btn").addEventListener("click", toggleShuffleMode);
		overlay.querySelector("#spotify-prev-btn").addEventListener("click", () => playRelativeTrack(-1));
		overlay.querySelector("#spotify-next-btn").addEventListener("click", () => playRelativeTrack(1));
		overlay.querySelector("#spotify-play-btn").addEventListener("click", () => {
			const tr = getActiveTrack();
			if (tr) playTrack(tr, false);
		});
		overlay.querySelector("#spotify-global-btn").addEventListener("click", () => deckSendGlobalBtn?.click());

		const spSeek = overlay.querySelector("#spotify-seek-slider");
		spSeek.addEventListener("input", () => {
			isSeeking = true;
			if (hubAudio?.duration) {
				const t = (parseFloat(spSeek.value) / 100) * hubAudio.duration;
				overlay.querySelector("#spotify-cur-time").textContent = formatDuration(t);
			}
		});
		spSeek.addEventListener("change", () => {
			if (hubAudio?.duration) {
				hubAudio.currentTime = (parseFloat(spSeek.value) / 100) * hubAudio.duration;
			}
			isSeeking = false;
			updateSyncedLyricUI(true);
		});

		applyLyricStageBackground();
		return overlay;
	}

	function applyLyricStageBackground() {
		const bgLayer = document.getElementById("spotify-bg-layer");
		if (!bgLayer) return;
		const cfg = getSavedLyricTheme();
		if (cfg.mode === "image" && cfg.value) {
			bgLayer.style.backgroundImage = `url("${cfg.value}")`;
			bgLayer.style.backgroundColor = "#090d16";
		} else if (cfg.mode === "color" && cfg.value) {
			bgLayer.style.backgroundImage = "none";
			bgLayer.style.backgroundColor = cfg.value;
		} else {
			bgLayer.style.backgroundImage = cfg.value || LYRIC_BG_PRESETS.css;
			bgLayer.style.backgroundColor = "#090d16";
		}
	}

	function openSpotifyPlayerView(track) {
		const overlay = ensureSpotifyOverlay();
		const tr = track || getActiveTrack();
		if (!tr) return;

		overlay.querySelector("#spotify-top-track-name").textContent = tr.title || "Không rõ tiêu đề";
		overlay.querySelector("#spotify-track-title").textContent = tr.title || "Không rõ tiêu đề";
		overlay.querySelector("#spotify-track-artist").textContent = `${tr.artist || "Ẩn danh"} · ${tr.genre || "Âm nhạc"}`;
		overlay.querySelector("#spotify-cover-img").src = resolveMedia(tr.coverImage || tr.coverUrl || tr.cover_url) || "./DIEU.avif";

		const redBadge = overlay.querySelector("#spotify-lyric-red-badge");
		if (redBadge) redBadge.hidden = !(Array.isArray(tr.lyrics) && tr.lyrics.length > 0);

		const adminBtn = overlay.querySelector("#btn-open-admin-lyric");
		if (adminBtn) adminBtn.hidden = !Boolean(currentUser?.isAdmin);

		overlay.hidden = false;
		document.body.style.overflow = "hidden";
		lastRenderedLyricKey = "";
		updateSyncedLyricUI(true);
		syncCardsAndDeckUI();
	}

	function updateSyncedLyricUI(force = false) {
		const overlay = document.getElementById("spotify-lyric-overlay");
		if (!overlay || overlay.hidden) return;
		const tr = getActiveTrack();
		const lyrics = Array.isArray(tr?.lyrics) ? tr.lyrics : [];
		const currentEl = overlay.querySelector("#spotify-lyric-current");
		const nextEl = overlay.querySelector("#spotify-lyric-next");
		const floater = overlay.querySelector("#spotify-lyric-floater");
		if (!currentEl || !floater) return;

		const nowSec = Number(hubAudio?.currentTime || 0);
		if (!lyrics.length) {
			const fallbackKey = `empty-${tr?.id || ""}`;
			if (force || lastRenderedLyricKey !== fallbackKey) {
				lastRenderedLyricKey = fallbackKey;
				currentEl.textContent = "♪ Bài hát này chưa có lời đồng bộ (Lyric)";
				if (nextEl) nextEl.textContent = currentUser?.isAdmin ? "Nhấn 'Sửa Lyric (Admin)' ở góc trên để thêm mốc giây lời bài hát." : "Thưởng thức giai điệu nhé!";
				floater.classList.remove("is-dissolving");
				floater.classList.add("is-rising");
			}
			return;
		}

		const activeIdx = lyrics.findIndex(line => nowSec >= line.startSec && nowSec <= line.endSec);
				if (activeIdx === -1) {
			const upcoming = lyrics.find(line => line.startSec > nowSec);
			const waitKey = `wait-${tr.id}-${upcoming ? upcoming.startSec : "end"}`;
			if (force || lastRenderedLyricKey !== waitKey) {
				lastRenderedLyricKey = waitKey;
				floater.classList.remove("is-rising");
				floater.classList.add("is-dissolving");
				setTimeout(() => {
					if (lastRenderedLyricKey === waitKey) {
						currentEl.textContent = "♪ • • • ♪";
						if (nextEl) nextEl.textContent = upcoming ? upcoming.text : "Kết thúc bài hát";
						floater.classList.remove("is-dissolving");
						floater.classList.add("is-rising");
					}
				}, 180);
			}
			return;
		}

		const line = lyrics[activeIdx];
		const nextLine = lyrics[activeIdx + 1] || null;
		const lineKey = `line-${tr.id}-${activeIdx}-${line.startSec}`;
		const remaining = line.endSec - nowSec;

		if (force || lastRenderedLyricKey !== lineKey) {
			lastRenderedLyricKey = lineKey;
			floater.classList.remove("is-rising", "is-dissolving");
			void floater.offsetWidth;
			currentEl.textContent = line.text;
			if (nextEl) nextEl.textContent = nextLine ? nextLine.text : "";
			floater.classList.add("is-rising");
		} else if (remaining <= 0.45 && !floater.classList.contains("is-dissolving")) {
			floater.classList.remove("is-rising");
			floater.classList.add("is-dissolving");
		}
	}

	// =========================================================
	// 2. TRÌNH SOẠN LYRIC CHO ADMIN (MỐC GIÂY -> CÂU HÁT)
	// =========================================================
	function openAdminLyricEditor(track) {
		if (!currentUser?.isAdmin) return;
		let modal = document.getElementById("admin-lyric-modal");
		if (!modal) {
			modal = document.createElement("div");
			modal.id = "admin-lyric-modal";
			modal.className = "report-modal-overlay";
			modal.innerHTML = `
				<div class="report-modal-box" style="width:min(620px, 100%);">
					<div class="report-modal-header">
						<h3 id="admin-lyric-modal-title">Chỉnh sửa Lyric</h3>
						<button type="button" id="btn-close-lyric-modal" class="close-badge">×</button>
					</div>
					<p style="font-size:12.5px; color:var(--text-muted);">Nhập từng dòng lời bài hát kèm thời gian bắt đầu (giây) và kết thúc (giây). Ví dụ: từ <b>12.5</b>s đến <b>17</b>s.</p>
					<div style="display:flex; gap:8px; flex-wrap:wrap;">
						<button type="button" id="btn-add-lyric-row" class="friends-primary-button">+ Thêm dòng lyric</button>
						<button type="button" id="btn-stamp-current-sec" class="friends-secondary-button">⏱ Lấy giây đang phát (<span id="lyric-live-sec">0.0</span>s)</button>
					</div>
					<div id="admin-lyric-rows" style="display:grid; gap:8px; max-height:330px; overflow-y:auto; padding:4px 2px;"></div>
					<div class="mod-actions-row">
						<button type="button" id="btn-cancel-lyric-modal" class="friends-secondary-button">Hủy</button>
						<button type="button" id="btn-save-lyric-modal" class="friends-primary-button">Lưu Lyric lên máy chủ</button>
					</div>
				</div>
			`;
			document.body.appendChild(modal);

			modal.querySelector("#btn-close-lyric-modal").addEventListener("click", () => { modal.hidden = true; });
			modal.querySelector("#btn-cancel-lyric-modal").addEventListener("click", () => { modal.hidden = true; });
		}

		const rowsContainer = modal.querySelector("#admin-lyric-rows");
		modal.querySelector("#admin-lyric-modal-title").textContent = `Lyric: ${track.title}`;

		function appendLyricRow(item = { startSec: "", endSec: "", text: "" }) {
			const row = document.createElement("div");
			row.className = "lyric-editor-row";
			row.innerHTML = `
				<input type="number" step="0.1" min="0" class="lyric-start-in" placeholder="Từ (s)" value="${item.startSec !== "" ? item.startSec : ""}">
				<input type="number" step="0.1" min="0" class="lyric-end-in" placeholder="Đến (s)" value="${item.endSec !== "" ? item.endSec : ""}">
				<input type="text" class="lyric-text-in" placeholder="Câu lời bài hát..." value="${escapeHtml(item.text || "")}">
				<button type="button" class="btn-del-lyric-row" title="Xóa dòng">×</button>
			`;
			row.querySelector(".btn-del-lyric-row").addEventListener("click", () => row.remove());
			rowsContainer.appendChild(row);
		}

		rowsContainer.innerHTML = "";
		const existing = Array.isArray(track.lyrics) && track.lyrics.length ? track.lyrics : [{ startSec: 0, endSec: 5, text: "" }];
		existing.forEach(appendLyricRow);

		const secSpan = modal.querySelector("#lyric-live-sec");
		const secTimer = setInterval(() => {
			if (modal.hidden) {
				clearInterval(secTimer);
				return;
			}
			secSpan.textContent = (Number(hubAudio?.currentTime || 0)).toFixed(1);
		}, 250);

		modal.querySelector("#btn-add-lyric-row").onclick = () => {
			const cur = Number((Number(hubAudio?.currentTime || 0)).toFixed(1));
			appendLyricRow({ startSec: cur, endSec: Number((cur + 4).toFixed(1)), text: "" });
		};

		modal.querySelector("#btn-stamp-current-sec").onclick = () => {
			const cur = Number((Number(hubAudio?.currentTime || 0)).toFixed(1));
			const rows = [...rowsContainer.querySelectorAll(".lyric-editor-row")];
			const targetRow = rows[rows.length - 1];
			if (targetRow) {
				targetRow.querySelector(".lyric-start-in").value = String(cur);
				targetRow.querySelector(".lyric-end-in").value = String(Number((cur + 4).toFixed(1)));
				targetRow.querySelector(".lyric-text-in").focus();
			}
		};

		modal.querySelector("#btn-save-lyric-modal").onclick = async () => {
			const payloadLyrics = [...rowsContainer.querySelectorAll(".lyric-editor-row")].map(r => ({
				startSec: parseFloat(r.querySelector(".lyric-start-in").value),
				endSec: parseFloat(r.querySelector(".lyric-end-in").value),
				text: r.querySelector(".lyric-text-in").value.trim()
			})).filter(x => x.text && Number.isFinite(x.startSec) && Number.isFinite(x.endSec) && x.endSec > x.startSec);

			const saveBtn = modal.querySelector("#btn-save-lyric-modal");
			saveBtn.disabled = true;
			saveBtn.textContent = "Đang lưu...";
			try {
				const res = await fetch(`${MUSIC_API}/${encodeURIComponent(track.id)}/lyrics`, {
					method: "PUT",
					credentials: "include",
					headers: getAuthHeaders({ "Content-Type": "application/json" }),
					body: JSON.stringify({ lyrics: payloadLyrics })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.error || "Không thể lưu Lyric.");
				const idx = allTracks.findIndex(t => String(t.id) === String(track.id));
				if (idx !== -1 && data.track) allTracks[idx] = data.track;
				applyFilters();
				renderPlaylistsSection();
				openSpotifyPlayerView(data.track || track);
				modal.hidden = true;
				notify("Đã cập nhật Lyric cho bài hát!", "success");
			} catch (err) {
				notify(err.message || "Lỗi khi lưu Lyric.", "error");
			} finally {
				saveBtn.disabled = false;
				saveBtn.textContent = "Lưu Lyric lên máy chủ";
			}
		};

		modal.hidden = false;
	}
		// =========================================================
	// 3. TẠO & ĐĂNG PLAYLIST CỘNG ĐỒNG TRÊN TRANG MUSIC
	// =========================================================
	function ensurePlaylistUI() {
		if (!trackListEl || document.getElementById("music-playlists-wrapper")) return;

		const wrapper = document.createElement("section");
		wrapper.id = "music-playlists-wrapper";
		wrapper.className = "music-playlists-wrapper";
		wrapper.innerHTML = `
			<div class="music-playlists-header">
				<div>
					<h2 style="font-size:19px; color:var(--text-main);">📀 Playlist Cộng Đồng DIEUNW</h2>
					<p style="font-size:12.5px; color:var(--text-muted);">Tuyển tập nhạc học bài được chia sẻ bởi thành viên.</p>
				</div>
				<button type="button" id="btn-toggle-playlist-creator" class="friends-primary-button" hidden>+ Tạo & Đăng Playlist</button>
			</div>

			<div id="playlist-creator-panel" class="playlist-creator-panel" hidden>
				<h3 style="font-size:16px; margin-bottom:10px;">Tạo Playlist mới</h3>
				<div style="display:grid; gap:10px;">
					<input type="text" id="playlist-title-input" placeholder="Tên Playlist (VD: Nhạc Lofi cày đề 2h sáng)..." maxlength="120" class="group-input">
					<input type="text" id="playlist-desc-input" placeholder="Mô tả ngắn gọn về Playlist..." maxlength="400" class="group-input">
					<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
						<label class="image-upload-label">🖼 Ảnh bìa Playlist (tùy chọn) <input type="file" id="playlist-cover-input" accept="image/*" hidden></label>
						<span id="playlist-cover-name" style="font-size:12px; color:var(--text-muted);">Mặc định theo bài đầu tiên</span>
					</div>
					<div>
						<p style="font-size:12.5px; font-weight:700; margin-bottom:6px;">Chọn các bài hát đưa vào Playlist:</p>
						<div id="playlist-track-checklist" class="playlist-track-checklist"></div>
					</div>
					<div style="display:flex; justify-content:flex-end; gap:8px;">
						<button type="button" id="btn-cancel-playlist" class="friends-secondary-button">Đóng</button>
						<button type="button" id="btn-submit-playlist" class="friends-primary-button">Đăng Playlist lên Kho nhạc</button>
					</div>
				</div>
			</div>

			<div id="music-playlists-grid" class="music-playlists-grid"></div>
		`;

		trackListEl.parentElement.insertBefore(wrapper, trackListEl);

		const toggleBtn = wrapper.querySelector("#btn-toggle-playlist-creator");
		const panel = wrapper.querySelector("#playlist-creator-panel");
		const coverInput = wrapper.querySelector("#playlist-cover-input");
		const coverName = wrapper.querySelector("#playlist-cover-name");
		let plCoverDataUrl = "";

		toggleBtn.addEventListener("click", () => {
			panel.hidden = !panel.hidden;
			if (!panel.hidden) {
				renderPlaylistChecklist();
				wrapper.querySelector("#playlist-title-input")?.focus();
			}
		});

		wrapper.querySelector("#btn-cancel-playlist").addEventListener("click", () => {
			panel.hidden = true;
		});

		coverInput.addEventListener("change", async (e) => {
			const f = e.target.files?.[0];
			if (!f) {
				plCoverDataUrl = "";
				coverName.textContent = "Mặc định theo bài đầu tiên";
				return;
			}
			try {
				plCoverDataUrl = await compressCover(f, 720);
				coverName.textContent = f.name;
			} catch (err) {
				plCoverDataUrl = "";
				notify(err.message || "Không xử lý được ảnh bìa.", "error");
			}
		});

		wrapper.querySelector("#btn-submit-playlist").addEventListener("click", async () => {
			const title = wrapper.querySelector("#playlist-title-input").value.trim();
			const description = wrapper.querySelector("#playlist-desc-input").value.trim();
			const checkedIds = [...wrapper.querySelectorAll(".pl-track-checkbox:checked")].map(cb => cb.value);

			if (!title) {
				notify("Vui lòng nhập tên Playlist.", "warning");
				return;
			}
			if (!checkedIds.length) {
				notify("Hãy chọn ít nhất 1 bài hát vào Playlist nhé!", "warning");
				return;
			}

			const submitBtn = wrapper.querySelector("#btn-submit-playlist");
			submitBtn.disabled = true;
			submitBtn.textContent = "Đang đăng...";
			try {
				const res = await fetch(PLAYLIST_API, {
					method: "POST",
					credentials: "include",
					headers: getAuthHeaders({ "Content-Type": "application/json" }),
					body: JSON.stringify({
						title,
						description,
						coverImage: plCoverDataUrl,
						trackIds: checkedIds
					})
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.error || "Không thể đăng Playlist.");
				if (data.playlist) allPlaylists.unshift(data.playlist);
				wrapper.querySelector("#playlist-title-input").value = "";
				wrapper.querySelector("#playlist-desc-input").value = "";
				plCoverDataUrl = "";
				coverInput.value = "";
				coverName.textContent = "Mặc định theo bài đầu tiên";
				panel.hidden = true;
				renderPlaylistsSection();
				notify("Đã đăng Playlist mới lên trang Kho nhạc!", "success");
			} catch (err) {
				notify(err.message || "Lỗi khi đăng Playlist.", "error");
			} finally {
				submitBtn.disabled = false;
				submitBtn.textContent = "Đăng Playlist lên Kho nhạc";
			}
		});
	}

	function renderPlaylistChecklist() {
		const box = document.getElementById("playlist-track-checklist");
		if (!box) return;
		if (!allTracks.length) {
			box.innerHTML = "<p style='font-size:12px; color:var(--text-muted);'>Chưa có bài hát nào trong Kho nhạc.</p>";
			return;
		}
		box.innerHTML = allTracks.map(tr => `
			<label class="pl-check-item">
				<input type="checkbox" class="pl-track-checkbox" value="${escapeHtml(tr.id)}">
				<span>${escapeHtml(tr.title)} <small style="color:var(--text-muted);">(${escapeHtml(tr.artist || "Ẩn danh")})</small></span>
			</label>
		`).join("");
	}

	function renderPlaylistsSection() {
		ensurePlaylistUI();
		const createBtn = document.getElementById("btn-toggle-playlist-creator");
		if (createBtn) createBtn.hidden = !Boolean(currentUser?.id);

		const grid = document.getElementById("music-playlists-grid");
		if (!grid) return;
		grid.innerHTML = "";

		if (!allPlaylists.length) {
			grid.innerHTML = "<p style='font-size:12.5px; color:var(--text-muted); grid-column:1/-1;'>Chưa có Playlist nào được đăng. Hãy là người đầu tiên tạo Playlist nhé!</p>";
			return;
		}

		allPlaylists.forEach(pl => {
			const card = document.createElement("article");
			card.className = "playlist-card";
			const coverSrc = resolveMedia(pl.coverImage) || "./DIEU.avif";
			const canDel = currentUser && (String(currentUser.id) === String(pl.userId) || currentUser.isAdmin);

			card.innerHTML = `
				<img src="${escapeHtml(coverSrc)}" class="playlist-card-cover" alt="">
				<div class="playlist-card-body">
					<h4>${escapeHtml(pl.title)}</h4>
					<p class="playlist-card-meta">${pl.trackCount} bài hát · Tạo bởi ${escapeHtml(pl.creatorName)}</p>
					${pl.description ? `<p class="playlist-card-desc">${escapeHtml(pl.description)}</p>` : ""}
					<div class="playlist-card-actions">
						<button type="button" class="friends-primary-button btn-play-pl">▶ Phát Playlist</button>
						${canDel ? `<button type="button" class="friends-remove-button btn-del-pl">Xóa</button>` : ""}
					</div>
				</div>
			`;

			card.querySelector(".btn-play-pl").addEventListener("click", () => {
				if (!Array.isArray(pl.tracks) || !pl.tracks.length) {
					notify("Playlist này hiện chưa có bài hát khả dụng.", "warning");
					return;
				}
				activeQueue = [...pl.tracks];
				const firstIdx = isShuffle ? Math.floor(Math.random() * activeQueue.length) : 0;
				playTrack(activeQueue[firstIdx], true);
				notify(`Đang phát Playlist "${pl.title}" (${activeQueue.length} bài)`, "success");
			});

			card.querySelector(".btn-del-pl")?.addEventListener("click", async () => {
				const ok = await askConfirm(`Xóa Playlist "${pl.title}"?`, "Xóa Playlist", true);
				if (!ok) return;
				try {
					const res = await fetch(`${PLAYLIST_API}/${encodeURIComponent(pl.id)}`, {
						method: "DELETE",
						credentials: "include",
						headers: getAuthHeaders()
					});
					if (!res.ok) throw new Error("Không thể xóa Playlist.");
					allPlaylists = allPlaylists.filter(item => String(item.id) !== String(pl.id));
					renderPlaylistsSection();
					notify("Đã xóa Playlist.", "success");
				} catch (err) {
					notify(err.message || "Lỗi khi xóa Playlist.", "error");
				}
			});

			grid.appendChild(card);
		});
	}

	// =========================================================
	// 4. UPLOAD NHẠC, PHÁT NHẠC, TAG ĐỎ LYRIC & SHUFFLE
	// =========================================================
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
			compressedCoverDataUrl = await compressCover(f, 720);
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
			if (compressedCoverDataUrl) fd.append("coverImage", compressedCoverDataUrl);

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
				renderPlaylistChecklist();
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
		return allTracks.find(t => String(t.id) === String(activeTrackId))
			|| activeQueue.find(t => String(t.id) === String(activeTrackId))
			|| null;
	}

	function toggleShuffleMode() {
		isShuffle = !isShuffle;
		localStorage.setItem("dieunw_music_shuffle", isShuffle ? "1" : "0");
		syncCardsAndDeckUI();
		notify(isShuffle ? "Đã bật chạy ngẫu nhiên bài hát 🔀" : "Đã tắt chạy ngẫu nhiên", "info");
	}

	// Chèn nút Shuffle & nút Mở giao diện Spotify Lyric lên Deck Bar
	let deckShuffleBtn = document.getElementById("deck-shuffle-btn");
	if (!deckShuffleBtn && deckPrevBtn?.parentElement) {
		deckShuffleBtn = document.createElement("button");
		deckShuffleBtn.type = "button";
		deckShuffleBtn.id = "deck-shuffle-btn";
		deckShuffleBtn.title = "Phát ngẫu nhiên";
		deckShuffleBtn.textContent = "🔀";
		deckShuffleBtn.addEventListener("click", toggleShuffleMode);
		deckPrevBtn.parentElement.insertBefore(deckShuffleBtn, deckPrevBtn);
	}

	let deckExpandLyricBtn = document.getElementById("deck-expand-lyric-btn");
	if (!deckExpandLyricBtn && deckSendGlobalBtn?.parentElement) {
		deckExpandLyricBtn = document.createElement("button");
		deckExpandLyricBtn.type = "button";
		deckExpandLyricBtn.id = "deck-expand-lyric-btn";
		deckExpandLyricBtn.className = "music-action-btn";
		deckExpandLyricBtn.textContent = "🎤 Lyric";
		deckExpandLyricBtn.addEventListener("click", () => openSpotifyPlayerView());
		deckSendGlobalBtn.parentElement.insertBefore(deckExpandLyricBtn, deckSendGlobalBtn);
	}

	function playTrack(track, openSpotify = true) {
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
			if (openSpotify) openSpotifyPlayerView(track);
			syncCardsAndDeckUI();
			return;
		}

		activeTrackId = track.id;
		if (!activeQueue.length) {
			activeQueue = filteredTracks.length ? [...filteredTracks] : [...allTracks];
		}

		hubAudio.src = src;
		hubAudio.play().catch(() => {});

		if (deckBar) deckBar.hidden = false;
		if (deckCover) deckCover.src = resolveMedia(track.coverImage || track.coverUrl || track.cover_url) || "./DIEU.avif";
		if (deckTitle) deckTitle.textContent = track.title || "Không rõ tiêu đề";
		if (deckArtist) deckArtist.textContent = track.artist || track.authorName || "Thành viên DIEUNW";

		if (openSpotify) {
			openSpotifyPlayerView(track);
		}

		if (!countedPlays.has(String(track.id))) {
			countedPlays.add(String(track.id));
			fetch(`${MUSIC_API}/${encodeURIComponent(track.id)}/play`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders()
			}).then(r => r.ok ? r.json() : null).then(data => {
				if (data && typeof data.plays === "number") {
					track.playCount = data.plays;
					track.plays = data.plays;
					const playBadge = document.querySelector(`.music-track-card[data-track-id="${track.id}"] .track-plays-count`);
					if (playBadge) playBadge.textContent = `${data.plays} lượt nghe`;
				}
			}).catch(() => {});
		}

		syncCardsAndDeckUI();
	}

	function playRelativeTrack(step) {
		const list = activeQueue.length ? activeQueue : (filteredTracks.length ? filteredTracks : allTracks);
		if (!list.length) return;
		const idx = list.findIndex(t => String(t.id) === String(activeTrackId));
		let nextIdx = 0;
		if (isShuffle && list.length > 1) {
			nextIdx = idx;
			while (nextIdx === idx) {
				nextIdx = Math.floor(Math.random() * list.length);
			}
		} else {
			nextIdx = idx === -1 ? 0 : ((idx + step + list.length) % list.length);
		}
		const overlay = document.getElementById("spotify-lyric-overlay");
		const keepSpotifyOpen = Boolean(overlay && !overlay.hidden);
		playTrack(list[nextIdx], keepSpotifyOpen);
	}

	function syncCardsAndDeckUI() {
		const isPlaying = Boolean(hubAudio && !hubAudio.paused && hubAudio.src);
		if (deckPlayBtn) deckPlayBtn.textContent = isPlaying ? "⏸" : "▶";
		if (deckShuffleBtn) deckShuffleBtn.classList.toggle("is-shuffle-active", isShuffle);

		const spPlayBtn = document.getElementById("spotify-play-btn");
		const spShuffleBtn = document.getElementById("spotify-shuffle-btn");
		if (spPlayBtn) spPlayBtn.textContent = isPlaying ? "⏸" : "▶";
		if (spShuffleBtn) spShuffleBtn.classList.toggle("is-shuffle-active", isShuffle);

		document.querySelectorAll(".music-track-card").forEach(card => {
			const isThis = String(card.dataset.trackId) === String(activeTrackId);
			card.classList.toggle("is-active", isThis);
			const iconSpan = card.querySelector(".music-cover-overlay");
			if (iconSpan) iconSpan.textContent = isThis && isPlaying ? "⏸" : "▶";
		});
	}

	deckPlayBtn?.addEventListener("click", () => {
		const tr = getActiveTrack();
		if (tr) playTrack(tr, false);
		else if (filteredTracks[0]) {
			activeQueue = [...filteredTracks];
			playTrack(isShuffle ? activeQueue[Math.floor(Math.random() * activeQueue.length)] : filteredTracks[0], true);
		}
	});
	deckPrevBtn?.addEventListener("click", () => playRelativeTrack(-1));
	deckNextBtn?.addEventListener("click", () => playRelativeTrack(1));

	deckSendGlobalBtn?.addEventListener("click", () => {
		const tr = getActiveTrack();
		if (!tr) return;
		const queuePayload = (activeQueue.length ? activeQueue : filteredTracks).map(item => ({
			id: item.id,
			title: item.title,
			artist: item.artist || item.authorName || "",
			audioUrl: resolveMedia(item.audioUrl || item.audio_url),
			coverUrl: resolveMedia(item.coverImage || item.coverUrl || item.cover_url)
		}));
		if (typeof window.dieunwPlayGlobalTrack === "function") {
			const resumeTime = Number(hubAudio?.currentTime || 0);
			hubAudio?.pause();
			window.dieunwPlayGlobalTrack({
				id: tr.id,
				title: tr.title,
				artist: tr.artist || tr.authorName || "",
				audioUrl: resolveMedia(tr.audioUrl || tr.audio_url),
				coverUrl: resolveMedia(tr.coverImage || tr.coverUrl || tr.cover_url),
				startTime: resumeTime,
				shuffle: isShuffle
			}, queuePayload);
			notify(`Đã chuyển "${tr.title}" sang đĩa nhạc xuyên trang!`, "success");
		} else {
			notify("Trình phát toàn web chưa sẵn sàng.", "info");
		}
	});

	hubAudio?.addEventListener("play", syncCardsAndDeckUI);
	hubAudio?.addEventListener("pause", syncCardsAndDeckUI);
	hubAudio?.addEventListener("ended", () => playRelativeTrack(1));
	hubAudio?.addEventListener("loadedmetadata", () => {
		if (deckDurTimeEl) deckDurTimeEl.textContent = formatDuration(hubAudio.duration);
		const spDur = document.getElementById("spotify-dur-time");
		if (spDur) spDur.textContent = formatDuration(hubAudio.duration);
	});
	hubAudio?.addEventListener("timeupdate", () => {
		updateSyncedLyricUI(false);
		if (!hubAudio.duration || isSeeking) return;
		const pct = (hubAudio.currentTime / hubAudio.duration) * 100;
		if (deckCurTimeEl) deckCurTimeEl.textContent = formatDuration(hubAudio.currentTime);
		if (deckDurTimeEl) deckDurTimeEl.textContent = formatDuration(hubAudio.duration);
		if (deckSeekSlider) deckSeekSlider.value = String(pct);

		const spCur = document.getElementById("spotify-cur-time");
		const spDur = document.getElementById("spotify-dur-time");
		const spSeek = document.getElementById("spotify-seek-slider");
		if (spCur) spCur.textContent = formatDuration(hubAudio.currentTime);
		if (spDur) spDur.textContent = formatDuration(hubAudio.duration);
		if (spSeek) spSeek.value = String(pct);

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
		updateSyncedLyricUI(true);
	});

	function createTrackCard(track) {
		const card = document.createElement("article");
		card.className = `music-track-card ${String(track.id) === String(activeTrackId) ? "is-active" : ""}`;
		card.dataset.trackId = track.id;

		const coverBtn = document.createElement("button");
		coverBtn.type = "button";
		coverBtn.className = "music-cover-btn";
		coverBtn.title = "Mở trình phát & Lyric";
		const img = document.createElement("img");
		img.src = resolveMedia(track.coverImage || track.coverUrl || track.cover_url) || "./DIEU.avif";
		img.alt = "";
		img.loading = "lazy";
		const overlay = document.createElement("span");
		overlay.className = "music-cover-overlay";
		overlay.textContent = String(track.id) === String(activeTrackId) && !hubAudio.paused ? "⏸" : "▶";
		coverBtn.append(img, overlay);
		coverBtn.addEventListener("click", () => {
			activeQueue = [...filteredTracks];
			playTrack(track, true);
		});

		const body = document.createElement("div");
		body.className = "music-track-body";

		const top = document.createElement("div");
		top.className = "music-track-top";
		const titleWrap = document.createElement("div");
		titleWrap.style.minWidth = "0";

		const h3 = document.createElement("h3");
		h3.className = "music-track-title";
		h3.style.cursor = "pointer";
		h3.textContent = track.title || "Không rõ tên";
		h3.addEventListener("click", () => {
			activeQueue = [...filteredTracks];
			playTrack(track, true);
		});

		if (track.hasLyrics || (Array.isArray(track.lyrics) && track.lyrics.length > 0)) {
			const lyricTag = document.createElement("span");
			lyricTag.className = "music-lyric-badge";
			lyricTag.textContent = "LYRIC";
			h3.append(" ", lyricTag);
		}

		const artistP = document.createElement("p");
		artistP.className = "music-track-artist";
		artistP.textContent = `${track.artist || "Ẩn danh"} · Đăng bởi ${track.uploaderName || track.authorName || track.name || "Thành viên"}`;
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
				activeQueue = [...filteredTracks];
				playTrack(track, true);
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
		playsSpan.textContent = `${Number(track.playCount ?? track.plays ?? 0)} lượt nghe`;
		progressRow.append(curTimeSpan, seekSlider, playsSpan);

		const actions = document.createElement("div");
		actions.className = "music-track-actions";

		const openSpotifyBtn = document.createElement("button");
		openSpotifyBtn.type = "button";
		openSpotifyBtn.className = "music-action-btn";
		openSpotifyBtn.textContent = "🎤 Mở Lyric";
		openSpotifyBtn.addEventListener("click", () => {
			activeQueue = [...filteredTracks];
			playTrack(track, true);
		});

		const likeBtn = document.createElement("button");
		likeBtn.type = "button";
		likeBtn.className = `music-action-btn ${track.likedByMe ? "liked" : ""}`;
		likeBtn.textContent = `♥ ${Number(track.likesCount ?? track.likes ?? 0)} Thích`;
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
					headers: getAuthHeaders({ "Content-Type": "application/json" }),
					body: JSON.stringify({ liked: nextLiked })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.error || "Không thể thích bài hát.");
				track.likedByMe = nextLiked;
				const newCount = Number(data.likeCount ?? data.likes ?? (nextLiked ? Number(track.likesCount ?? track.likes ?? 0) + 1 : Math.max(0, Number(track.likesCount ?? track.likes ?? 0) - 1)));
				track.likesCount = newCount;
				track.likes = newCount;
				likeBtn.classList.toggle("liked", nextLiked);
				likeBtn.textContent = `♥ ${newCount} Thích`;
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
					coverUrl: resolveMedia(track.coverImage || track.coverUrl || track.cover_url),
					shuffle: isShuffle
				});
				notify(`Đang phát "${track.title}" trên đĩa nhạc góc trên!`, "success");
			}
		});

		const downloadBtn = document.createElement("a");
		downloadBtn.className = "music-action-btn";
		downloadBtn.textContent = "⬇ Tải về";
		const rawAudioUrl = resolveMedia(track.audioUrl || track.audio_url);
		downloadBtn.href = rawAudioUrl.includes("://cloudinary.com") && !rawAudioUrl.includes("/raw/upload/")
			? rawAudioUrl.replace("/upload/", "/upload/fl_attachment/")
			: rawAudioUrl;
		downloadBtn.download = `${track.title || "nhac-dieunw"}`;
		downloadBtn.target = "_blank";

		actions.append(openSpotifyBtn, likeBtn, globalBtn, downloadBtn);

		if (currentUser?.isAdmin) {
			const editLyricBtn = document.createElement("button");
			editLyricBtn.type = "button";
			editLyricBtn.className = "music-action-btn";
			editLyricBtn.textContent = "✎ Sửa Lyric";
			editLyricBtn.addEventListener("click", () => openAdminLyricEditor(track));
			actions.append(editLyricBtn);
		}

		const ownerId = String(track.userId || track.user_id || "");
		const canDelete = currentUser && (String(currentUser.id) === ownerId || currentUser.isAdmin || currentUser.isModerator);
		if (canDelete) {
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.className = "music-action-btn delete";
			delBtn.textContent = "Xóa";
			delBtn.addEventListener("click", async () => {
				const ok = await askConfirm(`Bạn muốn xóa bài hát "${track.title}" khỏi Kho nhạc?`, "Xóa bài hát", true);
				if (!ok) return;
				delBtn.disabled = true;
				try {
					const res = await fetch(`${MUSIC_API}/${encodeURIComponent(track.id)}`, {
						method: "DELETE",
						credentials: "include",
						headers: getAuthHeaders()
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
				|| (t.uploaderName || t.authorName || t.name || "").toLowerCase().includes(q);
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
			const [tracksRes, playlistsRes] = await Promise.all([
				fetch(MUSIC_API, { credentials: "include", headers: getAuthHeaders() }),
				fetch(PLAYLIST_API, { credentials: "include", headers: getAuthHeaders() }).catch(() => null)
			]);
			const data = await tracksRes.json();
			if (!tracksRes.ok) throw new Error(data.error || "Không thể tải Kho nhạc.");
			allTracks = Array.isArray(data.tracks) ? data.tracks : [];
			applyFilters();

			if (playlistsRes && playlistsRes.ok) {
				const plData = await playlistsRes.json();
				allPlaylists = Array.isArray(plData.playlists) ? plData.playlists : [];
			}
			renderPlaylistsSection();
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

	fetch(`${API_BASE}/api/auth/me`, {
		credentials: "include",
		headers: getAuthHeaders()
	})
		.then(r => r.ok ? r.json() : { user: null })
		.then(data => {
			currentUser = data.user || null;
			if (toggleUploadBtn) toggleUploadBtn.hidden = !Boolean(currentUser?.id);
			renderPlaylistsSection();
		})
		.catch(() => {})
		.finally(() => loadTracks());
});