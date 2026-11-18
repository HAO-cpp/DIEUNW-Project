(() => {
	const API_BASE = "https://dieunw.onrender.com";
	const THEME_KEY = "dieunw_theme_mode";

	// Tự động chèn Authorization Bearer cho các API về dieunw.onrender.com
	const originalFetch = window.fetch;
	window.fetch = function(url, options = {}) {
		if (typeof url === "string" && url.includes("dieunw.onrender.com")) {
			const token = localStorage.getItem("session_token");
			if (token) {
				options.headers = {
					...options.headers,
					Authorization: `Bearer ${token}`
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

	function escapeHtml(value) {
		return String(value ?? "").replace(/[&<>"']/g, ch => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;"
		})[ch]);
	}

	// =========================================================
	// 1. DARK MODE TOÀN WEB (KẾT HỢP TÔNG NAVY #173853)
	// =========================================================
	function applyTheme(mode) {
		const isDark = mode === "dark";
		document.documentElement.dataset.theme = isDark ? "dark" : "light";
		document.documentElement.classList.toggle("dark-mode", isDark);
		if (document.body) {
			document.body.classList.toggle("dark-mode", isDark);
			// Đồng bộ Phòng Tự Học nếu đang ở tu-hoc.html
			if (document.body.id === "study-page-body") {
				const sel = document.getElementById("theme-selector");
				if (isDark) {
					document.body.classList.add("theme-dark");
					if (sel && sel.value === "default") sel.value = "dark";
				} else if (document.body.classList.contains("theme-dark")) {
					document.body.classList.remove("theme-dark");
					if (sel && sel.value === "dark") sel.value = "default";
				}
			}
		}
		document.querySelectorAll(".nav-theme-toggle").forEach(btn => {
			btn.setAttribute("aria-pressed", String(isDark));
			btn.title = isDark ? "Chuyển sang Chế độ Sáng" : "Chuyển sang Chế độ Tối (Dark Mode)";
			btn.textContent = isDark ? "☀️" : "🌙";
		});
	}

	function toggleTheme() {
		const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
		localStorage.setItem(THEME_KEY, next);
		applyTheme(next);
	}

	applyTheme(localStorage.getItem(THEME_KEY) || "light");

	// =========================================================
	// 2. AVATAR, STATUS DOT & STORY RING TRÊN THANH NAV
	// =========================================================
	function updateNavAvatar(user = getSavedUser()) {
		const avatarUrl = typeof user?.avatar === "string" && user.avatar.trim()
			? user.avatar.trim()
			: "./DIEU.png";
		const label = user?.name ? `Trang cá nhân của ${user.name}` : "Trang cá nhân";

		document.querySelectorAll(".nav-avatar-link").forEach(link => {
			const image = link.querySelector(".nav-user-avatar");
			if (!image) return;
			link.setAttribute("aria-label", label);
			link.title = label;
			image.src = avatarUrl;
			image.onerror = () => {
				image.onerror = null;
				image.src = "./DIEU.png";
			};

			// Chấm trạng thái góc dưới ảnh đại diện
			let dot = link.querySelector(".nav-status-dot");
			if (!dot) {
				dot = document.createElement("span");
				dot.className = "nav-status-dot";
				dot.setAttribute("aria-hidden", "true");
				link.append(dot);
			}
			const presence = user?.ghostMode ? "offline" : (user?.presenceStatus || (user?.id ? "online" : "offline"));
			dot.dataset.status = presence;
			link.classList.toggle("has-active-story", Boolean(user?.hasActiveStory));
		});
	}

	// =========================================================
	// 3. COMPACT COLLAPSIBLE CORNER DOCK (LOGO + AVATAR + DARK MODE + GHOST CHIP)
	// =========================================================
	function initCollapsibleCornerNav() {
		const header = document.querySelector("header.navbar");
		const navMenu = header?.querySelector(".nav-menu");
		const navRight = header?.querySelector(".nav-right");
		const avatarLink = navRight?.querySelector(".nav-avatar-link") || header?.querySelector(".nav-avatar-link");
		if (!header || !navMenu || header.dataset.dockReady === "1") return;
		header.dataset.dockReady = "1";

		const dock = document.createElement("div");
		dock.className = "nav-corner-dock";

		const brandToggle = document.createElement("button");
		brandToggle.type = "button";
		brandToggle.className = "nav-brand-toggle";
		brandToggle.setAttribute("aria-expanded", "false");
		brandToggle.setAttribute("aria-label", "Mở menu điều hướng DIEUNW");
		brandToggle.title = "Mở menu điều hướng DIEUNW";
		brandToggle.innerHTML = `
			<picture class="nav-brand-picture">
				<source srcset="./DIEU.avif" type="image/avif">
				<source srcset="./DIEU.webp" type="image/webp">
				<img src="./DIEU.png" alt="DIEUNW" class="nav-brand-icon">
			</picture>
			<span class="nav-brand-label">DIEUNW</span>
			<span class="nav-brand-caret" aria-hidden="true">▾</span>
		`;

		const themeBtn = document.createElement("button");
		themeBtn.type = "button";
		themeBtn.className = "nav-theme-toggle";
		themeBtn.addEventListener("click", toggleTheme);

		dock.append(brandToggle);
		if (avatarLink) dock.append(avatarLink);
		dock.append(themeBtn);

		navMenu.classList.add("nav-dropdown-panel");
		navMenu.hidden = true;

		header.replaceChildren(dock, navMenu);
		applyTheme(localStorage.getItem(THEME_KEY) || "light");

		function setMenuOpen(open) {
			navMenu.hidden = !open;
			brandToggle.setAttribute("aria-expanded", String(open));
			brandToggle.classList.toggle("open", open);
		}

		brandToggle.addEventListener("click", e => {
			e.stopPropagation();
			setMenuOpen(navMenu.hidden);
		});

		document.addEventListener("click", e => {
			if (!navMenu.hidden && !header.contains(e.target)) setMenuOpen(false);
		});
		document.addEventListener("keydown", e => {
			if (e.key === "Escape" && !navMenu.hidden) setMenuOpen(false);
		});
		navMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setMenuOpen(false)));
	}

	// =========================================================
	// 4. SHARED HELPERS: PRESENCE, OPTIMIZED PICTURE, SKELETON, STICKERS
	// =========================================================
	function sendPresenceHeartbeat(mode) {
		const user = getSavedUser();
		if (!user?.id || user?.ghostMode) return;
		const statusMode = mode || (document.body?.id === "study-page-body" ? "studying" : "online");
		fetch(`${API_BASE}/api/presence`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ statusMode })
		}).catch(() => {});
	}

	function createSkeletonCardsHtml(count = 3, variant = "post") {
		if (variant === "shelf") {
			return Array.from({ length: 2 }, () => `
				<div class="skeleton-card skeleton-shelf-row">
					<div class="skeleton-line short"></div>
					<div class="skeleton-books-row">
						<span class="skeleton-book"></span>
						<span class="skeleton-book"></span>
						<span class="skeleton-book"></span>
						<span class="skeleton-book"></span>
					</div>
				</div>
			`).join("");
		}
		return Array.from({ length: count }, () => `
			<div class="skeleton-card">
				<div class="skeleton-head">
					<span class="skeleton-circle"></span>
					<div class="skeleton-lines">
						<span class="skeleton-line med"></span>
						<span class="skeleton-line short"></span>
					</div>
				</div>
				<span class="skeleton-line full"></span>
				<span class="skeleton-line long"></span>
				<span class="skeleton-rect"></span>
			</div>
		`).join("");
	}

	function createEmptyIllustrationHtml({ title, subtitle, ctaLabel = "", ctaHref = "", ctaId = "" }) {
		const ctaHtml = ctaLabel
			? (ctaHref
				? `<a href="${escapeHtml(ctaHref)}" class="empty-cta-btn">${escapeHtml(ctaLabel)}</a>`
				: `<button type="button" ${ctaId ? `id="${escapeHtml(ctaId)}"` : ""} class="empty-cta-btn">${escapeHtml(ctaLabel)}</button>`)
			: "";
		return `
			<div class="dieunw-empty-state">
				<svg class="empty-illustration-svg" width="84" height="84" viewBox="0 0 96 96" fill="none" aria-hidden="true">
					<circle cx="48" cy="48" r="40" fill="#e8f3ff" stroke="#b9d8f4" stroke-width="2"/>
					<rect x="26" y="30" width="44" height="36" rx="8" fill="#ffffff" stroke="#2298f8" stroke-width="2.5"/>
					<path d="M34 42H62M34 51H52" stroke="#1769aa" stroke-width="3" stroke-linecap="round"/>
					<circle cx="66" cy="30" r="9" fill="#f59e0b"/>
					<path d="M66 26V34M62 30H70" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
				</svg>
				<h4>${escapeHtml(title)}</h4>
				<p>${escapeHtml(subtitle)}</p>
				${ctaHtml}
			</div>
		`;
	}

	function renderAuthorBadgesHtml(badges = []) {
		if (!Array.isArray(badges) || !badges.length) return "";
		return `<span class="inline-role-badges">${badges.map(b => {
			const type = escapeHtml(b.type || "club");
			const style = b.color ? `style="--badge-color:${escapeHtml(b.color)}"` : "";
			return `<span class="inline-role-badge badge-${type}" ${style}>${escapeHtml(b.label)}</span>`;
		}).join("")}</span>`;
	}

	let cachedStickers = null;
	async function fetchUserStickers(force = false) {
		if (cachedStickers && !force) return cachedStickers;
		try {
			const res = await fetch(`${API_BASE}/api/stickers`, { credentials: "include" });
			if (!res.ok) return [];
			const data = await res.json();
			cachedStickers = Array.isArray(data.stickers) ? data.stickers : [];
			return cachedStickers;
		} catch {
			return [];
		}
	}

	function attachStickerPicker(triggerBtn, onSelectSticker) {
		if (!triggerBtn || triggerBtn.dataset.stickerBound === "1") return;
		triggerBtn.dataset.stickerBound = "1";
		triggerBtn.addEventListener("click", async e => {
			e.stopPropagation();
			document.querySelectorAll(".sticker-popover").forEach(p => p.remove());
			const pop = document.createElement("div");
			pop.className = "sticker-popover";
			pop.innerHTML = `<p class="sticker-pop-title">Bộ Sticker cá nhân</p><div class="sticker-pop-grid">Đang tải...</div>`;
			triggerBtn.parentElement.style.position = "relative";
			triggerBtn.parentElement.appendChild(pop);

			const stickers = await fetchUserStickers();
			const grid = pop.querySelector(".sticker-pop-grid");
			if (!stickers.length) {
				grid.innerHTML = `<p class="sticker-pop-empty">Chưa có sticker nào. Vào <b>✨ DIEUNW+</b> ở Trang cá nhân để tải bộ sticker riêng nhé!</p>`;
			} else {
				grid.replaceChildren();
				stickers.forEach(st => {
					const btn = document.createElement("button");
					btn.type = "button";
					btn.className = "sticker-pop-item";
					btn.title = st.name || "Sticker";
					const img = document.createElement("img");
					img.src = st.image;
					img.alt = st.name || "Sticker";
					btn.append(img);
					btn.addEventListener("click", () => {
						onSelectSticker(st);
						pop.remove();
					});
					grid.append(btn);
				});
			}

			const closePop = ev => {
				if (!pop.contains(ev.target) && ev.target !== triggerBtn) {
					pop.remove();
					document.removeEventListener("click", closePop);
				}
			};
			setTimeout(() => document.addEventListener("click", closePop), 0);
		});
	}

	// Nén ảnh thành WebP nhỏ gọn trên client khi tải lên
	function compressImageToWebp(file, maxDim = 960, quality = 0.84) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
			reader.onload = () => {
				const img = new Image();
				img.onerror = () => reject(new Error("Tệp không phải hình ảnh hợp lệ."));
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
					const ctx = canvas.getContext("2d");
					ctx.drawImage(img, 0, 0, width, height);
					let dataUrl = canvas.toDataURL("image/webp", quality);
					if (!dataUrl.startsWith("data:image/webp")) {
						dataUrl = canvas.toDataURL("image/png");
					}
					resolve(dataUrl);
				};
				img.src = String(reader.result || "");
			};
			reader.readAsDataURL(file);
		});
	}

	window.DIEUNW = {
		API_BASE,
		applyTheme,
		toggleTheme,
		updateNavAvatar,
		sendPresenceHeartbeat,
		createSkeletonCardsHtml,
		createEmptyIllustrationHtml,
		renderAuthorBadgesHtml,
		fetchUserStickers,
		invalidateStickerCache: () => { cachedStickers = null; },
		attachStickerPicker,
		compressImageToWebp
	};
	window.updateNavAvatar = updateNavAvatar;

	document.addEventListener("DOMContentLoaded", () => {
		initCollapsibleCornerNav();
		applyTheme(localStorage.getItem(THEME_KEY) || "light");
		updateNavAvatar();
		sendPresenceHeartbeat();
		setInterval(() => sendPresenceHeartbeat(), 45000);
	});

	window.addEventListener("storage", event => {
		if (event.key === "dieuNwUser") updateNavAvatar();
		if (event.key === THEME_KEY) applyTheme(event.newValue || "light");
	});
})();