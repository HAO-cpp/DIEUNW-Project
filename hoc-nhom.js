document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = (window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.startsWith("192.168.") || window.location.port === "4174")) ? window.location.origin : "https://dieunw.onrender.com";
	const POSTS_API = `${API_BASE}/api/posts`;

	const tabButtons = [...document.querySelectorAll(".group-tab[data-tab]")];
	const panels = [...document.querySelectorAll(".group-panel")];
	const resourceForm = document.getElementById("resource-form");
	const gradeButtons = [...document.querySelectorAll(".grade-choice[data-grade]")];
	const gradeSummary = document.getElementById("grade-selection-summary");
	const subjectSummary = document.getElementById("subject-selection-summary");
	const openSubjectBtn = document.getElementById("open-subject-modal");
	const subjectModalOverlay = document.getElementById("subject-modal-overlay");
	const closeSubjectBtn = document.getElementById("close-subject-modal");
	const cancelSubjectBtn = document.getElementById("cancel-subject-modal");
	const trackButtons = [...document.querySelectorAll(".subject-track-button[data-track]")];
	const subjectOptionsEl = document.getElementById("subject-options");
	const prevSubjectPageBtn = document.getElementById("prev-subject-page");
	const nextSubjectPageBtn = document.getElementById("next-subject-page");
	const subjectPageIndicator = document.getElementById("subject-page-indicator");

	const titleInput = document.getElementById("resource-title");
	const descInput = document.getElementById("resource-description");
	const linkInput = document.getElementById("resource-link");
	const fileInput = document.getElementById("resource-file");
	const fileNameLabel = document.getElementById("resource-file-name");
	const coverColorInput = document.getElementById("resource-cover-color");
	const formMessage = document.getElementById("resource-form-message");
	const submitBtn = document.getElementById("resource-submit-btn");

	const filterGrade = document.getElementById("filter-grade");
	const filterTrack = document.getElementById("filter-track");
	const filterSubject = document.getElementById("filter-subject");
	const refreshBtn = document.getElementById("refresh-resources");
	const feedState = document.getElementById("resources-feed-state");
	const bookShelfEl = document.getElementById("book-shelf");

	const roomForm = document.getElementById("room-form");
	const roomInput = document.getElementById("room-name-input");
	const generateRoomBtn = document.getElementById("generate-room-btn");
	const meetingPlaceholder = document.getElementById("meeting-placeholder");
	const meetingFrame = document.getElementById("meeting-frame");

	const SUBJECTS_BY_TRACK = {
		"Tự nhiên": ["Toán học", "Vật lí", "Hóa học", "Sinh học", "Tin học", "Công nghệ"],
		"Xã hội": ["Ngữ văn", "Lịch sử", "Địa lí", "GDKT & PL", "Tiếng Anh", "Âm nhạc / Mỹ thuật"]
	};

	let currentUser = null;
	let allResources = [];
	let selectedGrades = new Set();
	let activeTrack = "Tự nhiên";
	let selectedSubject = "";
	let subjectPage = 0;

	let activeBook = null;
	let activeSpreadIndex = 0;

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

	function resolveResourceUrl(rawUrl) {
		const str = String(rawUrl || "").trim();
		if (!str) return "";
		if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("data:")) return str;
		if (str.startsWith("/uploads/")) return `${API_BASE}${str}`;
		if (str.startsWith("uploads/")) return `${API_BASE}/${str}`;
		return `${API_BASE}/uploads/${encodeURIComponent(str.replace(/^\/+/, ""))}`;
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

	// 1. CHUYỂN TAB TÀI LIỆU / PHÒNG HỌC NHÓM
	tabButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			const target = btn.dataset.tab;
			tabButtons.forEach(b => {
				const isMatch = b.dataset.tab === target;
				b.classList.toggle("active", isMatch);
				b.setAttribute("aria-selected", String(isMatch));
			});
			panels.forEach(p => {
				p.hidden = p.dataset.panel !== target;
			});
		});
	});

	// 2. CHỌN KHỐI LỚP & MÔN HỌC
	function updateGradeSummary() {
		if (!gradeSummary) return;
		const list = [...selectedGrades].sort();
		gradeSummary.textContent = list.length ? `Đã chọn: Khối ${list.join(", ")}` : "Chưa chọn khối lớp (mặc định Tất cả khối)";
	}

	gradeButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			const g = btn.dataset.grade;
			if (selectedGrades.has(g)) {
				selectedGrades.delete(g);
				btn.classList.remove("selected");
			} else {
				selectedGrades.add(g);
				btn.classList.add("selected");
			}
			updateGradeSummary();
		});
	});

	function renderSubjectModal() {
		if (!subjectOptionsEl) return;
		const items = SUBJECTS_BY_TRACK[activeTrack] || [];
		const perPage = 4;
		const totalPages = Math.max(1, Math.ceil(items.length / perPage));
		subjectPage = Math.max(0, Math.min(totalPages - 1, subjectPage));
		const slice = items.slice(subjectPage * perPage, subjectPage * perPage + perPage);

		subjectOptionsEl.innerHTML = "";
		slice.forEach(subj => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = `subject-option ${selectedSubject === subj ? "selected" : ""}`;
			btn.style.fontWeight = "800";
			btn.style.fontSize = "14px";
			btn.style.color = "var(--text-main)";
			btn.textContent = subj;
			btn.addEventListener("click", () => {
				selectedSubject = subj;
				if (subjectSummary) subjectSummary.textContent = `Tổ ${activeTrack} · Môn ${subj}`;
				closeSubjectModal();
			});
			subjectOptionsEl.appendChild(btn);
		});

		if (subjectPageIndicator) subjectPageIndicator.textContent = `Trang ${subjectPage + 1} / ${totalPages}`;
		if (prevSubjectPageBtn) prevSubjectPageBtn.disabled = subjectPage === 0;
		if (nextSubjectPageBtn) nextSubjectPageBtn.disabled = subjectPage >= totalPages - 1;
	}

	function openSubjectModal() {
		if (!subjectModalOverlay) return;
		subjectModalOverlay.hidden = false;
		document.body.classList.add("subject-modal-open");
		renderSubjectModal();
	}

	function closeSubjectModal() {
		if (!subjectModalOverlay) return;
		subjectModalOverlay.hidden = true;
		document.body.classList.remove("subject-modal-open");
	}

	openSubjectBtn?.addEventListener("click", openSubjectModal);
	closeSubjectBtn?.addEventListener("click", closeSubjectModal);
	cancelSubjectBtn?.addEventListener("click", closeSubjectModal);
	subjectModalOverlay?.addEventListener("click", e => {
		if (e.target === subjectModalOverlay) closeSubjectModal();
	});

	trackButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			trackButtons.forEach(b => b.classList.remove("active"));
			btn.classList.add("active");
			activeTrack = btn.dataset.track || "Tự nhiên";
			subjectPage = 0;
			renderSubjectModal();
		});
	});

	prevSubjectPageBtn?.addEventListener("click", () => {
		subjectPage--;
		renderSubjectModal();
	});
	nextSubjectPageBtn?.addEventListener("click", () => {
		subjectPage++;
		renderSubjectModal();
	});

	fileInput?.addEventListener("change", () => {
		const f = fileInput.files?.[0];
		if (fileNameLabel) {
			fileNameLabel.textContent = f ? `${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)` : "Chưa chọn tệp tài liệu";
		}
	});
		// 3. ĐĂNG TÀI LIỆU LÊN KỆ SÁCH
	resourceForm?.addEventListener("submit", async (e) => {
		e.preventDefault();
		if (!currentUser) {
			if (formMessage) {
				formMessage.textContent = "Bạn cần đăng nhập để chia sẻ tài liệu lên kệ sách.";
				formMessage.classList.add("error");
			}
			return;
		}

		const title = (titleInput?.value || "").trim();
		const description = (descInput?.value || "").trim();
		const link = (linkInput?.value || "").trim();
		const file = fileInput?.files?.[0] || null;
		const grade = [...selectedGrades].sort().join(", ") || "Tất cả";
		const track = activeTrack || "Tự nhiên";
		const subject = selectedSubject || "Chung";
		const coverColor = coverColorInput?.value || "#6aa68d";

		if (!title) {
			if (formMessage) {
				formMessage.textContent = "Vui lòng nhập tiêu đề tài liệu.";
				formMessage.classList.add("error");
			}
			return;
		}
		if (!link && !file) {
			if (formMessage) {
				formMessage.textContent = "Hãy nhập đường dẫn tài liệu hoặc chọn tệp PDF/tài liệu từ máy.";
				formMessage.classList.add("error");
			}
			return;
		}

		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = "Đang đặt sách lên kệ...";
		}
		if (formMessage) {
			formMessage.textContent = "Đang tải tài liệu lên máy chủ...";
			formMessage.classList.remove("error");
		}

		try {
			const fd = new FormData();
			fd.append("type", "study-resource");
			fd.append("visibility", "public");
			fd.append("resource_title", title);
			fd.append("resource_description", description);
			fd.append("resource_link", link);
			fd.append("resource_grade", grade);
			fd.append("resource_track", track);
			fd.append("resource_subject", subject);
			fd.append("resource_cover_color", coverColor);
			if (file) fd.append("file", file);

			const res = await fetch(POSTS_API, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders(),
				body: fd
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Không thể đăng tài liệu.");

			resourceForm.reset();
			selectedGrades.clear();
			gradeButtons.forEach(b => b.classList.remove("selected"));
			updateGradeSummary();
			if (fileNameLabel) fileNameLabel.textContent = "Chưa chọn tệp tài liệu";
			if (formMessage) {
				formMessage.textContent = "Đã đặt tài liệu lên kệ sách DIEUNW!";
				formMessage.classList.remove("error");
			}
			notify("Đã thêm tài liệu mới lên kệ sách!", "success");

			if (data?.post) {
				allResources.unshift(data.post);
				renderBookshelf();
			} else {
				await loadResources();
			}
		} catch (err) {
			if (formMessage) {
				formMessage.textContent = err.message || "Lỗi khi đăng tài liệu.";
				formMessage.classList.add("error");
			}
		} finally {
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = "Đặt sách lên kệ";
			}
		}
	});

	// 4. KHUNG ĐỌC SÁCH MỞ SANG BÊN TRÁI ĐỂ LẬT TRANG + XEM PDF KHÔNG 404
	function buildBookPages(book) {
		const rawDesc = String(book.resource_description || book.content || "").trim();
		const chunks = [];
		const pageChars = 420;
		if (!rawDesc) {
			chunks.push("Tài liệu học tập được chia sẻ bởi thành viên cộng đồng DIEUNW. Nhấn nút bên dưới để mở xem trực tiếp hoặc tải tệp về máy.");
		} else {
			for (let i = 0; i < rawDesc.length; i += pageChars) {
				chunks.push(rawDesc.slice(i, i + pageChars));
			}
		}
		return chunks;
	}

	function ensureBookReaderDrawer() {
		let overlay = document.getElementById("book-reader-overlay");
		if (overlay) return overlay;

		overlay = document.createElement("div");
		overlay.id = "book-reader-overlay";
		overlay.className = "book-reader-overlay book-reader-left-dock";
		overlay.hidden = true;
		overlay.innerHTML = `
			<article class="book-reader-modal book-left-sheet" id="book-reader-modal" role="dialog" aria-modal="true" aria-labelledby="book-reader-title">
				<header class="book-reader-topbar">
					<h2 id="book-reader-title">Đọc tài liệu</h2>
					<button type="button" id="book-reader-close" class="book-reader-close" aria-label="Đóng sách">×</button>
				</header>
				<div class="book-spread" id="book-spread">
					<section class="book-page-panel" id="book-page-left"></section>
					<section class="book-page-panel" id="book-page-right"></section>
				</div>
				<footer class="book-reader-footer">
					<div class="book-flip-controls">
						<button type="button" id="book-prev-page" class="book-flip-btn">◀ Lật trang trước</button>
						<span id="book-page-indicator" class="book-page-indicator">Trang 1 - 2</span>
						<button type="button" id="book-next-page" class="book-flip-btn">Lật trang sau ▶</button>
					</div>
					<div id="book-reader-actions" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
				</footer>
			</article>
		`;
		document.body.appendChild(overlay);

		overlay.querySelector("#book-reader-close").addEventListener("click", closeBookReader);
		overlay.addEventListener("click", e => {
			if (e.target === overlay) closeBookReader();
		});
		overlay.querySelector("#book-prev-page").addEventListener("click", () => flipBookPage(-1));
		overlay.querySelector("#book-next-page").addEventListener("click", () => flipBookPage(1));

		document.addEventListener("keydown", e => {
			if (overlay.hidden) return;
			if (e.key === "Escape") closeBookReader();
			else if (e.key === "ArrowLeft") flipBookPage(-1);
			else if (e.key === "ArrowRight") flipBookPage(1);
		});

		return overlay;
	}

	function closeBookReader() {
		const overlay = document.getElementById("book-reader-overlay");
		if (overlay) overlay.hidden = true;
		activeBook = null;
	}

	function flipBookPage(delta) {
		if (!activeBook) return;
		const pages = buildBookPages(activeBook);
		const maxSpread = Math.max(0, Math.ceil(pages.length / 2) - 1);
		const nextSpread = Math.max(0, Math.min(maxSpread, activeSpreadIndex + delta));
		if (nextSpread === activeSpreadIndex) return;

		activeSpreadIndex = nextSpread;
		const spreadEl = document.getElementById("book-spread");
		if (spreadEl) {
			spreadEl.classList.remove("flip-next", "flip-prev");
			void spreadEl.offsetWidth;
			spreadEl.classList.add(delta > 0 ? "flip-next" : "flip-prev");
		}
		renderBookSpread();
	}

	function renderBookSpread() {
		if (!activeBook) return;
		const overlay = ensureBookReaderDrawer();
		const modal = overlay.querySelector("#book-reader-modal");
		const leftPanel = overlay.querySelector("#book-page-left");
		const rightPanel = overlay.querySelector("#book-page-right");
		const indicator = overlay.querySelector("#book-page-indicator");
		const prevBtn = overlay.querySelector("#book-prev-page");
		const nextBtn = overlay.querySelector("#book-next-page");
		const actionsBox = overlay.querySelector("#book-reader-actions");

		const color = activeBook.resource_cover_color || "#1769aa";
		modal.style.setProperty("--book-color", color);
		overlay.querySelector("#book-reader-title").textContent = activeBook.resource_title || "Tài liệu học tập";

		const pages = buildBookPages(activeBook);
		const totalPages = Math.max(2, pages.length);
		const maxSpread = Math.max(0, Math.ceil(pages.length / 2) - 1);
		const leftIdx = activeSpreadIndex * 2;
		const rightIdx = leftIdx + 1;

		const fileUrl = resolveResourceUrl(activeBook.resource_file_url);
		const extLink = String(activeBook.resource_link || "").trim();
		const isPdf = /\.pdf(\?|$)/i.test(fileUrl) || String(activeBook.resource_file_type || "").toLowerCase().includes("pdf");

		const metaHtml = `
			<div class="book-meta-badges">
				<span class="book-meta-badge">Khối ${escapeHtml(activeBook.resource_grade || "Tất cả")}</span>
				<span class="book-meta-badge">${escapeHtml(activeBook.resource_track || "Tự nhiên")}</span>
				<span class="book-meta-badge">${escapeHtml(activeBook.resource_subject || "Chung")}</span>
			</div>
			<p style="font-size:12px; color:#6b5c49;">Chia sẻ bởi <b>${escapeHtml(activeBook.name || "Thành viên DIEUNW")}</b></p>
		`;

		leftPanel.innerHTML = `
			${activeSpreadIndex === 0 ? metaHtml : ""}
			<div class="book-page-text">${escapeHtml(pages[leftIdx] || "")}</div>
			<span class="book-page-num">Trang ${leftIdx + 1}</span>
		`;

		let rightExtraHtml = "";
		if (fileUrl) {
			const downloadHref = fileUrl.startsWith(`${API_BASE}/uploads/`)
				? `${fileUrl}?download=1&name=${encodeURIComponent(activeBook.resource_file_name || "tai-lieu-dieunw")}`
				: fileUrl;
			rightExtraHtml += `
				<div class="book-resource-box">
					<strong style="font-size:13px;">📄 Tệp đính kèm: ${escapeHtml(activeBook.resource_file_name || "Tài liệu")}</strong>
					${isPdf ? `<iframe src="${escapeHtml(fileUrl)}" title="Xem trước PDF" style="width:100%; height:230px; border:1px solid #d5c9b4; border-radius:6px; background:#fff;"></iframe>` : ""}
					<div style="display:flex; gap:8px; flex-wrap:wrap;">
						<a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer" class="book-action-link">👁 Mở toàn trang</a>
						<a href="${escapeHtml(downloadHref)}" download="${escapeHtml(activeBook.resource_file_name || "tai-lieu")}" class="book-action-link secondary">⬇ Tải tệp về</a>
					</div>
				</div>
			`;
		}
		if (extLink) {
			rightExtraHtml += `
				<div class="book-resource-box">
					<strong style="font-size:13px;">🔗 Liên kết tài liệu ngoài</strong>
					<a href="${escapeHtml(extLink)}" target="_blank" rel="noopener noreferrer" class="book-action-link">Mở liên kết tài liệu</a>
				</div>
			`;
		}

		rightPanel.innerHTML = `
			<div class="book-page-text">${escapeHtml(pages[rightIdx] || (rightExtraHtml ? "" : "— Hết nội dung tóm tắt —"))}</div>
			${rightExtraHtml}
			<span class="book-page-num">Trang ${rightIdx + 1} / ${totalPages}</span>
		`;

		indicator.textContent = `Trang ${leftIdx + 1}-${rightIdx + 1} / ${totalPages}`;
		prevBtn.disabled = activeSpreadIndex <= 0;
		nextBtn.disabled = activeSpreadIndex >= maxSpread;

		actionsBox.innerHTML = "";
				if (currentUser && (String(currentUser.id) === String(activeBook.userId) || currentUser.isAdmin)) {
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.className = "post-delete-button";
			delBtn.textContent = "Xóa sách";
			delBtn.addEventListener("click", async () => {
				const ok = typeof window.dieunwConfirm === "function"
					? await window.dieunwConfirm(`Xóa tài liệu "${activeBook.resource_title}" khỏi kệ sách?`, "Xóa tài liệu", true)
					: window.confirm(`Xóa tài liệu "${activeBook.resource_title}" khỏi kệ sách?`);
				if (!ok) return;
				try {
					const res = await fetch(`${POSTS_API}/${encodeURIComponent(activeBook.id)}`, {
						method: "DELETE",
						credentials: "include",
						headers: getAuthHeaders()
					});
					if (!res.ok) throw new Error("Không thể xóa tài liệu.");
					allResources = allResources.filter(r => String(r.id) !== String(activeBook.id));
					closeBookReader();
					renderBookshelf();
					notify("Đã xóa tài liệu khỏi kệ sách.", "success");
				} catch (err) {
					notify(err.message || "Lỗi khi xóa tài liệu.", "error");
				}
			});
			actionsBox.appendChild(delBtn);
		}
	}

	function openBookReader(book) {
		activeBook = book;
		activeSpreadIndex = 0;
		const overlay = ensureBookReaderDrawer();
		overlay.hidden = false;
		renderBookSpread();
	}

	// 5. HIỂN THỊ KỆ SÁCH TÀI LIỆU
	function renderBookshelf() {
		if (!bookShelfEl) return;
		const gVal = filterGrade?.value || "";
		const tVal = filterTrack?.value || "";
		const sVal = filterSubject?.value || "";

		const filtered = allResources.filter(item => {
			if (gVal && !String(item.resource_grade || "").includes(gVal)) return false;
			if (tVal && (item.resource_track || "") !== tVal) return false;
			if (sVal && (item.resource_subject || "") !== sVal) return false;
			return true;
		});

		bookShelfEl.innerHTML = "";
		if (!filtered.length) {
			if (feedState) {
				feedState.hidden = false;
				feedState.textContent = "Chưa có tài liệu nào trên kệ phù hợp với bộ lọc.";
			}
			return;
		}
		if (feedState) feedState.hidden = true;

		const groups = new Map();
		filtered.forEach(item => {
			const key = `${item.resource_track || "Tự nhiên"}::${item.resource_subject || "Chung"}`;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(item);
		});

		groups.forEach((books, key) => {
			const [track, subject] = key.split("::");
			const row = document.createElement("section");
			row.className = "shelf-row";
			row.innerHTML = `
				<div class="shelf-row-header">
					<div class="shelf-row-title-wrap">
						<span class="shelf-track">${escapeHtml(track)}</span>
						<h3 class="shelf-subject">${escapeHtml(subject)}</h3>
					</div>
					<span class="shelf-count">${books.length} tài liệu</span>
				</div>
				<div class="shelf-books"></div>
				<div class="shelf-plank"></div>
			`;
			const booksContainer = row.querySelector(".shelf-books");
			books.forEach(book => {
				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = "book-on-shelf";
				btn.style.setProperty("--book-color", book.resource_cover_color || "#6aa68d");
				btn.title = `${book.resource_title || "Tài liệu"} — Bấm để mở sách sang trái`;
				btn.innerHTML = `
					<div class="book-3d-spine">
						<span class="book-grade-pip">K${escapeHtml(String(book.resource_grade || "").replace(/[^\d]/g, "") || "All")}</span>
						<span class="book-3d-title">${escapeHtml(book.resource_title || "Tài liệu")}</span>
					</div>
				`;
				btn.addEventListener("click", () => openBookReader(book));
				booksContainer.appendChild(btn);
			});
			bookShelfEl.appendChild(row);
		});
	}

	async function loadResources() {
		if (feedState) {
			feedState.hidden = false;
			feedState.textContent = "Đang tải kệ sách tài liệu...";
			feedState.classList.remove("error");
		}
		try {
			const res = await fetch(POSTS_API, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Không thể tải tài liệu.");
			allResources = (Array.isArray(data.posts) ? data.posts : []).filter(p => p.type === "study-resource");
			renderBookshelf();
		} catch (err) {
			if (feedState) {
				feedState.hidden = false;
				feedState.textContent = err.message || "Không thể tải kệ sách tài liệu.";
				feedState.classList.add("error");
			}
		}
	}

	filterGrade?.addEventListener("change", renderBookshelf);
	filterTrack?.addEventListener("change", renderBookshelf);
	filterSubject?.addEventListener("change", renderBookshelf);
	refreshBtn?.addEventListener("click", loadResources);

	// 6. PHÒNG HỌC NHÓM JITSI
	function joinStudyRoom(roomNameRaw) {
		const clean = String(roomNameRaw || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 48);
		if (!clean || !meetingFrame) return;
		const fullRoom = clean.startsWith("dieunw-") ? clean : `dieunw-${clean}`;
		if (meetingPlaceholder) meetingPlaceholder.hidden = true;
		meetingFrame.hidden = false;
		meetingFrame.src = `https://meet.jit.si/${encodeURIComponent(fullRoom)}`;
	}

	roomForm?.addEventListener("submit", e => {
		e.preventDefault();
		if (roomInput?.value.trim()) joinStudyRoom(roomInput.value);
	});

	generateRoomBtn?.addEventListener("click", () => {
		const randomCode = `nhom-${Math.random().toString(36).slice(2, 7)}`;
		if (roomInput) roomInput.value = randomCode;
		joinStudyRoom(randomCode);
	});

	fetch(`${API_BASE}/api/auth/me`, { credentials: "include", headers: getAuthHeaders() })
		.then(r => r.ok ? r.json() : { user: null })
		.then(data => { currentUser = data.user || null; })
		.catch(() => {})
		.finally(() => loadResources());
});
