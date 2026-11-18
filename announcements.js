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
	const scheduleInput = document.getElementById("announcement-schedule");

	let currentUser = null;
	let publishableClubs = [];
	let compressedImageFile = null;

	function buildSkeletonMarkup(count = 3) {
		if (window.DIEUNW && typeof window.DIEUNW.createSkeletonCardsHtml === "function") {
			return window.DIEUNW.createSkeletonCardsHtml(count);
		}
		return Array.from({ length: count }, () => `
			<div class="skeleton-card" aria-hidden="true">
				<div class="skeleton-line short"></div>
				<div class="skeleton-line"></div>
				<div class="skeleton-line medium"></div>
			</div>
		`).join("");
	}

	async function api(url, options = {}) {
		const token = localStorage.getItem("session_token") || localStorage.getItem("dieuNwToken") || "";
		const headers = {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.headers || {})
		};
		const response = await fetch(`${API_BASE}${url}`, {
			credentials: "include",
			...options,
			headers
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(data.error || "Không thể hoàn tất yêu cầu.");
		return data;
	}

	function resolveUploadUrl(rawUrl) {
		const url = String(rawUrl || "").trim();
		if (!url) return "";
		if (url.startsWith("/uploads/")) return `${API_BASE}${url}`;
		return url;
	}

	function element(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	async function compressImageToWebp(file) {
		if (!file || !file.type.startsWith("image/") || file.type === "image/gif") return file;
		return new Promise(resolve => {
			const img = new Image();
			const url = URL.createObjectURL(file);
			img.onload = () => {
				URL.revokeObjectURL(url);
				const maxDim = 1600;
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
				if (!ctx) return resolve(file);
				ctx.drawImage(img, 0, 0, width, height);
				canvas.toBlob(
					blob => {
						if (!blob) return resolve(file);
						const baseName = file.name.replace(/\.[^.]+$/, "");
						resolve(new File([blob], `${baseName}.webp`, { type: "image/webp" }));
					},
					"image/webp",
					0.85
				);
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				resolve(file);
			};
			img.src = url;
		});
	}

	imageInput?.addEventListener("change", async () => {
		const file = imageInput.files?.[0];
		if (imagePreview?.dataset.objectUrl) {
			URL.revokeObjectURL(imagePreview.dataset.objectUrl);
			delete imagePreview.dataset.objectUrl;
		}
		if (!file) {
			compressedImageFile = null;
			imageNameEl.textContent = "Không có ảnh";
			imageClearBtn.hidden = true;
			imagePreviewWrap.hidden = true;
			return;
		}
		imageNameEl.textContent = `Đang tối ưu: ${file.name}...`;
		compressedImageFile = await compressImageToWebp(file);
		imageNameEl.textContent = compressedImageFile.name;
		imageClearBtn.hidden = false;
		const previewUrl = URL.createObjectURL(compressedImageFile);
		imagePreview.dataset.objectUrl = previewUrl;
		imagePreview.src = previewUrl;
		imagePreviewWrap.hidden = false;
	});

	imageClearBtn?.addEventListener("click", () => {
		imageInput.value = "";
		compressedImageFile = null;
		if (imagePreview?.dataset.objectUrl) {
			URL.revokeObjectURL(imagePreview.dataset.objectUrl);
			delete imagePreview.dataset.objectUrl;
		}
		imageNameEl.textContent = "Không có ảnh";
		imageClearBtn.hidden = true;
		imagePreviewWrap.hidden = true;
	});

	fileInput?.addEventListener("change", () => {
		const file = fileInput.files?.[0];
		if (!file) {
			fileNameEl.textContent = "Không có tệp";
			fileClearBtn.hidden = true;
			return;
		}
		fileNameEl.textContent = file.name;
		fileClearBtn.hidden = false;
	});

	fileClearBtn?.addEventListener("click", () => {
		fileInput.value = "";
		fileNameEl.textContent = "Không có tệp";
		fileClearBtn.hidden = true;
	});

	function renderPost(post, index) {
		const article = element("article", "announcement-post");
		article.style.setProperty("--club-color", post.tagColor || "#1769aa");
		article.style.setProperty("--post-index", String(index));

		const header = element("header", "announcement-post-header");
		if (post.clubLogo) {
			const logo = element("img", "announcement-club-logo");
			logo.src = post.clubLogo;
			logo.alt = "";
			logo.loading = "lazy";
			header.append(logo);
		} else {
			header.append(element("span", "announcement-club-monogram", (post.clubName || "C").slice(0, 1).toUpperCase()));
		}

		const identity = element("div", "announcement-post-identity");
		const authorName = post.author?.name || "Ban quản trị CLB";
		const dateText = post.createdAt ? new Date(post.createdAt).toLocaleString("vi-VN") : "";
		identity.append(
			element("h2", "", post.clubName || "Câu lạc bộ NQD"),
			element("p", "", `${authorName}${dateText ? ` · ${dateText}` : ""}`)
		);
		header.append(identity);
		header.append(element("span", "announcement-label", "THÔNG BÁO"));
		article.append(header);

		if (post.content) {
			article.append(element("p", "announcement-post-content", post.content));
		}

		const imgUrl = resolveUploadUrl(post.imageUrl || post.image);
		const fileUrl = resolveUploadUrl(post.fileUrl || post.attachmentUrl);
		const fileName = post.fileName || post.attachmentName || "Tài liệu đính kèm";

		if (imgUrl || fileUrl) {
			const media = element("div", "announcement-post-media");
			if (imgUrl) {
				const picture = document.createElement("picture");
				const img = element("img", "announcement-post-image");
				img.src = imgUrl;
				img.alt = `Ảnh thông báo từ ${post.clubName || "CLB"}`;
				img.loading = "lazy";
				picture.append(img);
				media.append(picture);
			}
			if (fileUrl) {
				const link = element("a", "club-attachment-link", `📎 Tải tệp: ${fileName}`);
				link.href = fileUrl;
				link.target = "_blank";
				link.rel = "noopener noreferrer";
				link.setAttribute("download", fileName);
				media.append(link);
			}
			article.append(media);
		}

		return article;
	}

	async function loadFeed() {
		feed.innerHTML = buildSkeletonMarkup(3);
		const { posts } = await api("/api/announcements");
		feed.replaceChildren(...(posts || []).map(renderPost));
		if (!posts || !posts.length) {
			feed.innerHTML = `
				<div class="empty-state-box">
					<span class="empty-illustration" aria-hidden="true">📢</span>
					<h3>Chưa có thông báo CLB nào</h3>
					<p>Các cập nhật, sự kiện và tin tức mới nhất từ câu lạc bộ sẽ xuất hiện tại đây.</p>
				</div>
			`;
		}
	}

	form.addEventListener("submit", async event => {
		event.preventDefault();
		const button = form.querySelector("button[type='submit']");
		const status = document.getElementById("announcement-status");
		const contentVal = document.getElementById("announcement-content").value.trim();
		const clubId = document.getElementById("announcement-club").value;
		const scheduledRaw = scheduleInput?.value || "";

		if (!clubId || !contentVal) {
			status.textContent = "Vui lòng chọn CLB và nhập nội dung thông báo.";
			return;
		}

		button.disabled = true;
		status.textContent = scheduledRaw ? "Đang lên lịch thông báo..." : "Đang đăng thông báo...";

		try {
			const formData = new FormData();
			formData.append("content", contentVal);
			if (compressedImageFile) {
				formData.append("image", compressedImageFile);
			}
			if (fileInput?.files?.[0]) {
				formData.append("file", fileInput.files[0]);
			}
			if (scheduledRaw) {
				const scheduledDate = new Date(scheduledRaw);
				if (!Number.isNaN(scheduledDate.getTime())) {
					formData.append("scheduledAt", scheduledDate.toISOString());
				}
			}

			await api(`/api/clubs/${encodeURIComponent(clubId)}/posts`, {
				method: "POST",
				body: formData
			});

			form.reset();
			imageClearBtn?.click();
			fileClearBtn?.click();
			status.textContent = scheduledRaw
				? "Đã lên lịch đăng thông báo tự động cho CLB!"
				: "Thông báo đã được đăng lên bảng tin!";
			await loadFeed();
		} catch (error) {
			status.textContent = error.message;
		} finally {
			button.disabled = false;
		}
	});

	feed.innerHTML = buildSkeletonMarkup(3);
	Promise.all([api("/api/auth/me").catch(() => ({ user: null })), api("/api/clubs")])
		.then(([auth, clubData]) => {
			currentUser = auth?.user || null;
			const myEmail = String(currentUser?.email || "").toLowerCase();
			publishableClubs = (clubData.clubs || []).filter(club => {
				if (club.status !== "approved") return false;
				if (currentUser?.isAdmin) return true;
				if (club.manager?.id && currentUser?.id && String(club.manager.id) === String(currentUser.id)) return true;
				if (Array.isArray(club.managerEmails) && myEmail) {
					return club.managerEmails.map(e => String(e).toLowerCase()).includes(myEmail);
				}
				return false;
			});

			if (publishableClubs.length) {
				const select = document.getElementById("announcement-club");
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
			feed.replaceChildren();
			document.getElementById("announcement-feed-status").textContent = error.message;
		});
});