document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const POSTS_API = `${API_BASE}/api/posts`;

	const modalOverlay = document.getElementById("post-modal-overlay");
	const triggerInput = document.getElementById("trigger-modal-input");
	const btnTriggerOpen = document.getElementById("btn-trigger-open");
	const btnModalClose = document.getElementById("btn-modal-close");
	const btnSubmit = document.getElementById("btn-submit-post");
	const richEditor = document.getElementById("post-rich-editor");
	const headingSelect = document.getElementById("post-heading-select");
	const colorPicker = document.getElementById("post-color-picker");
	const mentionTrigger = document.getElementById("post-mention-trigger");
	const mentionDropdown = document.getElementById("post-mention-dropdown");
	const postImageFile = document.getElementById("post-image-file");
	const postImageFilename = document.getElementById("post-image-filename");
	const postImageClear = document.getElementById("post-image-clear");
	const postImagePreviewWrap = document.getElementById("post-image-preview-wrap");
	const postImagePreview = document.getElementById("post-image-preview");
	const newsfeedContainer = document.getElementById("newsfeed-container");
	const feedAuthGate = document.getElementById("feed-auth-gate");
	const feedTriggerBox = document.getElementById("feed-trigger-box");

	// Report Modal elements
	const reportOverlay = document.getElementById("report-modal-overlay");
	const reportTargetLabel = document.getElementById("report-target-label");
	const reportReasonInput = document.getElementById("report-reason-input");
	const reportStatus = document.getElementById("report-modal-status");
	const reportSubmitBtn = document.getElementById("report-modal-submit");
	const reportCloseBtn = document.getElementById("report-modal-close");
	const reportCancelBtn = document.getElementById("report-modal-cancel");

	let homeAccessEnabled = false;
	let currentHomeUser = null;
	let selectedPostImageDataUrl = "";
	let cachedUsers = [];
	let savedRange = null;
	let activeReportTarget = null;

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

	function escapeHtml(value) {
		return String(value ?? "").replace(/[&<>"']/g, ch => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;"
		})[ch]);
	}

	function sanitizeRichHtml(rawHtml) {
		if (!rawHtml) return "";
		const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, "text/html");
		const allowedTags = new Set(["P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "H1", "H2", "H3", "H4", "H5", "SPAN", "A", "FONT"]);
		function cleanNode(node) {
			if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
			if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");
			const tag = node.tagName.toUpperCase();
			if (tag === "SCRIPT" || tag === "STYLE") return document.createTextNode("");
			if (!allowedTags.has(tag)) {
				const frag = document.createDocumentFragment();
				[...node.childNodes].forEach(c => frag.appendChild(cleanNode(c)));
				return frag;
			}
			const outTag = tag === "FONT" ? "SPAN" : tag;
			const el = document.createElement(outTag.toLowerCase());
			if (outTag === "SPAN") {
				const color = node.style?.color || node.getAttribute("color") || "";
				if (/^(#[0-9a-f]{3,8}|rgb\([0-9,\s]+\))$/i.test(color.trim())) {
					el.style.color = color.trim();
				}
			} else if (outTag === "A") {
				const href = node.getAttribute("href") || "";
				if (/^(\.\/profile\.html\?userId=|https?:\/\/)/i.test(href)) {
					el.setAttribute("href", href);
				} else {
					el.setAttribute("href", "#");
				}
				if (node.classList.contains("mention-tag")) {
					el.className = "mention-tag";
				}
			}
			[...node.childNodes].forEach(c => el.appendChild(cleanNode(c)));
			return el;
		}
		const wrapper = document.createElement("div");
		[...doc.body.firstChild.childNodes].forEach(c => wrapper.appendChild(cleanNode(c)));
		return wrapper.innerHTML;
	}

	async function compressImageFile(file, maxWidth = 1080, maxBytes = 420000) {
		if (!file) return "";
		if (!file.type.startsWith("image/")) throw new Error("Vui lòng chọn tệp hình ảnh hợp lệ.");
		if (file.type === "image/gif" && file.size <= maxBytes) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result || ""));
				reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
				reader.readAsDataURL(file);
			});
		}
		const dataUrl = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ""));
			reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
			reader.readAsDataURL(file);
		});
		const img = await new Promise((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error("Ảnh không hợp lệ."));
			image.src = dataUrl;
		});

		const canvas = document.createElement("canvas");
		let width = img.naturalWidth || img.width;
		let height = img.naturalHeight || img.height;
		if (width > maxWidth) {
			height = Math.round((height * maxWidth) / width);
			width = maxWidth;
		}
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		ctx.drawImage(img, 0, 0, width, height);

		for (const quality of [0.82, 0.68, 0.54, 0.42]) {
			const result = canvas.toDataURL("image/jpeg", quality);
			if (result.length <= maxBytes * 1.37) return result;
		}
		return canvas.toDataURL("image/jpeg", 0.32);
	}

	// --- RICH TEXT + @EMAIL MENTION EDITOR ---
	function saveEditorSelection() {
		const sel = window.getSelection();
		if (sel && sel.rangeCount > 0 && richEditor.contains(sel.anchorNode)) {
			savedRange = sel.getRangeAt(0).cloneRange();
		}
	}

	function restoreEditorSelection() {
		richEditor.focus();
		if (savedRange) {
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(savedRange);
		}
	}

	async function ensureUsersLoaded() {
		if (cachedUsers.length) return cachedUsers;
		try {
			const res = await fetch(`${API_BASE}/api/users`, { credentials: "include", headers: getAuthHeaders() });
			const data = await res.json().catch(() => ({}));
			if (Array.isArray(data.users)) cachedUsers = data.users;
		} catch {}
		return cachedUsers;
	}

	function getActiveMentionQuery() {
		const sel = window.getSelection();
		if (!sel || !sel.rangeCount || !richEditor.contains(sel.anchorNode)) return null;
		const range = sel.getRangeAt(0);
		if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
		const textBefore = range.startContainer.textContent.slice(0, range.startOffset);
		const match = textBefore.match(/@([^\s@]{0,40})$/);
		if (!match) return null;
		return {
			node: range.startContainer,
			start: range.startOffset - match[0].length,
			end: range.startOffset,
			query: match[1].toLowerCase()
		};
	}

	function insertMention(user, matchInfo) {
		const range = document.createRange();
		range.setStart(matchInfo.node, matchInfo.start);
		range.setEnd(matchInfo.node, matchInfo.end);
		range.deleteContents();

		const link = document.createElement("a");
		link.className = "mention-tag";
		link.href = `./profile.html?userId=${encodeURIComponent(user.id)}`;
		link.setAttribute("contenteditable", "false");
		link.textContent = `@${user.email}`;

		const space = document.createTextNode("\u00A0");
		range.insertNode(space);
		range.insertNode(link);

		const newRange = document.createRange();
		newRange.setStartAfter(space);
		newRange.collapse(true);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(newRange);
		savedRange = newRange.cloneRange();
		mentionDropdown.hidden = true;
	}

	async function updateMentionDropdown() {
		const matchInfo = getActiveMentionQuery();
		if (!matchInfo) {
			mentionDropdown.hidden = true;
			return;
		}
		const users = await ensureUsersLoaded();
		const filtered = users.filter(u =>
			(u.email || "").toLowerCase().includes(matchInfo.query)
			|| (u.name || "").toLowerCase().includes(matchInfo.query)
		).slice(0, 6);

		if (!filtered.length) {
			mentionDropdown.hidden = true;
			return;
		}
		mentionDropdown.replaceChildren();
		filtered.forEach(user => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "mention-option";
			btn.innerHTML = `<img src="${escapeHtml(user.avatar || "./DIEU.png")}" alt=""><div class="mention-option-meta"><strong>${escapeHtml(user.name || user.email)}</strong><span>${escapeHtml(user.email || "")}</span></div>`;
			btn.addEventListener("mousedown", e => {
				e.preventDefault();
				insertMention(user, matchInfo);
			});
			mentionDropdown.appendChild(btn);
		});
		mentionDropdown.hidden = false;
	}

	document.querySelectorAll("#post-rte-wrapper .rte-btn[data-cmd]").forEach(btn => {
		btn.addEventListener("mousedown", e => {
			e.preventDefault();
			restoreEditorSelection();
			document.execCommand(btn.dataset.cmd, false, null);
			saveEditorSelection();
		});
	});

	headingSelect?.addEventListener("change", () => {
		restoreEditorSelection();
		document.execCommand("formatBlock", false, headingSelect.value);
		saveEditorSelection();
	});

	colorPicker?.addEventListener("input", () => {
		restoreEditorSelection();
		document.execCommand("foreColor", false, colorPicker.value);
		saveEditorSelection();
	});

	mentionTrigger?.addEventListener("mousedown", e => {
		e.preventDefault();
		restoreEditorSelection();
		document.execCommand("insertText", false, "@");
		saveEditorSelection();
		updateMentionDropdown();
	});

	richEditor?.addEventListener("keyup", () => {
		saveEditorSelection();
		updateMentionDropdown();
	});
	richEditor?.addEventListener("mouseup", saveEditorSelection);
	richEditor?.addEventListener("input", updateMentionDropdown);

	postImageFile?.addEventListener("change", async () => {
		const file = postImageFile.files?.[0];
		if (!file) return;
		postImageFilename.textContent = "Đang xử lý ảnh...";
		try {
			selectedPostImageDataUrl = await compressImageFile(file);
			postImageFilename.textContent = file.name;
			postImagePreview.src = selectedPostImageDataUrl;
			postImagePreviewWrap.hidden = false;
			postImageClear.hidden = false;
		} catch (error) {
			selectedPostImageDataUrl = "";
			postImageFile.value = "";
			postImageFilename.textContent = error.message || "Không tải được ảnh";
			postImagePreviewWrap.hidden = true;
			postImageClear.hidden = true;
		}
	});

	postImageClear?.addEventListener("click", () => {
		selectedPostImageDataUrl = "";
		postImageFile.value = "";
		postImageFilename.textContent = "Chưa chọn ảnh";
		postImagePreview.removeAttribute("src");
		postImagePreviewWrap.hidden = true;
		postImageClear.hidden = true;
	});

	// --- TRẠNG THÁI TRUY CẬP TRANG CHỦ ---
	function updateHomeAccess(user = null) {
		const isAuthenticated = Boolean(user?.id);
		currentHomeUser = isAuthenticated ? user : null;
		if (feedAuthGate) feedAuthGate.hidden = isAuthenticated;
		if (feedTriggerBox) feedTriggerBox.hidden = !isAuthenticated;
		if (newsfeedContainer) newsfeedContainer.hidden = !isAuthenticated;
		if (!isAuthenticated) closeModal();

		if (isAuthenticated) {
			const name = user.name || user.email;
			const authorName = document.getElementById("post-author-name");
			const authorAvatar = document.getElementById("post-author-avatar");
			const triggerText = document.getElementById("trigger-modal-input");
			if (authorName) authorName.textContent = name;
			if (authorAvatar) authorAvatar.src = user.avatar || "./DIEU.png";
			if (triggerText) triggerText.textContent = `${name} ơi, bạn đang nghĩ gì thế?`;
			if (!homeAccessEnabled) loadPosts();
			ensureUsersLoaded();
		}
		homeAccessEnabled = isAuthenticated;
	}
	window.updateHomeAccess = updateHomeAccess;

	function showHomeAuth(view) {
		const authContainer = document.getElementById("auth-container");
		if (!authContainer) return;
		authContainer.style.display = "block";
		if (view === "register") {
			document.getElementById("link-to-register")?.click();
		} else {
			document.getElementById("login-view").style.display = "block";
			document.getElementById("register-view").style.display = "none";
			document.getElementById("forgot-view").style.display = "none";
		}
		authContainer.scrollIntoView({ behavior: "smooth", block: "center" });
		if (view === "login") document.getElementById("login-email")?.focus();
	}

	document.getElementById("feed-login-button")?.addEventListener("click", () => showHomeAuth("login"));
	document.getElementById("feed-register-button")?.addEventListener("click", () => showHomeAuth("register"));

	document.querySelectorAll('input[name="post-visibility"]').forEach(option => {
		option.addEventListener("change", () => {
			const label = document.getElementById("post-privacy-label");
			if (label) label.textContent = option.value === "private" ? "Riêng tư" : "Công khai";
		});
	});

	function openModal() {
		if (!homeAccessEnabled || !modalOverlay) return;
		modalOverlay.hidden = false;
		requestAnimationFrame(() => modalOverlay.classList.add("open"));
		richEditor?.focus();
	}

	function closeModal() {
		if (!modalOverlay) return;
		modalOverlay.classList.remove("open");
		modalOverlay.hidden = true;
		mentionDropdown.hidden = true;
	}

	triggerInput?.addEventListener("click", openModal);
	btnTriggerOpen?.addEventListener("click", openModal);
	btnModalClose?.addEventListener("click", closeModal);
	modalOverlay?.addEventListener("click", e => {
		if (e.target === modalOverlay) closeModal();
	});

	// --- BÁO CÁO BÀI VIẾT ---
	function openReportModal(targetType, targetId, labelText) {
		activeReportTarget = { targetType, targetId };
		reportTargetLabel.textContent = labelText || "";
		reportReasonInput.value = "";
		reportStatus.textContent = "";
		reportStatus.classList.remove("error");
		reportOverlay.hidden = false;
		requestAnimationFrame(() => reportOverlay.classList.add("open"));
	}

	function closeReportModal() {
		reportOverlay.classList.remove("open");
		reportOverlay.hidden = true;
		activeReportTarget = null;
	}

	document.querySelectorAll(".report-chip").forEach(chip => {
		chip.addEventListener("click", () => {
			const reason = chip.dataset.reason || chip.textContent;
			reportReasonInput.value = reportReasonInput.value.trim()
				? `${reportReasonInput.value.trim()}; ${reason}`
				: reason;
		});
	});

	reportCloseBtn?.addEventListener("click", closeReportModal);
	reportCancelBtn?.addEventListener("click", closeReportModal);
	reportOverlay?.addEventListener("click", e => {
		if (e.target === reportOverlay) closeReportModal();
	});

	reportSubmitBtn?.addEventListener("click", async () => {
		if (!activeReportTarget) return;
		const reason = reportReasonInput.value.trim() || "Nội dung vi phạm quy định cộng đồng";
		reportSubmitBtn.disabled = true;
		reportStatus.textContent = "Đang gửi báo cáo...";
		reportStatus.classList.remove("error");
		try {
			const res = await fetch(`${API_BASE}/api/reports`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					targetType: activeReportTarget.targetType,
					targetId: activeReportTarget.targetId,
					reason
				})
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Không thể gửi báo cáo.");
			reportStatus.textContent = "Đã gửi báo cáo tới Ban duyệt bài. Cảm ơn bạn!";
			setTimeout(closeReportModal, 900);
		} catch (err) {
			reportStatus.textContent = err.message || "Không gửi được báo cáo.";
			reportStatus.classList.add("error");
		} finally {
			reportSubmitBtn.disabled = false;
		}
	});

	// --- TẢI VÀ HIỂN THỊ BÀI VIẾT ---
	async function loadPosts() {
		if (!newsfeedContainer || !homeAccessEnabled) return;
		try {
			const response = await fetch(POSTS_API, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await response.json();
			if (response.status === 401) {
				localStorage.removeItem("dieuNwUser");
				updateHomeAccess(null);
				return;
			}
			if (!response.ok) throw new Error(data.error || "Không thể tải bài viết.");
			renderPosts(data.posts || []);
		} catch {
			newsfeedContainer.innerHTML = "<p style='color:red; text-align:center;'>Không thể tải bài viết. Hãy tải lại trang.</p>";
		}
	}

	function renderPostContentHtml(post) {
		if (post.contentHtml) {
			return sanitizeRichHtml(post.contentHtml);
		}
		return escapeHtml(post.content || "").replace(/\n/g, "<br>");
	}

	function renderPosts(posts) {
		const viewer = currentHomeUser;
		if (!viewer) return;
		const viewerId = String(viewer.id || "");
		const viewerEmail = String(viewer.email || "").toLowerCase();

		const visiblePosts = posts.filter(post => {
			if (["study-resource", "public-chat-room", "public-chat-message"].includes(post.type)) return false;
			if (post.visibility !== "private") return true;
			return String(post.userId || "") === viewerId || String(post.authorEmail || "").toLowerCase() === viewerEmail;
		});

		newsfeedContainer.replaceChildren();
		if (!visiblePosts.length) {
			newsfeedContainer.innerHTML = "<p class='empty-text'>Chưa có bài viết nào. Hãy là người đầu tiên đăng bài!</p>";
			return;
		}

		visiblePosts.slice(0, 20).forEach(post => {
			const postElement = document.createElement("article");
			postElement.className = "post-card";

			const hasValidImage = post.image && post.image.trim() !== "" && !post.image.includes("placeholder");
			const postImageHtml = hasValidImage ? `<img src="${escapeHtml(post.image)}" class="post-card-image" loading="lazy" alt="Ảnh bài viết">` : "";
			const countLikes = post.likes || 0;
			const authorName = escapeHtml(post.name || "Thành viên DIEUNW");
			const authorAvatar = escapeHtml(post.avatar || "./DIEU.png");
			const visibilityLabel = post.visibility === "private" ? "Riêng tư" : "Công khai";
			const authorHref = post.clubId
				? `./profile.html?clubId=${encodeURIComponent(post.clubId)}`
				: `./profile.html?userId=${encodeURIComponent(post.userId || "")}`;

			let savedComments = [];
			try {
				savedComments = typeof post.comments === "string" ? JSON.parse(post.comments) : (post.comments || []);
			} catch {
				savedComments = [];
			}

			const isLiked = Boolean(post.likedByMe);
			const commentsListHtml = Array.isArray(savedComments) ? savedComments.map(cmt => `
				<div class="comment-item">
					<img src="./DIEU.png" class="post-card-avatar" style="width:32px; height:32px;" alt="">
					<div class="comment-content-box">
						<h5>${escapeHtml(cmt.name || "Thành viên")}</h5>
						<p>${escapeHtml(cmt.text || "")}</p>
					</div>
				</div>
			`).join("") : "";

			postElement.innerHTML = `
				<div class="post-card-header">
					<a href="${authorHref}" style="display:flex; align-items:center; gap:12px; text-decoration:none; color:inherit;">
						<img src="${authorAvatar}" class="post-card-avatar" alt="">
						<div>
							<h4 class="post-card-author">${authorName}</h4>
							<span class="post-card-time">${new Date(post.createdAt).toLocaleString("vi-VN")}</span>
						</div>
					</a>
				</div>
				<div class="post-card-body">
					<div class="post-rich-content">${renderPostContentHtml(post)}</div>
					${postImageHtml}
				</div>
				<div class="post-visibility-label">${visibilityLabel}</div>
				<div class="post-status-info">
					<span class="like-count-text">
						<img src="./icon-like.png" class="status-like-icon" alt="Like">
						<span class="count">${countLikes}</span> lượt thích
					</span>
					<span class="comment-count-text">
						<img src="./icon-comment.png" class="status-comment-icon" alt="Comment">
						<span class="comment-count">${savedComments.length}</span> bình luận
					</span>
				</div>
				<div class="post-interact-bar">
					<button type="button" class="btn-interact btn-like ${isLiked ? "liked" : ""}" style="${isLiked ? "color:#0078ff;font-weight:bold;" : ""}">
						<img src="./icon-like.png" class="custom-interact-icon" alt="Like"> Thích
					</button>
					<button type="button" class="btn-interact btn-comment">
						<img src="./icon-comment.png" class="custom-interact-icon" alt="Comment"> Bình luận
					</button>
				</div>
				<div class="comment-section" style="display:none;">
					<div class="comment-input-group">
						<img src="${escapeHtml(viewer.avatar || "./DIEU.png")}" class="user-avatar-mini" style="width:32px; height:32px;" alt="">
						<input type="text" class="comment-field" placeholder="Viết bình luận công khai...">
					</div>
					<div class="comments-list">${commentsListHtml}</div>
				</div>
			`;

			const likeBtn = postElement.querySelector(".btn-like");
			likeBtn?.addEventListener("click", async () => {
				likeBtn.disabled = true;
				try {
					const res = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}/like`, {
						method: "POST",
						credentials: "include",
						headers: getAuthHeaders({ "Content-Type": "application/json" }),
						body: JSON.stringify({ liked: !likeBtn.classList.contains("liked") })
					});
					if (!res.ok) throw new Error();
					await loadPosts();
				} catch {
					likeBtn.disabled = false;
				}
			});

			const commentBtn = postElement.querySelector(".btn-comment");
			const commentSec = postElement.querySelector(".comment-section");
			const commentInput = postElement.querySelector(".comment-field");
			commentBtn?.addEventListener("click", () => {
				const show = commentSec.style.display === "none";
				commentSec.style.display = show ? "block" : "none";
				if (show) commentInput.focus();
			});

			commentInput?.addEventListener("keypress", async e => {
				if (e.key !== "Enter" || !commentInput.value.trim()) return;
				e.preventDefault();
				const content = commentInput.value.trim();
				commentInput.disabled = true;
				try {
					const res = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}/comments`, {
						method: "POST",
						credentials: "include",
						headers: getAuthHeaders({ "Content-Type": "application/json" }),
						body: JSON.stringify({ content })
					});
					const data = await res.json();
					if (!res.ok) throw new Error(data.error || "Không thể gửi bình luận.");
					commentInput.value = "";
					await loadPosts();
				} catch (err) {
					window.alert?.(err.message || "Không thể gửi bình luận.");
					commentInput.disabled = false;
				}
			});

			const actions = document.createElement("div");
			actions.className = "post-card-actions";
			const reportBtn = document.createElement("button");
			reportBtn.type = "button";
			reportBtn.className = "post-report-button";
			reportBtn.textContent = "⚑ Báo cáo";
			reportBtn.addEventListener("click", () => {
				openReportModal("post", post.id, `Báo cáo bài viết của ${post.name || "thành viên"}`);
			});
			actions.appendChild(reportBtn);

			if (String(post.userId || "") === viewerId || viewer.isAdmin || viewer.isModerator) {
				const deleteBtn = document.createElement("button");
				deleteBtn.type = "button";
				deleteBtn.className = "post-delete-button";
				deleteBtn.textContent = "Xóa bài viết";
				deleteBtn.addEventListener("click", async () => {
					if (!window.confirm("Bạn có chắc muốn xóa bài viết này?")) return;
					deleteBtn.disabled = true;
					try {
						const res = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}`, {
							method: "DELETE",
							credentials: "include",
							headers: getAuthHeaders()
						});
						const data = await res.json();
						if (!res.ok) throw new Error(data.error || "Không thể xóa bài viết.");
						await loadPosts();
					} catch (err) {
						window.alert?.(err.message || "Không thể xóa bài viết.");
						deleteBtn.disabled = false;
					}
				});
				actions.appendChild(deleteBtn);
			}
			postElement.appendChild(actions);
			newsfeedContainer.appendChild(postElement);
		});
	}

	// --- ĐĂNG BÀI VIẾT MỚI ---
	btnSubmit?.addEventListener("click", async () => {
		if (!homeAccessEnabled || !currentHomeUser) {
			updateHomeAccess(null);
			return;
		}
		const content = (richEditor.innerText || "").trim();
		const contentHtml = sanitizeRichHtml(richEditor.innerHTML);
		if (!content && !selectedPostImageDataUrl) {
			window.alert?.("Hãy nhập nội dung hoặc chọn ảnh trước khi đăng nhé!");
			return;
		}

		const visibility = document.querySelector('input[name="post-visibility"]:checked')?.value || "public";
		btnSubmit.textContent = "Đang đăng...";
		btnSubmit.disabled = true;

		try {
			const response = await fetch(POSTS_API, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					content: content || " ",
					contentHtml,
					image: selectedPostImageDataUrl,
					visibility
				})
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Đăng bài không thành công.");

			richEditor.innerHTML = "";
			postImageClear?.click();
			closeModal();
			await loadPosts();
		} catch (error) {
			window.alert?.(error.message || "Đăng bài không thành công!");
		} finally {
			btnSubmit.textContent = "Đăng";
			btnSubmit.disabled = false;
		}
	});

	updateHomeAccess(null);
	fetch(`${API_BASE}/api/auth/me`, { credentials: "include", headers: getAuthHeaders() })
		.then(res => res.json())
		.then(data => {
			if (data.user) {
				localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
				updateHomeAccess(data.user);
			}
		})
		.catch(() => {});

	window.addEventListener("storage", event => {
		if (event.key === "dieuNwUser" && !event.newValue) updateHomeAccess(null);
	});
});