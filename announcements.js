document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const feed = document.getElementById("announcement-feed");
	const composer = document.getElementById("announcement-composer");
	const form = document.getElementById("announcement-form");
	const imageInput = document.getElementById("announcement-image-file");
	const imageNameEl = document.getElementById("announcement-image-name");
	const imageClearBtn = document.getElementById("announcement-image-clear");
	const imagePreviewWrap = document.getElementById("announcement-image-preview-wrap");
	const imagePreview = document.getElementById("announcement-image-preview");
	const fileInput = document.getElementById("announcement-file");
	const fileNameEl = document.getElementById("announcement-file-name");
	const fileClearBtn = document.getElementById("announcement-file-clear");

	let currentUser = null;
	let publishableClubs = [];
	let compressedImageDataUrl = "";

	function getToken() {
		try {
			return localStorage.getItem("session_token")
				|| localStorage.getItem("dieuNwToken")
				|| JSON.parse(localStorage.getItem("dieuNwUser") || "{}").token
				|| "";
		} catch {
			return localStorage.getItem("session_token") || localStorage.getItem("dieuNwToken") || "";
		}
	}

	function getAuthHeaders(extra = {}) {
		const token = getToken();
		return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
	}

	async function api(url, options = {}) {
		const response = await fetch(`${API_BASE}${url}`, {
			credentials: "include",
			...options,
			headers: getAuthHeaders(options.headers || {})
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(data.error || "Không thể hoàn tất yêu cầu.");
		return data;
	}

	async function compressImageFile(file, maxWidth = 1080, maxBytes = 420000) {
		const dataUrl = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ""));
			reader.onerror = () => reject(new Error("Không đọc được ảnh."));
			reader.readAsDataURL(file);
		});
		const img = await new Promise((resolve, reject) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = () => reject(new Error("Ảnh không hợp lệ."));
			i.src = dataUrl;
		});
		const canvas = document.createElement("canvas");
		let w = img.naturalWidth || img.width;
		let h = img.naturalHeight || img.height;
		if (w > maxWidth) {
			h = Math.round((h * maxWidth) / w);
			w = maxWidth;
		}
		canvas.width = w;
		canvas.height = h;
		canvas.getContext("2d").drawImage(img, 0, 0, w, h);
		for (const q of [0.82, 0.68, 0.52]) {
			const res = canvas.toDataURL("image/jpeg", q);
			if (res.length <= maxBytes * 1.37) return res;
		}
		return canvas.toDataURL("image/jpeg", 0.35);
	}

	imageInput?.addEventListener("change", async () => {
		const file = imageInput.files?.[0];
		if (!file) return;
		imageNameEl.textContent = "Đang nén ảnh...";
		try {
			compressedImageDataUrl = await compressImageFile(file);
			imageNameEl.textContent = file.name;
			imagePreview.src = compressedImageDataUrl;
			imagePreviewWrap.hidden = false;
			imageClearBtn.hidden = false;
		} catch (err) {
			compressedImageDataUrl = "";
			imageInput.value = "";
			imageNameEl.textContent = err.message || "Không đọc được ảnh";
			imagePreviewWrap.hidden = true;
			imageClearBtn.hidden = true;
		}
	});

	imageClearBtn?.addEventListener("click", () => {
		compressedImageDataUrl = "";
		imageInput.value = "";
		imageNameEl.textContent = "Không có ảnh";
		imagePreview.removeAttribute("src");
		imagePreviewWrap.hidden = true;
		imageClearBtn.hidden = true;
	});

	fileInput?.addEventListener("change", () => {
		const file = fileInput.files?.[0];
		if (!file) return;
		fileNameEl.textContent = file.name;
		fileClearBtn.hidden = false;
	});

	fileClearBtn?.addEventListener("click", () => {
		fileInput.value = "";
		fileNameEl.textContent = "Không có tệp";
		fileClearBtn.hidden = true;
	});

	function element(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function safeMediaUrl(url) {
		const raw = String(url || "").trim();
		if (!raw) return "";
		if (raw.startsWith("/uploads/")) return `${API_BASE}${raw}`;
		if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
		return "";
	}

	function renderPost(post, index) {
		const article = element("article", "announcement-post");
		article.style.setProperty("--club-color", post.tagColor || "#1769aa");
		article.style.setProperty("--post-index", String(index));

		const header = element("header", "announcement-post-header");
		if (post.clubLogo) {
			const logo = element("img", "announcement-club-logo");
			logo.src = post.clubLogo;
			logo.alt = "";
			header.append(logo);
		} else {
			header.append(element("span", "announcement-club-monogram", (post.clubName || "C").slice(0, 1).toUpperCase()));
		}
		const identity = element("div", "announcement-post-identity");
		identity.append(
			element("h2", "", post.clubName),
			element("p", "", `${post.author?.name || "Quản lý CLB"} · ${new Date(post.createdAt).toLocaleString("vi-VN")}`)
		);
		header.append(identity, element("span", "announcement-label", "THÔNG BÁO"));
		article.append(header, element("p", "announcement-post-content", post.content));

		const imgSrc = safeMediaUrl(post.image);
		const fileHref = safeMediaUrl(post.fileUrl);
		if (imgSrc || fileHref) {
			const media = element("div", "announcement-post-media");
			if (imgSrc) {
				const img = element("img", "announcement-post-image");
				img.src = imgSrc;
				img.loading = "lazy";
				img.alt = "Ảnh thông báo CLB";
				media.append(img);
			}
			if (fileHref) {
				const dlHref = `${fileHref}${fileHref.includes("?") ? "&" : "?"}download=1`;
				const fileCard = element("a", "announcement-file-card");
				fileCard.href = dlHref;
				fileCard.target = "_blank";
				fileCard.rel = "noopener noreferrer";
				fileCard.setAttribute("download", post.fileName || "tep-dinh-kem");
				fileCard.textContent = `📎 ${post.fileName || "Tệp đính kèm"} — Bấm để tải xuống`;
				media.append(fileCard);
			}
			article.append(media);
		}
		return article;
	}

	async function loadFeed() {
		const { posts } = await api("/api/announcements");
		feed.replaceChildren(...(posts || []).map(renderPost));
		if (!posts || !posts.length) {
			feed.append(element("p", "clubs-empty", "Chưa có thông báo nào. Các cập nhật của CLB sẽ xuất hiện tại đây."));
		}
	}

	form.addEventListener("submit", async event => {
		event.preventDefault();
		const button = form.querySelector("button[type='submit']");
		const status = document.getElementById("announcement-status");
		const content = document.getElementById("announcement-content").value.trim();
		const clubId = document.getElementById("announcement-club").value;
		if (!content) {
			status.textContent = "Hãy nhập nội dung thông báo.";
			return;
		}
		button.disabled = true;
		status.textContent = "Đang đăng...";
		try {
			const formData = new FormData();
			formData.append("content", content);
			if (compressedImageDataUrl) formData.append("image", compressedImageDataUrl);
			if (fileInput?.files?.length) formData.append("attachment_file", fileInput.files[0]);

			await api(`/api/clubs/${encodeURIComponent(clubId)}/posts`, {
				method: "POST",
				body: formData
			});
			form.reset();
			imageClearBtn?.click();
			fileClearBtn?.click();
			status.textContent = "Thông báo đã được đăng.";
			await loadFeed();
		} catch (error) {
			status.textContent = error.message;
		} finally {
			button.disabled = false;
		}
	});

	Promise.all([api("/api/auth/me"), api("/api/clubs")])
		.then(([auth, clubData]) => {
			currentUser = auth.user;
			const userEmail = String(currentUser?.email || "").toLowerCase();
			publishableClubs = (clubData.clubs || []).filter(club => {
				if (club.status !== "approved") return false;
				if (currentUser?.isAdmin) return true;
				if (club.manager?.id && String(club.manager.id) === String(currentUser?.id)) return true;
				const managerEmails = Array.isArray(club.managerEmails) ? club.managerEmails.map(e => String(e).toLowerCase()) : [];
				return Boolean(userEmail && managerEmails.includes(userEmail));
			});
			if (publishableClubs.length) {
				const select = document.getElementById("announcement-club");
				select.replaceChildren();
				for (const club of publishableClubs) {
					const option = document.createElement("option");
					option.value = club.id;
					option.textContent = club.name;
					select.append(option);
				}
				composer.hidden = false;
			}
			return loadFeed();
		})
		.catch(error => {
			document.getElementById("announcement-feed-status").textContent = error.message;
		});
});