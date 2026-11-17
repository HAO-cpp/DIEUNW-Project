const API_BASE = "https://dieunw.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
	const authContainer = document.getElementById("auth-container");
	const profileContainer = document.getElementById("profile-container");
	const loginView = document.getElementById("login-view");
	const registerView = document.getElementById("register-view");
	const forgotView = document.getElementById("forgot-view");

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
		return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
	}

	function requestErrorMessage(error, fallback) {
		if (location.protocol === "file:" || error instanceof TypeError) {
			return "Không kết nối được backend. Hãy kiểm tra lại kết nối hoặc máy chủ.";
		}
		return error.message || fallback;
	}

	async function readApiResponse(response) {
		if (!response.headers.get("content-type")?.includes("application/json")) {
			throw new Error("Không nhận được phản hồi JSON hợp lệ từ máy chủ.");
		}
		const data = await response.json();
		if (data && data.token) {
			localStorage.setItem("session_token", data.token);
		}
		return data;
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
				el.setAttribute("href", /^(\.\/profile\.html\?userId=|https?:\/\/)/i.test(href) ? href : "#");
				if (node.classList.contains("mention-tag")) el.className = "mention-tag";
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
		if (!file.type.startsWith("image/")) throw new Error("Vui lòng chọn tệp ảnh hợp lệ.");
		const dataUrl = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ""));
			reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
			reader.readAsDataURL(file);
		});
		const img = await new Promise((resolve, reject) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = () => reject(new Error("Tệp ảnh không hợp lệ."));
			i.src = dataUrl;
		});
		const canvas = document.createElement("canvas");
		let w = img.naturalWidth || img.width;
		let h = img.naturalHeight || img.height;
		if (w > maxWidth) {
			h = Math.round((h * maxWidth) / w);
			w = maxWidth;
		}
		canvas.width = w;
		canvas.height = h;
		canvas.getContext("2d").drawImage(img, 0, 0, w, h);
		for (const q of [0.82, 0.68, 0.52]) {
			const out = canvas.toDataURL("image/jpeg", q);
			if (out.length <= maxBytes * 1.37) return out;
		}
		return canvas.toDataURL("image/jpeg", 0.35);
	}

	if (location.hash === "#register" && loginView && registerView) {
		loginView.style.display = "none";
		registerView.style.display = "block";
	}

	const urlParams = new URLSearchParams(window.location.search);
	const clubId = urlParams.get("clubId");
	const targetUserId = urlParams.get("userId");
	let activeClub = null;
	let viewerUser = null;
	let pendingAvatarData = null; // null = giữ nguyên, "" = xóa ảnh, string = ảnh mới
	let pendingCoverData = null;

	// --- UPLOAD ẢNH ĐẠI DIỆN & ẢNH BÌA TỪ MÁY ---
	const editAvatarFile = document.getElementById("edit-avatar-file");
	const editAvatarFilename = document.getElementById("edit-avatar-filename");
	const editAvatarClear = document.getElementById("edit-avatar-clear");
	const editAvatarPreviewWrap = document.getElementById("edit-avatar-preview-wrap");
	const editAvatarPreview = document.getElementById("edit-avatar-preview");

	const editCoverFile = document.getElementById("edit-cover-file");
	const editCoverFilename = document.getElementById("edit-cover-filename");
	const editCoverClear = document.getElementById("edit-cover-clear");
	const editCoverPreviewWrap = document.getElementById("edit-cover-preview-wrap");
	const editCoverPreview = document.getElementById("edit-cover-preview");

	editAvatarFile?.addEventListener("change", async () => {
		const f = editAvatarFile.files?.[0];
		if (!f) return;
		editAvatarFilename.textContent = "Đang xử lý...";
		try {
			pendingAvatarData = await compressImageFile(f, 512, 260000);
			editAvatarFilename.textContent = f.name;
			editAvatarPreview.src = pendingAvatarData;
			editAvatarPreviewWrap.hidden = false;
			editAvatarClear.hidden = false;
		} catch (err) {
			pendingAvatarData = null;
			editAvatarFilename.textContent = err.message || "Lỗi đọc ảnh";
		}
	});
	editAvatarClear?.addEventListener("click", () => {
		pendingAvatarData = "";
		editAvatarFile.value = "";
		editAvatarFilename.textContent = "Đã xóa ảnh (dùng mặc định)";
		editAvatarPreview.removeAttribute("src");
		editAvatarPreviewWrap.hidden = true;
		editAvatarClear.hidden = true;
	});

	editCoverFile?.addEventListener("change", async () => {
		const f = editCoverFile.files?.[0];
		if (!f) return;
		editCoverFilename.textContent = "Đang xử lý...";
		try {
			pendingCoverData = await compressImageFile(f, 1200, 380000);
			editCoverFilename.textContent = f.name;
			editCoverPreview.src = pendingCoverData;
			editCoverPreviewWrap.hidden = false;
			editCoverClear.hidden = false;
		} catch (err) {
			pendingCoverData = null;
			editCoverFilename.textContent = err.message || "Lỗi đọc ảnh";
		}
	});
	editCoverClear?.addEventListener("click", () => {
		pendingCoverData = "";
		editCoverFile.value = "";
		editCoverFilename.textContent = "Đã gỡ ảnh bìa";
		editCoverPreview.removeAttribute("src");
		editCoverPreviewWrap.hidden = true;
		editCoverClear.hidden = true;
	});

	// --- REPORT MODAL (TÀI KHOẢN / BÀI VIẾT) ---
	const reportOverlay = document.getElementById("report-modal-overlay");
	const reportTargetLabel = document.getElementById("report-target-label");
	const reportReasonInput = document.getElementById("report-reason-input");
	const reportStatus = document.getElementById("report-modal-status");
	const reportSubmitBtn = document.getElementById("report-modal-submit");
	let activeReportTarget = null;

	function openReportModal(targetType, targetId, labelText) {
		if (!viewerUser) {
			window.alert?.("Hãy đăng nhập để gửi báo cáo.");
			return;
		}
		activeReportTarget = { targetType, targetId };
		reportTargetLabel.textContent = labelText || "";
		reportReasonInput.value = "";
		reportStatus.textContent = "";
		reportStatus.classList.remove("error");
		reportOverlay.hidden = false;
		requestAnimationFrame(() => reportOverlay.classList.add("open"));
	}

	function closeReportModal() {
		if (!reportOverlay) return;
		reportOverlay.classList.remove("open");
		reportOverlay.hidden = true;
		activeReportTarget = null;
	}

	document.querySelectorAll("#report-modal-overlay .report-chip").forEach(chip => {
		chip.addEventListener("click", () => {
			const r = chip.dataset.reason || chip.textContent;
			reportReasonInput.value = reportReasonInput.value.trim()
				? `${reportReasonInput.value.trim()}; ${r}`
				: r;
		});
	});
	document.getElementById("report-modal-close")?.addEventListener("click", closeReportModal);
	document.getElementById("report-modal-cancel")?.addEventListener("click", closeReportModal);
	reportOverlay?.addEventListener("click", e => {
		if (e.target === reportOverlay) closeReportModal();
	});

	reportSubmitBtn?.addEventListener("click", async () => {
		if (!activeReportTarget) return;
		const reason = reportReasonInput.value.trim() || "Vi phạm quy tắc cộng đồng";
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
			reportStatus.textContent = "Đã gửi báo cáo tới Ban duyệt bài.";
			setTimeout(closeReportModal, 900);
		} catch (err) {
			reportStatus.textContent = err.message || "Không thể gửi báo cáo.";
			reportStatus.classList.add("error");
		} finally {
			reportSubmitBtn.disabled = false;
		}
	});

	// --- KHỞI TẠO PHIÊN ĐĂNG NHẬP ---
	fetch(`${API_BASE}/api/auth/me`, { credentials: "include", headers: getAuthHeaders() })
		.then(res => res.json())
		.then(async data => {
			const currentUser = data.user || null;
			viewerUser = currentUser;
			if (currentUser) {
				localStorage.setItem("dieuNwUser", JSON.stringify(currentUser));
			} else {
				localStorage.removeItem("dieuNwUser");
				localStorage.removeItem("session_token");
				window.updateNavAvatar?.(null);
				window.updateHomeAccess?.(null);
			}

			if (clubId) {
				window.updateNavAvatar?.(currentUser);
				window.updateHomeAccess?.(currentUser);
				await loadClubProfile(clubId, currentUser);
				return;
			}
			if (targetUserId && (!currentUser || String(currentUser.id) !== String(targetUserId))) {
				window.updateNavAvatar?.(currentUser);
				await loadFriendProfile(targetUserId, currentUser);
				return;
			}
			if (currentUser) showProfile(currentUser);
		})
		.catch(() => {
			if (clubId) loadClubProfile(clubId, null);
			else if (targetUserId) loadFriendProfile(targetUserId, null);
		});

	// --- CHUYỂN TAB LOGIN / REGISTER / FORGOT ---
	document.getElementById("link-to-register")?.addEventListener("click", e => {
		e.preventDefault();
		loginView.style.display = "none";
		forgotView.style.display = "none";
		registerView.style.display = "block";
	});
	document.getElementById("link-to-forgot")?.addEventListener("click", e => {
		e.preventDefault();
		loginView.style.display = "none";
		registerView.style.display = "none";
		forgotView.style.display = "block";
	});
	document.querySelectorAll(".link-to-login").forEach(link => {
		link.addEventListener("click", e => {
			e.preventDefault();
			registerView.style.display = "none";
			forgotView.style.display = "none";
			loginView.style.display = "block";
		});
	});

	// 1. ĐĂNG NHẬP
	document.getElementById("btn-login")?.addEventListener("click", async () => {
		const email = document.getElementById("login-email").value.trim().toLowerCase();
		const password = document.getElementById("login-password").value;
		const btnLogin = document.getElementById("btn-login");
		if (!email || !password) {
			window.alert?.("Vui lòng nhập đầy đủ Email và Mật khẩu!");
			return;
		}
		btnLogin.textContent = "Đang kiểm tra...";
		btnLogin.disabled = true;
		try {
			const response = await fetch(`${API_BASE}/api/auth/login`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password })
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Email hoặc mật khẩu không chính xác.");
			localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
			viewerUser = data.user;
			showProfile(data.user);
		} catch (error) {
			window.alert?.(requestErrorMessage(error, "Không thể kết nối máy chủ."));
		} finally {
			btnLogin.textContent = "Đăng nhập";
			btnLogin.disabled = false;
		}
	});

	// 2. ĐĂNG KÝ
	document.getElementById("btn-reg-send-otp")?.addEventListener("click", async () => {
		const name = document.getElementById("reg-name").value.trim();
		const email = document.getElementById("reg-email").value.trim().toLowerCase();
		const password = document.getElementById("reg-password").value;
		const btnSend = document.getElementById("btn-reg-send-otp");
		if (!name || !email || !password) return window.alert?.("Vui lòng điền đầy đủ thông tin đăng ký!");
		if (!email.endsWith("@nqd.edu.vn")) return window.alert?.("Bạn phải dùng Email trường có đuôi @nqd.edu.vn!");
		if (password.length < 8) return window.alert?.("Mật khẩu phải có ít nhất 8 ký tự!");
		btnSend.textContent = "Đang gửi mã OTP...";
		btnSend.disabled = true;
		try {
			const response = await fetch(`${API_BASE}/api/auth/register/start`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, password })
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không thể bắt đầu đăng ký.");
			const notice = document.querySelector("#reg-step-2 .otp-notice");
			notice.textContent = data.devCode ? `Chế độ phát triển, mã xác nhận: ${data.devCode}` : "Mã xác nhận đã được gửi đến email trường của bạn.";
			document.getElementById("reg-step-1").style.display = "none";
			document.getElementById("reg-step-2").style.display = "block";
		} catch (error) {
			window.alert?.(requestErrorMessage(error, "Không thể gửi mã xác nhận."));
		} finally {
			btnSend.textContent = "Gửi mã xác nhận Email";
			btnSend.disabled = false;
		}
	});

	document.getElementById("btn-reg-verify")?.addEventListener("click", async () => {
		const userOtp = document.getElementById("reg-otp-input").value.trim();
		const btnVerify = document.getElementById("btn-reg-verify");
		btnVerify.textContent = "Đang tạo tài khoản...";
		btnVerify.disabled = true;
		try {
			const response = await fetch(`${API_BASE}/api/auth/register/verify`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: document.getElementById("reg-name").value.trim(),
					email: document.getElementById("reg-email").value.trim().toLowerCase(),
					code: userOtp
				})
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Mã xác nhận không hợp lệ.");
			localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
			viewerUser = data.user;
			showProfile(data.user);
		} catch (error) {
			window.alert?.(requestErrorMessage(error, "Lỗi khi tạo tài khoản."));
		} finally {
			btnVerify.textContent = "Hoàn tất Đăng ký";
			btnVerify.disabled = false;
		}
	});

	// 3. QUÊN MẬT KHẨU
	document.getElementById("btn-forgot-send-otp")?.addEventListener("click", async () => {
		const email = document.getElementById("forgot-email").value.trim().toLowerCase();
		const btnSend = document.getElementById("btn-forgot-send-otp");
		if (!email.endsWith("@nqd.edu.vn")) return window.alert?.("Vui lòng nhập đúng email trường @nqd.edu.vn!");
		btnSend.textContent = "Đang gửi mã khôi phục...";
		btnSend.disabled = true;
		try {
			const response = await fetch(`${API_BASE}/api/auth/password/start`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email })
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không thể gửi mã khôi phục.");
			const notice = document.querySelector("#forgot-step-2 .otp-notice");
			notice.textContent = data.devCode ? `Chế độ phát triển, mã xác nhận: ${data.devCode}` : "Mã khôi phục đã được gửi đến email của bạn.";
			document.getElementById("forgot-step-1").style.display = "none";
			document.getElementById("forgot-step-2").style.display = "block";
		} catch (error) {
			window.alert?.(requestErrorMessage(error, "Lỗi gửi mã khôi phục."));
		} finally {
			btnSend.textContent = "Gửi mã khôi phục";
			btnSend.disabled = false;
		}
	});

	document.getElementById("btn-forgot-reset")?.addEventListener("click", async () => {
		const userOtp = document.getElementById("forgot-otp-input").value.trim();
		const newPassword = document.getElementById("forgot-new-password").value;
		const btnReset = document.getElementById("btn-forgot-reset");
		if (newPassword.length < 8) return window.alert?.("Mật khẩu mới phải có ít nhất 8 ký tự!");
		btnReset.textContent = "Đang cập nhật...";
		btnReset.disabled = true;
		try {
			const response = await fetch(`${API_BASE}/api/auth/password/verify`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: document.getElementById("forgot-email").value.trim().toLowerCase(),
					code: userOtp,
					password: newPassword
				})
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Mã xác nhận không hợp lệ.");
			localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
			viewerUser = data.user;
			showProfile(data.user);
		} catch (error) {
			window.alert?.(requestErrorMessage(error, "Lỗi khi cập nhật mật khẩu mới!"));
		} finally {
			btnReset.textContent = "Đổi mật khẩu mới";
			btnReset.disabled = false;
		}
	});

	// --- ĐĂNG XUẤT & CHỈNH SỬA HỒ SƠ ---
	document.getElementById("btn-logout")?.addEventListener("click", async () => {
		await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include", headers: getAuthHeaders() }).catch(() => {});
		localStorage.removeItem("dieuNwUser");
		localStorage.removeItem("session_token");
		location.reload();
	});

	const btnEditProfile = document.getElementById("btn-edit-profile");
	const editProfileForm = document.getElementById("edit-profile-form");

	btnEditProfile?.addEventListener("click", () => {
		const emailGroup = document.getElementById("edit-email-input")?.closest(".input-group");
		const classGroup = document.getElementById("edit-class-input")?.closest(".input-group");
		const updateTitle = document.getElementById("update");
		pendingAvatarData = null;
		pendingCoverData = null;
		if (editAvatarFile) editAvatarFile.value = "";
		if (editCoverFile) editCoverFile.value = "";
		if (editAvatarFilename) editAvatarFilename.textContent = "Giữ nguyên ảnh hiện tại";
		if (editCoverFilename) editCoverFilename.textContent = "Giữ nguyên ảnh hiện tại";

		if (activeClub) {
			if (updateTitle) updateTitle.textContent = "Cập nhật Fanpage CLB";
			if (emailGroup) emailGroup.style.display = "none";
			if (classGroup) classGroup.style.display = "none";
			document.getElementById("edit-name-input").value = activeClub.name || "";
			document.getElementById("edit-bio-input").value = activeClub.bio || "";
			if (activeClub.logo) {
				editAvatarPreview.src = activeClub.logo;
				editAvatarPreviewWrap.hidden = false;
				editAvatarClear.hidden = false;
			} else {
				editAvatarPreviewWrap.hidden = true;
				editAvatarClear.hidden = true;
			}
			if (activeClub.cover) {
				editCoverPreview.src = activeClub.cover;
				editCoverPreviewWrap.hidden = false;
				editCoverClear.hidden = false;
			} else {
				editCoverPreviewWrap.hidden = true;
				editCoverClear.hidden = true;
			}
		} else {
			if (updateTitle) updateTitle.textContent = "Cập nhật thông tin cá nhân";
			if (emailGroup) emailGroup.style.display = "block";
			if (classGroup) classGroup.style.display = "block";
			const cu = JSON.parse(localStorage.getItem("dieuNwUser") || "{}");
			document.getElementById("edit-name-input").value = cu.name || "";
			document.getElementById("edit-email-input").value = cu.email || "";
			document.getElementById("edit-class-input").value = cu.studentClass || "";
			document.getElementById("edit-bio-input").value = cu.bio || "";
			if (cu.avatar && cu.avatar !== "./DIEU.png") {
				editAvatarPreview.src = cu.avatar;
				editAvatarPreviewWrap.hidden = false;
				editAvatarClear.hidden = false;
			} else {
				editAvatarPreviewWrap.hidden = true;
				editAvatarClear.hidden = true;
			}
			if (cu.cover) {
				editCoverPreview.src = cu.cover;
				editCoverPreviewWrap.hidden = false;
				editCoverClear.hidden = false;
			} else {
				editCoverPreviewWrap.hidden = true;
				editCoverClear.hidden = true;
			}
		}
		editProfileForm.style.display = "block";
		btnEditProfile.style.display = "none";
	});

	document.getElementById("btn-cancel-edit")?.addEventListener("click", () => {
		editProfileForm.style.display = "none";
		btnEditProfile.style.display = "inline-block";
	});

	document.getElementById("btn-save-profile")?.addEventListener("click", async () => {
		const newName = document.getElementById("edit-name-input").value.trim();
		const newEmail = document.getElementById("edit-email-input").value.trim().toLowerCase();
		const newClass = document.getElementById("edit-class-input").value.trim();
		const newBio = document.getElementById("edit-bio-input").value.trim();
		if (!newName) return window.alert?.("Tên hiển thị không được để trống!");

		if (clubId && activeClub) {
			try {
				const logoVal = pendingAvatarData !== null ? pendingAvatarData : (activeClub.logo || "");
				const coverVal = pendingCoverData !== null ? pendingCoverData : (activeClub.cover || "");
				const response = await fetch(`${API_BASE}/api/clubs/${encodeURIComponent(clubId)}`, {
					method: "PATCH",
					credentials: "include",
					headers: getAuthHeaders({ "Content-Type": "application/json" }),
					body: JSON.stringify({ name: newName, logo: logoVal, cover: coverVal, bio: newBio })
				});
				const data = await readApiResponse(response);
				if (!response.ok) throw new Error(data.error || "Không thể cập nhật Fanpage CLB.");
				editProfileForm.style.display = "none";
				btnEditProfile.style.display = "inline-block";
				await loadClubProfile(clubId, viewerUser);
			} catch (error) {
				window.alert?.(requestErrorMessage(error, "Lỗi khi lưu thông tin Fanpage CLB!"));
			}
			return;
		}

		const cu = JSON.parse(localStorage.getItem("dieuNwUser") || "{}");
		const updatedFields = {
			name: newName,
			email: newEmail,
			studentClass: newClass,
			avatar: pendingAvatarData !== null ? pendingAvatarData : (cu.avatar || ""),
			cover: pendingCoverData !== null ? pendingCoverData : (cu.cover || ""),
			bio: newBio || "Chào mừng đến với góc học tập của mình trên DIEUNW!"
		};

		try {
			const response = await fetch(`${API_BASE}/api/users/me`, {
				method: "PATCH",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify(updatedFields)
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không thể cập nhật hồ sơ.");
			localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
			viewerUser = data.user;
			editProfileForm.style.display = "none";
			btnEditProfile.style.display = "inline-block";
			showProfile(data.user);
		} catch (error) {
			window.alert?.(requestErrorMessage(error, "Lỗi khi lưu thông tin hồ sơ!"));
		}
	});

	// --- VAI TRÒ: ADMIN + BAN DUYỆT BÀI + QUẢN LÝ CLB ---
	function renderProfileRoles(user) {
		const container = document.getElementById("profile-role-tags");
		if (!container) return;
		container.replaceChildren();
		if (user.isAdmin) {
			const adminTag = document.createElement("span");
			adminTag.className = "profile-role-tag admin-role-tag";
			adminTag.textContent = "ADMIN";
			container.append(adminTag);
		}
		if (user.isModerator) {
			const modTag = document.createElement("span");
			modTag.className = "profile-role-tag moderator-role-tag";
			modTag.textContent = "Ban duyệt bài";
			container.append(modTag);
		}
		for (const club of user.profileTitles || []) {
			const clubTag = document.createElement("span");
			clubTag.className = "profile-role-tag club-role-tag";
			clubTag.textContent = `Quản lý · ${club.name}`;
			clubTag.style.setProperty("--club-color", club.color);
			container.append(clubTag);
		}
	}

	async function loadAdminTools(user) {
		const panel = document.getElementById("admin-tools");
		if (!panel) return;
		panel.hidden = !user?.isAdmin;
		if (!user?.isAdmin) return;

		const adminList = document.getElementById("admin-list");
		const modList = document.getElementById("moderator-list");
		try {
			const [adminRes, modRes] = await Promise.all([
				fetch(`${API_BASE}/api/admins`, { credentials: "include", headers: getAuthHeaders() }),
				fetch(`${API_BASE}/api/moderators`, { credentials: "include", headers: getAuthHeaders() })
			]);
			const adminData = await adminRes.json().catch(() => ({}));
			const modData = await modRes.json().catch(() => ({}));

			if (adminList && Array.isArray(adminData.admins)) {
				adminList.replaceChildren(...adminData.admins.map(email => {
					const li = document.createElement("li");
					li.textContent = email;
					return li;
				}));
			}

			if (modList && Array.isArray(modData.moderators)) {
				modList.replaceChildren(...modData.moderators.map(email => {
					const li = document.createElement("li");
					const span = document.createElement("span");
					span.textContent = email;
					const rm = document.createElement("button");
					rm.type = "button";
					rm.className = "admin-remove-btn";
					rm.textContent = "Gỡ quyền";
					rm.addEventListener("click", async () => {
						if (!window.confirm(`Gỡ quyền Ban duyệt bài của ${email}?`)) return;
						rm.disabled = true;
						await fetch(`${API_BASE}/api/moderators/${encodeURIComponent(email)}`, {
							method: "DELETE",
							credentials: "include",
							headers: getAuthHeaders()
						});
						await loadAdminTools(user);
					});
					li.append(span, rm);
					return li;
				}));
			}
		} catch {}
	}

	document.getElementById("admin-add-form")?.addEventListener("submit", async event => {
		event.preventDefault();
		const emailInput = document.getElementById("admin-email-input");
		const status = document.getElementById("admin-action-status");
		const button = event.currentTarget.querySelector("button[type='submit']");
		button.disabled = true;
		status.textContent = "Đang thêm admin...";
		try {
			const response = await fetch(`${API_BASE}/api/admins`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ email: emailInput.value.trim() })
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không thể thêm admin.");
			emailInput.value = "";
			status.textContent = `${data.email} đã được thêm làm admin.`;
			await loadAdminTools(viewerUser);
		} catch (error) {
			status.textContent = requestErrorMessage(error, "Không thể thêm admin.");
		} finally {
			button.disabled = false;
		}
	});

	document.getElementById("moderator-add-form")?.addEventListener("submit", async event => {
		event.preventDefault();
		const emailInput = document.getElementById("moderator-email-input");
		const status = document.getElementById("moderator-action-status");
		const button = event.currentTarget.querySelector("button[type='submit']");
		button.disabled = true;
		status.textContent = "Đang thêm Ban duyệt bài...";
		try {
			const response = await fetch(`${API_BASE}/api/moderators`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ email: emailInput.value.trim() })
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không thể thêm Ban duyệt bài.");
			emailInput.value = "";
			status.textContent = data.accountExists
				? `${data.email} đã được thêm vào Ban duyệt bài.`
				: `${data.email} sẽ nhận quyền Ban duyệt bài khi đăng ký.`;
			await loadAdminTools(viewerUser);
		} catch (error) {
			status.textContent = requestErrorMessage(error, "Không thể thêm Ban duyệt bài.");
		} finally {
			button.disabled = false;
		}
	});

	// --- HÀNG ĐỢI KIỂM DUYỆT (MAX-HEAP PRIORITY QUEUE) ---
	const modPanel = document.getElementById("moderation-panel");
	const modQueueList = document.getElementById("mod-queue-list");
	const modInspectOverlay = document.getElementById("mod-inspect-overlay");
	const modInspectTitle = document.getElementById("mod-inspect-title");
	const modInspectBody = document.getElementById("mod-inspect-body");
	const modInspectActions = document.getElementById("mod-inspect-actions");
	let activeModTab = "posts";
	let moderationData = { reportedPosts: [], reportedUsers: [] };

	document.querySelectorAll(".mod-tab").forEach(tab => {
		tab.addEventListener("click", () => {
			activeModTab = tab.dataset.modTab;
			document.querySelectorAll(".mod-tab").forEach(t => t.classList.toggle("active", t === tab));
			renderModerationList();
		});
	});

	document.getElementById("mod-inspect-close")?.addEventListener("click", () => {
		modInspectOverlay.classList.remove("open");
		modInspectOverlay.hidden = true;
	});
	modInspectOverlay?.addEventListener("click", e => {
		if (e.target === modInspectOverlay) {
			modInspectOverlay.classList.remove("open");
			modInspectOverlay.hidden = true;
		}
	});

	function openModInspect(type, item) {
		modInspectTitle.textContent = type === "post" ? "Chi tiết bài viết bị báo cáo" : "Chi tiết tài khoản bị báo cáo";
		const reasonsHtml = (item.reasons || []).map(r => `
			<div class="mod-reason-item">
				<strong>${escapeHtml(r.reporterName || r.reporterEmail || "Người dùng")}</strong>
				<p style="margin-top:2px;">${escapeHtml(r.reason)}</p>
			</div>
		`).join("");

		if (type === "post") {
			const p = item.post || {};
			modInspectBody.innerHTML = `
				<p style="font-size:13px; color:#5e7488; margin-bottom:8px;">
					Tác giả: <strong>${escapeHtml(p.name || "Không rõ")}</strong> · Tổng báo cáo: <strong>${item.reportCount}</strong>
				</p>
				<div class="book-resource-box" style="margin-bottom:10px;">
					<div class="post-rich-content">${p.contentHtml ? sanitizeRichHtml(p.contentHtml) : escapeHtml(p.content || "(Không có nội dung)")}</div>
					${p.image ? `<img src="${escapeHtml(p.image)}" class="post-card-image" alt="">` : ""}
				</div>
				<h4 style="font-size:13px; margin-bottom:6px;">Lý do báo cáo (${item.reportCount}):</h4>
				<div class="mod-reasons-list">${reasonsHtml}</div>
			`;
		} else {
			const u = item.account || {};
			modInspectBody.innerHTML = `
				<p style="font-size:13px; color:#5e7488; margin-bottom:8px;">
					Tài khoản: <strong>${escapeHtml(u.name || "")}</strong> (${escapeHtml(u.email || "")}) · Tổng báo cáo: <strong>${item.reportCount}</strong>
				</p>
				<p style="font-size:13px; margin-bottom:8px;"><a href="./profile.html?userId=${encodeURIComponent(u.id || item.targetId)}" style="color:#1769aa; font-weight:700;">Xem trang hồ sơ ↗</a></p>
				<h4 style="font-size:13px; margin-bottom:6px;">Lý do báo cáo (${item.reportCount}):</h4>
				<div class="mod-reasons-list">${reasonsHtml}</div>
			`;
		}

		modInspectActions.replaceChildren();
		const dismissBtn = document.createElement("button");
		dismissBtn.type = "button";
		dismissBtn.className = "btn-timer outline";
		dismissBtn.textContent = "Bỏ qua báo cáo";
		dismissBtn.addEventListener("click", async () => {
			dismissBtn.disabled = true;
			await fetch(`${API_BASE}/api/reports/${type}/${encodeURIComponent(item.targetId)}`, {
				method: "DELETE",
				credentials: "include",
				headers: getAuthHeaders()
			});
			modInspectOverlay.classList.remove("open");
			modInspectOverlay.hidden = true;
			await loadModerationQueue(viewerUser);
		});
		modInspectActions.appendChild(dismissBtn);

		if (type === "post") {
			const delPostBtn = document.createElement("button");
			delPostBtn.type = "button";
			delPostBtn.className = "btn-auth";
			delPostBtn.style.width = "auto";
			delPostBtn.style.background = "#b42318";
			delPostBtn.textContent = "Xóa bài viết";
			delPostBtn.addEventListener("click", async () => {
				if (!window.confirm("Xóa vĩnh viễn bài viết bị báo cáo này?")) return;
				delPostBtn.disabled = true;
				await fetch(`${API_BASE}/api/posts/${encodeURIComponent(item.targetId)}`, {
					method: "DELETE",
					credentials: "include",
					headers: getAuthHeaders()
				});
				modInspectOverlay.classList.remove("open");
				modInspectOverlay.hidden = true;
				await loadModerationQueue(viewerUser);
			});
			modInspectActions.appendChild(delPostBtn);
		} else {
			const clearPostsBtn = document.createElement("button");
			clearPostsBtn.type = "button";
			clearPostsBtn.className = "btn-timer secondary";
			clearPostsBtn.textContent = "Xóa toàn bộ bài viết";
			clearPostsBtn.addEventListener("click", async () => {
				if (!window.confirm("Xóa toàn bộ bài viết của tài khoản này?")) return;
				clearPostsBtn.disabled = true;
				await fetch(`${API_BASE}/api/moderation/users/${encodeURIComponent(item.targetId)}/posts`, {
					method: "DELETE",
					credentials: "include",
					headers: getAuthHeaders()
				});
				modInspectOverlay.classList.remove("open");
				modInspectOverlay.hidden = true;
				await loadModerationQueue(viewerUser);
			});
			modInspectActions.appendChild(clearPostsBtn);

			if (viewerUser?.isAdmin && !item.account?.isAdmin) {
				const delAccBtn = document.createElement("button");
				delAccBtn.type = "button";
				delAccBtn.className = "btn-auth";
				delAccBtn.style.width = "auto";
				delAccBtn.style.background = "#b42318";
				delAccBtn.textContent = "Xóa tài khoản";
				delAccBtn.addEventListener("click", async () => {
					if (!window.confirm("Xóa vĩnh viễn tài khoản này? Hành động không thể hoàn tác.")) return;
					delAccBtn.disabled = true;
					await fetch(`${API_BASE}/api/moderation/users/${encodeURIComponent(item.targetId)}`, {
						method: "DELETE",
						credentials: "include",
						headers: getAuthHeaders()
					});
					modInspectOverlay.classList.remove("open");
					modInspectOverlay.hidden = true;
					await loadModerationQueue(viewerUser);
				});
				modInspectActions.appendChild(delAccBtn);
			}
		}

		modInspectOverlay.hidden = false;
		requestAnimationFrame(() => modInspectOverlay.classList.add("open"));
	}

	function renderModerationList() {
		if (!modQueueList) return;
		const items = activeModTab === "posts" ? moderationData.reportedPosts : moderationData.reportedUsers;
		modQueueList.replaceChildren();
		if (!items.length) {
			modQueueList.innerHTML = `<p style="color:#657b8f; font-size:13px;">Không có mục nào đang bị báo cáo.</p>`;
			return;
		}
		items.forEach(item => {
			const card = document.createElement("button");
			card.type = "button";
			card.className = "mod-queue-card";
			const info = document.createElement("div");
			info.className = "mod-queue-info";
			if (activeModTab === "posts") {
				const title = document.createElement("strong");
				title.textContent = `Bài viết của ${item.post?.name || "Thành viên"}`;
				const preview = document.createElement("span");
				preview.textContent = (item.post?.content || item.post?.resource_title || "(Chỉ có ảnh)").slice(0, 90);
				info.append(title, preview);
			} else {
				const title = document.createElement("strong");
				title.textContent = item.account?.name || "Tài khoản";
				const preview = document.createElement("span");
				preview.textContent = item.account?.email || item.targetId;
				info.append(title, preview);
			}
			const badge = document.createElement("span");
			badge.className = "mod-count-badge";
			badge.textContent = `${item.reportCount} báo cáo`;
			card.append(info, badge);
			card.addEventListener("click", () => openModInspect(activeModTab === "posts" ? "post" : "user", item));
			modQueueList.appendChild(card);
		});
	}

	async function loadModerationQueue(user) {
		if (!modPanel) return;
		const canModerate = Boolean(user && (user.isAdmin || user.isModerator));
		modPanel.hidden = !canModerate;
		if (!canModerate) return;
		try {
			const res = await fetch(`${API_BASE}/api/reports`, { credentials: "include", headers: getAuthHeaders() });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) return;
			moderationData = {
				reportedPosts: Array.isArray(data.reportedPosts) ? data.reportedPosts : [],
				reportedUsers: Array.isArray(data.reportedUsers) ? data.reportedUsers : []
			};
			document.getElementById("mod-posts-count").textContent = String(moderationData.reportedPosts.length);
			document.getElementById("mod-users-count").textContent = String(moderationData.reportedUsers.length);
			renderModerationList();
		} catch {}
	}

	// --- HIỂN THỊ BÀI VIẾT TRONG PROFILE (CÁ NHÂN / BẠN BÈ / FANPAGE) ---
	function renderPostsList(container, posts, fallbackAvatar, emptyText, options = {}) {
		const { canDeleteFn = () => false, onReload = async () => {}, interactive = false } = options;
		document.getElementById("stat-posts").textContent = String(posts.length);
		const totalLikes = posts.reduce((sum, post) => sum + (post.likes || 0), 0);
		document.getElementById("stat-likes").textContent = String(totalLikes);

		container.replaceChildren();
		if (!posts.length) {
			container.innerHTML = `<p style='text-align:center; color:#65676b; background:white; padding:20px; border-radius:12px;'>${escapeHtml(emptyText)}</p>`;
			return;
		}

		posts.forEach(post => {
			const postEl = document.createElement("article");
			postEl.className = "post-card";
			const imgHtml = post.image && post.image.trim() ? `<img src="${escapeHtml(post.image)}" class="post-card-image" loading="lazy" alt="Ảnh bài viết">` : "";
			const avatar = escapeHtml(post.avatar || fallbackAvatar || "./DIEU.png");
			const bodyHtml = post.contentHtml
				? sanitizeRichHtml(post.contentHtml)
				: escapeHtml(post.content || "").replace(/\n/g, "<br>");
			const savedComments = (() => {
				try {
					return typeof post.comments === "string" ? JSON.parse(post.comments) : (post.comments || []);
				} catch {
					return [];
				}
			})();
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

			postEl.innerHTML = `
				<div class="post-card-header">
					<img src="${avatar}" class="post-card-avatar" style="object-fit:cover;" alt="">
					<div>
						<h4 class="post-card-author">${escapeHtml(post.name || "")}</h4>
						<span class="post-card-time">${new Date(post.createdAt).toLocaleString("vi-VN")}</span>
					</div>
				</div>
				<div class="post-card-body">
					<div class="post-rich-content">${bodyHtml}</div>
					${imgHtml}
				</div>
				<div class="post-status-info">
					<span class="like-count-text">
						<img src="./icon-like.png" class="status-like-icon" alt="Like">
						<span class="count">${post.likes || 0}</span> lượt thích
					</span>
					<span class="comment-count-text">
						<img src="./icon-comment.png" class="status-comment-icon" alt="Comment">
						<span class="comment-count">${savedComments.length}</span> bình luận
					</span>
				</div>
				${interactive ? `
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
						<img src="${escapeHtml(viewerUser?.avatar || "./DIEU.png")}" class="user-avatar-mini" style="width:32px; height:32px;" alt="">
						<input type="text" class="comment-field" placeholder="${viewerUser ? "Viết bình luận..." : "Đăng nhập để bình luận..."}">
					</div>
					<div class="comments-list">${commentsListHtml}</div>
				</div>` : ""}
			`;

			if (interactive) {
				const likeBtn = postEl.querySelector(".btn-like");
				likeBtn?.addEventListener("click", async () => {
					if (!viewerUser) return window.alert?.("Hãy đăng nhập để thả tim bài viết.");
					likeBtn.disabled = true;
					try {
						const res = await fetch(`${API_BASE}/api/posts/${encodeURIComponent(post.id)}/like`, {
							method: "POST",
							credentials: "include",
							headers: getAuthHeaders({ "Content-Type": "application/json" }),
							body: JSON.stringify({ liked: !likeBtn.classList.contains("liked") })
						});
						if (res.ok) await onReload();
					} finally {
						likeBtn.disabled = false;
					}
				});

				const commentBtn = postEl.querySelector(".btn-comment");
				const commentSec = postEl.querySelector(".comment-section");
				const commentInput = postEl.querySelector(".comment-field");
				commentBtn?.addEventListener("click", () => {
					const show = commentSec.style.display === "none";
					commentSec.style.display = show ? "block" : "none";
					if (show) commentInput.focus();
				});
				commentInput?.addEventListener("keypress", async e => {
					if (e.key !== "Enter" || !commentInput.value.trim()) return;
					e.preventDefault();
					if (!viewerUser) return window.alert?.("Hãy đăng nhập để bình luận.");
					commentInput.disabled = true;
					try {
						const res = await fetch(`${API_BASE}/api/posts/${encodeURIComponent(post.id)}/comments`, {
							method: "POST",
							credentials: "include",
							headers: getAuthHeaders({ "Content-Type": "application/json" }),
							body: JSON.stringify({ content: commentInput.value.trim() })
						});
						if (!res.ok) throw new Error();
						commentInput.value = "";
						await onReload();
					} catch {
						commentInput.disabled = false;
					}
				});
			}

			const actions = document.createElement("div");
			actions.className = "post-card-actions";
			if (viewerUser && String(post.userId || "") !== String(viewerUser.id || "")) {
				const rptBtn = document.createElement("button");
				rptBtn.type = "button";
				rptBtn.className = "post-report-button";
				rptBtn.textContent = "⚑ Báo cáo";
				rptBtn.addEventListener("click", () => {
					openReportModal("post", post.id, `Báo cáo bài viết của ${post.name || "thành viên"}`);
				});
				actions.appendChild(rptBtn);
			}
			if (canDeleteFn(post)) {
				const deleteButton = document.createElement("button");
				deleteButton.type = "button";
				deleteButton.className = "post-delete-button";
				deleteButton.textContent = "Xóa bài viết";
				deleteButton.addEventListener("click", async () => {
					if (!window.confirm("Bạn có chắc muốn xóa bài viết này?")) return;
					deleteButton.disabled = true;
					try {
						const res = await fetch(`${API_BASE}/api/posts/${encodeURIComponent(post.id)}`, {
							method: "DELETE",
							credentials: "include",
							headers: getAuthHeaders()
						});
						const data = await readApiResponse(res);
						if (!res.ok) throw new Error(data.error || "Không thể xóa bài viết.");
						await onReload();
					} catch (error) {
						window.alert?.(requestErrorMessage(error, "Không thể xóa bài viết."));
						deleteButton.disabled = false;
					}
				});
				actions.appendChild(deleteButton);
			}
			if (actions.children.length) postEl.appendChild(actions);
			container.appendChild(postEl);
		});
	}

	// --- CHẾ ĐỘ XEM HỒ SƠ CÁ NHÂN ---
	function showProfile(user) {
		activeClub = null;
		window.updateNavAvatar?.(user);
		window.updateHomeAccess?.(user);
		if (authContainer) authContainer.style.display = "none";
		if (profileContainer) profileContainer.style.display = document.getElementById("newsfeed-container") ? "none" : "block";
		if (!profileContainer) return;

		const extras = document.querySelector(".profile-extras");
		if (extras) extras.style.display = "";
		document.querySelectorAll(".profile-extra-form, .profile-interest-form").forEach(f => { f.style.display = ""; });

		document.getElementById("btn-edit-profile").style.display = "inline-block";
		document.getElementById("btn-logout").style.display = "inline-block";
		document.getElementById("btn-friend-message").hidden = true;
		document.getElementById("btn-friend-back").hidden = true;
		document.getElementById("btn-report-account").hidden = true;

		document.getElementById("user-display-name").textContent = user.name;
		document.getElementById("user-display-email").textContent = user.email;
		document.getElementById("user-display-class").textContent = user.studentClass ? `Lớp ${user.studentClass}` : "Học sinh trường NQD";
		document.getElementById("user-display-bio").textContent = user.bio || "Chào mừng đến với góc học tập của mình trên DIEUNW!";
		renderProfileRoles(user);
		loadAdminTools(user);
		loadModerationQueue(user);

		document.getElementById("user-display-avatar").src = user.avatar || "./DIEU.png";
		const coverEl = document.getElementById("profile-cover-image");
		if (coverEl) {
			coverEl.hidden = !user.cover;
			if (user.cover) coverEl.src = user.cover;
			else coverEl.removeAttribute("src");
		}

		loadMyPosts(user.id, user.avatar);
		window.dispatchEvent(new Event("dieu-profile-ready"));
	}

	async function loadMyPosts(userId, userAvatar) {
		const container = document.getElementById("my-posts-container");
		if (!container) return;
		try {
			const res = await fetch(`${API_BASE}/api/posts`, { credentials: "include", headers: getAuthHeaders() });
			const data = await readApiResponse(res);
			if (!res.ok) throw new Error();
			const myPosts = (data.posts || []).filter(p => String(p.userId) === String(userId) && !p.clubId && p.type !== "study-resource");
			renderPostsList(container, myPosts, userAvatar, "Bạn chưa đăng bài viết nào trên DIEUNW.", {
				canDeleteFn: () => true,
				onReload: () => loadMyPosts(userId, userAvatar),
				interactive: true
			});
		} catch {
			container.innerHTML = "<p style='color:red; text-align:center;'>Không thể tải lịch sử bài viết.</p>";
		}
	}

	// --- CHẾ ĐỘ XEM HỒ SƠ BẠN BÈ (?userId=...) ---
	async function loadFriendProfile(friendId, currentUser) {
		if (authContainer) authContainer.style.display = "none";
		if (profileContainer) profileContainer.style.display = "block";
		activeClub = null;

		document.getElementById("btn-edit-profile").style.display = "none";
		document.getElementById("btn-logout").style.display = "none";
		document.getElementById("admin-tools").hidden = true;
		document.getElementById("moderation-panel").hidden = true;
		document.getElementById("club-post-composer").style.display = "none";
		document.querySelectorAll(".profile-extra-form, .profile-interest-form").forEach(f => { f.style.display = "none"; });

		try {
			const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(friendId)}/profile`, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await readApiResponse(res);
			if (!res.ok) throw new Error(data.error || "Không tìm thấy hồ sơ người dùng.");

			const friend = data.user;
			document.title = `DIEUNW - Hồ sơ ${friend.name || ""}`;
			document.getElementById("user-display-name").textContent = friend.name || "Thành viên DIEUNW";
			document.getElementById("user-display-email").textContent = friend.email || "";
			document.getElementById("user-display-class").textContent = friend.studentClass ? `Lớp ${friend.studentClass}` : "Học sinh trường NQD";
			document.getElementById("user-display-bio").textContent = friend.bio || "Thành viên cộng đồng DIEUNW";
			document.getElementById("user-display-avatar").src = friend.avatar || "./DIEU.png";

			const coverEl = document.getElementById("profile-cover-image");
			if (coverEl) {
				coverEl.hidden = !friend.cover;
				if (friend.cover) coverEl.src = friend.cover;
				else coverEl.removeAttribute("src");
			}
			renderProfileRoles(friend);

			const msgBtn = document.getElementById("btn-friend-message");
			const backBtn = document.getElementById("btn-friend-back");
			const reportBtn = document.getElementById("btn-report-account");
			if (backBtn) backBtn.hidden = false;
			if (msgBtn) {
				if (friend.relationship === "friend") {
					msgBtn.hidden = false;
					msgBtn.href = `./messages.html?with=${encodeURIComponent(friend.id)}`;
				} else {
					msgBtn.hidden = true;
				}
			}
			if (reportBtn && currentUser) {
				reportBtn.hidden = false;
				reportBtn.onclick = () => openReportModal("user", friend.id, `Báo cáo tài khoản: ${friend.name} (${friend.email})`);
			}

			window.renderFriendSections?.(data.sections || { achievements: [], interests: [], photos: [] });

			const heading = document.getElementById("posts-section-heading");
			if (heading) heading.textContent = `Bài viết công khai của ${friend.name || "bạn bè"}`;

			const container = document.getElementById("my-posts-container");
			renderPostsList(container, data.posts || [], friend.avatar || "./DIEU.png", "Người dùng này chưa có bài viết công khai nào.", {
				canDeleteFn: () => Boolean(currentUser && (currentUser.isAdmin || currentUser.isModerator)),
				onReload: () => loadFriendProfile(friendId, currentUser),
				interactive: true
			});
		} catch (error) {
			document.getElementById("my-posts-container").innerHTML = `<p style="color:#b42318;text-align:center;">${escapeHtml(error.message || "Không tải được hồ sơ.")}</p>`;
		}
	}

	// --- CHẾ ĐỘ FANPAGE CLB (?clubId=...) + RICH TEXT + @TAG + UPLOAD ẢNH ---
	const clubRichEditor = document.getElementById("club-post-rich-editor");
	const clubHeadingSelect = document.getElementById("club-heading-select");
	const clubColorPicker = document.getElementById("club-color-picker");
	const clubMentionTrigger = document.getElementById("club-mention-trigger");
	const clubMentionDropdown = document.getElementById("club-mention-dropdown");
	const clubImageFile = document.getElementById("club-post-image-file");
	const clubImageFilename = document.getElementById("club-post-image-filename");
	const clubImageClear = document.getElementById("club-post-image-clear");
	const clubImagePreviewWrap = document.getElementById("club-post-image-preview-wrap");
	const clubImagePreview = document.getElementById("club-post-image-preview");
	let clubPostImageDataUrl = "";
	let clubSavedRange = null;
	let clubUsersCache = [];

	function saveClubSel() {
		const sel = window.getSelection();
		if (sel && sel.rangeCount && clubRichEditor?.contains(sel.anchorNode)) {
			clubSavedRange = sel.getRangeAt(0).cloneRange();
		}
	}
	function restoreClubSel() {
		clubRichEditor?.focus();
		if (clubSavedRange) {
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(clubSavedRange);
		}
	}

	document.querySelectorAll("#club-rte-wrapper .rte-btn[data-cmd]").forEach(btn => {
		btn.addEventListener("mousedown", e => {
			e.preventDefault();
			restoreClubSel();
			document.execCommand(btn.dataset.cmd, false, null);
			saveClubSel();
		});
	});
	clubHeadingSelect?.addEventListener("change", () => {
		restoreClubSel();
		document.execCommand("formatBlock", false, clubHeadingSelect.value);
		saveClubSel();
	});
	clubColorPicker?.addEventListener("input", () => {
		restoreClubSel();
		document.execCommand("foreColor", false, clubColorPicker.value);
		saveClubSel();
	});
	clubMentionTrigger?.addEventListener("mousedown", e => {
		e.preventDefault();
		restoreClubSel();
		document.execCommand("insertText", false, "@");
		saveClubSel();
		updateClubMentions();
	});

	async function updateClubMentions() {
		const sel = window.getSelection();
		if (!sel || !sel.rangeCount || !clubRichEditor?.contains(sel.anchorNode)) return;
		const r = sel.getRangeAt(0);
		if (r.startContainer.nodeType !== Node.TEXT_NODE) {
			clubMentionDropdown.hidden = true;
			return;
		}
		const before = r.startContainer.textContent.slice(0, r.startOffset);
		const m = before.match(/@([^\s@]{0,40})$/);
		if (!m) {
			clubMentionDropdown.hidden = true;
			return;
		}
		if (!clubUsersCache.length) {
			try {
				const res = await fetch(`${API_BASE}/api/users`, { credentials: "include", headers: getAuthHeaders() });
				const d = await res.json().catch(() => ({}));
				if (Array.isArray(d.users)) clubUsersCache = d.users;
			} catch {}
		}
		const q = m[1].toLowerCase();
		const list = clubUsersCache.filter(u => (u.email || "").toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q)).slice(0, 6);
		if (!list.length) {
			clubMentionDropdown.hidden = true;
			return;
		}
		clubMentionDropdown.replaceChildren();
		list.forEach(user => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "mention-option";
			btn.innerHTML = `<img src="${escapeHtml(user.avatar || "./DIEU.png")}" alt=""><div class="mention-option-meta"><strong>${escapeHtml(user.name || user.email)}</strong><span>${escapeHtml(user.email || "")}</span></div>`;
			btn.addEventListener("mousedown", e => {
				e.preventDefault();
				const range = document.createRange();
				range.setStart(r.startContainer, r.startOffset - m[0].length);
				range.setEnd(r.startContainer, r.startOffset);
				range.deleteContents();
				const a = document.createElement("a");
				a.className = "mention-tag";
				a.href = `./profile.html?userId=${encodeURIComponent(user.id)}`;
				a.setAttribute("contenteditable", "false");
				a.textContent = `@${user.email}`;
				const sp = document.createTextNode("\u00A0");
				range.insertNode(sp);
				range.insertNode(a);
				const nr = document.createRange();
				nr.setStartAfter(sp);
				nr.collapse(true);
				const s = window.getSelection();
				s.removeAllRanges();
				s.addRange(nr);
				clubMentionDropdown.hidden = true;
			});
			clubMentionDropdown.appendChild(btn);
		});
		clubMentionDropdown.hidden = false;
	}

	clubRichEditor?.addEventListener("keyup", () => { saveClubSel(); updateClubMentions(); });
	clubRichEditor?.addEventListener("mouseup", saveClubSel);
	clubRichEditor?.addEventListener("input", updateClubMentions);

	clubImageFile?.addEventListener("change", async () => {
		const f = clubImageFile.files?.[0];
		if (!f) return;
		clubImageFilename.textContent = "Đang xử lý ảnh...";
		try {
			clubPostImageDataUrl = await compressImageFile(f);
			clubImageFilename.textContent = f.name;
			clubImagePreview.src = clubPostImageDataUrl;
			clubImagePreviewWrap.hidden = false;
			clubImageClear.hidden = false;
		} catch (err) {
			clubPostImageDataUrl = "";
			clubImageFilename.textContent = err.message || "Lỗi đọc ảnh";
		}
	});
	clubImageClear?.addEventListener("click", () => {
		clubPostImageDataUrl = "";
		clubImageFile.value = "";
		clubImageFilename.textContent = "Không có ảnh";
		clubImagePreview.removeAttribute("src");
		clubImagePreviewWrap.hidden = true;
		clubImageClear.hidden = true;
	});

	async function loadClubProfile(targetClubId, currentUser) {
		if (authContainer) authContainer.style.display = "none";
		if (profileContainer) profileContainer.style.display = "block";
		const extras = document.querySelector(".profile-extras");
		if (extras) extras.style.display = "none";
		document.getElementById("moderation-panel").hidden = true;

		try {
			const response = await fetch(`${API_BASE}/api/clubs/${encodeURIComponent(targetClubId)}`, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không tìm thấy CLB.");
			const club = data.club;
			activeClub = club;

			document.title = `DIEUNW - ${club.name}`;
			document.getElementById("user-display-name").textContent = club.name;
			const managersList = Array.isArray(club.managerEmails) ? club.managerEmails : [club.managerEmail];
			document.getElementById("user-display-email").textContent = `Quản lý: ${managersList.filter(Boolean).join(", ")}`;
			document.getElementById("user-display-class").textContent = "Câu lạc bộ trực thuộc trường NQD";
			document.getElementById("user-display-bio").textContent = club.bio || `Fanpage chính thức của ${club.name}`;
			document.querySelector(".verified-badge").textContent = "✓ Fanpage CLB chính thức";
			document.getElementById("user-display-avatar").src = club.logo || "./DIEU.png";

			const coverEl = document.getElementById("profile-cover-image");
			if (coverEl) {
				coverEl.hidden = !club.cover;
				if (club.cover) coverEl.src = club.cover;
				else coverEl.removeAttribute("src");
			}

			const roleContainer = document.getElementById("profile-role-tags");
			roleContainer.replaceChildren();
			const fanpageTag = document.createElement("span");
			fanpageTag.className = "profile-role-tag";
			fanpageTag.textContent = "✓ FANPAGE CLB";
			fanpageTag.style.setProperty("--club-color", club.tagColor || "#1769aa");
			roleContainer.append(fanpageTag);

			const normalizedManagers = managersList.map(e => String(e || "").toLowerCase());
			const isManager = Boolean(currentUser && (normalizedManagers.includes(currentUser.email.toLowerCase()) || currentUser.isAdmin));

			document.getElementById("btn-logout").style.display = "none";
			document.getElementById("admin-tools").hidden = true;
			document.getElementById("posts-section-heading").textContent = `Bài viết của ${club.name}`;

			const btnEdit = document.getElementById("btn-edit-profile");
			const clubComposer = document.getElementById("club-post-composer");
			if (isManager) {
				btnEdit.style.display = "inline-block";
				btnEdit.textContent = "Chỉnh sửa Fanpage";
				clubComposer.style.display = "flex";
			} else {
				btnEdit.style.display = "none";
				clubComposer.style.display = "none";
			}

			renderPostsList(
				document.getElementById("my-posts-container"),
				data.posts || [],
				club.logo || "./DIEU.png",
				"Fanpage CLB chưa có bài viết nào.",
				{
					canDeleteFn: post => Boolean(currentUser && (String(post.userId) === String(currentUser.id) || isManager || currentUser.isModerator)),
					onReload: () => loadClubProfile(targetClubId, currentUser),
					interactive: true
				}
			);
		} catch (error) {
			window.alert?.(requestErrorMessage(error, "Lỗi tải dữ liệu Fanpage CLB."));
		}
	}

	document.getElementById("club-post-composer")?.addEventListener("submit", async event => {
		event.preventDefault();
		if (!clubId) return;
		const submitBtn = event.currentTarget.querySelector("button[type='submit']");
		const content = (clubRichEditor?.innerText || "").trim();
		const contentHtml = sanitizeRichHtml(clubRichEditor?.innerHTML || "");
		if (!content && !clubPostImageDataUrl) return window.alert?.("Vui lòng nhập nội dung bài viết hoặc chọn ảnh!");

		submitBtn.disabled = true;
		try {
			const response = await fetch(`${API_BASE}/api/posts`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					content: content || " ",
					contentHtml,
					image: clubPostImageDataUrl,
					clubId,
					visibility: "public"
				})
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không thể đăng bài cho CLB.");
			if (clubRichEditor) clubRichEditor.innerHTML = "";
			clubImageClear?.click();
			await loadClubProfile(clubId, viewerUser);
		} catch (error) {
			window.alert?.(requestErrorMessage(error, "Lỗi khi đăng bài cho Fanpage CLB."));
		} finally {
			submitBtn.disabled = false;
		}
	});
});

// Bật/tắt hiện mật khẩu
const passwordInput = document.getElementById("login-password");
const toggleBtn = document.getElementById("toggle-password");
const eyeIcon = document.getElementById("eye-icon");
if (passwordInput && toggleBtn && eyeIcon) {
	toggleBtn.addEventListener("click", () => {
		const isPassword = passwordInput.type === "password";
		passwordInput.type = isPassword ? "text" : "password";
		eyeIcon.innerHTML = isPassword
			? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
			: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
	});
}