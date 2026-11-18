document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const POSTS_API = `${API_BASE}/api/posts`;
	const BOOKMARKS_API = `${API_BASE}/api/bookmarks`;

	function getToken() {
		const userObj = (() => {
			try {
				return JSON.parse(localStorage.getItem("dieuNwUser") || "{}");
			} catch {
				return {};
			}
		})();
		return (
			localStorage.getItem("session_token") ||
			localStorage.getItem("dieuNwToken") ||
			userObj.token ||
			""
		);
	}

	function getAuthHeaders(extra = {}) {
		const token = getToken();
		return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
	}

	function getCurrentUser() {
		try {
			return JSON.parse(localStorage.getItem("dieuNwUser") || "null");
		} catch {
			return null;
		}
	}

	const tracks = {
		"Chuyên": ["Toán", "Văn", "Anh", "Tin", "Hóa", "Lý", "Sinh", "Địa", "Sử"],
		"Thường": ["Toán", "Văn", "Anh", "Tin", "Hóa", "Lý", "Sinh", "Địa", "Công nghệ", "Kinh tế và pháp luật", "Quốc phòng", "Thể chất"]
	};

	const subjectImageBases = {
		"Toán": "./Math",
		"Văn": "./Literature",
		"Anh": "./English",
		"Tin": "./Informatics",
		"Hóa": "./Chemistry",
		"Lý": "./Physics",
		"Sinh": "./Biology",
		"Địa": "./Geography",
		"Sử": "./History",
		"Công nghệ": "./Technology",
		"Kinh tế và pháp luật": "./Economics and law"
	};

	const selection = { grade: "", track: "Chuyên", subject: "" };
	let pendingTrack = selection.track;
	let pendingSubject = "";
	let subjectPage = 0;

	const groupTabs = [...document.querySelectorAll(".group-tab")];
	const groupPanels = [...document.querySelectorAll(".group-panel")];
	const gradeChoices = document.getElementById("grade-choices");
	const selectionSummary = document.getElementById("selection-summary");
	const subjectPickerButton = document.getElementById("subject-picker-open");
	const subjectModal = document.getElementById("subject-picker-modal");
	const subjectOptions = document.getElementById("subject-options");
	const subjectModalConfirm = document.getElementById("subject-modal-confirm");
	const subjectPageLabel = document.getElementById("subject-page-label");
	const previousSubjectPage = document.getElementById("subject-page-previous");
	const nextSubjectPage = document.getElementById("subject-page-next");
	const resourceList = document.getElementById("resource-list");
	const resourceForm = document.getElementById("resource-form");
	const resourceMessage = document.getElementById("resource-message");
	const resourceSubmit = document.getElementById("resource-submit");
	const coverColorInput = document.getElementById("resource-cover-color");
	const coverColorLabel = document.querySelector(".color-picker-label");

	// Book Reader Elements
	const readerOverlay = document.getElementById("book-reader-overlay");
	const readerCloseBtn = document.getElementById("book-reader-close");
	const readerMetaEyebrow = document.getElementById("reader-meta-eyebrow");
	const readerBookTitle = document.getElementById("reader-book-title");
	const bookSpread = document.getElementById("book-spread");
	const bookPageLeft = document.getElementById("book-page-left");
	const bookPageRight = document.getElementById("book-page-right");
	const bookFlipPrev = document.getElementById("book-flip-prev");
	const bookFlipNext = document.getElementById("book-flip-next");
	const bookPageIndicator = document.getElementById("book-page-indicator");
	const bookBookmarkBtn = document.getElementById("book-bookmark-btn");
	const bookDownloadBtn = document.getElementById("book-download-btn");
	const bookOpenLinkBtn = document.getElementById("book-open-link-btn");
	const bookDeleteBtn = document.getElementById("book-delete-btn");

	let resources = [];
	let bookmarkedIds = new Set();
	let activeReaderBook = null;
	let readerSpreads = [];
	let currentSpreadIndex = 0;

	groupTabs.forEach(tab => {
		tab.addEventListener("click", () => {
			const targetId = tab.dataset.panel;
			groupTabs.forEach(item => {
				const active = item === tab;
				item.classList.toggle("active", active);
				item.setAttribute("aria-selected", String(active));
				item.tabIndex = active ? 0 : -1;
			});
			groupPanels.forEach(panel => {
				panel.hidden = panel.id !== targetId;
			});
		});
	});

	if (coverColorInput) {
		coverColorInput.addEventListener("input", () => {
			if (coverColorLabel) coverColorLabel.textContent = coverColorInput.value.toUpperCase();
		});
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

	function safeResourceUrl(url) {
		const raw = String(url || "").trim();
		if (!raw) return "";
		if (raw.startsWith("/uploads/")) return `${API_BASE}${raw}`;
		if (/^https?:\/\//i.test(raw)) return raw;
		return "";
	}

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

	function createSubjectPicture(basePath) {
		const picture = document.createElement("picture");
		const srcAvif = document.createElement("source");
		srcAvif.srcset = `${basePath}.avif`;
		srcAvif.type = "image/avif";

		const srcWebp = document.createElement("source");
		srcWebp.srcset = `${basePath}.webp`;
		srcWebp.type = "image/webp";

		const img = document.createElement("img");
		img.src = `${basePath}.png`;
		img.alt = "";
		img.loading = "lazy";

		picture.append(srcAvif, srcWebp, img);
		return picture;
	}

	function updateSelectionSummary() {
		const grade = selection.grade ? `Khối ${selection.grade}` : "Chưa chọn khối";
		const subject = selection.subject || "Chưa chọn môn";
		selectionSummary.textContent = `${grade} · ${selection.track} · ${subject}`;
	}

	function renderChoices() {
		gradeChoices.replaceChildren();
		["10", "11", "12"].forEach(grade => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "grade-choice";
			button.textContent = `Khối ${grade}`;
			button.setAttribute("aria-label", `Khối ${grade}`);
			button.setAttribute("aria-pressed", String(selection.grade === grade));
			button.classList.toggle("selected", selection.grade === grade);
			button.addEventListener("click", () => {
				selection.grade = selection.grade === grade ? "" : grade;
				renderChoices();
			});
			gradeChoices.appendChild(button);
		});
		updateSelectionSummary();
		subjectPickerButton.textContent = selection.subject ? "Đổi môn học" : "Chọn môn";
	}

	function renderSubjectOptions() {
		subjectOptions.replaceChildren();
		const subjects = tracks[pendingTrack] || [];
		const pageCount = Math.max(1, Math.ceil(subjects.length / 6));
		const pageSubjects = subjects.slice(subjectPage * 6, subjectPage * 6 + 6);
		Array.from({ length: 6 }, (_, index) => pageSubjects[index]).forEach(subject => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "subject-option";
			const imageSlot = document.createElement("span");
			imageSlot.className = "subject-tile-image";
			imageSlot.setAttribute("aria-hidden", "true");
			if (subject && subjectImageBases[subject]) {
				imageSlot.appendChild(createSubjectPicture(subjectImageBases[subject]));
			}
			button.appendChild(imageSlot);
			if (subject) {
				button.setAttribute("aria-label", subject);
				button.title = subject;
				button.setAttribute("aria-pressed", String(pendingSubject === subject));
				button.classList.toggle("selected", pendingSubject === subject);
				button.addEventListener("click", () => {
					pendingSubject = subject;
					renderSubjectOptions();
					subjectOptions.querySelector('[aria-pressed="true"]')?.focus();
				});
			} else {
				button.classList.add("subject-option-empty");
				button.disabled = true;
				button.setAttribute("aria-hidden", "true");
			}
			subjectOptions.appendChild(button);
		});
		subjectPageLabel.textContent = `Trang ${subjectPage + 1} / ${pageCount}`;
		previousSubjectPage.disabled = subjectPage === 0;
		nextSubjectPage.disabled = subjectPage >= pageCount - 1;
		subjectModalConfirm.disabled = !pendingSubject;
	}

	function closeSubjectPicker() {
		subjectModal.hidden = true;
		document.body.classList.remove("subject-modal-open");
		subjectPickerButton.focus();
	}

	subjectPickerButton.addEventListener("click", () => {
		pendingTrack = selection.track;
		pendingSubject = selection.subject;
		const selectedIndex = (tracks[pendingTrack] || []).indexOf(pendingSubject);
		subjectPage = selectedIndex < 0 ? 0 : Math.floor(selectedIndex / 6);
		document.querySelectorAll(".subject-track-button").forEach(button => {
			const active = button.dataset.track === pendingTrack;
			button.classList.toggle("active", active);
			button.setAttribute("aria-pressed", String(active));
		});
		renderSubjectOptions();
		subjectModal.hidden = false;
		document.body.classList.add("subject-modal-open");
		(subjectOptions.querySelector('[aria-pressed="true"]') || subjectOptions.querySelector(".subject-option"))?.focus();
	});

	document.getElementById("subject-modal-close").addEventListener("click", closeSubjectPicker);
	document.getElementById("subject-modal-cancel").addEventListener("click", closeSubjectPicker);
	subjectModal.addEventListener("click", event => {
		if (event.target === subjectModal) closeSubjectPicker();
	});
	subjectModalConfirm.addEventListener("click", () => {
		if (!pendingSubject) return;
		selection.track = pendingTrack;
		selection.subject = pendingSubject;
		renderChoices();
		closeSubjectPicker();
	});

	document.querySelectorAll(".subject-track-button").forEach(button => {
		button.addEventListener("click", () => {
			pendingTrack = button.dataset.track;
			if (!(tracks[pendingTrack] || []).includes(pendingSubject)) pendingSubject = "";
			subjectPage = 0;
			document.querySelectorAll(".subject-track-button").forEach(item => {
				const active = item === button;
				item.classList.toggle("active", active);
				item.setAttribute("aria-pressed", String(active));
			});
			renderSubjectOptions();
		});
	});

	previousSubjectPage.addEventListener("click", () => {
		if (subjectPage > 0) {
			subjectPage--;
			renderSubjectOptions();
		}
	});
	nextSubjectPage.addEventListener("click", () => {
		if ((subjectPage + 1) * 6 < (tracks[pendingTrack] || []).length) {
			subjectPage++;
			renderSubjectOptions();
		}
	});

	function displayDate(value) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? "Vừa chia sẻ" : date.toLocaleString("vi-VN");
	}

	function orderKey(track, subject) {
		const trackOrder = track === "Chuyên" ? 0 : 1;
		const list = tracks[track] || [];
		const subIndex = list.indexOf(subject);
		return trackOrder * 100 + (subIndex >= 0 ? subIndex : 99);
	}

	function splitTextToChunks(text, maxChars = 540) {
		const clean = String(text || "").trim();
		if (!clean) return [];
		const paragraphs = clean.split(/\n+/).map(p => p.trim()).filter(Boolean);
		const chunks = [];
		let buffer = "";
		for (const para of paragraphs) {
			if (para.length > maxChars) {
				if (buffer) {
					chunks.push(buffer);
					buffer = "";
				}
				for (let i = 0; i < para.length; i += maxChars) {
					chunks.push(para.slice(i, i + maxChars));
				}
				continue;
			}
			if (!buffer) {
				buffer = para;
			} else if (buffer.length + 1 + para.length <= maxChars) {
				buffer += "\n\n" + para;
			} else {
				chunks.push(buffer);
				buffer = para;
			}
		}
		if (buffer) chunks.push(buffer);
		return chunks;
	}

	function buildReaderSpreads(post) {
		const title = post.resource_title || "Tài liệu học tập";
		const desc = post.resource_description || post.description || "";
		const grade = post.resource_grade ? `Khối ${post.resource_grade}` : "Tất cả khối";
		const track = post.resource_track || "Chung";
		const subject = post.resource_subject || "Tổng hợp";
		const safeFileUrl = safeResourceUrl(post.resource_file_url);
		const safeLink = safeResourceUrl(post.resource_link);
		const fileName = post.resource_file_name || "";
		const fileType = post.resource_file_type || "";
		const authorName = post.name || post.authorName || "Dieuer Ẩn Danh";
		const createdText = displayDate(post.createdAt);

		const descChunks = splitTextToChunks(desc, 480);
		const firstChunk = descChunks.shift() || "Người chia sẻ chưa viết mô tả chi tiết cho tài liệu này.";

		const coverLeftHtml = `
			<div class="page-content">
				<span class="book-page-tag">${escapeHtml(grade)} · ${escapeHtml(track)} · ${escapeHtml(subject)}</span>
				<h2>${escapeHtml(title)}</h2>
				<p class="page-info">Đăng bởi: <strong>${escapeHtml(authorName)}</strong> · ${escapeHtml(createdText)}</p>
				<div class="page-desc">${escapeHtml(firstChunk).replace(/\n/g, "<br>")}</div>
			</div>
		`;

		const attachmentRightHtml = `
			<div class="page-content">
				<h2>Tệp &amp; Liên kết</h2>
				${fileName && safeFileUrl
					? `<p><strong>Tệp đính kèm:</strong> ${escapeHtml(fileName)}${fileType ? ` (${escapeHtml(fileType)})` : ""}</p>
					   <p><a href="${escapeHtml(safeFileUrl)}" class="page-link" download="${escapeHtml(fileName)}" target="_blank" rel="noopener noreferrer">⬇ Tải tệp tài liệu</a></p>`
					: `<p class="text-muted">Không có tệp tải lên trực tiếp.</p>`}
				${safeLink
					? `<p><strong>Liên kết ngoài:</strong></p>
					   <p><a href="${escapeHtml(safeLink)}" class="page-link" target="_blank" rel="noopener noreferrer">↗ Mở liên kết tài liệu</a></p>`
					: `<p class="text-muted">Không có liên kết ngoài đính kèm.</p>`}
				<hr style="border:none;border-top:1px dashed rgba(23,56,83,0.16);margin:14px 0;">
				<p class="text-muted">Mẹo: Bấm nút <strong>☆ Lưu tài liệu</strong> bên dưới để lưu về mục Tài liệu đã lưu trong trang cá nhân của bạn.</p>
			</div>
		`;

		const spreads = [{ left: coverLeftHtml, right: attachmentRightHtml }];

		while (descChunks.length > 0) {
			const leftChunk = descChunks.shift();
			const rightChunk = descChunks.shift() || "";
			spreads.push({
				left: `
					<div class="page-content">
						<h3>Nội dung chi tiết (tiếp)</h3>
						<div class="page-desc">${escapeHtml(leftChunk).replace(/\n/g, "<br>")}</div>
					</div>
				`,
				right: rightChunk
					? `
						<div class="page-content">
							<h3>Nội dung chi tiết (tiếp)</h3>
							<div class="page-desc">${escapeHtml(rightChunk).replace(/\n/g, "<br>")}</div>
						</div>
					`
					: `
						<div class="page-content">
							<h3>Hết phần mô tả</h3>
							<p class="text-muted">Bạn có thể dùng nút tải tệp hoặc mở liên kết ở thanh công cụ bên dưới để xem toàn bộ tài liệu gốc.</p>
						</div>
					`
			});
		}

		return spreads;
	}

	function updateReaderBookmarkUI() {
		if (!activeReaderBook || !bookBookmarkBtn) return;
		const saved = bookmarkedIds.has(String(activeReaderBook.id));
		bookBookmarkBtn.textContent = saved ? "★ Đã lưu tài liệu" : "☆ Lưu tài liệu";
		bookBookmarkBtn.classList.toggle("saved", saved);
		bookBookmarkBtn.setAttribute("aria-pressed", String(saved));
	}

	function renderCurrentSpread(direction = "") {
		if (!readerSpreads.length) return;
		const spread = readerSpreads[currentSpreadIndex];
		if (direction && bookSpread) {
			bookSpread.classList.remove("flip-next", "flip-prev");
			void bookSpread.offsetWidth;
			bookSpread.classList.add(direction === "next" ? "flip-next" : "flip-prev");
			setTimeout(() => bookSpread.classList.remove("flip-next", "flip-prev"), 280);
		}
		bookPageLeft.innerHTML = spread.left;
		bookPageRight.innerHTML = spread.right;

		const totalPages = readerSpreads.length * 2;
		const leftNum = currentSpreadIndex * 2 + 1;
		const rightNum = leftNum + 1;
		bookPageIndicator.textContent = `Trang ${leftNum}-${rightNum} / ${totalPages}`;
		bookFlipPrev.disabled = currentSpreadIndex <= 0;
		bookFlipNext.disabled = currentSpreadIndex >= readerSpreads.length - 1;
	}

	function openBookReader(post) {
		activeReaderBook = post;
		readerSpreads = buildReaderSpreads(post);
		currentSpreadIndex = 0;

		const grade = post.resource_grade ? `Khối ${post.resource_grade}` : "Tất cả khối";
		const track = post.resource_track || "Chung";
		const subject = post.resource_subject || "Tài liệu";
		readerMetaEyebrow.textContent = `${grade} · ${track} · ${subject}`.toUpperCase();
		readerBookTitle.textContent = post.resource_title || "Tài liệu học tập";

		const safeFileUrl = safeResourceUrl(post.resource_file_url);
		const safeLink = safeResourceUrl(post.resource_link);

		if (safeFileUrl) {
			bookDownloadBtn.href = safeFileUrl;
			if (post.resource_file_name) bookDownloadBtn.setAttribute("download", post.resource_file_name);
			bookDownloadBtn.hidden = false;
		} else {
			bookDownloadBtn.hidden = true;
			bookDownloadBtn.removeAttribute("href");
		}

		if (safeLink) {
			bookOpenLinkBtn.href = safeLink;
			bookOpenLinkBtn.hidden = false;
		} else {
			bookOpenLinkBtn.hidden = true;
			bookOpenLinkBtn.removeAttribute("href");
		}

		const me = getCurrentUser();
		const isOwner = me && String(me.id) === String(post.user_id || post.userId || "");
		const isMod = me && ["admin", "super_admin", "moderator"].includes(String(me.role || "").toLowerCase());
		bookDeleteBtn.hidden = !(isOwner || isMod);

		updateReaderBookmarkUI();
		renderCurrentSpread("");
		readerOverlay.hidden = false;
		document.body.classList.add("subject-modal-open");
		readerCloseBtn.focus();
	}

	function closeBookReader() {
		readerOverlay.hidden = true;
		document.body.classList.remove("subject-modal-open");
		activeReaderBook = null;
	}

	bookFlipPrev?.addEventListener("click", () => {
		if (currentSpreadIndex > 0) {
			currentSpreadIndex--;
			renderCurrentSpread("prev");
		}
	});

	bookFlipNext?.addEventListener("click", () => {
		if (currentSpreadIndex < readerSpreads.length - 1) {
			currentSpreadIndex++;
			renderCurrentSpread("next");
		}
	});

	readerCloseBtn?.addEventListener("click", closeBookReader);
	readerOverlay?.addEventListener("click", event => {
		if (event.target === readerOverlay) closeBookReader();
	});

	document.addEventListener("keydown", event => {
		if (event.key === "Escape") {
			if (readerOverlay && !readerOverlay.hidden) closeBookReader();
			else if (subjectModal && !subjectModal.hidden) closeSubjectPicker();
		} else if (readerOverlay && !readerOverlay.hidden) {
			if (event.key === "ArrowLeft" && currentSpreadIndex > 0) {
				currentSpreadIndex--;
				renderCurrentSpread("prev");
			} else if (event.key === "ArrowRight" && currentSpreadIndex < readerSpreads.length - 1) {
				currentSpreadIndex++;
				renderCurrentSpread("next");
			}
		}
	});

	bookBookmarkBtn?.addEventListener("click", async () => {
		if (!activeReaderBook) return;
		if (!getToken() && !getCurrentUser()) {
			resourceMessage.textContent = "Hãy đăng nhập để lưu tài liệu vào trang cá nhân.";
			resourceMessage.classList.add("error");
			return;
		}
		const bookId = String(activeReaderBook.id);
		bookBookmarkBtn.disabled = true;
		try {
			const res = await fetch(`${BOOKMARKS_API}/toggle`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ itemType: "resource", itemId: bookId })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Không thể cập nhật lưu tài liệu.");
			const isSavedNow = typeof data.bookmarked === "boolean" ? data.bookmarked : !bookmarkedIds.has(bookId);
			if (isSavedNow) bookmarkedIds.add(bookId);
			else bookmarkedIds.delete(bookId);
			updateReaderBookmarkUI();
			renderResources();
		} catch (error) {
			alertFallbackMessage(error.message || "Không thể lưu tài liệu lúc này.");
		} finally {
			bookBookmarkBtn.disabled = false;
		}
	});

	function alertFallbackMessage(msg) {
		resourceMessage.textContent = msg;
		resourceMessage.classList.add("error");
	}

	bookDeleteBtn?.addEventListener("click", async () => {
		if (!activeReaderBook) return;
		const bookTitle = activeReaderBook.resource_title || "tài liệu này";
		if (!window.confirm(`Bạn có chắc muốn xóa "${bookTitle}" khỏi kệ sách?`)) return;
		bookDeleteBtn.disabled = true;
		try {
			const res = await fetch(`${POSTS_API}/${encodeURIComponent(activeReaderBook.id)}`, {
				method: "DELETE",
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Không thể xóa tài liệu.");
			closeBookReader();
			await loadResources();
		} catch (error) {
			alertFallbackMessage(error.message || "Xóa tài liệu thất bại.");
		} finally {
			bookDeleteBtn.disabled = false;
		}
	});

	function makeBookOnShelf(post) {
		const book = document.createElement("button");
		book.type = "button";
		book.className = "book-on-shelf";
		book.dataset.subject = post.resource_subject || "";
		book.dataset.track = post.resource_track || "";
		const title = post.resource_title || "Tài liệu";
		const coverColor = post.resource_cover_color || "#6aa68d";
		book.setAttribute("aria-label", `Mở sách ${title}`);
		book.title = `${title} (${post.name || "Thành viên DIEUNW"})`;
		book.style.setProperty("--book-color", coverColor);

		const spine = document.createElement("div");
		spine.className = "book-3d-spine";
		spine.style.background = `linear-gradient(155deg, ${coverColor}, #173853 185%)`;

		const gradePip = document.createElement("span");
		gradePip.className = "book-grade-pip";
		gradePip.textContent = post.resource_grade ? `K${post.resource_grade}` : "TL";

		const titleSpan = document.createElement("span");
		titleSpan.className = "book-3d-title";
		titleSpan.textContent = title;

		spine.append(gradePip, titleSpan);

		if (bookmarkedIds.has(String(post.id))) {
			const star = document.createElement("span");
			star.className = "book-saved-star";
			star.textContent = "★";
			star.title = "Đã lưu";
			spine.appendChild(star);
		}

		book.appendChild(spine);
		book.addEventListener("click", () => openBookReader(post));
		return book;
	}

	function renderResources() {
		resourceList.replaceChildren();
		if (!resources.length) {
			resourceList.innerHTML = `
				<div class="empty-state-box">
					<span class="empty-illustration" aria-hidden="true">📚</span>
					<h3>Kệ sách đang trống</h3>
					<p>Chưa có tài liệu nào được chia sẻ. Hãy là người đầu tiên đặt cuốn sách lên kệ!</p>
				</div>
			`;
			return;
		}

		const grouped = {};
		resources.forEach(post => {
			const key = post.resource_subject || "Khác";
			if (!grouped[key]) grouped[key] = [];
			grouped[key].push(post);
		});

		const subjectOrder = Object.keys(grouped).sort((a, b) => {
			const ta = tracks.Chuyên.includes(a) ? "Chuyên" : (tracks.Thường.includes(a) ? "Thường" : "");
			const tb = tracks.Chuyên.includes(b) ? "Chuyên" : (tracks.Thường.includes(b) ? "Thường" : "");
			const taIdx = ta === "Chuyên" ? 0 : (ta === "Thường" ? 1 : 2);
			const tbIdx = tb === "Chuyên" ? 0 : (tb === "Thường" ? 1 : 2);
			if (taIdx !== tbIdx) return taIdx - tbIdx;
			return orderKey(ta, grouped[a][0].resource_subject || "") - orderKey(tb, grouped[b][0].resource_subject || "");
		});

		for (const subject of subjectOrder) {
			const posts = grouped[subject];
			const row = document.createElement("section");
			row.className = "shelf-row";

			const header = document.createElement("div");
			header.className = "shelf-row-header";
			const trackLabel = tracks.Chuyên.includes(subject) ? "Chuyên" : (tracks.Thường.includes(subject) ? "Thường" : "Chung");
			header.innerHTML = `
				<div class="shelf-row-title-wrap">
					<span class="shelf-track">${escapeHtml(trackLabel)}</span>
					<span class="shelf-subject">${escapeHtml(subject)}</span>
				</div>
				<span class="shelf-count">${posts.length} cuốn</span>
			`;

			const booksTrack = document.createElement("div");
			booksTrack.className = "shelf-books";
			posts.forEach(post => booksTrack.appendChild(makeBookOnShelf(post)));

			const plank = document.createElement("div");
			plank.className = "shelf-plank";
			plank.setAttribute("aria-hidden", "true");

			row.append(header, booksTrack, plank);
			resourceList.appendChild(row);
		}
	}

	async function loadBookmarks() {
		if (!getToken() && !getCurrentUser()) return;
		try {
			const res = await fetch(BOOKMARKS_API, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			if (!res.ok) return;
			const data = await res.json().catch(() => ({}));
			const items = Array.isArray(data) ? data : (data.bookmarks || data.items || []);
			bookmarkedIds = new Set(
				items
					.filter(item => !item.item_type || item.item_type === "resource" || item.itemType === "resource")
					.map(item => String(item.item_id ?? item.itemId ?? item.post_id ?? item.id ?? ""))
					.filter(Boolean)
			);
		} catch {
			// Bỏ qua nếu chưa đăng nhập hoặc API bookmarks tạm thời chưa phản hồi
		}
	}

	async function loadResources() {
		resourceList.innerHTML = buildSkeletonMarkup(3);
		try {
			const [postsRes] = await Promise.all([
				fetch(POSTS_API, {
					credentials: "include",
					headers: getAuthHeaders()
				}),
				loadBookmarks()
			]);
			const data = await postsRes.json().catch(() => ({}));
			if (postsRes.status === 401) {
				resourceList.innerHTML = "<p class=\"feed-state\">Hãy <a href=\"./profile.html\">đăng nhập</a> để xem và chia sẻ tài liệu.</p>";
				return;
			}
			if (!postsRes.ok) throw new Error(data.error || "Không tải được kệ sách.");
			const posts = data.posts || data || [];
			resources = posts
				.filter(post => post.type === "study-resource")
				.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
			renderResources();
		} catch (error) {
			console.error("loadResources error:", error);
			resourceList.innerHTML = "<p class=\"feed-state error\">Không tải được tài liệu. Kiểm tra kết nối rồi thử lại.</p>";
		}
	}

	resourceForm.addEventListener("submit", async event => {
		event.preventDefault();
		resourceMessage.textContent = "";
		resourceMessage.classList.remove("error");

		if (!selection.grade || !selection.subject) {
			resourceMessage.textContent = "Hãy chọn khối và môn học trước khi đăng.";
			resourceMessage.classList.add("error");
			return;
		}

		const titleVal = document.getElementById("resource-title").value.trim();
		const descVal = document.getElementById("resource-description").value.trim();
		const linkVal = document.getElementById("resource-link").value.trim();
		const fileInput = document.getElementById("resource-file");
		const hasFile = fileInput.files && fileInput.files.length > 0;

		if (!linkVal && !hasFile) {
			resourceMessage.textContent = "Vui lòng nhập Liên kết tài liệu hoặc chọn Tệp đính kèm (cần ít nhất 1 trong 2).";
			resourceMessage.classList.add("error");
			return;
		}

		if (linkVal && !/^https?:\/\//i.test(linkVal)) {
			resourceMessage.textContent = "Liên kết tài liệu cần bắt đầu bằng http:// hoặc https://";
			resourceMessage.classList.add("error");
			return;
		}

		const formData = new FormData();
		formData.append("type", "study-resource");
		formData.append("resource_title", titleVal);
		formData.append("resource_description", descVal);
		formData.append("resource_link", linkVal);
		formData.append("resource_grade", selection.grade);
		formData.append("resource_track", selection.track);
		formData.append("resource_subject", selection.subject);
		formData.append("resource_cover_color", coverColorInput.value);
		if (hasFile) formData.append("resource_file", fileInput.files[0]);

		const currentUser = getCurrentUser();
		formData.append("user_id", (currentUser && currentUser.id) || "");
		formData.append("visibility", "public");

		resourceSubmit.disabled = true;
		resourceSubmit.textContent = "Đang đăng...";

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 45000);

		try {
			const response = await fetch(POSTS_API, {
				method: "POST",
				body: formData,
				credentials: "include",
				headers: getAuthHeaders(),
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			const data = await response.json().catch(() => ({}));
			if (response.status === 401) {
				throw new Error("Phiên đăng nhập hết hạn. Hãy đăng nhập lại rồi thử đăng tài liệu.");
			}
			if (!response.ok) throw new Error(data.error || "Không thể đăng tài liệu.");

			resourceForm.reset();
			selection.grade = "";
			selection.subject = "";
			renderChoices();
			if (coverColorLabel) coverColorLabel.textContent = "#6aa68d";
			resourceMessage.textContent = "Đã đặt cuốn sách lên kệ thành công!";
			await loadResources();
		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === "AbortError") {
				resourceMessage.textContent = "Máy chủ phản hồi quá lâu (đang khởi động). Hãy bấm Đăng lại nhé!";
			} else {
				resourceMessage.textContent = error.message || "Đăng chưa thành công. Hãy thử lại sau.";
			}
			resourceMessage.classList.add("error");
		} finally {
			resourceSubmit.disabled = false;
			resourceSubmit.textContent = "Đăng tài liệu";
		}
	});

	document.getElementById("resource-refresh")?.addEventListener("click", loadResources);
	renderChoices();
	loadResources();

	const roomForm = document.getElementById("room-form");
	const roomInput = document.getElementById("room-name");
	const roomMessage = document.getElementById("room-message");
	const meetingFrame = document.getElementById("meeting-frame");
	const meetingPlaceholder = document.getElementById("meeting-placeholder");

	document.getElementById("room-generate")?.addEventListener("click", () => {
		const suffix = Math.random().toString(36).slice(2, 8);
		roomInput.value = `dieunw-hoc-nhom-${suffix}`;
		roomMessage.textContent = "Đã tạo tên phòng. Gửi tên này cho các bạn muốn tham gia.";
		roomMessage.classList.remove("error");
	});

	roomForm?.addEventListener("submit", event => {
		event.preventDefault();
		const roomName = roomInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
		if (!roomName) {
			roomMessage.textContent = "Nhập tên phòng hợp lệ để tiếp tục.";
			roomMessage.classList.add("error");
			return;
		}
		roomInput.value = roomName;
		meetingFrame.src = `https://meet.jit.si/${encodeURIComponent(roomName)}`;
		meetingFrame.hidden = false;
		meetingPlaceholder.hidden = true;
		roomMessage.textContent = `Đang kết nối phòng ${roomName}.`;
		roomMessage.classList.remove("error");
	});
});