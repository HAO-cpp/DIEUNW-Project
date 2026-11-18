const API_BASE = "https://dieunw.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
    const authContainer = document.getElementById("auth-container");
    const profileContainer = document.getElementById("profile-container");
    const loginView = document.getElementById("login-view");
    const registerView = document.getElementById("register-view");
    const forgotView = document.getElementById("forgot-view");

    const urlParams = new URLSearchParams(window.location.search);
    const clubId = urlParams.get("clubId");
    const targetUserId = urlParams.get("userId");

    let activeClub = null;
    let currentViewer = null;
    let currentSubFilter = "mine";
    let pendingAvatarData = null; // null = keep existing, "" = clear, string = new image
    let pendingCoverData = null;
    let pendingClubPostImage = "";
    let activeReportTarget = null;

    function getAuthHeaders(extra = {}) {
        const token = localStorage.getItem("session_token");
        return {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...extra
        };
    }

    function requestErrorMessage(error, fallback) {
        if (location.protocol === "file:" || error instanceof TypeError) {
            return "Không kết nối được máy chủ. Vui lòng kiểm tra kết nối mạng.";
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
        const tpl = document.createElement("template");
        tpl.innerHTML = String(rawHtml || "");
        const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV", "H1", "H2", "H3", "H4", "H5", "SPAN", "FONT", "A"]);

        function cleanNode(node) {
            if (node.nodeType === Node.TEXT_NODE) return;
            if (node.nodeType !== Node.ELEMENT_NODE) {
                node.remove();
                return;
            }
            if (!allowedTags.has(node.tagName)) {
                const text = document.createTextNode(node.textContent || "");
                node.replaceWith(text);
                return;
            }
            Array.from(node.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                if (name === "class" && attr.value.includes("mention-tag")) return;
                if (name === "href" && node.tagName === "A") {
                    if (/^(https?:\/\/|\.\/profile\.html\?userId=)/i.test(attr.value)) return;
                }
                if (name === "color" && node.tagName === "FONT") return;
                if (name === "style") {
                    const colorMatch = attr.value.match(/color\s*:\s*([^;]+)/i);
                    if (colorMatch) {
                        node.setAttribute("style", `color: ${colorMatch[1]}`);
                        return;
                    }
                }
                node.removeAttribute(attr.name);
            });
            Array.from(node.childNodes).forEach(cleanNode);
        }
        Array.from(tpl.content.childNodes).forEach(cleanNode);
        return tpl.innerHTML;
    }

    async function optimizeUpload(file, maxWidth = 1080) {
        if (!file) return "";
        if (window.DIEUNW?.compressImageToWebp) {
            return window.DIEUNW.compressImageToWebp(file, maxWidth, 0.84);
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Không đọc được ảnh đã chọn."));
            reader.readAsDataURL(file);
        });
    }

    // =========================================================
    // RICH TEXT EDITOR & @MENTION HELPER (FOR CLUB FANPAGE)
    // =========================================================
    function initClubRichEditor() {
        const wrapper = document.getElementById("club-rte-wrapper");
        const editor = document.getElementById("club-post-rich-editor");
        const dropdown = document.getElementById("club-mention-dropdown");
        if (!wrapper || !editor || wrapper.dataset.bound === "1") return;
        wrapper.dataset.bound = "1";

        wrapper.querySelectorAll(".rte-btn[data-cmd]").forEach(btn => {
            btn.addEventListener("click", () => {
                editor.focus();
                document.execCommand(btn.getAttribute("data-cmd"), false, null);
            });
        });

        document.getElementById("club-heading-select")?.addEventListener("change", e => {
            editor.focus();
            document.execCommand("formatBlock", false, e.target.value);
        });

        document.getElementById("club-color-picker")?.addEventListener("input", e => {
            editor.focus();
            document.execCommand("foreColor", false, e.target.value);
        });

        async function searchMentions(query) {
            if (!dropdown) return;
            try {
                const res = await fetch(`${API_BASE}/api/users/search?q=${encodeURIComponent(query)}`, {
                    credentials: "include",
                    headers: getAuthHeaders()
                });
                const data = await res.json();
                const users = data.users || [];
                if (!users.length) {
                    dropdown.hidden = true;
                    return;
                }
                dropdown.replaceChildren();
                users.slice(0, 6).forEach(u => {
                    const opt = document.createElement("button");
                    opt.type = "button";
                    opt.className = "mention-option";
                    opt.innerHTML = `<img src="${escapeHtml(u.avatar || "./DIEU.png")}" alt=""><div class="mention-option-meta"><strong>${escapeHtml(u.name)}</strong><span>${escapeHtml(u.email)}</span></div>`;
                    opt.onclick = () => {
                        const sel = window.getSelection();
                        if (sel && sel.rangeCount) {
                            const range = sel.getRangeAt(0);
                            const node = range.startContainer;
                            if (node.nodeType === Node.TEXT_NODE) {
                                const txt = node.textContent;
                                const atIdx = txt.lastIndexOf("@", range.startOffset);
                                if (atIdx !== -1) {
                                    range.setStart(node, atIdx);
                                    range.deleteContents();
                                }
                            }
                            const a = document.createElement("a");
                            a.className = "mention-tag";
                            a.href = `./profile.html?userId=${encodeURIComponent(u.id)}`;
                            a.textContent = `@${u.name}`;
                            a.contentEditable = "false";
                            range.insertNode(a);
                            const sp = document.createTextNode("\u00A0");
                            a.after(sp);
                            range.setStartAfter(sp);
                            range.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                        dropdown.hidden = true;
                    };
                    dropdown.append(opt);
                });
                dropdown.hidden = false;
            } catch {
                dropdown.hidden = true;
            }
        }

        document.getElementById("club-mention-trigger")?.addEventListener("click", () => {
            editor.focus();
            document.execCommand("insertText", false, "@");
            searchMentions("");
        });

        editor.addEventListener("keyup", () => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            if (range.startContainer.nodeType !== Node.TEXT_NODE) {
                if (dropdown) dropdown.hidden = true;
                return;
            }
            const before = range.startContainer.textContent.slice(0, range.startOffset);
            const match = before.match(/@([^\s@]{0,24})$/);
            if (match) searchMentions(match[1]);
            else if (dropdown) dropdown.hidden = true;
        });
    }

    // Bind file upload inputs cleanly
    function bindFileUploader(fileInputId, filenameId, previewWrapId, previewImgId, clearBtnId, onChanged) {
        const input = document.getElementById(fileInputId);
        const nameEl = document.getElementById(filenameId);
        const wrap = document.getElementById(previewWrapId);
        const img = document.getElementById(previewImgId);
        const clearBtn = document.getElementById(clearBtnId);
        if (!input) return;

        input.addEventListener("change", async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                if (nameEl) nameEl.textContent = "Đang tối ưu WebP...";
                const dataUrl = await optimizeUpload(file, 1080);
                onChanged(dataUrl);
                if (nameEl) nameEl.textContent = file.name;
                if (img) img.src = dataUrl;
                if (wrap) wrap.hidden = false;
                if (clearBtn) clearBtn.hidden = false;
            } catch (err) {
                alert(err.message || "Không xử lý được ảnh.");
            }
        });

        clearBtn?.addEventListener("click", () => {
            input.value = "";
            onChanged("");
            if (nameEl) nameEl.textContent = "Đã xóa ảnh";
            if (wrap) wrap.hidden = true;
            clearBtn.hidden = true;
        });
    }

    bindFileUploader("edit-avatar-file", "edit-avatar-filename", "edit-avatar-preview-wrap", "edit-avatar-preview", "edit-avatar-clear", val => { pendingAvatarData = val; });
    bindFileUploader("edit-cover-file", "edit-cover-filename", "edit-cover-preview-wrap", "edit-cover-preview", "edit-cover-clear", val => { pendingCoverData = val; });
    bindFileUploader("club-post-image-file", "club-post-image-filename", "club-post-image-preview-wrap", "club-post-image-preview", "club-post-image-clear", val => { pendingClubPostImage = val; });

    // =========================================================
    // INITIAL AUTH CHECK & ROUTE DISPATCH
    // =========================================================
    if (location.hash === "#register" && loginView && registerView) {
        loginView.style.display = "none";
        registerView.style.display = "block";
    }

    fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include",
        headers: getAuthHeaders()
    })
        .then(r => r.json())
        .then(async data => {
            const user = data.user || null;
            currentViewer = user;

            if (user) {
                localStorage.setItem("dieuNwUser", JSON.stringify(user));
            } else {
                localStorage.removeItem("dieuNwUser");
                localStorage.removeItem("session_token");
            }
            window.updateNavAvatar?.(user);
            window.updateHomeAccess?.(user);

            if (clubId) {
                await loadClubProfile(clubId, user);
                return;
            }

            if (targetUserId && (!user || String(targetUserId) !== String(user.id))) {
                await loadFriendProfile(targetUserId, user);
                return;
            }

            if (user) {
                showProfile(user);
            }
        })
        .catch(() => {
            if (clubId) loadClubProfile(clubId, null);
            else if (targetUserId) loadFriendProfile(targetUserId, null);
        });

    // Switch Login / Register / Forgot
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

    // =========================================================
    // AUTH: LOGIN / REGISTER / FORGOT PASSWORD
    // =========================================================
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
            currentViewer = data.user;
            showProfile(data.user);
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
            notice.textContent = data.devCode ? `Chế độ phát triển, mã xác nhận: ${data.devCode}` : "Mã xác nhận đã được gửi đến email trường của bạn.";
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
            currentViewer = data.user;
            alert("Đăng ký tài khoản thành công!");
            showProfile(data.user);
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
            notice.textContent = data.devCode ? `Chế độ phát triển, mã xác nhận: ${data.devCode}` : "Mã khôi phục đã được gửi đến email của bạn.";
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
            currentViewer = data.user;
            alert("Đổi mật khẩu thành công!");
            showProfile(data.user);
        } catch (error) {
            alert(requestErrorMessage(error, "Lỗi khi cập nhật mật khẩu mới!"));
        } finally {
            btnReset.innerText = "Đổi mật khẩu mới";
            btnReset.disabled = false;
        }
    });

    // =========================================================
    // EDIT PROFILE / LOGOUT / FANPAGE CLB EDIT
    // =========================================================
    document.getElementById("btn-logout")?.addEventListener("click", async () => {
        await fetch(`${API_BASE}/api/auth/logout`, {
            method: "POST",
            credentials: "include",
            headers: getAuthHeaders()
        }).catch(() => {});
        localStorage.removeItem("dieuNwUser");
        localStorage.removeItem("session_token");
        location.reload();
    });

    const btnEditProfile = document.getElementById("btn-edit-profile");
    const editProfileForm = document.getElementById("edit-profile-form");

    btnEditProfile?.addEventListener("click", () => {
        pendingAvatarData = null;
        pendingCoverData = null;
        const emailGroup = document.getElementById("edit-email-input")?.closest(".input-group");
        const classGroup = document.getElementById("edit-class-input")?.closest(".input-group");
        const updateTitle = document.getElementById("update");

        if (activeClub) {
            if (updateTitle) updateTitle.innerText = "Cập nhật Fanpage CLB";
            if (emailGroup) emailGroup.style.display = "none";
            if (classGroup) classGroup.style.display = "none";
            document.getElementById("edit-name-input").value = activeClub.name || "";
            document.getElementById("edit-bio-input").value = activeClub.bio || "";
        } else {
            if (updateTitle) updateTitle.innerText = "Cập nhật thông tin cá nhân";
            if (emailGroup) emailGroup.style.display = "block";
            if (classGroup) classGroup.style.display = "block";
            const u = JSON.parse(localStorage.getItem("dieuNwUser") || "{}");
            document.getElementById("edit-name-input").value = u.name || "";
            document.getElementById("edit-email-input").value = u.email || "";
            document.getElementById("edit-class-input").value = u.studentClass || "";
            if (document.getElementById("edit-cohort-input")) document.getElementById("edit-cohort-input").value = u.cohort || "";
            if (document.getElementById("edit-alumni-checkbox")) document.getElementById("edit-alumni-checkbox").checked = Boolean(u.isAlumni);
            document.getElementById("edit-bio-input").value = u.bio || "";
            if (document.getElementById("edit-schedule-input")) document.getElementById("edit-schedule-input").value = u.studySchedule || "";
            if (document.getElementById("edit-fb-input")) document.getElementById("edit-fb-input").value = u.socialFacebook || "";
            if (document.getElementById("edit-ig-input")) document.getElementById("edit-ig-input").value = u.socialInstagram || "";
            if (document.getElementById("edit-gh-input")) document.getElementById("edit-gh-input").value = u.socialGithub || "";
        }

        if (document.getElementById("edit-avatar-filename")) document.getElementById("edit-avatar-filename").textContent = "Giữ nguyên ảnh hiện tại";
        if (document.getElementById("edit-cover-filename")) document.getElementById("edit-cover-filename").textContent = "Giữ nguyên ảnh hiện tại";
        editProfileForm.style.display = "block";
        btnEditProfile.style.display = "none";
    });

    document.getElementById("btn-cancel-edit")?.addEventListener("click", () => {
        editProfileForm.style.display = "none";
        btnEditProfile.style.display = "inline-flex";
    });

    document.getElementById("btn-save-profile")?.addEventListener("click", async () => {
        const newName = document.getElementById("edit-name-input").value.trim();
        const newEmail = document.getElementById("edit-email-input").value.trim().toLowerCase();
        const newClass = document.getElementById("edit-class-input").value.trim();
        const newBio = document.getElementById("edit-bio-input").value.trim();

        if (!newName) return alert("Tên hiển thị không được để trống!");

        if (clubId && activeClub) {
            try {
                const response = await fetch(`${API_BASE}/api/clubs/${encodeURIComponent(clubId)}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: getAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({
                        name: newName,
                        logo: pendingAvatarData !== null ? pendingAvatarData : (activeClub.logo || ""),
                        cover: pendingCoverData !== null ? pendingCoverData : (activeClub.cover || ""),
                        bio: newBio
                    })
                });
                const data = await readApiResponse(response);
                if (!response.ok) throw new Error(data.error || "Không thể cập nhật Fanpage CLB.");
                editProfileForm.style.display = "none";
                btnEditProfile.style.display = "inline-flex";
                alert("Cập nhật Fanpage CLB thành công!");
                await loadClubProfile(clubId, currentViewer);
            } catch (error) {
                alert(requestErrorMessage(error, "Lỗi khi lưu Fanpage CLB."));
            }
            return;
        }

        const cur = JSON.parse(localStorage.getItem("dieuNwUser") || "{}");
        const updatedFields = {
            name: newName,
            email: newEmail,
            studentClass: newClass,
            cohort: document.getElementById("edit-cohort-input")?.value.trim() || "",
            isAlumni: Boolean(document.getElementById("edit-alumni-checkbox")?.checked),
            avatar: pendingAvatarData !== null ? pendingAvatarData : (cur.avatar || ""),
            cover: pendingCoverData !== null ? pendingCoverData : (cur.cover || ""),
            bio: newBio || "Chào mừng đến với góc học tập của mình trên DIEUNW!",
            studySchedule: document.getElementById("edit-schedule-input")?.value.trim() || "",
            socialFacebook: document.getElementById("edit-fb-input")?.value.trim() || "",
            socialInstagram: document.getElementById("edit-ig-input")?.value.trim() || "",
            socialGithub: document.getElementById("edit-gh-input")?.value.trim() || ""
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
            currentViewer = data.user;
            editProfileForm.style.display = "none";
            btnEditProfile.style.display = "inline-flex";
            alert("Cập nhật hồ sơ thành công!");
            showProfile(data.user);
        } catch (error) {
            alert(requestErrorMessage(error, "Lỗi khi lưu thông tin hồ sơ!"));
        }
    });

    // =========================================================
    // ROLE TAGS & REPORT MODAL
    // =========================================================
    function renderProfileRoles(user) {
        const container = document.getElementById("profile-role-tags");
        if (!container) return;
        container.replaceChildren();
        if (window.DIEUNW?.renderAuthorBadgesHtml) {
            container.innerHTML = window.DIEUNW.renderAuthorBadgesHtml(user);
        } else {
            if (user.isAdmin) {
                const t = document.createElement("span");
                t.className = "role-badge role-admin";
                t.textContent = "Admin";
                container.append(t);
            }
            if (user.isModerator) {
                const t = document.createElement("span");
                t.className = "role-badge role-mod";
                t.textContent = "Ban duyệt bài";
                container.append(t);
            }
            if (user.isAlumni) {
                const t = document.createElement("span");
                t.className = "role-badge role-alumni";
                t.textContent = "Cựu học sinh";
                container.append(t);
            }
        }
        for (const club of user.profileTitles || []) {
            const clubTag = document.createElement("span");
            clubTag.className = "profile-role-tag club-role-tag";
            clubTag.textContent = `Chủ nhiệm · ${club.name}`;
            clubTag.style.setProperty("--club-color", club.color);
            container.append(clubTag);
        }
    }

    function openReportModal(targetType, targetId, label) {
        activeReportTarget = { targetType, targetId };
        const lbl = document.getElementById("report-target-label");
        const status = document.getElementById("report-modal-status");
        const input = document.getElementById("report-reason-input");
        if (lbl) lbl.textContent = label;
        if (status) status.textContent = "";
        if (input) input.value = "";
        document.querySelectorAll(".report-chip").forEach(c => c.classList.remove("active"));
        const overlay = document.getElementById("report-modal-overlay");
        if (overlay) overlay.hidden = false;
    }

    document.querySelectorAll(".report-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".report-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            const input = document.getElementById("report-reason-input");
            if (input && !input.value.trim()) input.value = chip.dataset.reason || "";
        });
    });

    document.getElementById("report-modal-close")?.addEventListener("click", () => { document.getElementById("report-modal-overlay").hidden = true; });
    document.getElementById("report-modal-cancel")?.addEventListener("click", () => { document.getElementById("report-modal-overlay").hidden = true; });
    document.getElementById("report-modal-submit")?.addEventListener("click", async () => {
        if (!activeReportTarget) return;
        const reason = document.getElementById("report-reason-input").value.trim();
        const status = document.getElementById("report-modal-status");
        if (!reason) return (status.textContent = "Vui lòng chọn hoặc nhập lý do báo cáo.");
        try {
            const res = await fetch(`${API_BASE}/api/reports`, {
                method: "POST",
                credentials: "include",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ ...activeReportTarget, reason })
            });
            const data = await readApiResponse(res);
            if (!res.ok) throw new Error(data.error || "Không thể gửi báo cáo.");
            document.getElementById("report-modal-overlay").hidden = true;
            alert("Đã gửi báo cáo đến Ban duyệt bài!");
        } catch (err) {
            status.textContent = err.message;
        }
    });

    // =========================================================
    // SELF PROFILE, FRIEND PROFILE (?userId=), CLUB PROFILE (?clubId=)
    // =========================================================
    function showProfile(user) {
        activeClub = null;
        window.updateNavAvatar?.(user);
        window.updateHomeAccess?.(user);
        if (authContainer) authContainer.style.display = "none";
        if (profileContainer) {
            profileContainer.style.display = document.getElementById("newsfeed-container") ? "none" : "grid";
        }
        if (document.getElementById("newsfeed-container")) return;

        document.getElementById("btn-edit-profile").style.display = "inline-flex";
        document.getElementById("btn-logout").style.display = "inline-flex";
        document.getElementById("btn-friend-message").hidden = true;
        document.getElementById("btn-friend-back").hidden = true;
        document.getElementById("btn-report-account").hidden = true;
        document.getElementById("club-post-composer").style.display = "none";
        document.getElementById("profile-tabs-bar").hidden = false;

        document.getElementById("user-display-name").innerText = user.name;
        document.getElementById("user-display-email").innerText = user.email;
        document.getElementById("user-display-class").innerText = user.studentClass ? `Lớp ${user.studentClass}` : "Học sinh trường NQD";
        document.getElementById("user-display-bio").innerText = user.bio || "Chào mừng đến với góc học tập của mình trên DIEUNW!";
        renderProfileRoles(user);

        const avatarEl = document.getElementById("user-display-avatar");
        if (avatarEl) avatarEl.src = user.avatar || "./DIEU.png";

        const coverEl = document.getElementById("profile-cover-image");
        if (coverEl) {
            coverEl.hidden = !user.cover;
            if (user.cover) coverEl.src = user.cover;
            else coverEl.removeAttribute("src");
        }

        document.getElementById("posts-section-heading").textContent = "Bài viết đã đăng của bạn";
        loadUserPosts(user.id, user.avatar, true);
        window.dispatchEvent(new CustomEvent("dieu-profile-loaded", {
            detail: { targetUserId: "me", viewerUser: user, isSelf: true, isClub: false }
        }));
        window.dispatchEvent(new Event("dieu-profile-ready"));
    }

    async function loadFriendProfile(friendId, viewer) {
        activeClub = null;
        if (authContainer) authContainer.style.display = "none";
        if (profileContainer) profileContainer.style.display = "grid";

        try {
            const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(friendId)}/profile`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const data = await readApiResponse(res);
            if (!res.ok) throw new Error(data.error || "Không tìm thấy hồ sơ bạn học.");
            const friend = data.user;

            document.title = `DIEUNW - ${friend.name}`;
            document.getElementById("user-display-name").innerText = friend.name;
            document.getElementById("user-display-email").innerText = friend.email;
            document.getElementById("user-display-class").innerText = friend.studentClass ? `Lớp ${friend.studentClass}` : "Học sinh trường NQD";
            document.getElementById("user-display-bio").innerText = friend.bio || "Học sinh trường NQD";
            renderProfileRoles(friend);

            document.getElementById("user-display-avatar").src = friend.avatar || "./DIEU.png";
            const coverEl = document.getElementById("profile-cover-image");
            if (coverEl) {
                coverEl.hidden = !friend.cover;
                if (friend.cover) coverEl.src = friend.cover;
                else coverEl.removeAttribute("src");
            }

            document.getElementById("btn-edit-profile").style.display = "none";
            document.getElementById("btn-logout").style.display = "none";
            document.getElementById("club-post-composer").style.display = "none";
            document.getElementById("edit-profile-form").style.display = "none";

            const msgBtn = document.getElementById("btn-friend-message");
            msgBtn.href = `./messages.html?userId=${encodeURIComponent(friend.id)}`;
            msgBtn.hidden = !viewer;
            document.getElementById("btn-friend-back").hidden = false;

            const repBtn = document.getElementById("btn-report-account");
            repBtn.hidden = !viewer;
            repBtn.onclick = () => openReportModal("user", friend.id, `Báo cáo tài khoản: ${friend.name}`);

            document.getElementById("posts-section-heading").textContent = `Bài viết của ${friend.name}`;
            renderPostsList(
                document.getElementById("my-posts-container"),
                data.posts || [],
                friend.avatar,
                `${friend.name} chưa đăng bài viết công khai nào.`,
                () => false,
                () => loadFriendProfile(friendId, viewer)
            );

            window.dispatchEvent(new CustomEvent("dieu-profile-loaded", {
                detail: { targetUserId: friendId, viewerUser: viewer, isSelf: false, isClub: false }
            }));
        } catch (err) {
            alert(requestErrorMessage(err, "Không thể tải hồ sơ bạn học."));
        }
    }

    async function loadClubProfile(targetClubId, viewer) {
        if (authContainer) authContainer.style.display = "none";
        if (profileContainer) profileContainer.style.display = "grid";

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
            document.getElementById("user-display-name").innerText = club.name;
            const managersList = Array.isArray(club.managerEmails) ? club.managerEmails : [club.managerEmail];
            document.getElementById("user-display-email").innerText = `Quản lý: ${managersList.filter(Boolean).join(", ")}`;
            document.getElementById("user-display-class").innerText = "Câu lạc bộ trực thuộc trường NQD";
            document.getElementById("user-display-bio").innerText = club.bio || `Fanpage chính thức của ${club.name}`;
            document.querySelector(".verified-badge").textContent = "✓ Fanpage CLB chính thức";

            document.getElementById("user-display-avatar").src = club.logo || "./DIEU.png";
            const coverEl = document.getElementById("profile-cover-image");
            if (coverEl) {
                coverEl.hidden = !club.cover;
                if (club.cover) coverEl.src = club.cover;
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
            const isManager = Boolean(viewer && (normalizedManagers.includes(viewer.email.toLowerCase()) || viewer.isAdmin));

            document.getElementById("btn-logout").style.display = "none";
            document.getElementById("btn-edit-profile").style.display = isManager ? "inline-flex" : "none";
            if (isManager) document.getElementById("btn-edit-profile").innerText = "Chỉnh sửa Fanpage";

            const clubComposer = document.getElementById("club-post-composer");
            if (clubComposer) {
                clubComposer.style.display = isManager ? "flex" : "none";
                if (isManager) initClubRichEditor();
            }

            document.getElementById("study-metrics-card").hidden = true;
            document.getElementById("study-tags-card").hidden = true;
            document.getElementById("joined-clubs-card").hidden = true;
            document.getElementById("profile-tabs-bar").hidden = true;
            document.getElementById("posts-section-heading").textContent = `Bài viết của ${club.name}`;

            renderPostsList(
                document.getElementById("my-posts-container"),
                data.posts || [],
                club.logo || "./DIEU.png",
                "Fanpage CLB chưa có bài viết nào.",
                post => Boolean(viewer && (String(post.userId) === String(viewer.id) || isManager)),
                () => loadClubProfile(targetClubId, viewer)
            );
        } catch (error) {
            alert(requestErrorMessage(error, "Lỗi tải dữ liệu Fanpage CLB."));
        }
    }

    document.getElementById("club-post-composer")?.addEventListener("submit", async event => {
        event.preventDefault();
        if (!clubId) return;
        const editor = document.getElementById("club-post-rich-editor");
        const submitBtn = event.currentTarget.querySelector("button[type='submit']");
        const schedInput = document.getElementById("club-post-schedule-input");
        const htmlContent = editor.innerHTML.trim();
        const plainText = editor.textContent.trim();

        if (!plainText) return alert("Vui lòng nhập nội dung bài viết!");

        submitBtn.disabled = true;
        try {
            const payload = {
                content: htmlContent,
                isRichHtml: true,
                image: pendingClubPostImage || "",
                clubId,
                visibility: "public",
                ...(schedInput?.value ? { scheduledAt: new Date(schedInput.value).toISOString() } : {})
            };
            const response = await fetch(`${API_BASE}/api/posts`, {
                method: "POST",
                credentials: "include",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload)
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || "Không thể đăng bài cho CLB.");

            editor.innerHTML = "";
            pendingClubPostImage = "";
            if (schedInput) schedInput.value = "";
            document.getElementById("club-post-image-preview-wrap").hidden = true;
            document.getElementById("club-post-image-clear").hidden = true;
            document.getElementById("club-post-image-filename").textContent = "Không có ảnh";
            if (payload.scheduledAt) alert("Đã lên lịch đăng bài Fanpage CLB thành công!");
            await loadClubProfile(clubId, currentViewer);
        } catch (error) {
            alert(requestErrorMessage(error, "Lỗi khi đăng bài cho Fanpage CLB."));
        } finally {
            submitBtn.disabled = false;
        }
    });

    // =========================================================
    // POST RENDERER (LIKE, COMMENT + STICKER, BOOKMARK, STUDY SET, REPORT)
    // =========================================================
    function renderPostsList(container, posts, fallbackAvatar, emptyText, canDeleteFn, reloadFn) {
        if (!container) return;
        document.getElementById("stat-posts").innerText = posts.length;
        const totalLikes = posts.reduce((sum, post) => sum + (post.likes || 0), 0);
        document.getElementById("stat-likes").innerText = totalLikes;

        container.replaceChildren();
        if (!posts.length) {
            container.innerHTML = window.DIEUNW?.createEmptyIllustrationHtml
                ? window.DIEUNW.createEmptyIllustrationHtml({ title: "Trống", subtitle: emptyText })
                : `<p class="profile-extra-empty">${escapeHtml(emptyText)}</p>`;
            return;
        }

        posts.forEach(post => {
            const postEl = document.createElement("article");
            postEl.className = "post-card";
            const imgHtml = post.image && post.image.trim() !== ""
                ? `<img src="${escapeHtml(post.image)}" class="post-card-image" loading="lazy" alt="Ảnh bài viết">`
                : "";
            const avatar = escapeHtml(post.avatar || fallbackAvatar || "./DIEU.png");
            const bodyHtml = post.isRichHtml
                ? `<div class="post-rich-content">${sanitizeRichHtml(post.content || "")}</div>`
                : `<p>${escapeHtml(post.content || "")}</p>`;
            const badgesHtml = window.DIEUNW?.renderAuthorBadgesHtml ? window.DIEUNW.renderAuthorBadgesHtml(post) : "";
            const savedComments = Array.isArray(post.comments) ? post.comments : [];

            const commentsHtml = savedComments.map(cmt => {
                const stImg = cmt.stickerUrl ? `<img src="${escapeHtml(cmt.stickerUrl)}" class="comment-sticker-img" alt="Sticker">` : "";
                return `
                    <div class="comment-item">
                        <img src="${escapeHtml(cmt.avatar || "./DIEU.png")}" class="post-card-avatar" style="width:32px !important; height:32px !important;">
                        <div class="comment-content-box">
                            <h5>${escapeHtml(cmt.name || "Thành viên")}</h5>
                            ${cmt.text ? `<p>${escapeHtml(cmt.text)}</p>` : ""}
                            ${stImg}
                        </div>
                    </div>
                `;
            }).join("");

            postEl.innerHTML = `
                <div class="post-card-header">
                    <img src="${avatar}" class="post-card-avatar" alt="Avatar">
                    <div>
                        <h4 class="post-card-author">
                            <a class="post-card-author-link" href="${post.clubId ? `./profile.html?clubId=${encodeURIComponent(post.clubId)}` : `./profile.html?userId=${encodeURIComponent(post.userId)}`}">${escapeHtml(post.name || "")}</a>
                            ${badgesHtml}
                        </h4>
                        <span class="post-card-time">${new Date(post.createdAt).toLocaleString("vi-VN")}</span>
                    </div>
                </div>
                <div class="post-card-body">
                    ${bodyHtml}
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
            `;

            // Embedded Interactive Study Set
            if (post.studySet) {
                const card = document.createElement("div");
                card.className = "study-set-inline-card";
                card.innerHTML = `
                    <span class="study-set-badge">${post.studySet.setType === "quiz" ? "Quiz Tương tác" : "Flashcard 3D"} · ${escapeHtml(post.studySet.subject || "Học tập")}</span>
                    <strong>${escapeHtml(post.studySet.title)}</strong>
                    <div class="study-set-actions">
                        <button type="button" class="study-set-btn primary btn-launch-inline-set">Mở học / Làm bài ngay</button>
                    </div>
                `;
                card.querySelector(".btn-launch-inline-set").onclick = () => {
                    window.DIEUNW_PROFILE?.openStudySetPlayer?.(post.studySet, false);
                };
                postEl.querySelector(".post-card-body").append(card);
            }

            if (currentViewer) {
                const bar = document.createElement("div");
                bar.className = "post-interact-bar";

                const likeBtn = document.createElement("button");
                likeBtn.type = "button";
                likeBtn.className = `btn-interact btn-like${post.likedByMe ? " liked" : ""}`;
                if (post.likedByMe) likeBtn.style.color = "#0078ff";
                likeBtn.innerHTML = `<img src="./icon-like.png" class="custom-interact-icon" alt=""> Thích`;
                likeBtn.onclick = async () => {
                    await fetch(`${API_BASE}/api/posts/${encodeURIComponent(post.id)}/like`, {
                        method: "POST",
                        credentials: "include",
                        headers: getAuthHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({ liked: !post.likedByMe })
                    });
                    await reloadFn();
                };

                const cmtBtn = document.createElement("button");
                cmtBtn.type = "button";
                cmtBtn.className = "btn-interact";
                cmtBtn.innerHTML = `<img src="./icon-comment.png" class="custom-interact-icon" alt=""> Bình luận`;

                const saveBtn = document.createElement("button");
                saveBtn.type = "button";
                saveBtn.className = "btn-interact";
                saveBtn.textContent = "Lưu bài";
                saveBtn.onclick = async () => {
                    const r = await fetch(`${API_BASE}/api/bookmarks/toggle`, {
                        method: "POST",
                        credentials: "include",
                        headers: getAuthHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({ itemType: "post", itemId: post.id })
                    });
                    const d = await readApiResponse(r);
                    saveBtn.classList.toggle("is-saved", Boolean(d.saved));
                    saveBtn.textContent = d.saved ? "Đã lưu" : "Lưu bài";
                };

                bar.append(likeBtn, cmtBtn, saveBtn);
                postEl.append(bar);

                const cmtSec = document.createElement("div");
                cmtSec.className = "comment-section";
                cmtSec.style.display = "none";
                cmtSec.innerHTML = `
                    <div class="comment-input-group">
                        <input type="text" class="comment-field" placeholder="Viết bình luận hoặc chọn Sticker...">
                    </div>
                    <div class="comments-list">${commentsHtml}</div>
                `;
                cmtBtn.onclick = () => {
                    cmtSec.style.display = cmtSec.style.display === "none" ? "block" : "none";
                };
                const inputGroup = cmtSec.querySelector(".comment-input-group");
                const cmtField = cmtSec.querySelector(".comment-field");

                const sendComment = async (text, stickerUrl = "") => {
                    await fetch(`${API_BASE}/api/posts/${encodeURIComponent(post.id)}/comments`, {
                        method: "POST",
                        credentials: "include",
                        headers: getAuthHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({ content: text, stickerUrl })
                    });
                    await reloadFn();
                };

                cmtField.addEventListener("keypress", async e => {
                    if (e.key === "Enter" && cmtField.value.trim()) {
                        e.preventDefault();
                        await sendComment(cmtField.value.trim());
                    }
                });

                window.DIEUNW?.attachStickerPicker?.(inputGroup, sticker => {
                    sendComment(cmtField.value.trim(), sticker.imageUrl);
                });

                postEl.append(cmtSec);
            }

            const actions = document.createElement("div");
            actions.className = "post-card-actions";
            if (currentViewer && String(post.userId) !== String(currentViewer.id)) {
                const repBtn = document.createElement("button");
                repBtn.type = "button";
                repBtn.className = "post-report-button";
                repBtn.textContent = "⚑ Báo cáo";
                repBtn.onclick = () => openReportModal("post", post.id, `Báo cáo bài viết của ${post.name}`);
                actions.append(repBtn);
            }
            if (canDeleteFn(post)) {
                const delBtn = document.createElement("button");
                delBtn.type = "button";
                delBtn.className = "post-delete-button";
                delBtn.textContent = "Xóa bài viết";
                delBtn.onclick = async () => {
                    if (!confirm("Bạn có chắc muốn xóa bài viết này?")) return;
                    await fetch(`${API_BASE}/api/posts/${encodeURIComponent(post.id)}`, {
                        method: "DELETE",
                        credentials: "include",
                        headers: getAuthHeaders()
                    });
                    await reloadFn();
                };
                actions.append(delBtn);
            }
            if (actions.childElementCount) postEl.append(actions);
            container.append(postEl);
        });
    }

    async function loadUserPosts(userId, userAvatar, isSelf) {
        const container = document.getElementById("my-posts-container");
        if (!container) return;
        if (window.DIEUNW?.createSkeletonCardsHtml) {
            container.innerHTML = window.DIEUNW.createSkeletonCardsHtml(2);
        }
        try {
            if (isSelf && currentSubFilter === "saved") {
                const res = await fetch(`${API_BASE}/api/bookmarks`, {
                    credentials: "include",
                    headers: getAuthHeaders()
                });
                const data = await readApiResponse(res);
                renderPostsList(
                    container,
                    data.posts || [],
                    userAvatar,
                    "Bạn chưa lưu bài viết nào.",
                    post => Boolean(currentViewer && (String(post.userId) === String(currentViewer.id) || currentViewer.isAdmin)),
                    () => loadUserPosts(userId, userAvatar, isSelf)
                );
                return;
            }

            const response = await fetch(`${API_BASE}/api/posts`, {
                credentials: "include",
                headers: getAuthHeaders()
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || "Không thể tải bài viết.");
            const myPosts = (data.posts || []).filter(
                post => String(post.userId) === String(userId) && !post.clubId && post.type !== "study-resource"
            );
            renderPostsList(
                container,
                myPosts,
                userAvatar,
                "Bạn chưa đăng bài viết nào trên DIEUNW.",
                () => true,
                () => loadUserPosts(userId, userAvatar, isSelf)
            );
        } catch {
            container.innerHTML = "<p class='profile-extra-empty' style='color:#dc2626;'>Không thể tải lịch sử bài viết.</p>";
        }
    }

    // Subfilter Mine vs Saved on Posts Tab
    document.querySelectorAll("[data-post-filter]").forEach(btn => {
        btn.addEventListener("click", () => {
            currentSubFilter = btn.getAttribute("data-post-filter") || "mine";
            document.querySelectorAll("[data-post-filter]").forEach(b => b.classList.toggle("active", b === btn));
            if (currentViewer) loadUserPosts(currentViewer.id, currentViewer.avatar, true);
        });
    });
});

// Toggle Show/Hide Password
const passwordInput = document.getElementById("login-password");
const toggleBtn = document.getElementById("toggle-password");
const eyeIcon = document.getElementById("eye-icon");
if (passwordInput && toggleBtn && eyeIcon) {
    toggleBtn.addEventListener("click", () => {
        const isPwd = passwordInput.type === "password";
        passwordInput.type = isPwd ? "text" : "password";
        eyeIcon.innerHTML = isPwd
            ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
            : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    });
}