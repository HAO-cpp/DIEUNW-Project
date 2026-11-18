document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const POSTS_API = `${API_BASE}/api/posts`;

	function getAuthHeaders(extra = {}) {
		let storedUser = {};
		try {
			storedUser = JSON.parse(localStorage.getItem("dieuNwUser") || "{}");
		} catch {
			storedUser = {};
		}
		const token = localStorage.getItem("session_token")
			|| localStorage.getItem("dieuNwToken")
			|| storedUser.token
			|| "";
		return {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...extra
		};
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
	const filterTrack = document.getElementById("filter-track");
	const filterSubject = document.getElementById("filter-subject");
	const filterGrade = document.getElementById("filter-grade");
	const resourceForm = document.getElementById("resource-form");
	const resourceMessage = document.getElementById("resource-message");
	const resourceSubmit = document.getElementById("resource-submit");
	const coverColorInput = document.getElementById("resource-cover-color");
	const coverColorLabel = document.querySelector(".color-picker-label");

	const fileBox = document.getElementById("resource-file-box");
	const fileInput = document.getElementById("resource-file");
	const fileNameLabel = document.getElementById("resource-file-name");
	const fileClearBtn = document.getElementById("resource-file-clear");

	// Book Reader Modal elements
	const readerOverlay = document.getElementById("book-reader-overlay");
	const readerModal = document.getElementById("book-reader-modal");
	const readerEyebrow = document.getElementById("reader-meta-eyebrow");
	const readerTitle = document.getElementById("reader-book-title");
	const readerSpread = document.getElementById("book-spread");
	const pageLeftEl = document.getElementById("book-page-left");
	const pageRightEl = document.getElementById("book-page-right");
	const flipPrevBtn = document.getElementById("book-flip-prev");
	const flipNextBtn = document.getElementById("book-flip-next");
	const pageIndicator = document.getElementById("book-page-indicator");
	const bookmarkBtn = document.getElementById("book-bookmark-btn");
	const downloadBtn = document.getElementById("book-download-btn");
	const openLinkBtn = document.getElementById("book-open-link-btn");
	const deleteBtn = document.getElementById("book-delete-btn");
	const readerCloseBtn = document.getElementById("book-reader-close");

	let resources = [];
	let activeBook = null;
	let readerPages = [];
	let readerSpreadIndex = 0;

	// Tabs
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

	// File Upload Picker (click anywhere in box or on label, drag & drop, clear)
	function formatFileSize(bytes) {
		const size = Number(bytes || 0);
		if (!size) return "";
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	}

	function syncSelectedFileUi() {
		if (!fileInput || !fileNameLabel || !fileClearBtn) return;
		const file = fileInput.files?.[0];
		if (file) {
			const sizeStr = formatFileSize(file.size);
			fileNameLabel.textContent = sizeStr ? `${file.name} (${sizeStr})` : file.name;
			fileNameLabel.title = file.name;
			fileClearBtn.hidden = false;
		} else {
			fileNameLabel.textContent = "Chưa chọn tệp nào";
			fileNameLabel.title = "";
			fileClearBtn.hidden = true;
		}
	}

	if (fileInput) {
		fileInput.addEventListener("change", syncSelectedFileUi);
	}

	if (fileClearBtn && fileInput) {
		fileClearBtn.addEventListener("click", ev => {
			ev.preventDefault();
			ev.stopPropagation();
			fileInput.value = "";
			syncSelectedFileUi();
		});
	}

	if (fileBox && fileInput) {
		fileBox.addEventListener("click", ev => {
			if (ev.target.closest("#resource-file-clear") || ev.target.closest("label")) return;
			fileInput.click();
		});
		fileBox.addEventListener("dragover", ev => {
			ev.preventDefault();
			fileBox.classList.add("is-dragover");
		});
		fileBox.addEventListener("dragleave", () => {
			fileBox.classList.remove("is-dragover");
		});
		fileBox.addEventListener("drop", ev => {
			ev.preventDefault();
			fileBox.classList.remove("is-dragover");
			const dropped = ev.dataTransfer?.files?.[0];
			if (!dropped) return;
			try {
				const dt = new DataTransfer();
				dt.items.add(dropped);
				fileInput.files = dt.files;
				syncSelectedFileUi();
			} catch {
				// Fallback if DataTransfer constructor blocked
			}
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

	function buildDownloadUrl(fileUrl, fileName) {
		const safe = safeResourceUrl(fileUrl);
		if (!safe) return "";
		try {
			const parsed = new URL(safe);
			if (parsed.origin === API_BASE) {
				parsed.searchParams.set("download", "1");
				if (fileName) parsed.searchParams.set("name", fileName);
				return parsed.toString();
			}
		} catch {}
		return safe;
	}

	async function triggerResourceDownload(fileUrl, fileName) {
		const dlUrl = buildDownloadUrl(fileUrl, fileName);
		if (!dlUrl) return;
		try {
			const res = await fetch(dlUrl, { credentials: "include" });
			if (!res.ok) {
				const errJson = await res.json().catch(() => ({}));
				throw new Error(errJson.error || "Không tìm thấy tệp trên máy chủ.");
			}
			const blob = await res.blob();
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = blobUrl;
			a.download = fileName || "tai-lieu-dieunw";
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
		} catch (err) {
			alert(err.message || "Không thể tải tệp tài liệu này. Có thể tệp đã bị xóa khỏi bộ nhớ tạm máy chủ.");
		}
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

	document.getElementById("subject-modal-close")?.addEventListener("click", closeSubjectPicker);
	document.getElementById("subject-modal-cancel")?.addEventListener("click", closeSubjectPicker);
	subjectModal?.addEventListener("click", event => {
		if (event.target === subjectModal) closeSubjectPicker();
	});
	document.addEventListener("keydown", event => {
		if (event.key === "Escape") {
			if (!subjectModal.hidden) closeSubjectPicker();
			else if (readerOverlay && !readerOverlay.hidden) closeBookReader();
		}
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

	previousSubjectPage?.addEventListener("click", () => {
		if (subjectPage > 0) {
			subjectPage--;
			renderSubjectOptions();
		}
	});
	nextSubjectPage?.addEventListener("click", () => {
		if ((subjectPage + 1) * 6 < tracks[pendingTrack].length) {
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

	// =========================================================
	// BOOK READER MODAL (3D SHELF + PAGE FLIP + DOWNLOAD + BOOKMARK)
	// =========================================================
	function buildBookPages(post) {
		const desc = String(post.resource_description || post.description || "").trim() || "Tài liệu do bạn học chia sẻ trên thư viện DIEUNW.";
		const chunkSize = 420;
		const chunks = [];
		for (let i = 0; i < desc.length; i += chunkSize) {
			chunks.push(desc.slice(i, i + chunkSize));
		}
		if (!chunks.length) chunks.push("");

		const pages = [];
		// Page 1: Cover / Overview & first text chunk
		pages.push({
			type: "overview",
			text: chunks[0]
		});
		// Middle text pages (if long description)
		for (let i = 1; i < chunks.length; i++) {
			pages.push({
				type: "text",
				text: chunks[i]
			});
		}
		// Final attachments & author info page
		pages.push({
			type: "attachments"
		});
		if (pages.length % 2 !== 0) {
			// Ensure even spreads when needed
			pages.splice(pages.length - 1, 0, {
				type: "note",
				text: "Chúc bạn ôn tập hiệu quả cùng cộng đồng học tập DIEUNW NQD!"
			});
		}
		return pages;
	}

	function renderReaderPageHtml(pageObj, pageNumber, post) {
		if (!pageObj) {
			return `<div class="book-page-num">Trang ${pageNumber}</div>`;
		}
		const safeFileUrl = safeResourceUrl(post.resource_file_url);
		const safeLink = safeResourceUrl(post.resource_link);
		const fileName = post.resource_file_name || "tai-lieu-dinh-kem";
		const fileType = post.resource_file_type || "";

		if (pageObj.type === "overview") {
			return `
				<div class="book-meta-badges">
					<span class="book-meta-badge">Khối ${escapeHtml(post.resource_grade || "?")}</span>
					<span class="book-meta-badge">${escapeHtml(post.resource_track || "Chung")}</span>
					<span class="book-meta-badge">${escapeHtml(post.resource_subject || "Tổng hợp")}</span>
				</div>
				<h3 style="font-size:18px; color:#173853;">${escapeHtml(post.resource_title || "Tài liệu học tập")}</h3>
				<p class="book-page-text">${escapeHtml(pageObj.text)}</p>
				<div class="book-page-num">Trang ${pageNumber}</div>
			`;
		}

		if (pageObj.type === "attachments") {
			return `
				<h3 style="font-size:17px; color:#173853;">Tệp &amp; Liên kết đính kèm</h3>
				<div class="book-resource-box">
					${safeFileUrl ? `
						<div>
							<p style="font-size:13px; font-weight:700; color:#173853;">📄 ${escapeHtml(fileName)}${fileType ? ` (${escapeHtml(fileType)})` : ""}</p>
							<button type="button" class="book-action-link js-reader-inline-download" style="margin-top:8px;">⬇ Tải tệp tài liệu</button>
						</div>
					` : `<p style="font-size:13px; color:#6b8195;">Không có tệp tải lên trực tiếp.</p>`}
					${safeLink ? `
						<div style="padding-top:6px; border-top:1px dashed #e0e8f0;">
							<p style="font-size:12.5px; color:#526b80; margin-bottom:6px; word-break:break-all;">🔗 ${escapeHtml(safeLink)}</p>
							<a href="${escapeHtml(safeLink)}" class="book-action-link secondary" target="_blank" rel="noopener noreferrer">↗ Mở liên kết tài liệu</a>
						</div>
					` : ""}
				</div>
				<p style="font-size:12.5px; color:#5c6f82; margin-top:6px;">
					<strong>Người chia sẻ:</strong> ${escapeHtml(post.name || "Thành viên NQD")}<br>
					<strong>Thời gian:</strong> ${escapeHtml(displayDate(post.createdAt))}
				</p>
				<div class="book-page-num">Trang ${pageNumber}</div>
			`;
		}

		return `
			<p class="book-page-text">${escapeHtml(pageObj.text)}</p>
			<div class="book-page-num">Trang ${pageNumber}</div>
		`;
	}

	function renderReaderSpread(direction = "") {
		if (!activeBook) return;
		const totalSpreads = Math.max(1, Math.ceil(readerPages.length / 2));
		readerSpreadIndex = Math.max(0, Math.min(readerSpreadIndex, totalSpreads - 1));
		const leftIdx = readerSpreadIndex * 2;
		const rightIdx = leftIdx + 1;

		pageLeftEl.innerHTML = renderReaderPageHtml(readerPages[leftIdx], leftIdx + 1, activeBook);
		pageRightEl.innerHTML = renderReaderPageHtml(readerPages[rightIdx], rightIdx + 1, activeBook);

		pageRightEl.querySelectorAll(".js-reader-inline-download").forEach(btn => {
			btn.addEventListener("click", () => {
				triggerResourceDownload(activeBook.resource_file_url, activeBook.resource_file_name);
			});
		});
		pageLeftEl.querySelectorAll(".js-reader-inline-download").forEach(btn => {
			btn.addEventListener("click", () => {
				triggerResourceDownload(activeBook.resource_file_url, activeBook.resource_file_name);
			});
		});

		const leftNum = leftIdx + 1;
		const rightNum = Math.min(readerPages.length, rightIdx + 1);
		pageIndicator.textContent = `Trang ${leftNum}-${rightNum} / ${readerPages.length}`;
		flipPrevBtn.disabled = readerSpreadIndex === 0;
		flipNextBtn.disabled = readerSpreadIndex >= totalSpreads - 1;

		if (direction && readerSpread) {
			readerSpread.classList.remove("flip-next", "flip-prev");
			void readerSpread.offsetWidth;
			readerSpread.classList.add(direction === "next" ? "flip-next" : "flip-prev");
		}
	}

	function openBookReader(post) {
		activeBook = post;
		readerPages = buildBookPages(post);
		readerSpreadIndex = 0;

		const coverColor = post.resource_cover_color || "#1769aa";
		if (readerModal) readerModal.style.setProperty("--book-color", coverColor);
		if (readerEyebrow) {
			readerEyebrow.textContent = `KHỐI ${post.resource_grade || "?"} · ${post.resource_track || ""} · ${post.resource_subject || "TÀI LIỆU"}`;
		}
		if (readerTitle) readerTitle.textContent = post.resource_title || "Tài liệu học tập";

		const safeFileUrl = safeResourceUrl(post.resource_file_url);
		const safeLink = safeResourceUrl(post.resource_link);
		if (downloadBtn) {
			downloadBtn.hidden = !safeFileUrl;
			downloadBtn.href = buildDownloadUrl(post.resource_file_url, post.resource_file_name) || "#";
		}
		if (openLinkBtn) {
			openLinkBtn.hidden = !safeLink;
			openLinkBtn.href = safeLink || "#";
		}
		if (bookmarkBtn) {
			bookmarkBtn.textContent = post.bookmarkedByMe ? "★ Đã lưu tài liệu" : "☆ Lưu tài liệu";
		}

		const me = getCurrentUser();
		const canDelete = Boolean(me && (String(me.id) === String(post.userId) || me.isAdmin || me.isModerator));
		if (deleteBtn) deleteBtn.hidden = !canDelete;

		renderReaderSpread();
		if (readerOverlay) readerOverlay.hidden = false;
	}

	function closeBookReader() {
		if (readerOverlay) readerOverlay.hidden = true;
		activeBook = null;
	}

	readerCloseBtn?.addEventListener("click", closeBookReader);
	readerOverlay?.addEventListener("click", ev => {
		if (ev.target === readerOverlay) closeBookReader();
	});

	flipPrevBtn?.addEventListener("click", () => {
		if (readerSpreadIndex > 0) {
			readerSpreadIndex--;
			renderReaderSpread("prev");
		}
	});

	flipNextBtn?.addEventListener("click", () => {
		const totalSpreads = Math.max(1, Math.ceil(readerPages.length / 2));
		if (readerSpreadIndex < totalSpreads - 1) {
			readerSpreadIndex++;
			renderReaderSpread("next");
		}
	});

	downloadBtn?.addEventListener("click", ev => {
		if (!activeBook?.resource_file_url) return;
		ev.preventDefault();
		triggerResourceDownload(activeBook.resource_file_url, activeBook.resource_file_name);
	});

	bookmarkBtn?.addEventListener("click", async () => {
		if (!activeBook) return;
		bookmarkBtn.disabled = true;
		try {
			const res = await fetch(`${API_BASE}/api/bookmarks/toggle`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ itemType: "resource", itemId: activeBook.id })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Hãy đăng nhập để lưu tài liệu.");
			activeBook.bookmarkedByMe = Boolean(data.bookmarked);
			bookmarkBtn.textContent = activeBook.bookmarkedByMe ? "★ Đã lưu tài liệu" : "☆ Lưu tài liệu";
			renderResources();
		} catch (err) {
			alert(err.message || "Không thể lưu tài liệu.");
		} finally {
			bookmarkBtn.disabled = false;
		}
	});

	deleteBtn?.addEventListener("click", async () => {
		if (!activeBook) return;
		if (!window.confirm(`Bạn có chắc muốn xóa tài liệu "${activeBook.resource_title || "này"}"?`)) return;
		deleteBtn.disabled = true;
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
		} catch (err) {
			alert(err.message || "Không thể xóa tài liệu.");
		} finally {
			deleteBtn.disabled = false;
		}
	});

	function makeBook(post) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "book-on-shelf";
		button.dataset.subject = post.resource_subject || "";
		button.dataset.track = post.resource_track || "";
		button.setAttribute("aria-label", `Mở tài liệu ${post.resource_title || "Tài liệu"}`);
		button.title = `${post.resource_title || "Tài liệu"} (${post.resource_subject || ""})`;

		const coverColor = post.resource_cover_color || "#6aa68d";
		const spine = document.createElement("div");
		spine.className = "book-3d-spine";
		spine.style.setProperty("--book-color", coverColor);
		spine.style.background = coverColor;

		if (post.resource_grade) {
			const pip = document.createElement("span");
			pip.className = "book-grade-pip";
			pip.textContent = `K${post.resource_grade}`;
			spine.appendChild(pip);
		}

		const titleSpan = document.createElement("span");
		titleSpan.className = "book-3d-title";
		titleSpan.textContent = post.resource_title || "Tài liệu";
		spine.appendChild(titleSpan);

		if (post.bookmarkedByMe) {
			const star = document.createElement("span");
			star.className = "book-saved-star";
			star.textContent = "⭐";
			star.title = "Đã lưu";
			spine.appendChild(star);
		}

		button.appendChild(spine);
		button.addEventListener("click", () => openBookReader(post));
		return button;
	}

	function updateSubjectFilter() {
		if (!filterSubject || !filterTrack) return;
		const selectedSubject = filterSubject.value;
		const availableSubjects = filterTrack.value
			? tracks[filterTrack.value]
			: [...new Set(Object.values(tracks).flat())];
		filterSubject.replaceChildren(new Option("Tất cả môn", ""));
		availableSubjects.forEach(subject => filterSubject.add(new Option(subject, subject)));
		filterSubject.value = availableSubjects.includes(selectedSubject) ? selectedSubject : "";
	}

	function renderResources() {
		resourceList.replaceChildren();
		const trackVal = filterTrack?.value || "";
		const subVal = filterSubject?.value || "";
		const gradeVal = filterGrade?.value || "";

		const filtered = resources.filter(post => {
			return (!trackVal || post.resource_track === trackVal)
				&& (!subVal || post.resource_subject === subVal)
				&& (!gradeVal || String(post.resource_grade) === gradeVal);
		});
		if (!filtered.length) {
			resourceList.innerHTML = `<p class="feed-state">${resources.length ? "Không tìm thấy tài liệu phù hợp với bộ lọc." : "Chưa có tài liệu nào. Bạn có thể chia sẻ đầu tiên."}</p>`;
			return;
		}
		const grouped = {};
		filtered.forEach(post => {
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
				<span class="shelf-count">${posts.length} tài liệu</span>
			`;

			const shelf = document.createElement("div");
			shelf.className = "shelf-books";
			posts.forEach(post => shelf.appendChild(makeBook(post)));

			const plank = document.createElement("div");
			plank.className = "shelf-plank";
			plank.setAttribute("aria-hidden", "true");

			row.appendChild(header);
			row.appendChild(shelf);
			row.appendChild(plank);
			resourceList.appendChild(row);
		}
	}

	async function loadResources() {
		resourceList.innerHTML = "<p class=\"feed-state\">Đang tải kệ sách...</p>";
		try {
			const response = await fetch(POSTS_API, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await response.json().catch(() => ({}));
			if (response.status === 401) {
				resourceList.innerHTML = "<p class=\"feed-state\">Hãy <a href=\"./profile.html\">đăng nhập</a> để xem và chia sẻ tài liệu.</p>";
				return;
			}
			if (!response.ok) throw new Error(data.error || "Không tải được kệ sách.");
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

	resourceForm?.addEventListener("submit", async event => {
		event.preventDefault();
		if (!selection.grade || !selection.subject) {
			resourceMessage.textContent = "Hãy chọn khối và môn học trước khi đăng.";
			resourceMessage.classList.add("error");
			return;
		}
		const titleVal = document.getElementById("resource-title").value.trim();
		const linkVal = document.getElementById("resource-link").value.trim();
		const hasFile = Boolean(fileInput?.files?.length);
		if (!titleVal) {
			resourceMessage.textContent = "Hãy nhập tên tài liệu.";
			resourceMessage.classList.add("error");
			return;
		}
		if (!linkVal && !hasFile) {
			resourceMessage.textContent = "Hãy nhập Liên kết tài liệu hoặc Chọn tệp từ máy.";
			resourceMessage.classList.add("error");
			return;
		}

		const formData = new FormData();
		formData.append("type", "study-resource");
		formData.append("resource_title", titleVal);
		formData.append("resource_description", document.getElementById("resource-description").value.trim());
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
		resourceMessage.textContent = "";
		resourceMessage.classList.remove("error");

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
			syncSelectedFileUi();
			selection.grade = "";
			selection.subject = "";
			renderChoices();
			if (coverColorLabel) coverColorLabel.textContent = "#6AA68D";
			if (filterTrack) filterTrack.value = "";
			if (filterSubject) filterSubject.value = "";
			if (filterGrade) filterGrade.value = "";
			updateSubjectFilter();
			resourceMessage.textContent = "Đã đăng tài liệu thành công.";
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
	filterTrack?.addEventListener("change", () => {
		updateSubjectFilter();
		renderResources();
	});
	filterSubject?.addEventListener("change", renderResources);
	filterGrade?.addEventListener("change", renderResources);
	updateSubjectFilter();
	renderChoices();
	loadResources();

	// =========================================================
	// ONLINE STUDY ROOMS (JITSI MEET)
	// =========================================================
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