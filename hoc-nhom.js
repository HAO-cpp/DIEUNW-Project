document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const POSTS_API = `${API_BASE}/api/posts`;
	const groupTabs = [...document.querySelectorAll(".group-tab")];
	const groupPanels = [...document.querySelectorAll(".group-panel")];
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
	let resources = [];

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
document.addEventListener("keydown", event => {
	if (event.key === "Escape" && !subjectModal.hidden) closeSubjectPicker();
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

function makeBook(post) {
	
	const book = document.createElement("article");
	book.className = "book";
	book.dataset.subject = post.resource_subject || "";
	book.dataset.track = post.resource_track || "";
	book.setAttribute("aria-label", `Sách ${post.resource_title || "Tài liệu"}`);
	book.setAttribute("role", "button");
	book.tabIndex = 0;

	const coverColor = post.resource_cover_color || "#6aa68d";
	const fileUrl = post.resource_file_url || "";
	const fileName = post.resource_file_name || "";
	const fileType = post.resource_file_type || "";
	const link = post.resource_link || "";

	const spine = document.createElement("div");
	spine.className = "book-spine";
	spine.style.background = coverColor;
	const titleSpan = document.createElement("span");
	titleSpan.className = "book-spine-title";
	titleSpan.textContent = post.resource_title || "Tài liệu";
	spine.appendChild(titleSpan);

	const bookBlock = document.createElement("div");
	bookBlock.className = "book-block";

	const cover = document.createElement("div");
	cover.className = "book-cover";
	cover.style.background = coverColor;
	cover.style.borderColor = coverColor;

	const pages = document.createElement("div");
	pages.className = "book-pages";

	const safeFileUrl = safeResourceUrl(fileUrl);
	const safeLink = safeResourceUrl(link);

	const leftPage = document.createElement("div");
	leftPage.className = "book-page book-page-left";
	leftPage.innerHTML = `<div class="page-content">
		<h2>${escapeHtml(post.resource_title || "Tài liệu")}</h2>
		<p class="page-meta">Khối ${escapeHtml(post.resource_grade || "?")} · ${escapeHtml(post.resource_track || "")} · ${escapeHtml(post.resource_subject || "")}</p>
		<p class="page-desc">${escapeHtml(post.resource_description || post.description || "")}</p>
	</div>`;

	const rightPage = document.createElement("div");
	rightPage.className = "book-page book-page-right";
	rightPage.innerHTML = `<div class="page-content">
		<h2>Tệp &amp; Liên kết</h2>
		${fileName && safeFileUrl
			? `<p><strong>Tệp:</strong> ${escapeHtml(fileName)}${fileType ? ` (${escapeHtml(fileType)})` : ""}</p><a href="${escapeHtml(safeFileUrl)}" class="page-link" target="_blank" rel="noopener noreferrer">Tải tệp tài liệu ↓</a>`
			: `<p class="text-muted">Chưa có tệp đính kèm.</p>`}
		${safeLink
			? `<p><strong>Liên kết:</strong> <a href="${escapeHtml(safeLink)}" class="page-link" target="_blank" rel="noopener noreferrer">Mở liên kết ↗</a></p>`
			: ""}
		<p class="page-info">Đăng bởi: ${escapeHtml(post.name || "Dieuer Ẩn Danh")} · ${escapeHtml(displayDate(post.createdAt))}</p>
	</div>`;

	pages.appendChild(leftPage);
	pages.appendChild(rightPage);

	const controls = document.createElement("div");
	controls.className = "book-controls";
	const btnOpen = document.createElement("button");
	btnOpen.className = "book-btn book-btn-open";
	btnOpen.type = "button";
	btnOpen.textContent = "Mở sách";
	btnOpen.setAttribute("aria-label", `Mở sách ${post.resource_title || "Tài liệu"}`);
	const btnClose = document.createElement("button");
	btnClose.className = "book-btn book-btn-close";
	btnClose.type = "button";
	btnClose.textContent = "Đóng sách";
	btnClose.setAttribute("aria-label", `Đóng sách ${post.resource_title || "Tài liệu"}`);
	controls.appendChild(btnOpen);
	controls.appendChild(btnClose);

	bookBlock.appendChild(cover);
	bookBlock.appendChild(pages);
	bookBlock.appendChild(controls);
	book.appendChild(spine);
	book.appendChild(bookBlock);

	let active = false;
	function setActive(v) {
		active = v;
		book.classList.toggle("book-active", v);
	}
	btnOpen.addEventListener("click", (ev) => { ev.stopPropagation(); setActive(true); });
	btnClose.addEventListener("click", (ev) => { ev.stopPropagation(); setActive(false); });
	book.addEventListener("click", () => { if (!active) setActive(true); });
	book.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setActive(!active); } });

	return book;
}
function updateSubjectFilter() {
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
	const filtered = resources.filter(post => {
		return (!filterTrack.value || post.resource_track === filterTrack.value)
			&& (!filterSubject.value || post.resource_subject === filterSubject.value)
			&& (!filterGrade.value || String(post.resource_grade) === filterGrade.value);
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
		const trackLabel = tracks.Chuyên.includes(subject) ? "Chuyên" : (tracks.Thường.includes(subject) ? "Thường" : "");
		header.innerHTML = `<span class="shelf-track">${trackLabel}</span><span class="shelf-subject">${subject}</span>`;
		const shelf = document.createElement("div");
		shelf.className = "shelf-books";
		posts.forEach(post => shelf.appendChild(makeBook(post)));
		row.appendChild(header);
		row.appendChild(shelf);
		resourceList.appendChild(row);
	}
}
async function loadResources() {
	resourceList.innerHTML = "<p class=\"feed-state\">Đang tải kệ sách...</p>";
	resources = posts
			.filter(post => post.type === "study-resource")
			.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
	const coverColorInput = document.getElementById("resource-cover-color");
	const coverColorLabel = document.querySelector(".color-picker-label");
	coverColorInput.addEventListener("input", () => {
		if (coverColorLabel) coverColorLabel.textContent = coverColorInput.value.toUpperCase();
	});
	try {
		const response = await fetch(POSTS_API, { credentials: "include" });
		if (!response.ok) throw new Error("Không tải được kệ sách.");
		const data = await response.json();
		const posts = data.posts || data || [];
		resources = posts
    	.filter(post => post.type === "study-resource")
    	.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
		renderResources();
	} catch (error) {
		resourceList.innerHTML = "<p class=\"feed-state error\">Không tải được tài liệu. Kiểm tra kết nối rồi thử lại.</p>";
	}
}
resourceForm.addEventListener("submit", async event => {
	formData.append("type", "study-resource");
	event.preventDefault();
	if (!selection.grade || !selection.subject) {
		resourceMessage.textContent = "Hãy chọn khối và môn học trước khi đăng.";
		resourceMessage.classList.add("error");
		return;
	}
	const formData = new FormData();
	formData.append("resource_title", document.getElementById("resource-title").value.trim());
	formData.append("resource_description", document.getElementById("resource-description").value.trim());
	formData.append("resource_link", document.getElementById("resource-link").value.trim());
	formData.append("resource_grade", selection.grade);
	formData.append("resource_track", selection.track);
	formData.append("resource_subject", selection.subject);
	formData.append("resource_cover_color", document.getElementById("resource-cover-color").value);
	const fileInput = document.getElementById("resource-file");
	if (fileInput.files.length) formData.append("resource_file", fileInput.files[0]);

	const currentUser = JSON.parse(localStorage.getItem("dieuNwUser") || "null");
	formData.append("user_id", (currentUser && currentUser.id) || "");
	formData.append("visibility", "public");

	resourceSubmit.disabled = true;
	resourceSubmit.textContent = "Đăng tài liệu...";
	resourceMessage.textContent = "";
	resourceMessage.classList.remove("error");
	formData.append("type", "study-resource");
	try {
		const response = await fetch(POSTS_API, { method: "POST", body: formData, credentials: "include" });
		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(data.error || "Không thể đăng tài liệu.");
		resourceForm.reset();
		selection.grade = "";
		selection.subject = "";
		renderChoices();
		if (coverColorLabel) coverColorLabel.textContent = "#6aa68d";
		filterTrack.value = "";
		filterSubject.value = "";
		filterGrade.value = "";
		updateSubjectFilter();
		resourceMessage.textContent = "Đã đăng tài liệu thành công.";
		await loadResources();
	} catch (error) {
		resourceMessage.textContent = error.message || "Đăng chưa thành công. Hãy thử lại sau.";
		resourceMessage.classList.add("error");
	} finally {
		resourceSubmit.disabled = false;
		resourceSubmit.textContent = "Đăng tài liệu";
	}
});

document.getElementById("resource-refresh").addEventListener("click", loadResources);
filterTrack.addEventListener("change", () => {
	updateSubjectFilter();
	renderResources();
});
filterSubject.addEventListener("change", renderResources);
filterGrade.addEventListener("change", renderResources);
updateSubjectFilter();
renderChoices();
loadResources();

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
