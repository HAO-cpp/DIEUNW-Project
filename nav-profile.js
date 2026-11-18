(() => {
	const API_BASE = "https://dieunw.onrender.com";
	const fallbackAvatar = "./DIEU.png";
	const AUDIO_STATE_KEY = "dieunw_global_audio_state_v1";

	function getToken() {
		try {
			return localStorage.getItem("session_token") || "";
		} catch {
			return "";
		}
	}

	function resolveMediaUrl(url) {
		const clean = String(url || "").trim();
		if (!clean) return "";
		if (clean.startsWith("/uploads/")) return `${API_BASE}${clean}`;
		if (clean.startsWith("./") || clean.startsWith("../") || clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("data:") || clean.startsWith("blob:")) {
			return clean;
		}
		return clean;
	}
	window.dieunwResolveMedia = resolveMediaUrl;

	const originalFetch = window.fetch;
	window.fetch = function(url, options = {}) {
		if (typeof url === "string" && url.includes("dieunw.onrender.com")) {
			const token = getToken();
			if (token) {
				options = { ...options };
				options.headers = {
					...(options.headers || {}),
					"Authorization": `Bearer ${token}`
				};
			}
		}
		return originalFetch(url, options);
	};

	function getSavedUser() {
		try {
			return JSON.parse(localStorage.getItem("dieuNwUser") || "null");
		} catch {
			return null;
		}
	}

	// =========================================================
	// 1. NỀN WEB CÁ NHÂN THEO TỪNG NGƯỜI DÙNG (SITE BACKGROUND)
	// =========================================================
	const SITE_BG_PRESETS = {
		default: "",
		aurora: "radial-gradient(circle at 12% 18%, rgba(56, 189, 248, 0.24), transparent 42%), radial-gradient(circle at 86% 14%, rgba(168, 85, 247, 0.2), transparent 44%), linear-gradient(135deg, #eef7ff 0%, #f5f3ff 52%, #ecfeff 100%)",
		sunset: "radial-gradient(circle at 15% 15%, rgba(251, 146, 60, 0.24), transparent 45%), linear-gradient(135deg, #fff4ed 0%, #ffe8e5 52%, #fef9c3 100%)",
		forest: "radial-gradient(circle at 82% 18%, rgba(34, 197, 94, 0.2), transparent 45%), linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 55%, #eff6ff 100%)",
		midnight: "radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.16), transparent 42%), radial-gradient(circle at 80% 80%, rgba(129, 140, 248, 0.18), transparent 45%), linear-gradient(135deg, #0b1220 0%, #111c33 55%, #0f172a 100%)",
		cherry: "radial-gradient(circle at 16% 20%, rgba(244, 114, 182, 0.22), transparent 42%), linear-gradient(135deg, #fff1f5 0%, #fdf2f8 50%, #f5f3ff 100%)"
	};

	function applySiteBg(siteBg) {
		if (!document.body) return;
		const cfg = siteBg && typeof siteBg === "object" ? siteBg : { mode: "default" };
		const mode = String(cfg.mode || "default");
		const value = String(cfg.value || "").trim();

		document.body.classList.remove("has-custom-site-bg", "site-bg-dark");
		document.body.style.removeProperty("--dieunw-site-bg");
		document.body.style.removeProperty("--dieunw-site-bg-image");

		if (mode === "preset" && SITE_BG_PRESETS[value]) {
			document.body.classList.add("has-custom-site-bg");
			if (value === "midnight") document.body.classList.add("site-bg-dark");
			document.body.style.setProperty("--dieunw-site-bg", SITE_BG_PRESETS[value]);
		} else if (mode === "color" && /^#[0-9a-f]{6}$/i.test(value)) {
			document.body.classList.add("has-custom-site-bg");
			const r = parseInt(value.slice(1, 3), 16);
			const g = parseInt(value.slice(3, 5), 16);
			const b = parseInt(value.slice(5, 7), 16);
			if ((0.299 * r + 0.587 * g + 0.114 * b) < 115) document.body.classList.add("site-bg-dark");
			document.body.style.setProperty("--dieunw-site-bg", value);
		} else if (mode === "gradient" && value) {
			document.body.classList.add("has-custom-site-bg");
			document.body.style.setProperty("--dieunw-site-bg", value);
		} else if (mode === "image" && value) {
			document.body.classList.add("has-custom-site-bg");
			const resolved = resolveMediaUrl(value);
			document.body.style.setProperty("--dieunw-site-bg-image", `url("${resolved.replace(/"/g, '\\"')}")`);
		}
	}
	window.dieunwApplySiteBg = applySiteBg;
	window.DIEUNW_SITE_BG_PRESETS = SITE_BG_PRESETS;

	// =========================================================
	// 2. TOAST THÔNG BÁO & HỘP THOẠI XÁC NHẬN HIỆN ĐẠI
	// =========================================================
	function ensureToastContainer() {
		let container = document.getElementById("dieunw-toast-container");
		if (!container) {
			container = document.createElement("div");
			container.id = "dieunw-toast-container";
			container.className = "dieunw-toast-container";
			container.setAttribute("aria-live", "polite");
			document.body.appendChild(container);
		}
		return container;
	}

	function detectToastTone(msg, explicitTone) {
		if (explicitTone) return explicitTone;
		const lower = String(msg || "").toLowerCase();
		if (/(lỗi|thất bại|không thể|sai|hết hạn|từ chối|thiếu|không hợp lệ|cảnh báo|chưa đăng nhập)/.test(lower)) return "error";
		if (/(chúc mừng|thành công|đã đăng|đã lưu|đã gửi|đã xóa|hoàn tất|sẵn sàng|tuyệt|đã cập nhật|đã kết bạn|đã tạo)/.test(lower)) return "success";
		if (/(chú ý|nhắc|vui lòng|đang |chờ)/.test(lower)) return "warning";
		return "info";
	}

	function showToast(message, toneOrDuration = "info", durationMs = 3800) {
		const text = String(message || "").trim();
		if (!text) return;
		let tone = "info";
		let duration = durationMs;
		if (typeof toneOrDuration === "number") {
			duration = toneOrDuration;
			tone = detectToastTone(text);
		} else {
			tone = detectToastTone(text, toneOrDuration === "info" ? null : toneOrDuration);
		}

		const container = ensureToastContainer();
		const toast = document.createElement("div");
		toast.className = `dieunw-toast dieunw-toast--${tone}`;
		const icons = { success: "✓", error: "✕", warning: "!", info: "i" };
		toast.innerHTML = `
			<span class="dieunw-toast-icon" aria-hidden="true">${icons[tone] || "i"}</span>
			<div class="dieunw-toast-body"></div>
			<button type="button" class="dieunw-toast-close" aria-label="Đóng thông báo">×</button>
		`;
		toast.querySelector(".dieunw-toast-body").textContent = text;
		container.appendChild(toast);
		requestAnimationFrame(() => toast.classList.add("is-visible"));

		const removeToast = () => {
			if (toast.dataset.closing) return;
			toast.dataset.closing = "1";
			toast.classList.remove("is-visible");
			setTimeout(() => toast.remove(), 260);
		};
		toast.querySelector(".dieunw-toast-close").addEventListener("click", removeToast);
		setTimeout(removeToast, Math.max(1800, duration));
	}

	window.dieunwToast = showToast;
	if (!window.__dieunwNativeAlert) {
		window.__dieunwNativeAlert = window.alert.bind(window);
		window.alert = msg => showToast(msg);
	}

	window.dieunwConfirm = function(message, options = {}) {
		return new Promise(resolve => {
			const overlay = document.createElement("div");
			overlay.className = "dieunw-confirm-overlay";
			overlay.innerHTML = `
				<div class="dieunw-confirm-box" role="dialog" aria-modal="true">
					<h3 class="dieunw-confirm-title"></h3>
					<p class="dieunw-confirm-msg"></p>
					<div class="dieunw-confirm-actions">
						<button type="button" class="dieunw-confirm-btn cancel">${options.cancelText || "Hủy"}</button>
						<button type="button" class="dieunw-confirm-btn confirm ${options.danger ? "danger" : ""}">${options.confirmText || "Xác nhận"}</button>
					</div>
				</div>
			`;
			overlay.querySelector(".dieunw-confirm-title").textContent = options.title || "Xác nhận thao tác";
			overlay.querySelector(".dieunw-confirm-msg").textContent = String(message || "");
			document.body.appendChild(overlay);
			requestAnimationFrame(() => overlay.classList.add("open"));

			const done = val => {
				overlay.classList.remove("open");
				setTimeout(() => overlay.remove(), 200);
				resolve(val);
			};
			overlay.querySelector(".cancel").addEventListener("click", () => done(false));
			overlay.querySelector(".confirm").addEventListener("click", () => done(true));
			overlay.addEventListener("click", e => {
				if (e.target === overlay) done(false);
			});
		});
	};

	function observeStatusBanners() {
		const selectors = [
			".profile-status", ".profile-extra-status", ".clubs-form-status",
			".friends-status", ".chat-page-status", ".messages-loading", "#upload-status"
		];
		const decorate = el => {
			if (!el) return;
			const txt = (el.textContent || "").trim();
			el.classList.remove("status-tone-success", "status-tone-error", "status-tone-info");
			if (!txt) return;
			const tone = detectToastTone(txt, el.classList.contains("error") || el.classList.contains("is-error") ? "error" : null);
			el.classList.add(`status-tone-${tone}`);
		};
		const applyAll = () => selectors.forEach(s => document.querySelectorAll(s).forEach(decorate));
		applyAll();
		const obs = new MutationObserver(applyAll);
		obs.observe(document.body, { subtree: true, childList: true, characterData: true });
	}

	// =========================================================
	// 3. HELPER UPLOAD XHR CÓ THANH % & NÉN ẢNH NHANH
	// =========================================================
	window.dieunwUploadWithProgress = function(url, options = {}, onProgress) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			const method = String(options.method || "POST").toUpperCase();
			xhr.open(method, url, true);
			xhr.withCredentials = Boolean(options.credentials === "include");

			const token = getToken();
			if (token && url.includes("dieunw.onrender.com")) {
				xhr.setRequestHeader("Authorization", `Bearer ${token}`);
			}
			if (options.headers && typeof options.headers === "object") {
				Object.entries(options.headers).forEach(([k, v]) => {
					if (v !== undefined && v !== null) xhr.setRequestHeader(k, String(v));
				});
			}

			if (xhr.upload && typeof onProgress === "function") {
				xhr.upload.onprogress = evt => {
					if (evt.lengthComputable && evt.total > 0) {
						const pct = Math.min(97, Math.max(1, Math.round((evt.loaded / evt.total) * 100)));
						onProgress(pct, evt.loaded, evt.total);
					}
				};
			}

			xhr.onload = () => {
				if (typeof onProgress === "function") onProgress(100, 1, 1);
				let data = {};
				try {
					data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
				} catch {
					data = {};
				}
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve(data);
				} else {
					reject(new Error(data.error || `Lỗi máy chủ (${xhr.status}).`));
				}
			};
			xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi đang tải lên."));
			xhr.onabort = () => reject(new Error("Đã hủy quá trình tải lên."));
			xhr.send(options.body || null);
		});
	};

	window.dieunwCreateProgressBar = function(anchorOrContainer) {
		if (!anchorOrContainer) return { set() {}, hide() {} };
		let wrap = anchorOrContainer.querySelector(".dieunw-upload-progress");
		if (!wrap) {
			wrap = document.createElement("div");
			wrap.className = "dieunw-upload-progress";
			wrap.hidden = true;
			wrap.innerHTML = `
				<div class="dieunw-upload-progress-head">
					<span class="dieunw-upload-progress-label">Đang tải lên...</span>
					<strong class="dieunw-upload-progress-pct">0%</strong>
				</div>
				<div class="dieunw-upload-progress-track">
					<div class="dieunw-upload-progress-fill" style="width: 0%"></div>
				</div>
			`;
			anchorOrContainer.appendChild(wrap);
		}
		const fill = wrap.querySelector(".dieunw-upload-progress-fill");
		const pctEl = wrap.querySelector(".dieunw-upload-progress-pct");
		const labelEl = wrap.querySelector(".dieunw-upload-progress-label");
		return {
			set(percent, label) {
				const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
				wrap.hidden = false;
				fill.style.width = `${p}%`;
				pctEl.textContent = `${p}%`;
				if (label) labelEl.textContent = label;
			},
			hide() {
				wrap.hidden = true;
				fill.style.width = "0%";
				pctEl.textContent = "0%";
			}
		};
	};

	window.dieunwCompressImage = function(file, maxSide = 1500, quality = 0.84) {
		return new Promise((resolve, reject) => {
			if (!file || !String(file.type || "").startsWith("image/")) {
				reject(new Error("Tệp không phải là ảnh hợp lệ."));
				return;
			}
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("Không thể đọc ảnh đã chọn."));
			reader.onload = () => {
				const img = new Image();
				img.onerror = () => reject(new Error("Định dạng ảnh không được trình duyệt hỗ trợ."));
				img.onload = () => {
					const ratio = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
					const w = Math.max(1, Math.round(img.width * ratio));
					const h = Math.max(1, Math.round(img.height * ratio));
					const canvas = document.createElement("canvas");
					canvas.width = w;
					canvas.height = h;
					const ctx = canvas.getContext("2d");
					ctx.drawImage(img, 0, 0, w, h);
					let dataUrl = canvas.toDataURL("image/webp", quality);
					if (!dataUrl.startsWith("data:image/webp")) {
						dataUrl = canvas.toDataURL("image/jpeg", quality);
					}
					resolve(dataUrl);
				};
				img.src = String(reader.result || "");
			};
			reader.readAsDataURL(file);
		});
	};

	// =========================================================
	// 4. WIDGET CHỌN NHẠC DÙNG CHUNG (KHO NHẠC HOẶC FILE TỪ MÁY)
	// =========================================================
	let cachedLibraryTracks = null;
	async function fetchOnlineMusicTracks(force = false) {
		if (cachedLibraryTracks && !force) return cachedLibraryTracks;
		try {
			const res = await fetch(`${API_BASE}/api/music?limit=60`);
			const data = await res.json();
			cachedLibraryTracks = Array.isArray(data.tracks) ? data.tracks : [];
		} catch {
			cachedLibraryTracks = [];
		}
		return cachedLibraryTracks;
	}
	window.dieunwFetchMusicLibrary = fetchOnlineMusicTracks;

	window.dieunwCreateMusicAttachmentWidget = function(container, opts = {}) {
		if (!container) return null;
		container.innerHTML = `
			<div class="dieunw-music-picker">
				<div class="dieunw-music-picker-head">
					<span>🎵 Đính kèm nhạc (tùy chọn)</span>
					<button type="button" class="dieunw-music-clear-btn" hidden>Gỡ nhạc</button>
				</div>
				<div class="dieunw-music-picker-tabs">
					<button type="button" class="dieunw-mp-tab active" data-tab="library">Từ Kho nhạc DIEUNW</button>
					<button type="button" class="dieunw-mp-tab" data-tab="file">Tệp nhạc từ máy</button>
				</div>
				<div class="dieunw-mp-panel" data-panel="library">
					<select class="dieunw-mp-select">
						<option value="">-- Không chọn nhạc --</option>
					</select>
				</div>
				<div class="dieunw-mp-panel" data-panel="file" hidden>
					<input type="file" class="dieunw-mp-file" accept="audio/*">
				</div>
				<p class="dieunw-mp-selected" hidden></p>
			</div>
		`;

		const selectEl = container.querySelector(".dieunw-mp-select");
		const fileInput = container.querySelector(".dieunw-mp-file");
		const clearBtn = container.querySelector(".dieunw-music-clear-btn");
		const selectedEl = container.querySelector(".dieunw-mp-selected");
		const tabs = container.querySelectorAll(".dieunw-mp-tab");
		const panels = container.querySelectorAll(".dieunw-mp-panel");

		const state = { mode: "none", file: null, musicId: "", musicUrl: "", musicTitle: "" };

		function refreshSummary() {
			if (state.musicTitle) {
				selectedEl.hidden = false;
				selectedEl.textContent = `🎶 Đã chọn: ${state.musicTitle}`;
				clearBtn.hidden = false;
			} else {
				selectedEl.hidden = true;
				selectedEl.textContent = "";
				clearBtn.hidden = true;
			}
			if (typeof opts.onChange === "function") opts.onChange({ ...state });
		}

		tabs.forEach(tab => {
			tab.addEventListener("click", () => {
				tabs.forEach(t => t.classList.toggle("active", t === tab));
				const target = tab.dataset.tab;
				panels.forEach(p => { p.hidden = p.dataset.panel !== target; });
			});
		});

		fetchOnlineMusicTracks().then(tracks => {
			selectEl.innerHTML = `<option value="">-- Chọn từ Kho nhạc (${tracks.length} bài) --</option>`;
			tracks.forEach(t => {
				const opt = document.createElement("option");
				opt.value = t.id;
				opt.dataset.url = t.audioUrl;
				opt.dataset.title = `${t.title} — ${t.artist}`;
				opt.textContent = `♫ ${t.title} — ${t.artist}`;
				selectEl.appendChild(opt);
			});
		});

		selectEl.addEventListener("change", () => {
			const opt = selectEl.options[selectEl.selectedIndex];
			fileInput.value = "";
			if (opt && opt.value) {
				state.mode = "library";
				state.file = null;
				state.musicId = opt.value;
				state.musicUrl = opt.dataset.url || "";
				state.musicTitle = opt.dataset.title || opt.textContent;
			} else {
				state.mode = "none";
				state.file = null;
				state.musicId = "";
				state.musicUrl = "";
				state.musicTitle = "";
			}
			refreshSummary();
		});

		fileInput.addEventListener("change", () => {
			const f = fileInput.files?.[0];
			selectEl.value = "";
			if (f) {
				state.mode = "file";
				state.file = f;
				state.musicId = "";
				state.musicUrl = "";
				state.musicTitle = f.name;
			} else {
				state.mode = "none";
				state.file = null;
				state.musicId = "";
				state.musicUrl = "";
				state.musicTitle = "";
			}
			refreshSummary();
		});

		clearBtn.addEventListener("click", () => {
			state.mode = "none";
			state.file = null;
			state.musicId = "";
			state.musicUrl = "";
			state.musicTitle = "";
			selectEl.value = "";
			fileInput.value = "";
			refreshSummary();
		});

		return {
			getValue: () => ({ ...state }),
			reset() {
				clearBtn.click();
			}
		};
	};

	// =========================================================
	// 5. SẮP XẾP LẠI MENU ĐIỀU HƯỚNG THEO NHÓM CHỨC NĂNG GẦN NHAU
	// =========================================================
	function reorganizeNavMenu() {
		const navMenu = document.querySelector(".nav-menu");
		if (!navMenu) return;

		const currentFile = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
		const groups = [
			[
				{ href: "./index.html", file: "index.html", label: "Trang chủ" },
				{ href: "./videos.html", file: "videos.html", label: "Video" },
				{ href: "./music.html", file: "music.html", label: "Kho nhạc" }
			],
			[
				{ href: "./tu-hoc.html", file: "tu-hoc.html", label: "Phòng tự học" },
				{ href: "./hoc-nhom.html", file: "hoc-nhom.html", label: "Học nhóm" }
			],
			[
				{ href: "./friends.html", file: "friends.html", label: "Bạn bè" },
				{ href: "./messages.html", file: "messages.html", label: "Tin nhắn" },
				{ href: "./tro-chuyen.html", file: "tro-chuyen.html", label: "Phòng trò chuyện" }
			],
			[
				{ href: "./clubs.html", file: "clubs.html", label: "CLB" },
				{ href: "./announcements.html", file: "announcements.html", label: "Thông báo" }
			]
		];

		const frag = document.createDocumentFragment();
		groups.forEach((group, idx) => {
			if (idx > 0) {
				const sep = document.createElement("span");
				sep.className = "nav-group-sep";
				sep.setAttribute("aria-hidden", "true");
				frag.appendChild(sep);
			}
			group.forEach(item => {
				const a = document.createElement("a");
				a.href = item.href;
				a.className = "nav-item";
				a.textContent = item.label;
				const isActive = currentFile === item.file || (currentFile === "" && item.file === "index.html");
				if (isActive) {
					a.classList.add("active");
					a.setAttribute("aria-current", "page");
				}
				frag.appendChild(a);
			});
		});

		navMenu.innerHTML = "";
		navMenu.appendChild(frag);
	}

	// =========================================================
	// 6. ĐĨA NHẠC XOAY KẾ AVATAR & MENU PHÁT NHẠC GIỐNG PHÒNG TỰ HỌC
	// =========================================================
	function initGlobalNavbarMusicPlayer() {
		const navRight = document.querySelector(".navbar .nav-right");
		if (!navRight || document.getElementById("nav-music-btn")) return;

		const wrapper = document.createElement("div");
		wrapper.className = "nav-music-wrap";
		wrapper.innerHTML = `
			<button type="button" id="nav-music-btn" class="nav-music-btn" aria-label="Trình phát nhạc nhanh" aria-expanded="false" title="Nghe nhạc trên DIEUNW">
				<span class="nav-vinyl-disc" aria-hidden="true">
					<span class="nav-vinyl-core"></span>
				</span>
				<span class="nav-music-note-badge" aria-hidden="true">♪</span>
			</button>
			<section id="nav-music-popover" class="nav-music-popover audio-player-panel" hidden aria-label="Menu phát nhạc DIEUNW">
				<div class="nav-mp-header">
					<strong>🎵 Máy Nghe Nhạc DIEUNW</strong>
					<a href="./music.html" class="nav-mp-link">Mở Kho nhạc →</a>
				</div>

				<div class="audio-player-top nav-mp-top">
					<div class="vinyl-stage nav-mp-stage" aria-hidden="true">
						<div class="vinyl-disc nav-mp-disc">
							<div class="vinyl-label">
								<span class="vinyl-spindle"></span>
							</div>
						</div>
						<div class="floating-notes">
							<span class="floating-note n1">♪</span>
							<span class="floating-note n2">♫</span>
							<span class="floating-note n3">♩</span>
						</div>
					</div>

					<div class="audio-info-col">
						<div class="nav-mp-source-tabs" role="tablist">
							<button type="button" class="nav-mp-source-tab active" data-source="online">Kho nhạc online</button>
							<label class="nav-mp-source-tab" for="nav-mp-local-upload" data-source="local">+ Tệp từ máy</label>
							<input type="file" id="nav-mp-local-upload" accept="audio/*" multiple hidden>
						</div>

						<p id="nav-mp-track-title" class="nav-mp-track-title">Chọn bài nhạc từ kho hoặc từ máy để phát</p>

						<div class="audio-controls-row">
							<button type="button" id="nav-mp-prev" class="audio-ctrl-btn" title="Bài trước">⏮</button>
							<button type="button" id="nav-mp-toggle" class="audio-ctrl-btn primary" title="Phát / Tạm dừng">▶</button>
							<button type="button" id="nav-mp-next" class="audio-ctrl-btn" title="Bài tiếp theo">⏭</button>
							<button type="button" id="nav-mp-replay" class="audio-ctrl-btn" title="Lặp lại playlist" aria-pressed="true">⇄</button>
						</div>

						<div class="audio-speed-row">
							<div class="audio-speed-group" role="group" aria-label="Tốc độ">
								<button type="button" class="nav-mp-speed audio-speed-btn" data-speed="0.5">0.5x</button>
								<button type="button" class="nav-mp-speed audio-speed-btn active" data-speed="1">1x</button>
								<button type="button" class="nav-mp-speed audio-speed-btn" data-speed="1.5">1.5x</button>
								<button type="button" class="nav-mp-speed audio-speed-btn" data-speed="2">2x</button>
							</div>
							<label class="audio-volume-wrap" title="Âm lượng">
								<span>🔊</span>
								<input type="range" id="nav-mp-volume" min="0" max="1" step="0.05" value="0.65" aria-label="Âm lượng">
							</label>
						</div>
					</div>
				</div>

				<ul id="nav-mp-playlist" class="audio-playlist nav-mp-playlist"></ul>
			</section>
		`;

		const avatarLink = navRight.querySelector(".nav-avatar-link");
		if (avatarLink) navRight.insertBefore(wrapper, avatarLink);
		else navRight.appendChild(wrapper);

		const audio = new Audio();
		audio.preload = "metadata";
		const musicBtn = wrapper.querySelector("#nav-music-btn");
		const popover = wrapper.querySelector("#nav-music-popover");
		const trackTitleEl = wrapper.querySelector("#nav-mp-track-title");
		const playlistEl = wrapper.querySelector("#nav-mp-playlist");
		const btnToggle = wrapper.querySelector("#nav-mp-toggle");
		const btnPrev = wrapper.querySelector("#nav-mp-prev");
		const btnNext = wrapper.querySelector("#nav-mp-next");
		const btnReplay = wrapper.querySelector("#nav-mp-replay");
		const volInput = wrapper.querySelector("#nav-mp-volume");
		const localUpload = wrapper.querySelector("#nav-mp-local-upload");
		const sourceTabs = wrapper.querySelectorAll(".nav-mp-source-tab");
		const speedBtns = wrapper.querySelectorAll(".nav-mp-speed");

		let savedState = {};
		try {
			savedState = JSON.parse(localStorage.getItem(AUDIO_STATE_KEY) || "{}");
		} catch {}

		let sourceMode = savedState.sourceMode === "local" ? "local" : "online";
		let onlinePlaylist = [];
		let localPlaylist = [];
		let activeIndex = -1;
		let loopPlaylist = savedState.loopPlaylist !== false;
		let playbackSpeed = Number(savedState.speed || 1);
		let volume = typeof savedState.volume === "number" ? savedState.volume : 0.65;

		audio.volume = volume;
		audio.playbackRate = playbackSpeed;
		volInput.value = String(volume);
		btnReplay.setAttribute("aria-pressed", String(loopPlaylist));
		btnReplay.classList.toggle("is-active", loopPlaylist);
		speedBtns.forEach(b => b.classList.toggle("active", Number(b.dataset.speed) === playbackSpeed));

		function persistState(extra = {}) {
			try {
				const prev = JSON.parse(localStorage.getItem(AUDIO_STATE_KEY) || "{}");
				localStorage.setItem(AUDIO_STATE_KEY, JSON.stringify({
					...prev,
					sourceMode,
					loopPlaylist,
					speed: playbackSpeed,
					volume,
					...extra
				}));
			} catch {}
		}

		function currentPlaylist() {
			return sourceMode === "local" ? localPlaylist : onlinePlaylist;
		}

		function syncPlayVisual() {
			const playing = !audio.paused && Boolean(audio.src);
			musicBtn.classList.toggle("is-playing", playing);
			popover.classList.toggle("is-playing", playing);
			btnToggle.textContent = playing ? "⏸" : "▶";
		}

		function renderPlaylist() {
			const list = currentPlaylist();
			playlistEl.innerHTML = "";
			if (!list.length) {
				const empty = document.createElement("li");
				empty.className = "nav-mp-empty";
				empty.textContent = sourceMode === "local"
					? "Nhấn '+ Tệp từ máy' để thêm file nhạc (.mp3, .wav, .m4a...)."
					: "Chưa có bài hát trên Kho nhạc. Hãy đăng bài hát đầu tiên nhé!";
				playlistEl.appendChild(empty);
				return;
			}
			list.forEach((item, idx) => {
				const li = document.createElement("li");
				li.className = `nav-mp-item${idx === activeIndex ? " active" : ""}`;
				li.innerHTML = `
					<button type="button" class="nav-mp-item-btn">
						<span class="nav-mp-item-num">${idx === activeIndex && !audio.paused ? "🔊" : idx + 1}</span>
						<span class="nav-mp-item-name"></span>
					</button>
				`;
				li.querySelector(".nav-mp-item-name").textContent = item.label;
				li.querySelector(".nav-mp-item-btn").addEventListener("click", () => playTrackAt(idx, true));
				playlistEl.appendChild(li);
			});
		}

		function playTrackAt(index, autoplay = true, startSec = 0) {
			const list = currentPlaylist();
			if (!list.length) return;
			const safeIdx = ((index % list.length) + list.length) % list.length;
			activeIndex = safeIdx;
			const item = list[safeIdx];
			audio.src = item.src;
			audio.playbackRate = playbackSpeed;
			audio.volume = volume;
			if (startSec > 0) {
				audio.addEventListener("loadedmetadata", () => {
					try { audio.currentTime = Math.min(startSec, audio.duration || startSec); } catch {}
				}, { once: true });
			}
			trackTitleEl.textContent = `🎶 ${item.label}`;
			if (item.id && sourceMode === "online") {
				fetch(`${API_BASE}/api/music/${encodeURIComponent(item.id)}/play`, { method: "POST" }).catch(() => {});
				persistState({ activeOnlineId: item.id });
			}
			renderPlaylist();
			if (autoplay) {
				audio.play().then(syncPlayVisual).catch(() => syncPlayVisual());
			} else {
				syncPlayVisual();
			}
		}

		async function loadOnlineLibrary(autoplayId = "") {
			const tracks = await fetchOnlineMusicTracks();
			onlinePlaylist = tracks.map(t => ({
				id: t.id,
				src: resolveMediaUrl(t.audioUrl),
				label: `${t.title} — ${t.artist}`
			}));
			if (sourceMode === "online") {
				if (autoplayId) {
					const idx = onlinePlaylist.findIndex(x => x.id === autoplayId);
					if (idx >= 0) activeIndex = idx;
				} else if (savedState.activeOnlineId && activeIndex < 0) {
					const idx = onlinePlaylist.findIndex(x => x.id === savedState.activeOnlineId);
					if (idx >= 0) {
						activeIndex = idx;
						trackTitleEl.textContent = `🎵 ${onlinePlaylist[idx].label}`;
					}
				}
				renderPlaylist();
			}
		}

		sourceTabs.forEach(tab => {
			tab.addEventListener("click", () => {
				const mode = tab.dataset.source;
				if (!mode) return;
				sourceMode = mode;
				sourceTabs.forEach(t => t.classList.toggle("active", t === tab));
				persistState();
				activeIndex = -1;
				if (mode === "online" && !onlinePlaylist.length) loadOnlineLibrary();
				renderPlaylist();
			});
		});

		localUpload.addEventListener("change", () => {
			const files = Array.from(localUpload.files || []);
			if (!files.length) return;
			sourceMode = "local";
			sourceTabs.forEach(t => t.classList.toggle("active", t.dataset.source === "local"));
			const startIdx = localPlaylist.length;
			files.forEach(f => {
				localPlaylist.push({
					id: "",
					src: URL.createObjectURL(f),
					label: f.name.replace(/\.[^.]+$/, "")
				});
			});
			persistState();
			playTrackAt(startIdx, true);
		});

		btnToggle.addEventListener("click", () => {
			const list = currentPlaylist();
			if (!list.length) {
				showToast(sourceMode === "local" ? "Chọn tệp nhạc từ máy trước nhé." : "Kho nhạc đang trống.", "info");
				return;
			}
			if (!audio.src) {
				playTrackAt(activeIndex >= 0 ? activeIndex : 0, true);
				return;
			}
			if (audio.paused) audio.play().then(syncPlayVisual).catch(() => {});
			else {
				audio.pause();
				syncPlayVisual();
			}
		});

		btnPrev.addEventListener("click", () => playTrackAt((activeIndex <= 0 ? 0 : activeIndex) - 1, true));
		btnNext.addEventListener("click", () => playTrackAt(activeIndex + 1, true));
		btnReplay.addEventListener("click", () => {
			loopPlaylist = !loopPlaylist;
			btnReplay.setAttribute("aria-pressed", String(loopPlaylist));
			btnReplay.classList.toggle("is-active", loopPlaylist);
			persistState();
		});

		speedBtns.forEach(btn => {
			btn.addEventListener("click", () => {
				playbackSpeed = Number(btn.dataset.speed || 1);
				audio.playbackRate = playbackSpeed;
				speedBtns.forEach(b => b.classList.toggle("active", b === btn));
				persistState();
			});
		});

		volInput.addEventListener("input", () => {
			volume = Number(volInput.value);
			audio.volume = volume;
			persistState();
		});

		audio.addEventListener("ended", () => {
			const list = currentPlaylist();
			if (!list.length) return;
			if (loopPlaylist || activeIndex + 1 < list.length) {
				playTrackAt(activeIndex + 1, true);
			} else {
				syncPlayVisual();
			}
		});
		audio.addEventListener("play", syncPlayVisual);
		audio.addEventListener("pause", syncPlayVisual);

		musicBtn.addEventListener("click", async e => {
			e.stopPropagation();
			const opening = popover.hidden;
			popover.hidden = !opening;
			musicBtn.setAttribute("aria-expanded", String(opening));
			if (opening && !onlinePlaylist.length) await loadOnlineLibrary();
		});

		document.addEventListener("click", e => {
			if (!popover.hidden && !wrapper.contains(e.target)) {
				popover.hidden = true;
				musicBtn.setAttribute("aria-expanded", "false");
			}
		});

		// Cho phép các trang (Kho nhạc, Video, Story) điều khiển trình phát dùng chung
		window.dieunwPlayGlobalTrack = async function(track) {
			if (!track || !track.audioUrl) return;
			sourceMode = "online";
			sourceTabs.forEach(t => t.classList.toggle("active", t.dataset.source === "online"));
			if (!onlinePlaylist.length) await loadOnlineLibrary();
			const src = resolveMediaUrl(track.audioUrl);
			let idx = onlinePlaylist.findIndex(x => (track.id && x.id === track.id) || x.src === src);
			if (idx < 0) {
				onlinePlaylist.unshift({
					id: track.id || "",
					src,
					label: `${track.title || "Bài hát"}${track.artist ? " — " + track.artist : ""}`
				});
				idx = 0;
			}
			playTrackAt(idx, true);
		};
		window.dieunwPauseGlobalMusic = function() {
			if (!audio.paused) {
				audio.pause();
				syncPlayVisual();
			}
		};

		loadOnlineLibrary();
	}

	// =========================================================
	// 7. CẬP NHẬT AVATAR NAVBAR + ĐỒNG BỘ USER & NỀN WEB
	// =========================================================
	function updateNavAvatar(user = getSavedUser()) {
		const avatarUrl = typeof user?.avatar === "string" && user.avatar.trim()
			? resolveMediaUrl(user.avatar.trim())
			: fallbackAvatar;
		const label = user?.name ? `Trang cá nhân của ${user.name}` : "Trang cá nhân";

		document.querySelectorAll(".nav-avatar-link").forEach(link => {
			const image = link.querySelector(".nav-user-avatar");
			if (!image) return;
			link.setAttribute("aria-label", label);
			link.title = label;
			image.src = avatarUrl;
			image.onerror = () => {
				image.onerror = null;
				image.src = fallbackAvatar;
			};
		});

		applySiteBg(user?.siteBg);
	}

	async function refreshCurrentUserPrefs() {
		const token = getToken();
		if (!token) return;
		try {
			const res = await fetch(`${API_BASE}/api/auth/me`);
			if (!res.ok) return;
			const data = await res.json();
			if (data?.user) {
				localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
				updateNavAvatar(data.user);
			}
		} catch {}
	}

	window.updateNavAvatar = updateNavAvatar;

	function boot() {
		reorganizeNavMenu();
		updateNavAvatar();
		initGlobalNavbarMusicPlayer();
		observeStatusBanners();
		refreshCurrentUserPrefs();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}

	window.addEventListener("storage", event => {
		if (event.key === "dieuNwUser") updateNavAvatar();
	});
})();