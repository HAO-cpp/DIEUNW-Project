document.addEventListener("DOMContentLoaded", () => {
	const POSTS_API = "https://6af30641d2377d6c370469d7.mockapi.io/posts";
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

	document.querySelectorAll(".group-tab").forEach(tab => {
		tab.addEventListener("click", () => {
			document.querySelectorAll(".group-tab").forEach(item => {
				const active = item === tab;
				item.classList.toggle("active", active);
				item.setAttribute("aria-selected", String(active));
				item.tabIndex = active ? 0 : -1;
			});
			document.querySelectorAll(".group-panel").forEach(panel => {
				panel.hidden = panel.id !== tab.dataset.panel;
			});
		});
	});

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

	function getSafeResourceUrl(value) {
		try {
			const url = new URL(value);
			return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
		} catch (error) {
			return "";
		}
	}

	function makeResourceCard(post) {
		const card = document.createElement("article");
		card.className = "resource-card";

		const header = document.createElement("div");
		header.className = "resource-card-header";
		const author = document.createElement("span");
		author.className = "resource-author";
		author.textContent = post.name || "Dieuer Ẩn Danh";
		const date = document.createElement("time");
		date.className = "resource-date";
		date.textContent = displayDate(post.createdAt);
		header.append(author, date);

		const tags = document.createElement("p");
		tags.className = "resource-tags";
		tags.textContent = `Khối ${post.grade || "?"} · ${post.track || ""} · ${post.subject || ""}`;

		const title = document.createElement("h3");
		title.textContent = post.title || "Tài liệu học tập";
		const description = document.createElement("p");
		description.className = "resource-description";
		description.textContent = post.description || post.content || "Không có mô tả.";

		const link = document.createElement("a");
		link.className = "resource-link";
		link.href = getSafeResourceUrl(post.resourceUrl);
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		link.textContent = "Mở tài liệu ↗";

		card.append(header, tags, title, description);
		if (link.href) card.appendChild(link);
		return card;
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
		const filteredResources = resources.filter(post => {
			return (!filterTrack.value || post.track === filterTrack.value)
				&& (!filterSubject.value || post.subject === filterSubject.value)
				&& (!filterGrade.value || String(post.grade) === filterGrade.value);
		});
		resourceList.replaceChildren();
		if (!filteredResources.length) {
			const message = resources.length
				? "Không tìm thấy tài liệu phù hợp với bộ lọc."
				: "Chưa có tài liệu nào. Bạn có thể chia sẻ đầu tiên.";
			resourceList.innerHTML = `<p class="feed-state">${message}</p>`;
			return;
		}
		filteredResources.forEach(post => resourceList.appendChild(makeResourceCard(post)));
	}

	async function loadResources() {
		resourceList.innerHTML = "<p class=\"feed-state\">Đang tải tài liệu...</p>";
		try {
			const response = await fetch(POSTS_API);
			if (!response.ok) throw new Error("Không thể tải bài chia sẻ.");
			const posts = await response.json();
			resources = posts
				.filter(post => post.type === "study-resource")
				.sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
			renderResources();
		} catch (error) {
			resourceList.innerHTML = "<p class=\"feed-state error\">Không tải được tài liệu. Kiểm tra kết nối rồi thử lại.</p>";
		}
	}

	resourceForm.addEventListener("submit", async event => {
		event.preventDefault();
		if (!selection.grade || !selection.subject) {
			resourceMessage.textContent = "Hãy chọn khối và môn học trước khi đăng.";
			resourceMessage.classList.add("error");
			return;
		}

		const currentUser = JSON.parse(localStorage.getItem("dieuNwUser") || "null");
		const title = document.getElementById("resource-title").value.trim();
		const description = document.getElementById("resource-description").value.trim();
		const resourceUrl = getSafeResourceUrl(document.getElementById("resource-link").value.trim());
		if (!resourceUrl) {
			resourceMessage.textContent = "Liên kết tài liệu cần bắt đầu bằng http:// hoặc https://.";
			resourceMessage.classList.add("error");
			return;
		}
		const newResource = {
			type: "study-resource",
			title,
			description,
			resourceUrl,
			grade: selection.grade,
			track: selection.track,
			subject: selection.subject,
			content: `${title} - Khối ${selection.grade} ${selection.track} ${selection.subject}`,
			name: currentUser && currentUser.name ? currentUser.name : "Dieuer Ẩn Danh",
			createdAt: new Date().toISOString(),
			likes: 0,
			comments: []
		};

		resourceSubmit.disabled = true;
		resourceSubmit.textContent = "Đang đăng...";
		resourceMessage.textContent = "";
		resourceMessage.classList.remove("error");
		try {
			const response = await fetch(POSTS_API, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(newResource)
			});
			if (!response.ok) throw new Error("Không thể đăng tài liệu.");
			resourceForm.reset();
			filterTrack.value = "";
			filterSubject.value = "";
			filterGrade.value = "";
			updateSubjectFilter();
			resourceMessage.textContent = "Đã đăng tài liệu thành công.";
			await loadResources();
		} catch (error) {
			resourceMessage.textContent = "Đăng chưa thành công. Hãy thử lại sau.";
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