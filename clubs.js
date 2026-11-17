document.addEventListener("DOMContentLoaded", () => {
	const clubsList = document.getElementById("clubs-list");
	const requestForm = document.getElementById("club-request-form");
	const requestStatus = document.getElementById("club-request-status");
	const adminReviewPanel = document.getElementById("admin-review-panel");
	const reviewList = document.getElementById("club-review-list");
	let currentUser = null;

	// Biến quản lý danh sách nhiều email quản lý CLB
	let managerEmails = [];
	const managerInput = document.getElementById("club-manager-input");
	const managersListEl = document.getElementById("club-managers-list");
	const btnAddManager = document.getElementById("btn-add-manager");

	async function api(url, options = {}) {
		const response = await fetch(`https://dieunw.onrender.com${url}`, {
			credentials: "include",
			...options
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || "Không thể hoàn tất yêu cầu.");
		return data;
	}

	function element(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function renderManagersList() {
		if (!managersListEl) return;
		managersListEl.replaceChildren();
		managerEmails.forEach((email, index) => {
			const li = document.createElement("li");
			li.style.display = "inline-flex";
			li.style.alignItems = "center";
			li.style.gap = "6px";
			li.textContent = email;

			const removeBtn = document.createElement("button");
			removeBtn.type = "button";
			removeBtn.textContent = "×";
			removeBtn.style.cssText = "border:none; background:none; color:#b5473c; font-weight:bold; cursor:pointer; font-size:14px;";
			removeBtn.onclick = () => {
				managerEmails.splice(index, 1);
				renderManagersList();
			};
			li.append(removeBtn);
			managersListEl.append(li);
		});
	}

	btnAddManager?.addEventListener("click", () => {
		const email = managerInput.value.trim().toLowerCase();
		if (!email) return;
		if (!email.endsWith("@nqd.edu.vn")) {
			requestStatus.textContent = "Vui lòng nhập email trường (@nqd.edu.vn).";
			return;
		}
		if (managerEmails.includes(email)) {
			requestStatus.textContent = "Email này đã có trong danh sách quản lý.";
			return;
		}
		managerEmails.push(email);
		managerInput.value = "";
		requestStatus.textContent = "";
		renderManagersList();
	});

	function renderClub(club) {
		const card = element("article", "club-card");
		card.style.cursor = "pointer";
		card.addEventListener("click", () => {
			window.location.href = `./profile.html?clubId=${encodeURIComponent(club.id)}`;
		});

		const brand = element("div", "club-card-brand");
		if (club.logo) {
			const logo = element("img", "club-card-logo");
			logo.src = club.logo;
			logo.alt = `Logo ${club.name}`;
			brand.append(logo);
		} else {
			brand.append(element("span", "club-card-monogram", club.name.slice(0, 1).toUpperCase()));
		}

		const managersText = Array.isArray(club.managerEmails)
			? club.managerEmails.join(", ")
			: (club.manager?.name || club.managerEmail);

		const identity = element("div", "club-card-identity");
		identity.append(element("h3", "", club.name), element("p", "", managersText));
		brand.append(identity);
		card.append(brand);

		const managerTag = element("span", "club-manager-tag", `Quản lý · ${managersText}`);
		managerTag.style.setProperty("--club-color", club.tagColor);
		card.append(managerTag);
		return card;
	}

	function renderReview(club) {
		const item = element("article", "club-review-item");
		const details = element("div", "club-review-details");
		const managersText = Array.isArray(club.managerEmails)
			? club.managerEmails.join(", ")
			: (club.manager?.name || club.managerEmail);

		details.append(element("h3", "", club.name), element("p", "", `Quản lý: ${managersText}`));
		if (club.logo) {
			const logo = element("img", "club-review-logo");
			logo.src = club.logo;
			logo.alt = "";
			item.append(logo);
		}
		item.append(details);
		const actions = element("div", "club-review-actions");
		for (const [status, label, className] of [["approved", "Duyệt", "clubs-button"], ["rejected", "Từ chối", "club-reject-button"]]) {
			const button = element("button", className, label);
			button.type = "button";
			button.addEventListener("click", async () => {
				button.disabled = true;
				try {
					await api(`/api/clubs/${encodeURIComponent(club.id)}/decision`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ status })
					});
					await loadClubs();
				} catch (error) {
					document.getElementById("clubs-status").textContent = error.message;
					button.disabled = false;
				}
			});
			actions.append(button);
		}
		item.append(actions);
		return item;
	}

	async function loadClubs() {
		const { clubs } = await api("/api/clubs");
		const approved = clubs.filter(club => club.status === "approved");
		const pending = clubs.filter(club => club.status === "pending");
		clubsList.replaceChildren(...approved.map(renderClub));
		document.getElementById("clubs-count").textContent = `${approved.length} CLB`;
		if (!approved.length) clubsList.append(element("p", "clubs-empty", "Chưa có CLB nào được duyệt. Hãy gửi đề xuất đầu tiên."));
		if (currentUser?.isAdmin) {
			adminReviewPanel.hidden = false;
			document.getElementById("pending-count").textContent = String(pending.length);
			reviewList.replaceChildren(...pending.map(renderReview));
			if (!pending.length) reviewList.append(element("p", "clubs-empty", "Không có yêu cầu đang chờ."));
		}
		const ownRequest = clubs.find(club => club.requestedById === currentUser?.id && club.status !== "approved");
		if (ownRequest) {
			document.getElementById("clubs-status").textContent = ownRequest.status === "pending"
				? `Yêu cầu “${ownRequest.name}” đang chờ admin xác nhận.`
				: `Yêu cầu “${ownRequest.name}” chưa được duyệt.`;
		}
	}

	const logoInput = document.getElementById("club-logo");
	const logoPreview = document.getElementById("club-logo-preview");
	logoInput.addEventListener("change", () => {
		const file = logoInput.files?.[0];
		if (!file) {
			logoPreview.hidden = true;
			return;
		}
		if (file.size > 500 * 1024) {
			logoInput.value = "";
			logoPreview.hidden = true;
			requestStatus.textContent = "Logo vượt quá 500 KB.";
			return;
		}
		logoPreview.src = URL.createObjectURL(file);
		logoPreview.hidden = false;
		requestStatus.textContent = "";
	});

	const colorInput = document.getElementById("club-tag-color");
	colorInput.addEventListener("input", () => {
		document.getElementById("club-color-value").textContent = colorInput.value.toUpperCase();
	});

	requestForm.addEventListener("submit", async event => {
		event.preventDefault();
		if (!managerEmails.length) {
			requestStatus.textContent = "Vui lòng thêm ít nhất 1 email quản lý.";
			return;
		}
		const submit = requestForm.querySelector("button[type='submit']");
		submit.disabled = true;
		requestStatus.textContent = "Đang gửi yêu cầu...";
		try {
			let logo = "";
			const file = logoInput.files?.[0];
			if (file) logo = await new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result);
				reader.onerror = () => reject(new Error("Không đọc được ảnh logo."));
				reader.readAsDataURL(file);
			});
			const data = await api("/api/clubs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: document.getElementById("club-name").value.trim(),
					managerEmails,
					logo,
					tagColor: colorInput.value
				})
			});
			requestForm.reset();
			managerEmails = currentUser ? [currentUser.email] : [];
			renderManagersList();
			logoPreview.hidden = true;
			colorInput.value = "#1769aa";
			document.getElementById("club-color-value").textContent = "#1769AA";
			requestStatus.textContent = `Đã gửi yêu cầu “${data.club.name}” đến admin.`;
			await loadClubs();
		} catch (error) {
			requestStatus.textContent = error.message;
		} finally {
			submit.disabled = false;
		}
	});

	Promise.all([api("/api/auth/me"), api("/api/clubs")])
		.then(([auth]) => {
			currentUser = auth.user;
			if (currentUser) {
				requestForm.hidden = false;
				if (!managerEmails.includes(currentUser.email)) {
					managerEmails.push(currentUser.email);
					renderManagersList();
				}
			} else {
				document.getElementById("clubs-auth-gate").hidden = false;
			}
			return loadClubs();
		})
		.catch(error => {
			document.getElementById("clubs-status").textContent = error.message;
		});
});
