document.addEventListener("DOMContentLoaded", () => {
	if (new URLSearchParams(window.location.search).get("clubId")) return;

	const achievementsList = document.getElementById("profile-achievements-list");
	const interestsList = document.getElementById("profile-interests-list");
	const albumList = document.getElementById("profile-album-list");
	const achievementStatus = document.getElementById("achievement-status");
	const interestStatus = document.getElementById("interest-status");
	const albumStatus = document.getElementById("album-status");
	const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

	async function api(url, options = {}) {
		const token = localStorage.getItem("session_token");
		const headers = {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.headers || {})
		};
		const response = await fetch(`https://dieunw.onrender.com${url}`, {
			credentials: "include",
			...options,
			headers
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || "Không thể hoàn tất yêu cầu.");
		return data;
	}

	function makeElement(tag, className, text) {
		const element = document.createElement(tag);
		if (className) element.className = className;
		if (text !== undefined) element.textContent = text;
		return element;
	}

	function readImage(file) {
		if (!file) return Promise.resolve("");
		if (!allowedImageTypes.has(file.type)) return Promise.reject(new Error("Chọn ảnh PNG, JPG, WEBP hoặc GIF."));
		if (file.size > 500 * 1024) return Promise.reject(new Error("Ảnh không được vượt quá 500 KB."));
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ""));
			reader.onerror = () => reject(new Error("Không đọc được ảnh đã chọn."));
			reader.readAsDataURL(file);
		});
	}

	function makeDeleteButton(label, url, reload) {
		const button = makeElement("button", "profile-extra-delete", "Xóa");
		button.type = "button";
		button.setAttribute("aria-label", label);
		button.addEventListener("click", async () => {
			if (!window.confirm(`Xóa ${label.toLocaleLowerCase("vi")} khỏi hồ sơ?`)) return;
			button.disabled = true;
			try {
				await api(url, { method: "DELETE" });
				await reload();
			} catch (error) {
				achievementStatus.textContent = error.message || "Không thể xóa mục này.";
				button.disabled = false;
			}
		});
		return button;
	}

	function renderAchievements(achievements) {
		achievementsList.replaceChildren();
		if (!achievements.length) {
			achievementsList.append(makeElement("p", "profile-extra-empty", "Thành tích bạn thêm sẽ hiện ở đây."));
			return;
		}
		for (const achievement of achievements) {
			const item = makeElement("article", "profile-achievement-item");
			const tag = makeElement("span", "profile-achievement-tag", achievement.title);
			item.append(tag);
			if (achievement.certificateImage) {
				const certificate = makeElement("a", "profile-certificate-link");
				certificate.href = achievement.certificateImage;
				certificate.target = "_blank";
				certificate.rel = "noopener noreferrer";
				certificate.setAttribute("aria-label", `Xem chứng nhận: ${achievement.title}`);
				const image = makeElement("img", "profile-certificate-image");
				image.src = achievement.certificateImage;
				image.alt = `Chứng nhận: ${achievement.title}`;
				certificate.append(image, makeElement("span", "", "Xem chứng nhận"));
				item.append(certificate);
			}
			item.append(makeDeleteButton(`thành tích ${achievement.title}`, `/api/profile/achievements/${encodeURIComponent(achievement.id)}`, loadSections));
			achievementsList.append(item);
		}
	}

	function renderInterests(interests) {
		interestsList.replaceChildren();
		if (!interests.length) {
			interestsList.append(makeElement("p", "profile-extra-empty", "Thêm vài điều bạn yêu thích."));
			return;
		}
		for (const interest of interests) {
			const tag = makeElement("span", "profile-interest-tag");
			tag.append(makeElement("span", "", interest.name));
			tag.append(makeDeleteButton(`sở thích ${interest.name}`, `/api/profile/interests/${encodeURIComponent(interest.id)}`, loadSections));
			interestsList.append(tag);
		}
	}

	function renderAlbum(photos) {
		albumList.replaceChildren();
		if (!photos.length) {
			albumList.append(makeElement("p", "profile-extra-empty", "Ảnh bạn thêm vào album sẽ hiện ở đây."));
			return;
		}
		for (const photo of photos) {
			const item = makeElement("article", "profile-album-item");
			const image = makeElement("img", "profile-album-image");
			image.src = photo.image;
			image.alt = photo.caption || "Ảnh trong album cá nhân";
			image.loading = "lazy";
			item.append(image);
			if (photo.caption) item.append(makeElement("p", "profile-album-caption", photo.caption));
			item.append(makeDeleteButton("ảnh trong album", `/api/profile/photos/${encodeURIComponent(photo.id)}`, loadSections));
			albumList.append(item);
		}
	}

	async function loadSections() {
		const data = await api("/api/profile/sections");
		renderAchievements(data.achievements);
		renderInterests(data.interests);
		renderAlbum(data.photos);
	}

	document.getElementById("achievement-form")?.addEventListener("submit", async event => {
		event.preventDefault();
		const form = event.currentTarget;
		const button = form.querySelector("button[type='submit']");
		button.disabled = true;
		achievementStatus.textContent = "Đang lưu thành tích...";
		try {
			const certificateImage = await readImage(document.getElementById("achievement-certificate").files[0]);
			await api("/api/profile/achievements", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: document.getElementById("achievement-title").value.trim(), certificateImage })
			});
			form.reset();
			achievementStatus.textContent = "Đã thêm thành tích.";
			await loadSections();
		} catch (error) {
			achievementStatus.textContent = error.message || "Không thể lưu thành tích.";
		} finally {
			button.disabled = false;
		}
	});

	document.getElementById("interest-form")?.addEventListener("submit", async event => {
		event.preventDefault();
		const form = event.currentTarget;
		const button = form.querySelector("button[type='submit']");
		button.disabled = true;
		interestStatus.textContent = "Đang thêm sở thích...";
		try {
			await api("/api/profile/interests", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: document.getElementById("interest-name").value.trim() })
			});
			form.reset();
			interestStatus.textContent = "Đã thêm tag sở thích.";
			await loadSections();
		} catch (error) {
			interestStatus.textContent = error.message || "Không thể thêm sở thích.";
		} finally {
			button.disabled = false;
		}
	});

	document.getElementById("album-form")?.addEventListener("submit", async event => {
		event.preventDefault();
		const form = event.currentTarget;
		const button = form.querySelector("button[type='submit']");
		button.disabled = true;
		albumStatus.textContent = "Đang thêm ảnh vào album...";
		try {
			const image = await readImage(document.getElementById("album-photo").files[0]);
			if (!image) throw new Error("Chọn ảnh trước khi thêm vào album.");
			await api("/api/profile/photos", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ image, caption: document.getElementById("album-caption").value.trim() })
			});
			form.reset();
			albumStatus.textContent = "Ảnh đã được thêm vào album.";
			await loadSections();
		} catch (error) {
			albumStatus.textContent = error.message || "Không thể thêm ảnh.";
		} finally {
			button.disabled = false;
		}
	});

	window.addEventListener("dieu-profile-ready", () => loadSections().catch(error => {
		achievementStatus.textContent = error.message || "Không thể tải dữ liệu hồ sơ.";
	}));

	api("/api/auth/me")
		.then(data => data.user ? loadSections() : null)
		.catch(error => {
			achievementStatus.textContent = error.message || "Không thể tải dữ liệu hồ sơ.";
		});
});