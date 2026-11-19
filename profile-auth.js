const API_BASE = "https://dieunw.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
	window.dieunwCreateProgressBar = function (host) {
		if (!host) return { set() {}, hide() {} };
		host.hidden = false;
		host.innerHTML = `
			<div style="width:100%;height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:8px 0 4px;">
				<div class="bar-fill" style="width:0%;height:100%;background:#1769aa;transition:width .2s;"></div>
			<div class="bar-label" style="font-size:12px;color:#65676b;"></div>
		`;
		const fill = host.querySelector(".bar-fill");
		const label = host.querySelector(".bar-label");
		return {
			set(pct, text = "") {
				host.hidden = false;
				if (fill) fill.style.width = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
				if (label) label.textContent = text;
			},
			hide() {
				host.hidden = true;
				host.innerHTML = "";
			}
		};
	};
	function createSafeProgressBar(host) {
		const raw = window.dieunwCreateProgressBar ? window.dieunwCreateProgressBar(host) : null;
		if (raw && typeof raw.set === "function") {
			return raw;
		}
		// Fallback nếu dieunwCreateProgressBar chưa định nghĩa hoặc thiếu .set()
		if (host) {
			host.innerHTML = `
				<div style="width:100%;background:#e5e7eb;border-radius:999px;overflow:hidden;height:8px;margin-top:8px;">
					<div class="safe-bar-fill" style="width:0%;height:100%;background:#1769aa;transition:width .2s;"></div>
				</div>
				<div class="safe-bar-text" style="font-size:12px;color:#65676b;margin-top:4px;"></div>
			`;
			host.hidden = false;
		}
		return {
			set(pct, text) {
				if (typeof raw?.update === "function") return raw.update(pct, text);
				if (!host) return;
				host.hidden = false;
				const fill = host.querySelector(".safe-bar-fill");
				const label = host.querySelector(".safe-bar-text");
				if (fill) fill.style.width = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
				if (label && text) label.textContent = text;
			},
			hide() {
				if (typeof raw?.hide === "function") return raw.hide();
				if (host) {
					host.hidden = true;
					host.innerHTML = "";
				}
			}
		};
	}

	const authContainer = document.getElementById("auth-container");
	const profileContainer = document.getElementById("profile-container");
	const loginView = document.getElementById("login-view");
	const registerView = document.getElementById("register-view");
	const forgotView = document.getElementById("forgot-view");

	const urlParams = new URLSearchParams(window.location.search);
	const clubId = urlParams.get("clubId");
	const viewUserId = urlParams.get("userId");

	let pendingAvatarData = undefined;
	let pendingCoverData = undefined;
	let activeClubData = null;
	let activeViewerUser = null;
	let activePostsFilter = "mine";

	function resolveMedia(url) {
		return window.dieunwResolveMedia ? window.dieunwResolveMedia(url) : String(url || "");
	}

	function requestErrorMessage(error, fallback) {
		if (location.protocol === "file:") {
			return "Không kết nối được backend khi mở bằng file://.";
		}
		return error?.message || fallback;
	}

	async function readApiResponse(response) {
		if (!response.headers.get("content-type")?.includes("application/json")) {
			throw new Error("Không nhận được phản hồi JSON từ máy chủ.");
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

	// Dropdown navbar & Dark mode toggle trên trang profile
	const brandToggle = document.querySelector(".nav-brand-toggle");
	const mainNavMenu = document.getElementById("main-nav-menu");
	brandToggle?.addEventListener("click", e => {
		e.stopPropagation();
		if (!mainNavMenu) return;
		const nextHidden = !mainNavMenu.hidden;
		mainNavMenu.hidden = nextHidden;
		brandToggle.setAttribute("aria-expanded", String(!nextHidden));
	});
	document.addEventListener("click", e => {
		if (mainNavMenu && !mainNavMenu.hidden && !mainNavMenu.contains(e.target) && !brandToggle?.contains(e.target)) {
			mainNavMenu.hidden = true;
			brandToggle?.setAttribute("aria-expanded", "false");
		}
	});

	const themeBtn = document.getElementById("nav-theme-toggle");
	if (localStorage.getItem("dieunw_dark_mode") === "1") {
		document.body.classList.add("dark-mode");
		if (themeBtn) themeBtn.textContent = "☀️";
	}
	themeBtn?.addEventListener("click", () => {
		const isDark = document.body.classList.toggle("dark-mode");
		localStorage.setItem("dieunw_dark_mode", isDark ? "1" : "0");
		themeBtn.textContent = isDark ? "☀️" : "🌙";
	});

	if (location.hash === "#register" && loginView && registerView) {
		loginView.style.display = "none";
		registerView.style.display = "block";
	}

	// =========================================================
	// KHỞI ĐỘNG & TẢI HỒ SƠ
	// =========================================================
	fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
		.then(res => res.json())
		.then(async data => {
			const currentUser = data.user || null;
			activeViewerUser = currentUser;

			if (currentUser) {
				localStorage.setItem("dieuNwUser", JSON.stringify(currentUser));
				window.updateNavAvatar?.(currentUser);
			} else {
				localStorage.removeItem("dieuNwUser");
				localStorage.removeItem("session_token");
				window.updateNavAvatar?.(null);
			}

			if (clubId) {
				await loadClubProfile(clubId, currentUser);
				return;
			}

			if (viewUserId && (!currentUser || String(viewUserId) !== String(currentUser.id))) {
				await loadPublicProfileShell(viewUserId, currentUser);
				return;
			}

			if (currentUser) {
				showProfile(currentUser, currentUser);
			}
		})
		.catch(async () => {
			if (clubId) await loadClubProfile(clubId, null);
			else if (viewUserId) await loadPublicProfileShell(viewUserId, null);
		});

	async function loadPublicProfileShell(targetId, viewer) {
		try {
			const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(targetId)}/profile`, { credentials: "include" });
			const data = await readApiResponse(res);
			if (!res.ok) throw new Error(data.error || "Không tìm thấy hồ sơ học sinh.");
			showProfile(data.user, viewer);
		} catch (err) {
			alert(requestErrorMessage(err, "Không thể tải hồ sơ người dùng."));
		}
	}

	// =========================================================
	// ĐĂNG NHẬP / ĐĂNG KÝ / QUÊN MẬT KHẨU
	// =========================================================
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

	document.getElementById("btn-login")?.addEventListener("click", async () => {
		const email = document.getElementById("login-email").value.trim().toLowerCase();
		const password = document.getElementById("login-password").value;
		const btnLogin = document.getElementById("btn-login");
		if (!email || !password) {
			alert("Vui lòng nhập đầy đủ Email và Mật khẩu!");
			return;
		}
		btnLogin.innerText = "Đang kiểm tra...";
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
			activeViewerUser = data.user;
			showProfile(data.user, data.user);
		} catch (error) {
			alert(requestErrorMessage(error, "Không thể kết nối máy chủ."));
		} finally {
			btnLogin.innerText = "Đăng nhập";
			btnLogin.disabled = false;
		}
	});

	document.getElementById("btn-reg-send-otp")?.addEventListener("click", async () => {
		const name = document.getElementById("reg-name").value.trim();
		const email = document.getElementById("reg-email").value.trim().toLowerCase();
		const password = document.getElementById("reg-password").value;
		const btnSend = document.getElementById("btn-reg-send-otp");
		if (!name || !email || !password) return alert("Vui lòng điền đầy đủ thông tin đăng ký!");
		if (!email.endsWith("@nqd.edu.vn")) return alert("Bạn phải dùng Email trường cấp có đuôi @nqd.edu.vn!");
		if (password.length < 8) return alert("Mật khẩu phải có ít nhất 8 ký tự!");
		btnSend.innerText = "Đang gửi mã OTP...";
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
			if (notice) {
				notice.textContent = data.devCode
					? `Mã xác nhận (dev): ${data.devCode}`
					: "Mã xác nhận đã được gửi đến email trường của bạn.";
			}
			document.getElementById("reg-step-1").style.display = "none";
			document.getElementById("reg-step-2").style.display = "block";
		} catch (error) {
			alert(requestErrorMessage(error, "Không thể gửi mã xác nhận."));
		} finally {
			btnSend.innerText = "Gửi mã xác nhận Email";
			btnSend.disabled = false;
		}
	});

	document.getElementById("btn-reg-verify")?.addEventListener("click", async () => {
		const userOtp = document.getElementById("reg-otp-input").value.trim();
		const btnVerify = document.getElementById("btn-reg-verify");
		btnVerify.innerText = "Đang tạo tài khoản...";
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
			activeViewerUser = data.user;
			alert("Đăng ký tài khoản thành công!");
			showProfile(data.user, data.user);
		} catch (error) {
			alert(requestErrorMessage(error, "Lỗi khi tạo tài khoản."));
		} finally {
			btnVerify.innerText = "Hoàn tất Đăng ký";
			btnVerify.disabled = false;
		}
	});

	document.getElementById("btn-forgot-send-otp")?.addEventListener("click", async () => {
		const email = document.getElementById("forgot-email").value.trim().toLowerCase();
		const btnSend = document.getElementById("btn-forgot-send-otp");
		if (!email.endsWith("@nqd.edu.vn")) return alert("Vui lòng nhập đúng email trường @nqd.edu.vn!");
		btnSend.innerText = "Đang gửi mã khôi phục...";
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
			if (notice) {
				notice.textContent = data.devCode
					? `Mã xác nhận (dev): ${data.devCode}`
					: "Mã khôi phục đã được gửi đến email của bạn.";
			}
			document.getElementById("forgot-step-1").style.display = "none";
			document.getElementById("forgot-step-2").style.display = "block";
		} catch (error) {
			alert(requestErrorMessage(error, "Lỗi gửi mã khôi phục."));
		} finally {
			btnSend.innerText = "Gửi mã khôi phục";
			btnSend.disabled = false;
		}
	});

	document.getElementById("btn-forgot-reset")?.addEventListener("click", async () => {
		const userOtp = document.getElementById("forgot-otp-input").value.trim();
		const newPassword = document.getElementById("forgot-new-password").value;
		const btnReset = document.getElementById("btn-forgot-reset");
		if (newPassword.length < 8) return alert("Mật khẩu mới phải có ít nhất 8 ký tự!");
		btnReset.innerText = "Đang cập nhật...";
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
			activeViewerUser = data.user;
			alert("Đổi mật khẩu thành công! Hệ thống đã tự động đăng nhập.");
			showProfile(data.user, data.user);
		} catch (error) {
			alert(requestErrorMessage(error, "Lỗi khi cập nhật mật khẩu mới!"));
		} finally {
			btnReset.innerText = "Đổi mật khẩu mới";
			btnReset.disabled = false;
		}
	});

	document.getElementById("btn-logout")?.addEventListener("click", async () => {
		await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
		localStorage.removeItem("dieuNwUser");
		localStorage.removeItem("session_token");
		location.reload();
	});

	// =========================================================
	// UPLOAD AVATAR / COVER TRONG FORM CHỈNH SỬA HỒ SƠ
	// =========================================================
	function bindImageFilePicker(fileId, filenameId, clearId, wrapId, previewId, onDataChange, maxSide) {
		const fileInput = document.getElementById(fileId);
		const nameEl = document.getElementById(filenameId);
		const clearBtn = document.getElementById(clearId);
		const wrapEl = document.getElementById(wrapId);
		const imgEl = document.getElementById(previewId);

		fileInput?.addEventListener("change", async () => {
			const file = fileInput.files?.[0];
			if (!file) return;
			try {
				if (nameEl) nameEl.textContent = "Đang tối ưu ảnh...";
				const compressed = window.dieunwCompressImage
					? await window.dieunwCompressImage(file, maxSide, 0.85)
					: await new Promise((res, rej) => {
						const r = new FileReader();
						r.onload = () => res(String(r.result || ""));
						r.onerror = () => rej(new Error("Lỗi đọc ảnh."));
						r.readAsDataURL(file);
					});
				onDataChange(compressed);
				if (nameEl) nameEl.textContent = file.name;
				if (imgEl) imgEl.src = compressed;
				if (wrapEl) wrapEl.hidden = false;
				if (clearBtn) clearBtn.hidden = false;
			} catch (err) {
				alert(err.message || "Không xử lý được ảnh.");
			}
		});

		clearBtn?.addEventListener("click", () => {
			if (fileInput) fileInput.value = "";
			onDataChange("");
			if (nameEl) nameEl.textContent = "Đã gỡ ảnh";
			if (wrapEl) wrapEl.hidden = true;
			clearBtn.hidden = true;
		});
	}

	bindImageFilePicker(
		"edit-avatar-file", "edit-avatar-filename", "edit-avatar-clear",
		"edit-avatar-preview-wrap", "edit-avatar-preview",
		val => { pendingAvatarData = val; }, 720
	);
	bindImageFilePicker(
		"edit-cover-file", "edit-cover-filename", "edit-cover-clear",
		"edit-cover-preview-wrap", "edit-cover-preview",
		val => { pendingCoverData = val; }, 1400
	);

	const btnEditProfile = document.getElementById("btn-edit-profile");
	const editProfileForm = document.getElementById("edit-profile-form");

	btnEditProfile?.addEventListener("click", () => {
		pendingAvatarData = undefined;
		pendingCoverData = undefined;
		if (clubId && activeClubData) {
			document.getElementById("edit-name-input").value = activeClubData.name || "";
			document.getElementById("edit-email-input").value = "";
			document.getElementById("edit-class-input").value = "";
			document.getElementById("edit-bio-input").value = activeClubData.bio || "";
		} else {
			const currentUser = JSON.parse(localStorage.getItem("dieuNwUser") || "{}");
			document.getElementById("edit-name-input").value = currentUser.name || "";
			document.getElementById("edit-email-input").value = currentUser.email || "";
			document.getElementById("edit-class-input").value = currentUser.studentClass || "";
			document.getElementById("edit-cohort-input").value = currentUser.cohort || "";
			document.getElementById("edit-alumni-checkbox").checked = Boolean(currentUser.isAlumni);
			document.getElementById("edit-bio-input").value = currentUser.bio || "";
			document.getElementById("edit-schedule-input").value = currentUser.studySchedule || "";
			document.getElementById("edit-fb-input").value = currentUser.socialFacebook || "";
			document.getElementById("edit-ig-input").value = currentUser.socialInstagram || "";
			document.getElementById("edit-gh-input").value = currentUser.socialGithub || "";
			const tiktokInput = document.getElementById("edit-tiktok-input");
			if (tiktokInput) tiktokInput.value = currentUser.socialTiktok || "";
		}
		document.getElementById("edit-avatar-filename").textContent = "Giữ nguyên ảnh hiện tại";
		document.getElementById("edit-cover-filename").textContent = "Giữ nguyên ảnh hiện tại";
		document.getElementById("edit-avatar-preview-wrap").hidden = true;
		document.getElementById("edit-cover-preview-wrap").hidden = true;
		document.getElementById("edit-avatar-clear").hidden = true;
		document.getElementById("edit-cover-clear").hidden = true;
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

		if (!newName) return alert("Tên hiển thị không được để trống!");

		const progHost = document.getElementById("edit-profile-progress");
		const bar = window.dieunwCreateProgressBar ? window.dieunwCreateProgressBar(progHost) : { set() {}, hide() {} };
		const saveBtn = document.getElementById("btn-save-profile");
		saveBtn.disabled = true;
		bar.set(15, "Đang lưu hồ sơ...");

		try {
			if (clubId) {
				const clubPayload = {
					name: newName,
					bio: newBio,
					...(pendingAvatarData !== undefined ? { logo: pendingAvatarData } : {}),
					...(pendingCoverData !== undefined ? { cover: pendingCoverData } : {})
				};
				await window.dieunwUploadWithProgress(
					`${API_BASE}/api/clubs/${encodeURIComponent(clubId)}`,
					{
						method: "PATCH",
						credentials: "include",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(clubPayload)
					},
					pct => bar.set(pct, `Đang cập nhật Fanpage... ${pct}%`)
				);
				editProfileForm.style.display = "none";
				btnEditProfile.style.display = "inline-block";
				alert("Cập nhật Fanpage CLB thành công!");
				await loadClubProfile(clubId, activeViewerUser);
				return;
			}

			const updatedFields = {
				name: newName,
				email: newEmail,
				studentClass: newClass,
				cohort: document.getElementById("edit-cohort-input").value.trim(),
				isAlumni: document.getElementById("edit-alumni-checkbox").checked,
				bio: newBio || "Chào mừng đến với góc học tập của mình trên DIEUNW!",
				studySchedule: document.getElementById("edit-schedule-input").value.trim(),
				socialFacebook: document.getElementById("edit-fb-input").value.trim(),
				socialInstagram: document.getElementById("edit-ig-input").value.trim(),
				socialGithub: document.getElementById("edit-gh-input").value.trim(),
				socialTiktok: document.getElementById("edit-tiktok-input")?.value.trim() || "",
				...(pendingAvatarData !== undefined ? { avatar: pendingAvatarData } : {}),
				...(pendingCoverData !== undefined ? { cover: pendingCoverData } : {})
			};

			const data = await window.dieunwUploadWithProgress(
				`${API_BASE}/api/users/me`,
				{
					method: "PATCH",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(updatedFields)
				},
				pct => bar.set(pct, `Đang lưu hồ sơ... ${pct}%`)
			);
			localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
			activeViewerUser = data.user;
			editProfileForm.style.display = "none";
			btnEditProfile.style.display = "inline-block";
			alert("Cập nhật hồ sơ thành công!");
			showProfile(data.user, data.user);
		} catch (error) {
			alert(requestErrorMessage(error, "Lỗi khi lưu thông tin hồ sơ!"));
		} finally {
			saveBtn.disabled = false;
			setTimeout(() => bar.hide(), 500);
		}
	});

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
			modTag.className = "profile-role-tag";
			modTag.textContent = "BAN DUYỆT BÀI";
			container.append(modTag);
		}
		if (user.isAlumni) {
			const alTag = document.createElement("span");
			alTag.className = "profile-role-tag";
			alTag.textContent = "Cựu Học Sinh";
			container.append(alTag);
		}
		for (const club of user.profileTitles || []) {
			const clubTag = document.createElement("span");
			clubTag.className = "profile-role-tag club-role-tag";
			clubTag.textContent = `Quản lý · ${club.name}`;
			clubTag.style.setProperty("--club-color", club.color);
			container.append(clubTag);
		}
	}

	function showProfile(user, viewer = user) {
		const isSelf = Boolean(viewer && String(viewer.id) === String(user.id));
		if (isSelf) window.updateNavAvatar?.(user);
		if (authContainer) authContainer.style.display = "none";
		if (profileContainer) profileContainer.style.removeProperty("display");

		document.getElementById("user-display-name").innerText = user.name || "Học sinh NQD";
		document.getElementById("user-display-email").innerText = user.email || "";
		document.getElementById("user-display-class").innerText = user.studentClass ? `Lớp ${user.studentClass}` : "Học sinh trường NQD";
		document.getElementById("user-display-bio").innerText = user.bio || "Chào mừng đến với góc học tập của mình trên DIEUNW!";
		renderProfileRoles(user);

		const avatarEl = document.getElementById("user-display-avatar");
		if (avatarEl) avatarEl.src = resolveMedia(user.avatar) || "./DIEU.avif";

		const coverEl = document.getElementById("profile-cover-image");
		if (coverEl) {
			coverEl.hidden = !user.cover;
			if (user.cover) coverEl.src = resolveMedia(user.cover);
			else coverEl.removeAttribute("src");
		}

		if (btnEditProfile) btnEditProfile.style.display = isSelf ? "inline-block" : "none";
		const btnLogout = document.getElementById("btn-logout");
		if (btnLogout) btnLogout.style.display = isSelf ? "inline-block" : "none";
		const btnMsg = document.getElementById("btn-friend-message");
		const btnBack = document.getElementById("btn-friend-back");
		const btnReport = document.getElementById("btn-report-account");
		if (btnMsg) {
			btnMsg.hidden = isSelf;
			btnMsg.href = `./messages.html?userId=${encodeURIComponent(user.id)}`;
		}
		if (btnBack) btnBack.hidden = isSelf;
		if (btnReport) btnReport.hidden = isSelf || !viewer;

		loadMyPosts(user.id, user.avatar, isSelf);
		window.dispatchEvent(new CustomEvent("dieu-profile-loaded", {
			detail: { isClub: false, targetUserId: user.id, viewerUser: viewer || null }
		}));
	}

	// Filter "Của tôi" / "Bài đã lưu"
	document.querySelectorAll("[data-post-filter]").forEach(btn => {
		btn.addEventListener("click", () => {
			activePostsFilter = btn.getAttribute("data-post-filter") || "mine";
			document.querySelectorAll("[data-post-filter]").forEach(b => b.classList.toggle("active", b === btn));
			const targetId = viewUserId || activeViewerUser?.id;
			if (targetId) loadMyPosts(targetId, activeViewerUser?.avatar, !viewUserId || String(viewUserId) === String(activeViewerUser?.id));
		});
	});

	async function loadMyPosts(userId, userAvatar, isSelf = true) {
		const myPostsContainer = document.getElementById("my-posts-container");
		if (!myPostsContainer) return;

		try {
			const endpoint = activePostsFilter === "saved" && isSelf ? "/api/bookmarks" : "/api/posts";
			const response = await fetch(`${API_BASE}${endpoint}`, { credentials: "include" });
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không thể tải bài viết.");

			const allPosts = data.posts || [];
			const list = activePostsFilter === "saved" && isSelf
				? allPosts
				: allPosts.filter(post => String(post.userId) === String(userId));

			if (activePostsFilter !== "saved") {
				document.getElementById("stat-posts").innerText = list.length;
				const totalLikes = list.reduce((sum, post) => sum + (post.likes || 0), 0);
				document.getElementById("stat-likes").innerText = totalLikes;
			}

			myPostsContainer.innerHTML = "";
			if (!list.length) {
				myPostsContainer.innerHTML = `<p style="text-align:center; color:#65676b; background:var(--bg-surface,#fff); padding:20px; border-radius:12px;">${activePostsFilter === "saved" ? "Bạn chưa lưu bài viết nào." : "Chưa có bài viết nào trên DIEUNW."}</p>`;
				return;
			}

			list.forEach(post => {
				const postEl = document.createElement("div");
				postEl.className = "post-card";
				const imgUrl = resolveMedia(post.image || "");
				const imgHtml = imgUrl ? `<img src="${escapeHtml(imgUrl)}" class="post-card-image" loading="lazy">` : "";
				const avatar = escapeHtml(resolveMedia(post.avatar || userAvatar) || "./DIEU.avif");
				const musicHtml = post.musicUrl ? `
					<div class="dieunw-inline-audio-box">
						<span class="dieunw-inline-audio-title">🎵 ${escapeHtml(post.musicTitle || "Nhạc đính kèm")}</span>
						<audio controls preload="none" src="${escapeHtml(resolveMedia(post.musicUrl))}"></audio>
					</div>
				` : "";

				postEl.innerHTML = `
					<div class="post-card-header">
						<img src="${avatar}" width="44" height="44" class="post-card-avatar" style="width:44px !important; height:44px !important; min-width:44px !important; border-radius:50% !important; object-fit:cover !important;">
						<div>
							<h4 class="post-card-author">${escapeHtml(post.name || "")}</h4>
							<span class="post-card-time">${new Date(post.createdAt).toLocaleString("vi-VN")}</span>
						</div>
					</div>
					<div class="post-card-body">
						${post.isRichHtml ? `<div>${post.content || ""}</div>` : `<p>${escapeHtml(post.content || "")}</p>`}
						${musicHtml}
						${imgHtml}
					</div>
					<div class="post-status-info">
						<span class="like-count-text">
							<img src="./icon-like.avif" class="status-like-icon" alt="Like">
							<span class="count">${post.likes || 0}</span> lượt thích
						</span>
						<span class="comment-count-text">
							<img src="./icon-comment.avif" class="status-comment-icon" alt="Comment">
							<span class="comment-count">${Array.isArray(post.comments) ? post.comments.length : 0}</span> bình luận
						</span>
					</div>
				`;

				if (post.canDelete || (activeViewerUser && String(post.userId) === String(activeViewerUser.id))) {
					const actions = document.createElement("div");
					actions.className = "post-card-actions";
					const deleteButton = document.createElement("button");
					deleteButton.type = "button";
					deleteButton.className = "post-delete-button";
					deleteButton.textContent = "Xóa bài viết";
					deleteButton.addEventListener("click", async () => {
						const ok = await window.dieunwConfirm("Bạn có chắc muốn xóa bài viết này?", { danger: true });
						if (!ok) return;
						deleteButton.disabled = true;
						try {
							const delRes = await fetch(`${API_BASE}/api/posts/${encodeURIComponent(post.id)}`, {
								method: "DELETE",
								credentials: "include"
							});
							const delData = await readApiResponse(delRes);
							if (!delRes.ok) throw new Error(delData.error || "Không thể xóa bài viết.");
							postEl.remove();
							alert("Đã xóa bài viết!");
						} catch (error) {
							alert(requestErrorMessage(error, "Không thể xóa bài viết."));
							deleteButton.disabled = false;
						}
					});
					actions.append(deleteButton);
					postEl.append(actions);
				}
				myPostsContainer.appendChild(postEl);
			});
		} catch (error) {
			myPostsContainer.innerHTML = "<p style='color:#dc2626; text-align:center;'>Không thể tải lịch sử bài viết.</p>";
		}
	}

	// =========================================================
	// FANPAGE CLB + COMPOSER KÈM NHẠC + UPLOAD %
	// =========================================================
	let clubMusicWidget = null;
	let clubImageData = "";

	async function loadClubProfile(targetClubId, currentUser) {
		if (authContainer) authContainer.style.display = "none";
		if (profileContainer) profileContainer.style.removeProperty("display");

		try {
			const response = await fetch(`${API_BASE}/api/clubs/${encodeURIComponent(targetClubId)}`, {
				credentials: "include"
			});
			const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không tìm thấy CLB.");
			const club = data.club;
			activeClubData = club;

			document.getElementById("user-display-name").innerText = club.name;
			const managersList = Array.isArray(club.managerEmails) ? club.managerEmails : [club.managerEmail];
			document.getElementById("user-display-email").innerText = `Quản lý: ${managersList.filter(Boolean).join(", ")}`;
			document.getElementById("user-display-class").innerText = "Câu lạc bộ trực thuộc trường NQD";
			document.getElementById("user-display-bio").innerText = club.bio || `Fanpage chính thức của ${club.name}`;

			const avatarEl = document.getElementById("user-display-avatar");
			if (avatarEl) avatarEl.src = resolveMedia(club.logo) || "./DIEU.avif";

			const coverEl = document.getElementById("profile-cover-image");
			if (coverEl) {
				coverEl.hidden = !club.cover;
				if (club.cover) coverEl.src = resolveMedia(club.cover);
				else coverEl.removeAttribute("src");
			}

			const roleContainer = document.getElementById("profile-role-tags");
			if (roleContainer) {
				roleContainer.replaceChildren();
				const fanpageTag = document.createElement("span");
				fanpageTag.className = "profile-role-tag";
				fanpageTag.textContent = "✓ FANPAGE CLB";
				fanpageTag.style.setProperty("--club-color", club.tagColor || "#1769aa");
				roleContainer.append(fanpageTag);
			}

			const normalizedManagers = managersList.map(e => String(e || "").toLowerCase());
			const isManager = Boolean(currentUser && (normalizedManagers.includes(currentUser.email.toLowerCase()) || currentUser.isAdmin));

			const btnLogout = document.getElementById("btn-logout");
			const clubComposer = document.getElementById("club-post-composer");
			if (btnLogout) btnLogout.style.display = "none";
			if (btnEditProfile) {
				btnEditProfile.style.display = isManager ? "inline-block" : "none";
				btnEditProfile.innerText = "Chỉnh sửa Fanpage";
			}
			if (clubComposer) {
				clubComposer.style.display = isManager ? "flex" : "none";
				if (isManager && !clubMusicWidget && window.dieunwCreateMusicAttachmentWidget) {
					clubMusicWidget = window.dieunwCreateMusicAttachmentWidget(document.getElementById("club-music-picker"));
				}
			}

			// Render bài viết của Fanpage CLB
			const myPostsContainer = document.getElementById("my-posts-container");
			if (myPostsContainer) {
				const posts = data.posts || [];
				document.getElementById("stat-posts").innerText = posts.length;
				document.getElementById("stat-likes").innerText = posts.reduce((s, p) => s + (p.likes || 0), 0);
				myPostsContainer.innerHTML = "";
				if (!posts.length) {
					myPostsContainer.innerHTML = "<p style='text-align:center; color:#65676b; background:#fff; padding:20px; border-radius:12px;'>CLB chưa có bài đăng nào.</p>";
				} else {
					posts.forEach(post => {
						const postEl = document.createElement("div");
						postEl.className = "post-card";
						const imgHtml = post.image ? `<img src="${escapeHtml(resolveMedia(post.image))}" class="post-card-image" loading="lazy">` : "";
						const musicHtml = post.musicUrl ? `
							<div class="dieunw-inline-audio-box">
								<span class="dieunw-inline-audio-title">🎵 ${escapeHtml(post.musicTitle || "Nhạc đính kèm")}</span>
								<audio controls preload="none" src="${escapeHtml(resolveMedia(post.musicUrl))}"></audio>
							</div>
						` : "";
						postEl.innerHTML = `
							<div class="post-card-header">
								<img src="${escapeHtml(resolveMedia(club.logo) || "./DIEU.avif")}" width="44" height="44" class="post-card-avatar" style="width:44px !important; height:44px !important; min-width:44px !important; border-radius:50% !important; object-fit:cover !important;">
								<div>
									<h4 class="post-card-author">${escapeHtml(club.name)}</h4>
									<span class="post-card-time">${new Date(post.createdAt).toLocaleString("vi-VN")}</span>
								</div>
							</div>
							<div class="post-card-body">
								${post.isRichHtml ? `<div>${post.content || ""}</div>` : `<p>${escapeHtml(post.content || "")}</p>`}
								${musicHtml}
								${imgHtml}
							</div>
						`;
						myPostsContainer.appendChild(postEl);
					});
				}
			}
		} catch (error) {
			alert(requestErrorMessage(error, "Lỗi tải dữ liệu Fanpage CLB."));
		}
	}

	// Rich Text toolbar & Ảnh cho Fanpage CLB
	document.querySelectorAll("#club-rte-wrapper .rte-btn[data-cmd]").forEach(btn => {
		btn.addEventListener("click", () => document.execCommand(btn.dataset.cmd, false, null));
	});
	document.getElementById("club-heading-select")?.addEventListener("change", e => {
		document.execCommand("formatBlock", false, e.target.value);
	});
	document.getElementById("club-color-picker")?.addEventListener("input", e => {
		document.execCommand("foreColor", false, e.target.value);
	});
	bindImageFilePicker(
		"club-post-image-file", "club-post-image-filename", "club-post-image-clear",
		"club-post-image-preview-wrap", "club-post-image-preview",
		val => { clubImageData = val; }, 1400
	);

	document.getElementById("club-post-composer")?.addEventListener("submit", async e => {
		e.preventDefault();
		if (!clubId) return;
		const editor = document.getElementById("club-post-rich-editor");
		const content = (editor?.innerHTML || "").trim();
		const plain = (editor?.textContent || "").trim();
		if (!plain && !clubImageData) return alert("Hãy nhập nội dung bài viết cho Fanpage CLB!");

		const progHost = document.getElementById("club-post-progress");
		const bar = window.dieunwCreateProgressBar ? window.dieunwCreateProgressBar(progHost) : { set() {}, hide() {} };
		const submitBtn = e.currentTarget.querySelector("button[type='submit']");
		if (submitBtn) submitBtn.disabled = true;
		bar.set(10, "Đang đăng lên Fanpage CLB...");

		try {
			const scheduledAt = document.getElementById("club-post-schedule-input")?.value || "";
			const music = clubMusicWidget ? clubMusicWidget.getValue() : { mode: "none" };

			if (music.mode === "file" && music.file) {
				const fd = new FormData();
				fd.append("content", content);
				fd.append("clubId", clubId);
				fd.append("isRichHtml", "1");
				fd.append("visibility", "public");
				if (clubImageData) fd.append("image", clubImageData);
				if (scheduledAt) fd.append("scheduledAt", scheduledAt);
				fd.append("music", music.file);
				fd.append("musicTitle", music.musicTitle || music.file.name);
				await window.dieunwUploadWithProgress(
					`${API_BASE}/api/posts`,
					{ method: "POST", credentials: "include", body: fd },
					pct => bar.set(pct, `Đang tải lên... ${pct}%`)
				);
			} else {
				await window.dieunwUploadWithProgress(
					`${API_BASE}/api/posts`,
					{
						method: "POST",
						credentials: "include",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							content,
							image: clubImageData,
							clubId,
							isRichHtml: true,
							visibility: "public",
							scheduledAt: scheduledAt || undefined,
							musicUrl: music.musicUrl || "",
							musicTitle: music.musicTitle || ""
						})
					},
					pct => bar.set(pct, `Đang đăng bài... ${pct}%`)
				);
			}

			if (editor) editor.innerHTML = "";
			clubImageData = "";
			document.getElementById("club-post-image-clear")?.click();
			clubMusicWidget?.reset();
			alert("Đã đăng bài lên Fanpage CLB!");
			await loadClubProfile(clubId, activeViewerUser);
		} catch (err) {
			alert(requestErrorMessage(err, "Không thể đăng bài lên Fanpage CLB."));
		} finally {
			if (submitBtn) submitBtn.disabled = false;
			setTimeout(() => bar.hide(), 500);
		}
	});
});

// --- BẬT / TẮT HIỂN THỊ MẬT KHẨU ---
(() => {
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
})();