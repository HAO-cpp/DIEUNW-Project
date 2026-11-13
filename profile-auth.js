document.addEventListener("DOMContentLoaded", () => {
    const authContainer = document.getElementById("auth-container");
    const profileContainer = document.getElementById("profile-container");

    const loginView = document.getElementById("login-view");
    const registerView = document.getElementById("register-view");
    const forgotView = document.getElementById("forgot-view");

    function requestErrorMessage(error, fallback) {
        if (location.protocol === "file:" || error instanceof TypeError) {
            return "Không kết nối được backend. Hãy chạy npm start và mở trang qua http://localhost:4173.";
        }
        return error.message || fallback;
    }

    async function readApiResponse(response) {
        if (!response.headers.get("content-type")?.includes("application/json")) {
            throw new Error("Không nhận được phản hồi API. Hãy chạy npm start và mở http://127.0.0.1:4173, không dùng Live Server.");
        }
        return response.json();
    }

    if (location.hash === "#register") {
        loginView.style.display = "none";
        registerView.style.display = "block";
    }

    fetch("/api/auth/me", { credentials: "same-origin" })
        .then(response => response.json())
        .then(data => {
            if (data.user) {
                localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
                showProfile(data.user);
            } else {
                localStorage.removeItem("dieuNwUser");
                window.updateNavAvatar?.(null);
                window.updateHomeAccess?.(null);
            }
        })
        .catch(() => {});
    // CHUYỂN ĐỔI GIỮA CÁC TAB ĐĂNG NHẬP / ĐĂNG KÝ / QUÊN MẬT KHẨU
    document.getElementById("link-to-register")?.addEventListener("click", (e) => {
        e.preventDefault();
        loginView.style.display = "none";
        forgotView.style.display = "none";
        registerView.style.display = "block";
    });

    document.getElementById("link-to-forgot")?.addEventListener("click", (e) => {
        e.preventDefault();
        loginView.style.display = "none";
        registerView.style.display = "none";
        forgotView.style.display = "block";
    });

    document.querySelectorAll(".link-to-login").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            registerView.style.display = "none";
            forgotView.style.display = "none";
            loginView.style.display = "block";
        });
    });

    // ==========================================
    // CHỨC NĂNG 1: ĐĂNG NHẬP (KHÔNG TỐN EMAILJS)
    // ==========================================
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
            const response = await fetch("/api/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || "Email hoặc mật khẩu không chính xác.");
            localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
            showProfile(data.user);
        } catch (error) {
            alert(requestErrorMessage(error, "Không thể kết nối máy chủ."));
        } finally {
            btnLogin.innerText = "Đăng nhập";
            btnLogin.disabled = false;
        }
    });

    // ==========================================
    // CHỨC NĂNG 2: ĐĂNG KÝ TÀI KHOẢN MỚI (CÓ GỬI OTP)
    // ==========================================
    document.getElementById("btn-reg-send-otp")?.addEventListener("click", async () => {
        const name = document.getElementById("reg-name").value.trim();
        const email = document.getElementById("reg-email").value.trim().toLowerCase();
        const password = document.getElementById("reg-password").value;
        const btnSend = document.getElementById("btn-reg-send-otp");

        if (!name || !email || !password) {
            alert("Vui lòng điền đầy đủ thông tin đăng ký!");
            return;
        }
        if (!email.endsWith("@nqd.edu.vn")) {
            alert("Bạn phải dùng Email trường cấp có đuôi @nqd.edu.vn!");
            return;
        }
        if (password.length < 8) {
            alert("Mật khẩu phải có ít nhất 8 ký tự!");
            return;
        }

        btnSend.innerText = "Đang kiểm tra email...";
        btnSend.disabled = true;

        try {
            btnSend.innerText = "Đang gửi mã OTP...";
            const response = await fetch("/api/auth/register/start", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password })
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || "Không thể bắt đầu đăng ký.");
            const notice = document.querySelector("#reg-step-2 .otp-notice");
            notice.textContent = data.devCode
                ? `Chế độ phát triển, mã xác nhận: ${data.devCode}`
                : "Mã xác nhận đã được gửi đến email trường của bạn.";
            document.getElementById("reg-step-1").style.display = "none";
            document.getElementById("reg-step-2").style.display = "block";
        } catch (error) {
            alert(requestErrorMessage(error, "Không thể gửi mã xác nhận."));
        } finally {
            btnSend.innerText = "Gửi mã xác nhận Email";
            btnSend.disabled = false;
        }
    });

    // Xác thực OTP và lưu tài khoản mới lên MockAPI
    document.getElementById("btn-reg-verify")?.addEventListener("click", async () => {
        const userOtp = document.getElementById("reg-otp-input").value.trim();
        const btnVerify = document.getElementById("btn-reg-verify");

        btnVerify.innerText = "Đang tạo tài khoản...";
        btnVerify.disabled = true;

        try {
            const response = await fetch("/api/auth/register/verify", {
                method: "POST",
                credentials: "same-origin",
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
            alert("Đăng ký tài khoản thành công! 🎉");
            showProfile(data.user);
        } catch (error) {
            alert(requestErrorMessage(error, "Lỗi khi tạo tài khoản."));
        } finally {
            btnVerify.innerText = "Hoàn tất Đăng ký";
            btnVerify.disabled = false;
        }
    });

    // ==========================================
    // CHỨC NĂNG 3: QUÊN MẬT KHẨU (CÓ GỬI OTP)
    // ==========================================
    document.getElementById("btn-forgot-send-otp")?.addEventListener("click", async () => {
        const email = document.getElementById("forgot-email").value.trim().toLowerCase();
        const btnSend = document.getElementById("btn-forgot-send-otp");

        if (!email.endsWith("@nqd.edu.vn")) {
            alert("Vui lòng nhập đúng email trường @nqd.edu.vn!");
            return;
        }

        btnSend.innerText = "Đang tìm tài khoản...";
        btnSend.disabled = true;

        try {
            btnSend.innerText = "Đang gửi mã khôi phục...";
			const response = await fetch("/api/auth/password/start", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email })
            });
            const data = await readApiResponse(response);
			if (!response.ok) throw new Error(data.error || "Không thể gửi mã khôi phục.");
			const notice = document.querySelector("#forgot-step-2 .otp-notice");
			notice.textContent = data.devCode
				? `Chế độ phát triển, mã xác nhận: ${data.devCode}`
				: "Mã khôi phục đã được gửi đến email của bạn.";
            document.getElementById("forgot-step-1").style.display = "none";
            document.getElementById("forgot-step-2").style.display = "block";
        } catch (error) {
            alert(requestErrorMessage(error, "Lỗi gửi mã khôi phục."));
        } finally {
            btnSend.innerText = "Gửi mã khôi phục";
            btnSend.disabled = false;
        }
    });

    // Đặt lại mật khẩu mới trên MockAPI
    document.getElementById("btn-forgot-reset")?.addEventListener("click", async () => {
        const userOtp = document.getElementById("forgot-otp-input").value.trim();
        const newPassword = document.getElementById("forgot-new-password").value;
        const btnReset = document.getElementById("btn-forgot-reset");

        if (newPassword.length < 8) {
            alert("Mật khẩu mới phải có ít nhất 8 ký tự!");
            return;
        }

        btnReset.innerText = "Đang cập nhật...";
        btnReset.disabled = true;

        try {
            const response = await fetch("/api/auth/password/verify", {
                method: "POST",
                credentials: "same-origin",
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
            alert("Đổi mật khẩu thành công! Hệ thống đã tự động đăng nhập. 🎉");
            showProfile(data.user);
        } catch (error) {
            alert(requestErrorMessage(error, "Lỗi khi cập nhật mật khẩu mới!"));
        } finally {
            btnReset.innerText = "Đổi mật khẩu mới";
            btnReset.disabled = false;
        }
    });
        // ==========================================
    // HIỂN THỊ & CHỈNH SỬA HỒ SƠ CÁ NHÂN
    // ==========================================
    document.getElementById("btn-logout")?.addEventListener("click", async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
        localStorage.removeItem("dieuNwUser");
        location.reload();
    });

    const btnEditProfile = document.getElementById("btn-edit-profile");
    const editProfileForm = document.getElementById("edit-profile-form");

    btnEditProfile?.addEventListener("click", () => {
        const currentUser = JSON.parse(localStorage.getItem("dieuNwUser")) || {};
        document.getElementById("edit-name-input").value = currentUser.name || "";
        document.getElementById("edit-email-input").value = currentUser.email || "";
        document.getElementById("edit-class-input").value = currentUser.studentClass || "";
        document.getElementById("edit-avatar-input").value = currentUser.avatar || "";
        document.getElementById("edit-cover-input").value = currentUser.cover || "";
        document.getElementById("edit-bio-input").value = currentUser.bio || "";
        
        editProfileForm.style.display = "block";
        btnEditProfile.style.display = "none";
    });

    document.getElementById("btn-cancel-edit")?.addEventListener("click", () => {
        editProfileForm.style.display = "none";
        btnEditProfile.style.display = "inline-block";
    });

    document.getElementById("btn-save-profile")?.addEventListener("click", async () => {
        const currentUser = JSON.parse(localStorage.getItem("dieuNwUser")) || {};
        const newName = document.getElementById("edit-name-input").value.trim();
        const newEmail = document.getElementById("edit-email-input").value.trim().toLowerCase();
        const newClass = document.getElementById("edit-class-input").value.trim();
        const newAvatar = document.getElementById("edit-avatar-input").value.trim();
        const newCover = document.getElementById("edit-cover-input").value.trim();
        const newBio = document.getElementById("edit-bio-input").value.trim();

        if (!newName) {
            alert("Tên hiển thị không được để trống!");
            return;
        }

        const updatedFields = {
            name: newName,
            email: newEmail || currentUser.email,
            studentClass: newClass || "Học sinh NQD",
            avatar: newAvatar || "./DIEU.png",
            cover: newCover,
            bio: newBio || "Chào mừng đến với góc học tập của mình trên DIEUNW!"
        };

        try {
            const response = await fetch("/api/users/me", {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedFields)
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || "Không thể cập nhật hồ sơ.");
            localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
            
            editProfileForm.style.display = "none";
            btnEditProfile.style.display = "inline-block";
            
            alert("Cập nhật hồ sơ thành công! 🎉");
            showProfile(data.user);
        } catch (error) {
            alert(requestErrorMessage(error, "Lỗi khi lưu thông tin hồ sơ!"));
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
        panel.hidden = !user.isAdmin;
        if (!user.isAdmin) return;
        const list = document.getElementById("admin-list");
        try {
            const response = await fetch("/api/admins", { credentials: "same-origin" });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || "Không thể tải danh sách admin.");
            list.replaceChildren(...data.admins.map(email => {
                const item = document.createElement("li");
                item.textContent = email;
                return item;
            }));
        } catch {
            list.replaceChildren();
        }
    }

    document.getElementById("admin-add-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const emailInput = document.getElementById("admin-email-input");
        const status = document.getElementById("admin-action-status");
        const button = event.currentTarget.querySelector("button[type='submit']");
        button.disabled = true;
        status.textContent = "Đang thêm admin...";
        try {
            const response = await fetch("/api/admins", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailInput.value.trim() })
            });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || "Không thể thêm admin.");
            emailInput.value = "";
            status.textContent = data.accountExists
                ? `${data.email} đã được thêm làm admin.`
                : `${data.email} sẽ có quyền admin khi đăng ký tài khoản.`;
            const currentUser = JSON.parse(localStorage.getItem("dieuNwUser") || "{}");
            await loadAdminTools(currentUser);
        } catch (error) {
            status.textContent = requestErrorMessage(error, "Không thể thêm admin.");
        } finally {
            button.disabled = false;
        }
    });

    function showProfile(user) {
        window.updateNavAvatar?.(user);
        window.updateHomeAccess?.(user);
        if (authContainer) authContainer.style.display = "none";
        if (profileContainer) profileContainer.style.display = document.getElementById("newsfeed-container") ? "none" : "block";
        
        document.getElementById("user-display-name").innerText = user.name;
        document.getElementById("user-display-email").innerText = user.email;
        document.getElementById("user-display-class").innerText = user.studentClass ? `Lớp ${user.studentClass}` : "Học sinh trường NQD";
        document.getElementById("user-display-bio").innerText = user.bio || "Chào mừng đến với góc học tập của mình trên DIEUNW!";
        renderProfileRoles(user);
        loadAdminTools(user);
        
        const avatarEl = document.getElementById("user-display-avatar");
        if (avatarEl) avatarEl.src = user.avatar || "./DIEU.png";

        const coverEl = document.getElementById("profile-cover-image");
        if (coverEl) {
            coverEl.hidden = !user.cover;
            if (user.cover) coverEl.src = user.cover;
            else coverEl.removeAttribute("src");
        }

        loadMyPosts(user.id, user.avatar);
        window.dispatchEvent(new Event("dieu-profile-ready"));
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    async function loadMyPosts(userId, userAvatar) {
        const myPostsContainer = document.getElementById("my-posts-container");
        if (!myPostsContainer) return;

        try {
            const response = await fetch("/api/posts", { credentials: "same-origin" });
            const data = await readApiResponse(response);
            if (!response.ok) throw new Error(data.error || "Không thể tải bài viết.");
            const myPosts = data.posts.filter(post => String(post.userId) === String(userId)).reverse();

            document.getElementById("stat-posts").innerText = myPosts.length;
            const totalLikes = myPosts.reduce((sum, post) => sum + (post.likes || 0), 0);
            document.getElementById("stat-likes").innerText = totalLikes;

            myPostsContainer.innerHTML = "";
            if (myPosts.length === 0) {
                myPostsContainer.innerHTML = "<p style='text-align:center; color:#65676b; background:white; padding:20px; border-radius:12px;'>Bạn chưa đăng bài viết nào trên DIEUNW.</p>";
                return;
            }

            myPosts.forEach(post => {
                const postEl = document.createElement("div");
                postEl.classList.add("post-card");
                const imgHtml = (post.image && post.image.trim() !== "") ? `<img src="${escapeHtml(post.image)}" class="post-card-image" loading="lazy">` : "";
                const avatar = escapeHtml(userAvatar || "./DIEU.png");

                postEl.innerHTML = `
                    <div class="post-card-header">
                        <img src="${avatar}" class="post-card-avatar" style="object-fit:cover;">
                        <div>
                            <h4 class="post-card-author">${escapeHtml(post.name || "")}</h4>
                            <span class="post-card-time">${new Date(post.createdAt).toLocaleString('vi-VN')}</span>
                        </div>
                    </div>
                    <div class="post-card-body">
                        <p>${escapeHtml(post.content || "")}</p>
                        ${imgHtml}
                    </div>
                    <div class="post-status-info">
                        <span class="like-count-text">
                            <img src="./icon-like.png" class="status-like-icon" alt="Like"> 
                            <span class="count">${post.likes || 0}</span> lượt thích
                        </span>
                        <span class="comment-count-text">
                            <img src="./icon-comment.png" class="status-comment-icon" alt="Comment"> 
                            <span class="comment-count">${Array.isArray(post.comments) ? post.comments.length : 0}</span> bình luận
                        </span>
                    </div>
                `;
                const actions = document.createElement("div");
                actions.className = "post-card-actions";
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "post-delete-button";
                deleteButton.textContent = "Xóa bài viết";
                deleteButton.addEventListener("click", async () => {
                    if (!window.confirm("Bạn có chắc muốn xóa bài viết này?")) return;
                    deleteButton.disabled = true;
                    try {
                        const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}`, {
                            method: "DELETE",
                            credentials: "same-origin"
                        });
                        const data = await readApiResponse(response);
                        if (!response.ok) throw new Error(data.error || "Không thể xóa bài viết.");
                        await loadMyPosts(userId, userAvatar);
                    } catch (error) {
                        alert(requestErrorMessage(error, "Không thể xóa bài viết."));
                        deleteButton.disabled = false;
                    }
                });
                actions.append(deleteButton);
                postEl.append(actions);
                myPostsContainer.appendChild(postEl);
            });
        } catch (error) {
            myPostsContainer.innerHTML = "<p style='color:red; text-align:center;'>Không thể tải lịch sử bài viết.</p>";
        }
    }
});

