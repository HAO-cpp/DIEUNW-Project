document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = (window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.startsWith("192.168.") || window.location.port === "4174")) ? window.location.origin : "https://dieunw.onrender.com";

	let activeProfileUser = null;
	let viewerUser = null;
	let workingConfig = {
		coverImage: "",
		coverDim: 0.35,
		rightColor1: "#1769aa",
		rightColor2: "#2298f8",
		tagline: ""
	};

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

	function getAuthHeaders(extra = {}) {
		const token = localStorage.getItem("session_token");
		return {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...extra
		};
	}

	function parseEcardConfig(user) {
		const raw = user?.ecardConfig ?? user?.ecard_config ?? null;
		let obj = {};
		if (typeof raw === "string" && raw.trim()) {
			try { obj = JSON.parse(raw); } catch { obj = {}; }
		} else if (raw && typeof raw === "object") {
			obj = raw;
		}
		return {
			coverImage: String(obj.coverImage || obj.leftCoverImage || ""),
			coverDim: typeof obj.coverDim === "number" ? obj.coverDim : 0.35,
			rightColor1: obj.rightColor1 || obj.color1 || user?.themePrimary || "#1769aa",
			rightColor2: obj.rightColor2 || obj.color2 || user?.themeSecondary || "#2298f8",
			tagline: String(obj.tagline || obj.subtitle || "")
		};
	}

	async function compressCoverImage(file) {
		if (typeof window.dieunwCompressImage === "function") {
			const res = await window.dieunwCompressImage(file, 900, 0.8);
			if (typeof res === "string") return res;
			if (res instanceof Blob) {
				return await new Promise((resolve) => {
					const r = new FileReader();
					r.onload = () => resolve(String(r.result || ""));
					r.readAsDataURL(res);
				});
			}
		}
		return await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("Không đọc được tệp ảnh bìa."));
			reader.onload = () => {
				const img = new Image();
				img.onerror = () => reject(new Error("Ảnh bìa không hợp lệ."));
				img.onload = () => {
					const maxDim = 900;
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
					resolve(canvas.toDataURL("image/webp", 0.8));
				};
				img.src = String(reader.result || "");
			};
			reader.readAsDataURL(file);
		});
	}

	// QR Code Encoder thuần JS
	function buildQrMatrix(text) {
		const bytes = Array.from(new TextEncoder().encode(text));
		const caps = [0, 17, 32, 53, 78, 106, 134];
		const eccPerBlock = [0, 7, 10, 15, 20, 26, 18];
		const totalCodewords = [0, 26, 44, 70, 100, 134, 172];
		let ver = 1;
		while (ver < 6 && bytes.length > caps[ver]) ver++;
		const dim = 17 + ver * 4;
		const mat = Array.from({ length: dim }, () => Array(dim).fill(null));
		const isFunc = Array.from({ length: dim }, () => Array(dim).fill(false));

		function setMod(r, c, val, fn = true) {
			if (r >= 0 && r < dim && c >= 0 && c < dim) {
				mat[r][c] = val ? 1 : 0;
				if (fn) isFunc[r][c] = true;
			}
		}
		function drawFinder(top, left) {
			for (let r = -1; r <= 7; r++) {
				for (let c = -1; c <= 7; c++) {
					const rr = top + r, cc = left + c;
					if (rr < 0 || rr >= dim || cc < 0 || cc >= dim) continue;
					const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
					const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
					const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
					setMod(rr, cc, inOuter && (onBorder || inCenter), true);
				}
			}
		}
		drawFinder(0, 0);
		drawFinder(0, dim - 7);
		drawFinder(dim - 7, 0);

		if (ver >= 2) {
			const alignPos = dim - 7;
			for (let r = -2; r <= 2; r++) {
				for (let c = -2; c <= 2; c++) {
					const onB = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
					setMod(alignPos + r, alignPos + c, onB, true);
				}
			}
		}
		for (let i = 8; i < dim - 8; i++) {
			setMod(6, i, i % 2 === 0, true);
			setMod(i, 6, i % 2 === 0, true);
		}
		setMod(dim - 8, 8, 1, true);
		for (let i = 0; i < 9; i++) {
			if (i !== 6) {
				isFunc[8][i] = true;
				isFunc[i][8] = true;
			}
		}
		for (let i = dim - 8; i < dim; i++) {
			isFunc[8][i] = true;
			isFunc[i][8] = true;
		}

		const bits = [];
		const pushBits = (val, len) => {
			for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
		};
		pushBits(0b0100, 4);
		pushBits(bytes.length, 8);
		bytes.forEach(b => pushBits(b, 8));
		const dataCwCount = totalCodewords[ver] - eccPerBlock[ver] * (ver === 6 ? 2 : 1);
		for (let i = 0; i < 4 && bits.length < dataCwCount * 8; i++) bits.push(0);
		while (bits.length % 8 !== 0) bits.push(0);
		const padBytes = [0xec, 0x11];
		let pIdx = 0;
		while (bits.length < dataCwCount * 8) {
			pushBits(padBytes[pIdx % 2], 8);
			pIdx++;
		}
		const dataCw = [];
		for (let i = 0; i < bits.length; i += 8) {
			let v = 0;
			for (let b = 0; b < 8; b++) v = (v << 1) | bits[i + b];
			dataCw.push(v);
		}
		const gfExp = new Array(512);
		const gfLog = new Array(256).fill(0);
		let x = 1;
		for (let i = 0; i < 255; i++) {
			gfExp[i] = x;
			gfLog[x] = i;
			x <<= 1;
			if (x & 0x100) x ^= 0x11d;
		}
		for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
		const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : gfExp[gfLog[a] + gfLog[b]];

		function computeEcc(block, eccLen) {
			let gen = [1];
			for (let i = 0; i < eccLen; i++) {
				const factor = [1, gfExp[i]];
				const next = new Array(gen.length + 1).fill(0);
				for (let j = 0; j < gen.length; j++) {
					next[j] ^= gfMul(gen[j], factor[0]);
					next[j + 1] ^= gfMul(gen[j], factor[1]);
				}
				gen = next;
			}
			const res = [...block, ...new Array(eccLen).fill(0)];
			for (let i = 0; i < block.length; i++) {
				const coef = res[i];
				if (coef !== 0) {
					for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
				}
			}
			return res.slice(block.length);
		}

		let finalStream = [];
		if (ver === 6) {
			const half = dataCw.length / 2;
			const b1 = dataCw.slice(0, half);
			const b2 = dataCw.slice(half);
			const e1 = computeEcc(b1, 18);
			const e2 = computeEcc(b2, 18);
			for (let i = 0; i < half; i++) finalStream.push(b1[i], b2[i]);
			for (let i = 0; i < 18; i++) finalStream.push(e1[i], e2[i]);
		} else {
			finalStream = [...dataCw, ...computeEcc(dataCw, eccPerBlock[ver])];
		}

		const outBits = [];
		finalStream.forEach(cw => {
			for (let i = 7; i >= 0; i--) outBits.push((cw >> i) & 1);
		});

		let bitIdx = 0;
		let up = true;
		for (let right = dim - 1; right >= 1; right -= 2) {
			if (right === 6) right = 5;
			for (let vert = 0; vert < dim; vert++) {
				const r = up ? dim - 1 - vert : vert;
				for (let lr = 0; lr < 2; lr++) {
					const c = right - lr;
					if (!isFunc[r][c]) {
						let bit = bitIdx < outBits.length ? outBits[bitIdx++] : 0;
						if ((r + c) % 2 === 0) bit ^= 1;
						mat[r][c] = bit;
					}
				}
			}
			up = !up;
		}
		const fmt = 0b111011111000100;
		for (let i = 0; i < 15; i++) {
			const bit = (fmt >> i) & 1;
			if (i < 6) mat[i][8] = bit;
			else if (i < 8) mat[i + 1][8] = bit;
			else mat[dim - 15 + i][8] = bit;

			if (i < 8) mat[8][dim - 1 - i] = bit;
			else if (i < 9) mat[8][15 - i] = bit;
			else mat[8][14 - i] = bit;
		}
		return mat;
	}

	function drawQrToCanvas(canvas, text) {
		if (!canvas || !text) return;
		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingEnabled = false;
		const size = canvas.width;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, size, size);

		const matrix = buildQrMatrix(text);
		const dim = matrix.length;
		const quiet = 2;
		const cell = Math.floor(size / (dim + quiet * 2));
		const offset = Math.floor((size - cell * dim) / 2);

		ctx.fillStyle = "#0b1926";
		for (let r = 0; r < dim; r++) {
			for (let c = 0; c < dim; c++) {
				if (matrix[r][c]) {
					ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
				}
			}
		}
	}

	function applyPreviewToCard(user) {
		if (!user) return;
		const leftCoverImg = document.getElementById("ecard-left-cover-img");
		const leftHalf = document.getElementById("ecard-left-half");
		const rightHalf = document.getElementById("ecard-right-half");
		const taglineLabel = document.getElementById("ecard-tagline-label");

		const coverSrc = resolveMedia(workingConfig.coverImage);
		if (leftCoverImg) {
			if (coverSrc) {
				leftCoverImg.src = coverSrc;
				leftCoverImg.hidden = false;
			} else {
				leftCoverImg.removeAttribute("src");
				leftCoverImg.hidden = true;
			}
		}
		if (leftHalf) {
			leftHalf.style.setProperty("--ecard-cover-dim", String(workingConfig.coverDim ?? 0.35));
		}
		if (rightHalf) {
			rightHalf.style.setProperty("--ecard-r1", workingConfig.rightColor1 || "#1769aa");
			rightHalf.style.setProperty("--ecard-r2", workingConfig.rightColor2 || "#2298f8");
		}
		if (taglineLabel) {
			taglineLabel.textContent = workingConfig.tagline || (user.studentClass ? `Thành viên lớp ${user.studentClass}` : "Học sinh THPT Nguyễn Quang DIêu");
		}

		const avatarImg = document.getElementById("ecard-avatar-img");
		if (avatarImg) avatarImg.src = resolveMedia(user.avatar) || "./DIEU.avif";
		const nameEl = document.getElementById("ecard-name-label");
		if (nameEl) nameEl.textContent = user.name || "Học sinh NQD";
		const classEl = document.getElementById("ecard-class-label");
		if (classEl) classEl.textContent = user.studentClass ? `Lớp ${user.studentClass}` : "Học sinh trường NQD";
		const cohortEl = document.getElementById("ecard-cohort-label");
		if (cohortEl) cohortEl.textContent = user.cohort || "NQD";
		const emailEl = document.getElementById("ecard-email-label");
		if (emailEl) emailEl.textContent = user.email || "";

		const profileUrl = `${location.origin}${location.pathname}?userId=${encodeURIComponent(user.id)}`;
		drawQrToCanvas(document.getElementById("ecard-qr-canvas"), profileUrl);
	}

	function syncCustomControlsUI(canCustomize) {
		const toggleBtn = document.getElementById("btn-toggle-ecard-custom");
		const panel = document.getElementById("ecard-custom-panel");
		const clearBtn = document.getElementById("ecard-cover-clear");
		const dimSlider = document.getElementById("ecard-cover-dim");
		const taglineInput = document.getElementById("ecard-tagline-input");
		const color1 = document.getElementById("ecard-color-1");
		const color2 = document.getElementById("ecard-color-2");

		if (toggleBtn) toggleBtn.hidden = !canCustomize;
		if (!canCustomize && panel) panel.hidden = true;
		if (clearBtn) clearBtn.hidden = !Boolean(workingConfig.coverImage);
		if (dimSlider) dimSlider.value = String(workingConfig.coverDim ?? 0.35);
		if (taglineInput) taglineInput.value = workingConfig.tagline || "";
		if (color1) color1.value = workingConfig.rightColor1 || "#1769aa";
		if (color2) color2.value = workingConfig.rightColor2 || "#2298f8";
	}

	async function ensureTargetProfileUser() {
		if (activeProfileUser) return activeProfileUser;
		const params = new URLSearchParams(window.location.search);
		const targetId = params.get("userId") || "me";
		try {
			const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(targetId)}/profile`, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await res.json();
			if (res.ok && data.user) {
				activeProfileUser = data.user;
			}
		} catch {}
		if (!activeProfileUser) {
			try {
				activeProfileUser = JSON.parse(localStorage.getItem("dieuNwUser") || "null");
			} catch {}
		}
		return activeProfileUser;
	}

	function loadImageElement(src) {
		return new Promise((resolve) => {
			if (!src) return resolve(null);
			const img = new Image();
			if (/^https?:\/\//i.test(src) && !src.startsWith(location.origin)) {
				img.crossOrigin = "anonymous";
			}
			img.onload = () => resolve(img);
			img.onerror = () => resolve(null);
			img.src = src;
		});
	}

	function drawCoverFit(ctx, img, x, y, w, h) {
		const imgRatio = img.width / img.height;
		const boxRatio = w / h;
		let sx = 0, sy = 0, sw = img.width, sh = img.height;
		if (imgRatio > boxRatio) {
			sw = img.height * boxRatio;
			sx = (img.width - sw) / 2;
		} else {
			sh = img.width / boxRatio;
			sy = (img.height - sh) / 2;
		}
		ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
	}

	function drawRoundedRectPath(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	}

	// Xuất Thẻ Học Sinh PNG 3x HD (2280 x 1290) kiểu Nửa trái ảnh bìa
	async function exportHighResEcardPng() {
		const user = await ensureTargetProfileUser();
		if (!user) return;

		const W = 2280;
		const H = 1290;
		const LEFT_W = Math.round(W * 0.44);
		const RIGHT_X = LEFT_W;
		const RIGHT_W = W - LEFT_W;

		const canvas = document.createElement("canvas");
		canvas.width = W;
		canvas.height = H;
		const ctx = canvas.getContext("2d");

		ctx.save();
		drawRoundedRectPath(ctx, 0, 0, W, H, 64);
		ctx.clip();

		// 1. NỬA TRÁI: Ảnh bìa hoặc nền gradient + scrim + nhãn trường
		const leftGrad = ctx.createLinearGradient(0, 0, LEFT_W, H);
		leftGrad.addColorStop(0, "#0f2b46");
		leftGrad.addColorStop(0.6, "#1769aa");
		leftGrad.addColorStop(1, "#1d8f75");
		ctx.fillStyle = leftGrad;
		ctx.fillRect(0, 0, LEFT_W, H);

		const coverImg = await loadImageElement(resolveMedia(workingConfig.coverImage));
		if (coverImg) {
			drawCoverFit(ctx, coverImg, 0, 0, LEFT_W, H);
		}

		const dimAlpha = Math.min(0.85, Math.max(0, Number(workingConfig.coverDim ?? 0.35)));
		const scrim = ctx.createLinearGradient(0, 0, 0, H);
		scrim.addColorStop(0, "rgba(8, 18, 30, 0.14)");
		scrim.addColorStop(1, `rgba(8, 18, 30, ${dimAlpha})`);
		ctx.fillStyle = scrim;
		ctx.fillRect(0, 0, LEFT_W, H);

		// Chữ trên nửa trái (căn góc dưới trái)
		ctx.save();
		ctx.shadowColor = "rgba(0,0,0,0.45)";
		ctx.shadowBlur = 12;

		// Badge DIEUNW · E-CARD
		ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
		drawRoundedRectPath(ctx, 64, H - 290, 340, 62, 18);
		ctx.fill();
		ctx.fillStyle = "#ffffff";
		ctx.font = "800 30px system-ui, -apple-system, Arial, sans-serif";
		ctx.fillText("DIEUNW · E-CARD", 90, H - 249);

		ctx.fillStyle = "#e0f2fe";
		ctx.font = "800 52px system-ui, -apple-system, Arial, sans-serif";
		ctx.fillText(user.cohort || "NQD", 64, H - 155);

		const tagline = workingConfig.tagline || (user.studentClass ? `Thành viên lớp ${user.studentClass}` : "Học sinh THPT Nguyễn Quang DIêu");
		ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
		ctx.font = "600 34px system-ui, -apple-system, Arial, sans-serif";
		ctx.fillText(tagline.slice(0, 44), 64, H - 90);
		ctx.restore();

		// 2. NỬA PHẢI: Gradient 2 màu + Avatar + Thông tin + QR sắc nét
		const rGrad = ctx.createLinearGradient(RIGHT_X, 0, W, H);
		rGrad.addColorStop(0, workingConfig.rightColor1 || "#1769aa");
		rGrad.addColorStop(1, workingConfig.rightColor2 || "#2298f8");
		ctx.fillStyle = rGrad;
		ctx.fillRect(RIGHT_X, 0, RIGHT_W, H);

		// Đường viền ngăn cách 2 nửa
		ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
		ctx.fillRect(RIGHT_X - 3, 0, 6, H);

		// Avatar tròn
		const avX = RIGHT_X + 160;
		const avY = 190;
		const avR = 96;
		const avatarImg = await loadImageElement(resolveMedia(user.avatar) || "./DIEU.avif");
		ctx.save();
		ctx.beginPath();
		ctx.arc(avX, avY, avR + 8, 0, Math.PI * 2);
		ctx.fillStyle = "#ffffff";
		ctx.fill();
		ctx.beginPath();
		ctx.arc(avX, avY, avR, 0, Math.PI * 2);
		ctx.clip();
		if (avatarImg) {
			drawCoverFit(ctx, avatarImg, avX - avR, avY - avR, avR * 2, avR * 2);
		} else {
			ctx.fillStyle = "#dbeafe";
			ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
		}
		ctx.restore();

		// Thông tin học sinh bên cạnh avatar
		const textX = RIGHT_X + 295;
		ctx.fillStyle = "#ffffff";
		ctx.font = "800 58px system-ui, -apple-system, Arial, sans-serif";
		ctx.fillText((user.name || "Học sinh NQD").slice(0, 26), textX, 168);

		ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
		ctx.font = "700 38px system-ui, -apple-system, Arial, sans-serif";
		ctx.fillText(user.studentClass ? `Lớp ${user.studentClass}` : "Học sinh trường NQD", textX, 232);

		ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
		ctx.font = "500 30px system-ui, -apple-system, Arial, sans-serif";
		ctx.fillText(String(user.email || "").slice(0, 38), textX, 286);

		// Nhãn phân biệt góc trên/giữa phải
		ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
		drawRoundedRectPath(ctx, RIGHT_X + 70, 360, RIGHT_W - 140, 4, 2);
		ctx.fill();

		ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
		ctx.font = "700 30px system-ui, -apple-system, Arial, sans-serif";
		ctx.fillText("THẺ HỌC SINH ĐIỆN TỬ", RIGHT_X + 70, H - 220);
		ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
		ctx.font = "500 28px system-ui, -apple-system, Arial, sans-serif";
		ctx.fillText("Quét mã QR để xem hồ sơ học tập", RIGHT_X + 70, H - 165);

		// Mã QR siêu nét ở góc dưới phải
		const qrBoxSize = 470;
		const qrBoxX = W - qrBoxSize - 74;
		const qrBoxY = H - qrBoxSize - 68;
		ctx.fillStyle = "#ffffff";
		drawRoundedRectPath(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 32);
		ctx.fill();

		const qrCanvas = document.createElement("canvas");
		qrCanvas.width = 430;
		qrCanvas.height = 430;
		const profileUrl = `${location.origin}${location.pathname}?userId=${encodeURIComponent(user.id)}`;
		drawQrToCanvas(qrCanvas, profileUrl);

		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(qrCanvas, qrBoxX + 20, qrBoxY + 20, qrBoxSize - 40, qrBoxSize - 40);
		ctx.imageSmoothingEnabled = true;

		ctx.restore();

		const link = document.createElement("a");
		link.download = `dieunw-the-hoc-sinh-${(user.name || "nqd").toLowerCase().replace(/\s+/g, "-")}.png`;
		link.href = canvas.toDataURL("image/png");
		link.click();
		notify("Đã tải thẻ học sinh HD (2280×1290) về máy!", "success");
	}

	// Gỡ listener cũ trên nút để tránh chạy trùng với profile-sections.js
	function replaceWithCleanButton(id) {
		const el = document.getElementById(id);
		if (!el || !el.parentNode) return el;
		const clone = el.cloneNode(true);
		el.parentNode.replaceChild(clone, el);
		return clone;
	}

	window.addEventListener("dieu-profile-loaded", (ev) => {
		const d = ev.detail || {};
		if (d.viewerUser) viewerUser = d.viewerUser;
		if (d.user) activeProfileUser = d.user;
	});

	// Bắt sự kiện mở modal E-Card
	const openBtn = replaceWithCleanButton("btn-ecard-open");
	openBtn?.addEventListener("click", async () => {
		const user = await ensureTargetProfileUser();
		if (!user) return;
		if (!viewerUser) {
			try { viewerUser = JSON.parse(localStorage.getItem("dieuNwUser") || "null"); } catch {}
		}
		workingConfig = parseEcardConfig(user);
		const isSelf = Boolean(viewerUser && String(viewerUser.id) === String(user.id));

		applyPreviewToCard(user);
		syncCustomControlsUI(isSelf);

		const overlay = document.getElementById("ecard-modal-overlay");
		if (overlay) overlay.hidden = false;
	});

	const toggleCustomBtn = replaceWithCleanButton("btn-toggle-ecard-custom");
	toggleCustomBtn?.addEventListener("click", () => {
		const panel = document.getElementById("ecard-custom-panel");
		if (panel) panel.hidden = !panel.hidden;
	});

	const copyBtn = replaceWithCleanButton("btn-copy-profile-link");
	copyBtn?.addEventListener("click", async () => {
		const user = await ensureTargetProfileUser();
		if (!user) return;
		const url = `${location.origin}${location.pathname}?userId=${encodeURIComponent(user.id)}`;
		await navigator.clipboard?.writeText(url).catch(() => {});
		notify("Đã sao chép liên kết hồ sơ!", "success");
	});

	const downloadBtn = replaceWithCleanButton("btn-download-ecard");
	downloadBtn?.addEventListener("click", exportHighResEcardPng);

	// Upload ảnh bìa nửa trái (live preview ngay lập tức)
	const coverFileInput = document.getElementById("ecard-cover-file");
	coverFileInput?.addEventListener("change", async () => {
		const file = coverFileInput.files?.[0];
		if (!file) return;
		try {
			workingConfig.coverImage = await compressCoverImage(file);
			const clearBtn = document.getElementById("ecard-cover-clear");
			if (clearBtn) clearBtn.hidden = false;
			if (activeProfileUser) applyPreviewToCard(activeProfileUser);
		} catch (err) {
			notify(err.message || "Không thể xử lý ảnh bìa.", "error");
		}
	});

	document.getElementById("ecard-cover-clear")?.addEventListener("click", () => {
		workingConfig.coverImage = "";
		if (coverFileInput) coverFileInput.value = "";
		document.getElementById("ecard-cover-clear").hidden = true;
		if (activeProfileUser) applyPreviewToCard(activeProfileUser);
	});

	document.getElementById("ecard-cover-dim")?.addEventListener("input", (e) => {
		workingConfig.coverDim = parseFloat(e.target.value) || 0;
		if (activeProfileUser) applyPreviewToCard(activeProfileUser);
	});

	document.getElementById("ecard-tagline-input")?.addEventListener("input", (e) => {
		workingConfig.tagline = e.target.value;
		if (activeProfileUser) applyPreviewToCard(activeProfileUser);
	});

	document.getElementById("ecard-color-1")?.addEventListener("input", (e) => {
		workingConfig.rightColor1 = e.target.value;
		if (activeProfileUser) applyPreviewToCard(activeProfileUser);
	});

	document.getElementById("ecard-color-2")?.addEventListener("input", (e) => {
		workingConfig.rightColor2 = e.target.value;
		if (activeProfileUser) applyPreviewToCard(activeProfileUser);
	});

	// Lưu cấu hình thẻ lên máy chủ
	document.getElementById("btn-save-ecard-config")?.addEventListener("click", async () => {
		const btn = document.getElementById("btn-save-ecard-config");
		btn.disabled = true;
		btn.textContent = "Đang lưu...";
		try {
			const payload = {
				ecardConfig: {
					coverImage: workingConfig.coverImage || "",
					leftCoverImage: workingConfig.coverImage || "",
					coverDim: Number(workingConfig.coverDim ?? 0.35),
					rightColor1: workingConfig.rightColor1 || "#1769aa",
					rightColor2: workingConfig.rightColor2 || "#2298f8",
					tagline: String(workingConfig.tagline || "").trim()
				}
			};
			const res = await fetch(`${API_BASE}/api/users/me`, {
				method: "PATCH",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Không thể lưu mẫu thẻ.");
			if (data.user) {
				activeProfileUser = data.user;
				viewerUser = data.user;
				localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
			} else if (activeProfileUser) {
				activeProfileUser.ecardConfig = payload.ecardConfig;
			}
			const panel = document.getElementById("ecard-custom-panel");
			if (panel) panel.hidden = true;
			notify("Đã lưu ảnh bìa và giao diện Thẻ học sinh!", "success");
		} catch (err) {
			notify(err.message || "Lỗi khi lưu mẫu thẻ.", "error");
		} finally {
			btn.disabled = false;
			btn.textContent = "Lưu mẫu thẻ này";
		}
	});
});