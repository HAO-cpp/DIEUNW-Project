document.addEventListener("DOMContentLoaded", () => {
	const clubsList = document.getElementById("clubs-list");
	const requestForm = document.getElementById("club-request-form");
	const requestStatus = document.getElementById("club-request-status");
	const adminReviewPanel = document.getElementById("admin-review-panel");
	const reviewList = document.getElementById("club-review-list");
	let currentUser = null;

	async function api(url, options = {}) {
		const response = await fetch(url, { credentials: "same-origin", ...options });
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

	function renderClub(club) {
		const card = element("article", "club-card");
		const brand = element("div", "club-card-brand");
		if (club.logo) {
			const logo = element("img", "club-card-logo");
			logo.src = club.logo;
			logo.alt = `Logo ${club.name}`;
			brand.append(logo);
		} else {
			brand.append(element("span", "club-card-monogram", club.name.slice(0, 1).toUpperCase()));
		}
		const identity = element("div", "club-card-identity");
		identity.append(element("h3", "", club.name), element("p", "", club.manager?.name || club.managerEmail));
		brand.append(identity);
		card.append(brand);
		const managerTag = element("span", "club-manager-tag", `Quản lý · ${club.manager?.name || club.managerEmail}`);
		managerTag.style.setProperty("--club-color", club.tagColor);
		card.append(managerTag);
		return card;
	}

	function renderReview(club) {
		const item = element("article", "club-review-item");
		const details = element("div", "club-review-details");
		details.append(element("h3", "", club.name), element("p", "", `Quản lý: ${club.manager?.name || club.managerEmail}`));
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
					managerEmail: document.getElementById("club-manager-email").value.trim(),
					logo,
					tagColor: colorInput.value
				})
			});
			requestForm.reset();
			document.getElementById("club-manager-email").value = currentUser.email;
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
				document.getElementById("club-manager-email").value = currentUser.email;
			} else {
				document.getElementById("clubs-auth-gate").hidden = false;
			}
			return loadClubs();
		})
		.catch(error => {
			document.getElementById("clubs-status").textContent = error.message;
		});
});
