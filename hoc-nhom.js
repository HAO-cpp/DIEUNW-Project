document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const POSTS_API = `${API_BASE}/api/posts`;
	const SAVED_BOOKS_KEY = "dieunw_saved_books";

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

	function getAuthHeaders() {
		const token = getToken();
		return token ? { Authorization: `Bearer ${token}` } : {};
	}

	function getCurrentUser() {
		try {
			return JSON.parse(localStorage.getItem("dieuNwUser") || "null");
		} catch {
			return null;
		}
	}

	function getSavedIds() {
		try {
			const raw = JSON.parse(localStorage.getItem(SAVED_BOOKS_KEY) || "[]");
			return Array.isArray(raw) ? raw.map(String) : [];
		} catch {
			return [];
		}
	}

	function toggleSavedId(id) {
		const idStr = String(id);
		const current = getSavedIds();
		const exists = current.includes(idStr);
		const next = exists ? current.filter(item => item !== idStr) : [idStr, ...current];
		localStorage.setItem(SAVED_BOOKS_KEY, JSON.stringify(next));
		return !exists;
	}

	const tracks = {
		"Chuyên": ["Toán", "Văn", "Anh", "Tin", "Hóa", "Lý", "Sinh", "Địa", "Sử"],
		"Thường": ["Toán", "Văn", "Anh", "Tin", "Hóa", "Lý", "Sinh", "Địa", "Công nghệ", "Kinh tế và pháp luật", "Quốc phòng", "Thể chất"]
	};
	const subjectImages = {
		"Toán": "./Math.png",
		"Văn": "./Literature.png",
		"Anh": "./English.png",
		"Tin": "./Informatics.png",
		"Hóa": "./Chemistry.png",
		"Lý": "./Physics.png",
		"Sinh": "./Biology.png",
		"Địa": "./Geography.png",
		"Sử": "./History.png",
		"Công nghệ": "./Technology.png",
		"Kinh tế và pháp luật": "./Economics and law.png"
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

	// Book Reader Modal elements
	const readerOverlay = document.getElementById("book-reader-overlay");
	const readerModal = document.getElementById("book-reader-modal");
	const readerEyebrow = document.getElementById("reader-meta-eyebrow");
	const readerTitle = document.getElementById("reader-book-title");
	const readerClose = document.getElementById("book-reader-close");
	const bookSpread = document.getElementById("book-spread");
	const pageLeftEl = document.getElementById("book-page-left");
	const pageRightEl = document.getElementById("book-page-right");
	const flipPrevBtn = document.getElementById("book-flip-prev");
	const flipNextBtn = document.getElementById("book-flip-next");
	const pageIndicator = document.getElementById("book-page-indicator");
	const bookmarkBtn = document.getElementById("book-bookmark-btn");
	const downloadBtn = document.getElementById("book-download-btn");
	const openLinkBtn = document.getElementById("book-open-link-btn");
	const deleteBookBtn = document.getElementById("book-delete-btn");

	let resources = [];
	let activeBook = null;
	let bookPages = [];
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

	function normalizeInputLink(raw) {
		const trimmed = String(raw || "").trim();
		if (!trimmed) return "";
		if (/^https?:\/\//i.test(trimmed)) return trimmed;
		if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) return `https://${trimmed}`;
		return trimmed;
	}

	function displayDate(value) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? "Vừa chia sẻ" : date.toLocaleString("vi-VN");
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
		const subjects = tracks[pendingTrack];
		const pageCount = Math.ceil(subjects.length / 6);
		const pageSubjects = subjects.slice(subjectPage * 6, subjectPage * 6 + 6);
		Array.from({ length: 6 }, (_, index) => pageSubjects[index]).forEach(subject => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "subject-option";
			const imageSlot = document.createElement("span");
			imageSlot.className = "subject-tile-image";
			imageSlot.setAttribute("aria-hidden", "true");
			if (subjectImages[subject]) {
				const image = document.createElement("img");
				image.src = subjectImages[subject];
				image.alt = "";
				imageSlot.appendChild(image);
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
		const selectedIndex = tracks[pendingTrack].indexOf(pendingSubject);
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
			if (!tracks[pendingTrack].includes(pendingSubject)) pendingSubject = "";
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
		if ((subjectPage + 1) * 6 < tracks[pendingTrack].length) {
			subjectPage++;
			renderSubjectOptions();
		}
	});

	// --- TRÌNH ĐỌC SÁCH (OPEN BOOK READER VỚI LẬT TRANG TRÁI/PHẢI + LƯU TÀI LIỆU) ---
	function splitDescriptionPages(text, chunkSize = 420) {
		const clean = String(text || "").trim();
		if (!clean) return ["Tác giả chưa thêm mô tả chi tiết cho tài liệu này. Bạn có thể mở liên kết hoặc tải tệp đính kèm ở trang bên cạnh."];
		const chunks = [];
		let remaining = clean;
		while (remaining.length > chunkSize) {
			let cut = remaining.lastIndexOf("\n", chunkSize);
			if (cut < chunkSize * 0.4) cut = remaining.lastIndexOf(" ", chunkSize);
			if (cut < chunkSize * 0.4) cut = chunkSize;
			chunks.push(remaining.slice(0, cut).trim());
			remaining = remaining.slice(cut).trim();
		}
		if (remaining) chunks.push(remaining);
		return chunks;
	}

	function buildBookPages(post) {
		const title = post.resource_title || "Tài liệu học tập";
		const grade = post.resource_grade ? `Khối ${post.resource_grade}` : "Mọi khối";
		const track = post.resource_track || "Chung";
		const subject = post.resource_subject || "Tài liệu";
		const author = post.name || "Thành viên DIEUNW";
		const dateText = displayDate(post.createdAt);
		const safeFileUrl = safeResourceUrl(post.resource_file_url);
		const safeLink = safeResourceUrl(post.resource_link);
		const fileName = post.resource_file_name || "Tệp đính kèm";
		const fileType = post.resource_file_type || "";
		const descChunks = splitDescriptionPages(post.resource_description || post.description || "");

		const pages = [];

		// Trang 1: Bìa trong & Phần đầu nội dung
		pages.push(`
			<div class="book-meta-badges">
				<span class="book-meta-badge">${escapeHtml(grade)}</span>
				<span class="book-meta-badge">${escapeHtml(track)}</span>
				<span class="book-meta-badge">${escapeHtml(subject)}</span>
			</div>
			<h3>${escapeHtml(title)}</h3>
			<p class="book-page-text" style="font-size:12px; color:#71879a; margin-bottom:10px;">
				Đăng bởi <strong>${escapeHtml(author)}</strong> · ${escapeHtml(dateText)}
			</p>
			<div class="book-page-text">${escapeHtml(descChunks[0])}</div>
		`);

		// Các trang nội dung tiếp theo nếu mô tả dài
		for (let i = 1; i < descChunks.length; i++) {
			pages.push(`
				<h3>Nội dung (tiếp theo)</h3>
				<div class="book-page-text">${escapeHtml(descChunks[i])}</div>
			`);
		}

		// Trang cuối: Tệp đính kèm & Liên kết tài liệu
		const downloadHref = safeFileUrl ? `${safeFileUrl}${safeFileUrl.includes("?") ? "&" : "?"}download=1` : "";
		pages.push(`
			<h3>Tài liệu &amp; Truy cập</h3>
			<div class="book-resource-box">
				<p><strong>Tệp đính kèm:</strong></p>
				${safeFileUrl
					? `<p style="margin:6px 0 10px;">${escapeHtml(fileName)}${fileType ? ` (${escapeHtml(fileType)})` : ""}</p>
					   <a href="${escapeHtml(downloadHref)}" class="book-action-link" download="${escapeHtml(fileName)}" target="_blank" rel="noopener noreferrer">⬇ Tải &amp; lưu tệp</a>`
					: `<p style="color:#71879a; margin-top:4px;">Không có tệp tải lên.</p>`
				}
			</div>
			<div class="book-resource-box">
				<p><strong>Liên kết tài liệu:</strong></p>
				${safeLink
					? `<p style="margin:6px 0 10px; word-break:break-all; font-size:12.5px; color:#31536e;">${escapeHtml(safeLink)}</p>
					   <a href="${escapeHtml(safeLink)}" class="book-action-link secondary" target="_blank" rel="noopener noreferrer">↗ Mở liên kết</a>`
					: `<p style="color:#71879a; margin-top:4px;">Không có liên kết ngoài.</p>`
				}
			</div>
		`);

		if (pages.length % 2 !== 0) {
			pages.push(`
				<h3>Ghi chú học tập</h3>
				<div class="book-page-text">Bạn có thể bấm nút "☆ Lưu tài liệu" bên dưới để ghim cuốn sách này lên đầu Kệ sách trên trình duyệt, hoặc tải tệp / mở liên kết ở trang bên cạnh để ôn tập bất cứ lúc nào.</div>
			`);
		}
		return pages;
	}

	function renderSpread(direction = "") {
		const leftIdx = currentSpreadIndex * 2;
		const rightIdx = leftIdx + 1;
		const total = bookPages.length;

		if (direction) {
			bookSpread.classList.remove("flip-next", "flip-prev");
			void bookSpread.offsetWidth;
			bookSpread.classList.add(direction === "next" ? "flip-next" : "flip-prev");
		}

		pageLeftEl.innerHTML = `${bookPages[leftIdx] || ""}<div class="book-page-num">Trang ${leftIdx + 1}</div>`;
		pageRightEl.innerHTML = `${bookPages[rightIdx] || ""}<div class="book-page-num">Trang ${rightIdx + 1}</div>`;

		const totalSpreads = Math.max(1, Math.ceil(total / 2));
		pageIndicator.textContent = `Trang ${leftIdx + 1}-${Math.min(rightIdx + 1, total)} / ${total}`;
		flipPrevBtn.disabled = currentSpreadIndex <= 0;
		flipNextBtn.disabled = currentSpreadIndex >= totalSpreads - 1;
	}

	function updateBookmarkButtonState() {
		if (!activeBook) return;
		const saved = getSavedIds().includes(String(activeBook.id));
		bookmarkBtn.textContent = saved ? "★ Đã lưu tài liệu" : "☆ Lưu tài liệu";
		bookmarkBtn.classList.toggle("secondary", !saved);
	}

	function openBookReader(post) {
		activeBook = post;
		bookPages = buildBookPages(post);
		currentSpreadIndex = 0;

		const coverColor = post.resource_cover_color || "#6aa68d";
		readerModal.style.setProperty("--book-color", coverColor);
		readerEyebrow.textContent = `KHỐI ${post.resource_grade || "?"} · ${post.resource_track || ""} · ${post.resource_subject || ""}`;
		readerTitle.textContent = post.resource_title || "Tài liệu";

		const safeFileUrl = safeResourceUrl(post.resource_file_url);
		const safeLink = safeResourceUrl(post.resource_link);

		if (safeFileUrl) {
			const dlUrl = `${safeFileUrl}${safeFileUrl.includes("?") ? "&" : "?"}download=1`;
			downloadBtn.href = dlUrl;
			downloadBtn.setAttribute("download", post.resource_file_name || "tai-lieu");
			downloadBtn.hidden = false;
		} else {
			downloadBtn.hidden = true;
		}

		if (safeLink) {
			openLinkBtn.href = safeLink;
			openLinkBtn.hidden = false;
		} else {
			openLinkBtn.hidden = true;
		}

		const user = getCurrentUser();
		const canDelete = Boolean(
			user && (
				String(user.id) === String(post.user_id || post.userId)
				|| user.isAdmin
				|| user.isModerator
			)
		);
		deleteBookBtn.hidden = !canDelete;

		updateBookmarkButtonState();
		renderSpread();
		readerOverlay.hidden = false;
		document.body.style.overflow = "hidden";
	}

	function closeBookReader() {
		readerOverlay.hidden = true;
		document.body.style.overflow = "";
		activeBook = null;
	}

	function flipSpread(delta) {
		if (!activeBook) return;
		const totalSpreads = Math.max(1, Math.ceil(bookPages.length / 2));
		const nextSpread = currentSpreadIndex + delta;
		if (nextSpread < 0 || nextSpread >= totalSpreads) return;
		currentSpreadIndex = nextSpread;
		renderSpread(delta > 0 ? "next" : "prev");
	}

	flipPrevBtn.addEventListener("click", () => flipSpread(-1));
	flipNextBtn.addEventListener("click", () => flipSpread(1));
	readerClose.addEventListener("click", closeBookReader);
	readerOverlay.addEventListener("click", event => {
		if (event.target === readerOverlay) closeBookReader();
	});

	// Vuốt trên điện thoại để lật trang
	let touchStartX = 0;
	bookSpread.addEventListener("touchstart", e => {
		touchStartX = e.changedTouches[0]?.clientX || 0;
	}, { passive: true });
	bookSpread.addEventListener("touchend", e => {
		const diff = (e.changedTouches[0]?.clientX || 0) - touchStartX;
		if (Math.abs(diff) > 48) {
			flipSpread(diff < 0 ? 1 : -1);
		}
	}, { passive: true });

	document.addEventListener("keydown", event => {
		if (!subjectModal.hidden && event.key === "Escape") {
			closeSubjectPicker();
			return;
		}
		if (!readerOverlay.hidden) {
			if (event.key === "Escape") closeBookReader();
			else if (event.key === "ArrowLeft") flipSpread(-1);
			else if (event.key === "ArrowRight") flipSpread(1);
		}
	});

	bookmarkBtn.addEventListener("click", () => {
		if (!activeBook) return;
		toggleSavedId(activeBook.id);
		updateBookmarkButtonState();
		renderResources();
	});

	deleteBookBtn.addEventListener("click", async () => {
		if (!activeBook) return;
		if (!window.confirm(`Xóa tài liệu "${activeBook.resource_title || "này"}" khỏi kệ sách?`)) return;
		deleteBookBtn.disabled = true;
		try {
			const res = await fetch(`${POSTS_API}/${encodeURIComponent(activeBook.id)}`, {
				method: "DELETE",
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Không thể xóa tài liệu.");
			closeBookReader();
			await loadResources();
		} catch (error) {
			window.alert?.(error.message || "Không xóa được tài liệu.");
		} finally {
			deleteBookBtn.disabled = false;
		}
	});

	// --- VẼ KỆ SÁCH ---
	function orderKey(track, subject) {
		const trackOrder = track === "Chuyên" ? 0 : 1;
		const list = tracks[track] || [];
		const subIndex = list.indexOf(subject);
		return trackOrder * 100 + (subIndex >= 0 ? subIndex : 99);
	}

	function makeBookOnShelf(post, savedSet) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "book-on-shelf";
		btn.style.setProperty("--book-color", post.resource_cover_color || "#6aa68d");
		btn.title = `${post.resource_title || "Tài liệu"} — Khối ${post.resource_grade || "?"}`;
		btn.setAttribute("aria-label", `Mở sách ${post.resource_title || "Tài liệu"}`);

		const spine = document.createElement("div");
		spine.className = "book-3d-spine";

		if (post.resource_grade) {
			const gradePip = document.createElement("span");
			gradePip.className = "book-grade-pip";
			gradePip.textContent = `K${post.resource_grade}`;
			spine.appendChild(gradePip);
		}

		const titleSpan = document.createElement("span");
		titleSpan.className = "book-3d-title";
		titleSpan.textContent = post.resource_title || "Tài liệu";
		spine.appendChild(titleSpan);

		if (savedSet.has(String(post.id))) {
			const star = document.createElement("span");
			star.className = "book-saved-star";
			star.textContent = "★";
			star.title = "Đã lưu";
			spine.appendChild(star);
		}

		btn.appendChild(spine);
		btn.addEventListener("click", () => openBookReader(post));
		return btn;
	}

	function buildShelfRow(trackLabel, subjectName, posts, savedSet) {
		const row = document.createElement("section");
		row.className = "shelf-row";

		const header = document.createElement("div");
		header.className = "shelf-row-header";
		const titleWrap = document.createElement("div");
		titleWrap.className = "shelf-row-title-wrap";
		titleWrap.innerHTML = `${trackLabel ? `<span class="shelf-track">${escapeHtml(trackLabel)}</span>` : ""}<span class="shelf-subject">${escapeHtml(subjectName)}</span>`;
		const countEl = document.createElement("span");
		countEl.className = "shelf-count";
		countEl.textContent = `${posts.length} cuốn`;
		header.append(titleWrap, countEl);

		const booksWrap = document.createElement("div");
		booksWrap.className = "shelf-books";
		posts.forEach(post => booksWrap.appendChild(makeBookOnShelf(post, savedSet)));

		const plank = document.createElement("div");
		plank.className = "shelf-plank";
		plank.setAttribute("aria-hidden", "true");

		row.append(header, booksWrap, plank);
		return row;
	}

	function renderResources() {
		resourceList.replaceChildren();
		if (!resources.length) {
			resourceList.innerHTML = `<p class="feed-state">Chưa có tài liệu nào trên kệ. Hãy chia sẻ cuốn sách đầu tiên!</p>`;
			return;
		}

		const savedIds = getSavedIds();
		const savedSet = new Set(savedIds);
		const savedBooks = resources.filter(post => savedSet.has(String(post.id)));
		if (savedBooks.length) {
			resourceList.appendChild(buildShelfRow("ĐÃ LƯU", "Tài liệu của bạn", savedBooks, savedSet));
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
			const trackLabel = tracks.Chuyên.includes(subject)
				? "Chuyên"
				: (tracks.Thường.includes(subject) ? "Thường" : "");
			resourceList.appendChild(buildShelfRow(trackLabel, subject, posts, savedSet));
		}
	}

	async function loadResources() {
		resourceList.innerHTML = `<p class="feed-state">Đang tải kệ sách...</p>`;
		try {
			const response = await fetch(POSTS_API, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await response.json().catch(() => ({}));
			if (response.status === 401) {
				resourceList.innerHTML = `<p class="feed-state">Hãy <a href="./profile.html">đăng nhập</a> để xem và chia sẻ tài liệu.</p>`;
				return;
			}
			if (!response.ok) throw new Error(data.error || "Không tải được kệ sách.");
			const posts = Array.isArray(data.posts) ? data.posts : (Array.isArray(data) ? data : []);
			resources = posts
				.filter(post => post.type === "study-resource")
				.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
			renderResources();
		} catch (error) {
			console.error("loadResources error:", error);
			resourceList.innerHTML = `<p class="feed-state error">Không tải được tài liệu. Kiểm tra kết nối rồi thử lại.</p>`;
		}
	}

	resourceForm.addEventListener("submit", async event => {
		event.preventDefault();
		resourceMessage.textContent = "";
		resourceMessage.classList.remove("error");

		const titleInput = document.getElementById("resource-title");
		const descInput = document.getElementById("resource-description");
		const linkInput = document.getElementById("resource-link");
		const fileInput = document.getElementById("resource-file");

		const title = titleInput.value.trim();
		const normalizedLink = normalizeInputLink(linkInput.value);
		const hasFile = fileInput.files && fileInput.files.length > 0;

		if (!selection.grade || !selection.subject) {
			resourceMessage.textContent = "Hãy chọn khối và môn học trước khi đăng.";
			resourceMessage.classList.add("error");
			return;
		}
		if (!title) {
			resourceMessage.textContent = "Hãy nhập tên tài liệu.";
			resourceMessage.classList.add("error");
			return;
		}
		if (!normalizedLink && !hasFile) {
			resourceMessage.textContent = "Vui lòng nhập liên kết tài liệu HOẶC chọn tệp đính kèm (cần ít nhất 1 trong 2).";
			resourceMessage.classList.add("error");
			return;
		}
		if (normalizedLink && !/^https?:\/\/.+/i.test(normalizedLink)) {
			resourceMessage.textContent = "Liên kết không hợp lệ (hãy bắt đầu bằng https:// hoặc tên miền).";
			resourceMessage.classList.add("error");
			return;
		}

		const formData = new FormData();
		formData.append("type", "study-resource");
		formData.append("resource_title", title);
		formData.append("resource_description", descInput.value.trim());
		formData.append("resource_link", normalizedLink);
		formData.append("resource_grade", selection.grade);
		formData.append("resource_track", selection.track);
		formData.append("resource_subject", selection.subject);
		formData.append("resource_cover_color", coverColorInput.value || "#6aa68d");
		if (hasFile) formData.append("resource_file", fileInput.files[0]);

		const currentUser = getCurrentUser();
		formData.append("user_id", (currentUser && currentUser.id) || "");
		formData.append("visibility", "public");

		resourceSubmit.disabled = true;
		resourceSubmit.textContent = "Đang đăng...";

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 65000);

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
			resourceMessage.textContent = "Đã đăng tài liệu lên kệ sách thành công!";
			await loadResources();
		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === "AbortError") {
				resourceMessage.textContent = "Máy chủ phản hồi quá lâu (có thể đang thức dậy). Hãy bấm Đăng lại nhé!";
			} else {
				resourceMessage.textContent = error.message || "Đăng chưa thành công. Hãy thử lại sau.";
			}
			resourceMessage.classList.add("error");
		} finally {
			resourceSubmit.disabled = false;
			resourceSubmit.textContent = "Đăng tài liệu";
		}
	});

	document.getElementById("resource-refresh").addEventListener("click", loadResources);
	renderChoices();
	loadResources();

	// --- PHÒNG HỌC TRỰC TUYẾN JITSI ---
	const roomForm = document.getElementById("room-form");
	const roomInput = document.getElementById("room-name");
	const roomMessage = document.getElementById("room-message");
	const meetingFrame = document.getElementById("meeting-frame");
	const meetingPlaceholder = document.getElementById("meeting-placeholder");

	document.getElementById("room-generate").addEventListener("click", () => {
		const suffix = Math.random().toString(36).slice(2, 8);
		roomInput.value = `dieunw-hoc-nhom-${suffix}`;
		roomMessage.textContent = "Đã tạo tên phòng. Gửi tên này cho các bạn muốn tham gia.";
		roomMessage.classList.remove("error");
	});

	roomForm.addEventListener("submit", event => {
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