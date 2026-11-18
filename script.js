(() => {
    const API_BASE = "https://dieunw.onrender.com";
    const POSTS_API = `${API_BASE}/api/posts`;
    const FALLBACK_AVATAR = "./DIEU.avif";
    const LIKE_ICON = "./icon-like.avif";
    const COMMENT_ICON = "./icon-comment.avif";

    let homeAccessEnabled = false;
    let currentHomeUser = null;
    let pendingImageDataUrl = "";
    let mentionCandidates = [];
    let activeMentionQuery = null;
    let reportTargetPostId = "";

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
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    async function askConfirm(message, title = "Xác nhận", danger = false) {
        if (typeof window.dieunwConfirm === "function") {
            return await window.dieunwConfirm(message, title, danger);
        }
        return window.confirm(message);
    }

    function normalizeMediaPath(src, fallback = FALLBACK_AVATAR) {
        const raw = typeof src === "string" ? src.trim() : "";
        if (!raw) return fallback;
        if (raw === "./DIEU.png" || raw === "DIEU.png") return "./DIEU.avif";
        return raw;
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

    function sanitizePostHtml(html) {
        const template = document.createElement("template");
        template.innerHTML = String(html || "");
        const allowedTags = new Set([
            "B", "STRONG", "I", "EM", "U", "S",
            "H1", "H2", "H3", "H4", "H5",
            "P", "BR", "DIV", "SPAN", "A"
        ]);

        const walk = node => {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (child.nodeType === Node.TEXT_NODE) continue;
                if (child.nodeType !== Node.ELEMENT_NODE) {
                    child.remove();
                    continue;
                }
                const tag = child.tagName.toUpperCase();
                if (!allowedTags.has(tag)) {
                    const textNode = document.createTextNode(child.textContent || "");
                    child.replaceWith(textNode);
                    continue;
                }

                for (const attr of Array.from(child.attributes)) {
                    const name = attr.name.toLowerCase();
                    if (tag === "A" && name === "href") {
                        const val = attr.value.trim();
                        if (!val.startsWith("./") && !val.startsWith("https://") && !val.startsWith("http://")) {
                            child.removeAttribute(attr.name);
                        }
                        continue;
                    }
                    if (name === "class" && child.classList.contains("mention-tag")) {
                        child.setAttribute("class", "mention-tag");
                        continue;
                    }
                    if (name === "style") {
                        const color = child.style.color;
                        child.removeAttribute("style");
                        if (color) child.style.color = color;
                        continue;
                    }
                    child.removeAttribute(attr.name);
                }
                walk(child);
            }
        };

        walk(template.content);
        return template.innerHTML.trim();
    }

    // Dự phòng bật/tắt menu nav trên Trang chủ (chống double-toggle với nav-profile.js)
    // Dự phòng bật/tắt menu nav trên Trang chủ (event delegation, chống double-toggle)
    function ensureHomeNavMenuToggle() {
        let preClickHidden = true;
        let preClickExpanded = "false";

        const getNavEls = () => {
            const toggleBtn = document.querySelector(".nav-brand-toggle");
            const menu = document.getElementById("main-nav-menu") || document.querySelector(".nav-menu");
            return { toggleBtn, menu };
        };

        const setMenuOpen = (toggleBtn, menu, open) => {
            menu.hidden = !open;
            if (open) {
                menu.removeAttribute("hidden");
                menu.style.display = "grid";
            } else {
                menu.setAttribute("hidden", "");
                menu.style.display = "";
            }
            toggleBtn.setAttribute("aria-expanded", String(open));
        };

        document.addEventListener("click", e => {
            const target = e.target instanceof Element ? e.target : null;
            if (!target?.closest(".nav-brand-toggle")) return;
            const { toggleBtn, menu } = getNavEls();
            if (!toggleBtn || !menu) return;
            preClickHidden = menu.hidden;
            preClickExpanded = toggleBtn.getAttribute("aria-expanded");
        }, true);

        document.addEventListener("click", e => {
            const target = e.target instanceof Element ? e.target : null;
            const { toggleBtn, menu } = getNavEls();
            if (!toggleBtn || !menu) return;

            if (target?.closest(".nav-brand-toggle")) {
                setTimeout(() => {
                    const handledByNavProfile =
                        menu.hidden !== preClickHidden ||
                        toggleBtn.getAttribute("aria-expanded") !== preClickExpanded;
                    if (handledByNavProfile) return;
                    setMenuOpen(toggleBtn, menu, preClickHidden);
                }, 0);
                return;
            }

            if (!menu.hidden) {
                const header = toggleBtn.closest(".navbar");
                if (header && !header.contains(target)) {
                    setMenuOpen(toggleBtn, menu, false);
                }
            }
        });

        document.addEventListener("keydown", e => {
            if (e.key !== "Escape") return;
            const { toggleBtn, menu } = getNavEls();
            if (toggleBtn && menu && !menu.hidden) {
                setMenuOpen(toggleBtn, menu, false);
            }
        });
    }

    function initHomePage() {
        ensureHomeNavMenuToggle();

        const modalOverlay = document.getElementById("post-modal-overlay");
        const reportOverlay = document.getElementById("report-modal-overlay");
        const triggerInput = document.getElementById("trigger-modal-input");
        const btnTriggerOpen = document.getElementById("btn-trigger-open");
        const btnModalClose = document.getElementById("btn-modal-close");
        const btnSubmit = document.getElementById("btn-submit-post");
        const richEditor = document.getElementById("post-rich-editor");
        const mentionDropdown = document.getElementById("post-mention-dropdown");
        const mentionTrigger = document.getElementById("post-mention-trigger");
        const headingSelect = document.getElementById("post-heading-select");
        const colorPicker = document.getElementById("post-color-picker");
        const postImageFile = document.getElementById("post-image-file");
        const postImageFilename = document.getElementById("post-image-filename");
        const postImageClear = document.getElementById("post-image-clear");
        const postImagePreviewWrap = document.getElementById("post-image-preview-wrap");
        const postImagePreview = document.getElementById("post-image-preview");
        const uploadProgressHost = document.getElementById("post-upload-progress");
        const newsfeedContainer = document.getElementById("newsfeed-container");
        const feedAuthGate = document.getElementById("feed-auth-gate");
        const feedTriggerBox = document.getElementById("feed-trigger-box");
        const feedTriggerAvatar = document.getElementById("feed-trigger-avatar");

        if (modalOverlay) {
            modalOverlay.classList.remove("open");
            modalOverlay.hidden = true;
        }
        if (reportOverlay) {
            reportOverlay.hidden = true;
        }

        const musicWidget = typeof window.dieunwCreateMusicAttachmentWidget === "function"
            ? window.dieunwCreateMusicAttachmentWidget("post-music-picker")
            : null;

        try {
            window.dieunwApplySiteBg?.();
        } catch {
            // bỏ qua nếu chưa sẵn sàng
        }

        function openModal() {
            if (!homeAccessEnabled) {
                showHomeAuth("login");
                return;
            }
            if (!modalOverlay) return;
            modalOverlay.hidden = false;
            requestAnimationFrame(() => modalOverlay.classList.add("open"));
            richEditor?.focus();
        }

        function closeModal() {
            if (!modalOverlay) return;
            modalOverlay.classList.remove("open");
            modalOverlay.hidden = true;
            if (mentionDropdown) mentionDropdown.hidden = true;
        }

        function showHomeAuth(view) {
            const authContainer = document.getElementById("auth-container");
            if (!authContainer) return;
            authContainer.style.display = "block";
            const loginView = document.getElementById("login-view");
            const registerView = document.getElementById("register-view");
            const forgotView = document.getElementById("forgot-view");

            if (view === "register") {
                if (loginView) loginView.style.display = "none";
                if (forgotView) forgotView.style.display = "none";
                if (registerView) registerView.style.display = "block";
            } else {
                if (loginView) loginView.style.display = "block";
                if (registerView) registerView.style.display = "none";
                if (forgotView) forgotView.style.display = "none";
            }
            authContainer.scrollIntoView({ behavior: "smooth", block: "center" });
            if (view === "login") document.getElementById("login-email")?.focus();
        }

        function updateHomeAccess(user = null) {
            const isAuthenticated = Boolean(user?.id);
            const wasEnabled = homeAccessEnabled;
            currentHomeUser = isAuthenticated ? user : null;
            homeAccessEnabled = isAuthenticated;

            if (feedAuthGate) feedAuthGate.hidden = isAuthenticated;
            if (feedTriggerBox) feedTriggerBox.hidden = !isAuthenticated;
            if (newsfeedContainer) newsfeedContainer.hidden = !isAuthenticated;

            const authContainer = document.getElementById("auth-container");
            if (isAuthenticated && authContainer) {
                authContainer.style.display = "none";
            }

            if (isAuthenticated) {
                const name = user.name || user.email || "Dieuer";
                const avatar = normalizeMediaPath(user.avatar, FALLBACK_AVATAR);
                const authorName = document.getElementById("post-author-name");
                const authorAvatar = document.getElementById("post-author-avatar");
                if (authorName) authorName.textContent = name;
                if (authorAvatar) authorAvatar.src = avatar;
                if (feedTriggerAvatar) feedTriggerAvatar.src = avatar;
                if (triggerInput) triggerInput.textContent = `${name} ơi, bạn đang nghĩ gì thế?`;

                if (!wasEnabled) {
                    loadPosts();
                    loadMentionCandidates();
                }
            } else {
                closeModal();
            }
        }

        window.updateHomeAccess = updateHomeAccess;

        try {
            const cached = JSON.parse(localStorage.getItem("dieuNwUser") || "null");
            if (cached?.id) {
                updateHomeAccess(cached);
            } else {
                updateHomeAccess(null);
            }
        } catch {
            updateHomeAccess(null);
        }

        document.getElementById("feed-login-button")?.addEventListener("click", () => showHomeAuth("login"));
        document.getElementById("feed-register-button")?.addEventListener("click", () => showHomeAuth("register"));

        triggerInput?.addEventListener("click", openModal);
        triggerInput?.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openModal();
            }
        });
        btnTriggerOpen?.addEventListener("click", openModal);
        btnModalClose?.addEventListener("click", closeModal);
        modalOverlay?.addEventListener("click", e => {
            if (e.target === modalOverlay) closeModal();
        });

        document.querySelectorAll('input[name="post-visibility"]').forEach(option => {
            option.addEventListener("change", () => {
                const label = document.getElementById("post-privacy-label");
                if (label) label.textContent = option.value === "private" ? "Riêng tư" : "Công khai";
            });
        });

        // --- Rich Text Toolbar ---
        document.querySelectorAll("#post-rte-wrapper .rte-btn[data-cmd]").forEach(btn => {
            btn.addEventListener("click", () => {
                richEditor?.focus();
                document.execCommand(btn.dataset.cmd, false);
            });
        });

        headingSelect?.addEventListener("change", () => {
            richEditor?.focus();
            document.execCommand("formatBlock", false, headingSelect.value);
        });

        colorPicker?.addEventListener("input", () => {
            richEditor?.focus();
            document.execCommand("foreColor", false, colorPicker.value);
        });

        // --- @Tag Mentions ---
        async function loadMentionCandidates() {
            try {
                const res = await fetch(`${API_BASE}/api/users/search?q=`, {
                    credentials: "include",
                    headers: getAuthHeaders()
                });
                const data = await res.json();
                if (res.ok && Array.isArray(data.users)) {
                    mentionCandidates = data.users;
                }
            } catch {
                // bỏ qua nếu chưa kết nối
            }
        }

        function insertMentionTag(user) {
            if (!richEditor) return;
            richEditor.focus();

            const sel = window.getSelection();
            if (activeMentionQuery && sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const node = range.startContainer;
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent || "";
                    const cursor = range.startOffset;
                    const before = text.slice(0, cursor);
                    const atIdx = before.lastIndexOf("@");
                    if (atIdx >= 0) {
                        node.textContent = text.slice(0, atIdx) + text.slice(cursor);
                        range.setStart(node, atIdx);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            }

            const a = document.createElement("a");
            a.className = "mention-tag";
            a.href = `./profile.html?userId=${encodeURIComponent(user.id)}`;
            a.textContent = `@${user.name || user.email}`;
            a.contentEditable = "false";

            const space = document.createTextNode("\u00A0");
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(space);
                range.insertNode(a);
                range.setStartAfter(space);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                richEditor.append(a, space);
            }

            activeMentionQuery = null;
            if (mentionDropdown) mentionDropdown.hidden = true;
        }

        function renderMentionDropdown(query) {
            if (!mentionDropdown) return;
            const q = String(query || "").toLowerCase();
            const matches = mentionCandidates
                .filter(u =>
                    (u.name || "").toLowerCase().includes(q) ||
                    (u.email || "").toLowerCase().includes(q)
                )
                .slice(0, 8);

            if (matches.length === 0) {
                mentionDropdown.hidden = true;
                return;
            }

            mentionDropdown.replaceChildren(
                ...matches.map(u => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "mention-option";

                    const img = document.createElement("img");
                    img.src = normalizeMediaPath(u.avatar, FALLBACK_AVATAR);
                    img.alt = "";

                    const meta = document.createElement("div");
                    meta.className = "mention-option-meta";
                    const strong = document.createElement("strong");
                    strong.textContent = u.name || u.email;
                    const span = document.createElement("span");
                    span.textContent = u.email || "";
                    meta.append(strong, span);

                    btn.append(img, meta);
                    btn.addEventListener("mousedown", e => {
                        e.preventDefault();
                        insertMentionTag(u);
                    });
                    return btn;
                })
            );
            mentionDropdown.hidden = false;
        }

        mentionTrigger?.addEventListener("click", () => {
            if (!richEditor) return;
            richEditor.focus();
            document.execCommand("insertText", false, "@");
            activeMentionQuery = "";
            renderMentionDropdown("");
        });

        richEditor?.addEventListener("input", () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType !== Node.TEXT_NODE) {
                if (mentionDropdown) mentionDropdown.hidden = true;
                activeMentionQuery = null;
                return;
            }
            const before = (node.textContent || "").slice(0, range.startOffset);
            const match = before.match(/(?:^|\s)@([^\s@]{0,24})$/);
            if (match) {
                activeMentionQuery = match[1];
                renderMentionDropdown(match[1]);
            } else {
                activeMentionQuery = null;
                if (mentionDropdown) mentionDropdown.hidden = true;
            }
        });

        // --- Upload & Nén ảnh ---
        function clearSelectedImage() {
            pendingImageDataUrl = "";
            if (postImageFile) postImageFile.value = "";
            if (postImageFilename) postImageFilename.textContent = "Chưa chọn ảnh";
            if (postImageClear) postImageClear.hidden = true;
            if (postImagePreviewWrap) postImagePreviewWrap.hidden = true;
            if (postImagePreview) postImagePreview.removeAttribute("src");
        }

        postImageClear?.addEventListener("click", clearSelectedImage);

        postImageFile?.addEventListener("change", async () => {
            const file = postImageFile.files?.[0];
            if (!file) {
                clearSelectedImage();
                return;
            }
            if (postImageFilename) postImageFilename.textContent = "Đang tối ưu ảnh...";
            try {
                let dataUrl = "";
                if (typeof window.dieunwCompressImage === "function") {
                    dataUrl = await window.dieunwCompressImage(file, 1440, 0.84);
                } else {
                    dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result || ""));
                        reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
                        reader.readAsDataURL(file);
                    });
                }
                pendingImageDataUrl = dataUrl;
                if (postImageFilename) postImageFilename.textContent = file.name;
                if (postImageClear) postImageClear.hidden = false;
                if (postImagePreview) postImagePreview.src = dataUrl;
                if (postImagePreviewWrap) postImagePreviewWrap.hidden = false;
            } catch (err) {
                notify(err.message || "Không thể xử lý ảnh.", "error");
                clearSelectedImage();
            }
        });

        // --- Report Modal ---
        const reportCloseBtn = document.getElementById("report-modal-close");
        const reportCancelBtn = document.getElementById("report-modal-cancel");
        const reportSubmitBtn = document.getElementById("report-modal-submit");
        const reportReasonInput = document.getElementById("report-reason-input");
        const reportStatusEl = document.getElementById("report-modal-status");

        function openReportModal(post) {
            if (!reportOverlay) return;
            reportTargetPostId = String(post.id || "");
            const label = document.getElementById("report-target-label");
            if (label) label.textContent = `Báo cáo bài viết của ${post.name || "thành viên DIEUNW"}`;
            if (reportReasonInput) reportReasonInput.value = "";
            if (reportStatusEl) reportStatusEl.textContent = "";
            document.querySelectorAll("#report-modal-overlay .report-chip").forEach(c => c.classList.remove("active"));
            reportOverlay.hidden = false;
        }

        function closeReportModal() {
            if (reportOverlay) reportOverlay.hidden = true;
            reportTargetPostId = "";
        }

        reportCloseBtn?.addEventListener("click", closeReportModal);
        reportCancelBtn?.addEventListener("click", closeReportModal);
        reportOverlay?.addEventListener("click", e => {
            if (e.target === reportOverlay) closeReportModal();
        });

        document.querySelectorAll("#report-modal-overlay .report-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                chip.classList.toggle("active");
                const selected = Array.from(document.querySelectorAll("#report-modal-overlay .report-chip.active"))
                    .map(c => c.dataset.reason)
                    .filter(Boolean);
                if (reportReasonInput && selected.length > 0 && !reportReasonInput.value.trim()) {
                    reportReasonInput.value = selected.join("; ");
                }
            });
        });

        reportSubmitBtn?.addEventListener("click", async () => {
            if (!reportTargetPostId) return;
            const selectedChips = Array.from(document.querySelectorAll("#report-modal-overlay .report-chip.active"))
                .map(c => c.dataset.reason)
                .filter(Boolean);
            const reasonText = (reportReasonInput?.value || "").trim() || selectedChips.join("; ");
            if (!reasonText) {
                if (reportStatusEl) reportStatusEl.textContent = "Vui lòng chọn hoặc nhập lý do báo cáo.";
                return;
            }
            reportSubmitBtn.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/api/reports`, {
                    method: "POST",
                    credentials: "include",
                    headers: getAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({
                        targetType: "post",
                        targetId: reportTargetPostId,
                        reason: reasonText
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Không thể gửi báo cáo.");
                notify("Đã gửi báo cáo tới Ban kiểm duyệt!", "success");
                closeReportModal();
            } catch (err) {
                if (reportStatusEl) reportStatusEl.textContent = err.message || "Lỗi gửi báo cáo.";
            } finally {
                reportSubmitBtn.disabled = false;
            }
        });

        // --- Tạo Card Bài viết ---
        function createPostCardElement(post) {
            const viewer = currentHomeUser || {};
            const viewerId = String(viewer.id || "");
            const postCard = document.createElement("div");
            postCard.className = "post-card";
            postCard.dataset.postId = String(post.id || "");

            const authorName = escapeHtml(post.name || "Thành viên DIEUNW");
            const authorAvatar = escapeHtml(normalizeMediaPath(post.avatar, FALLBACK_AVATAR));
            const profileUrl = post.userId ? `./profile.html?userId=${encodeURIComponent(post.userId)}` : "#";
            const visibilityLabel = post.visibility === "private" ? "Riêng tư" : "Công khai";

            let savedComments = [];
            if (post.comments) {
                try {
                    savedComments = typeof post.comments === "string" ? JSON.parse(post.comments) : post.comments;
                } catch {
                    savedComments = [];
                }
            }
            if (!Array.isArray(savedComments)) savedComments = [];

            const hasValidImage = post.image && post.image.trim() !== "" &&
                !post.image.includes("placeholder") && !post.image.includes("faker");
            const postImageHtml = hasValidImage
                ? `<img src="${escapeHtml(post.image)}" class="post-card-image" loading="lazy" alt="Ảnh bài viết">`
                : "";

            const richBodyHtml = post.contentHtml
                ? `<div class="post-rich-content">${sanitizePostHtml(post.contentHtml)}</div>`
                : `<p>${escapeHtml(post.content || "")}</p>`;

            const audioUrl = post.audioUrl || post.musicUrl || "";
            const audioTitle = post.audioTitle || post.musicTitle || "Nhạc đính kèm";
            const audioHtml = audioUrl
                ? `<div class="post-audio-attach" style="margin-top:10px; padding:10px 12px; border-radius:10px; border:1px solid #d5e4f2; background:#f5f9ff; display:grid; gap:6px;">
                        <div style="font-size:12.5px; font-weight:700; color:#173853;">🎵 ${escapeHtml(audioTitle)}</div>
                        <audio controls preload="none" src="${escapeHtml(audioUrl)}" style="width:100%; height:36px;"></audio>
                   </div>`
                : "";

            const countLikes = Number(post.likes || 0);
            const isLiked = Boolean(post.likedByMe);

            postCard.innerHTML = `
                <div class="post-card-header">
                    <a href="${profileUrl}"><img src="${authorAvatar}" class="post-card-avatar" alt=""></a>
                    <div>
                        <h4 class="post-card-author">
                            <a href="${profileUrl}" class="post-card-author-link">${authorName}</a>
                        </h4>
                        <span class="post-card-time">${new Date(post.createdAt || Date.now()).toLocaleString("vi-VN")}</span>
                    </div>
                </div>
                <div class="post-card-body">
                    ${richBodyHtml}
                    ${postImageHtml}
                    ${audioHtml}
                </div>
                <div class="post-visibility-label">${visibilityLabel}</div>
                <div class="post-status-info">
                    <span class="like-count-text">
                        <img src="${LIKE_ICON}" class="status-like-icon" alt="Like">
                        <span class="count">${countLikes}</span> lượt thích
                    </span>
                    <span class="comment-count-text">
                        <img src="${COMMENT_ICON}" class="status-comment-icon" alt="Comment">
                        <span class="comment-count">${savedComments.length}</span> bình luận
                    </span>
                </div>
                <div class="post-interact-bar">
                    <button type="button" class="btn-interact btn-like ${isLiked ? "liked" : ""}" ${isLiked ? 'style="color:#0078ff; font-weight:700;"' : ""}>
                        <img src="${LIKE_ICON}" class="custom-interact-icon" alt="Like"> Thích
                    </button>
                    <button type="button" class="btn-interact btn-comment">
                        <img src="${COMMENT_ICON}" class="custom-interact-icon" alt="Comment"> Bình luận
                    </button>
                </div>
                <div class="comment-section" style="display: none;">
                    <div class="comment-input-group">
                        <img src="${escapeHtml(normalizeMediaPath(viewer.avatar, FALLBACK_AVATAR))}" class="user-avatar-mini" style="width:32px; height:32px;" alt="">
                        <input type="text" class="comment-field" placeholder="Viết bình luận và nhấn Enter...">
                    </div>
                    <div class="comments-list"></div>
                </div>
            `;

            const commentsListEl = postCard.querySelector(".comments-list");
            const commentCountEl = postCard.querySelector(".comment-count");
            const renderCommentsIntoList = items => {
                if (!commentsListEl) return;
                commentsListEl.replaceChildren(...items.map(cmt => {
                    const row = document.createElement("div");
                    row.className = "comment-item";
                    const av = document.createElement("img");
                    av.src = normalizeMediaPath(cmt.avatar, FALLBACK_AVATAR);
                    av.className = "post-card-avatar";
                    av.style.width = "32px";
                    av.style.height = "32px";
                    av.alt = "";

                    const box = document.createElement("div");
                    box.className = "comment-content-box";
                    const h5 = document.createElement("h5");
                    h5.textContent = cmt.name || "Thành viên";
                    const p = document.createElement("p");
                    p.textContent = cmt.text || "";
                    box.append(h5, p);

                    row.append(av, box);
                    return row;
                }));
                if (commentCountEl) commentCountEl.textContent = String(items.length);
            };
            renderCommentsIntoList(savedComments);

            const likeBtn = postCard.querySelector(".btn-like");
            const likeCountEl = postCard.querySelector(".like-count-text .count");
            likeBtn?.addEventListener("click", async () => {
                if (!homeAccessEnabled) return;
                const nextLiked = !likeBtn.classList.contains("liked");
                const currentNum = Number(likeCountEl?.textContent || 0);
                likeBtn.disabled = true;

                likeBtn.classList.toggle("liked", nextLiked);
                likeBtn.style.color = nextLiked ? "#0078ff" : "";
                likeBtn.style.fontWeight = nextLiked ? "700" : "";
                if (likeCountEl) likeCountEl.textContent = String(Math.max(0, currentNum + (nextLiked ? 1 : -1)));

                try {
                    const res = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}/like`, {
                        method: "POST",
                        credentials: "include",
                        headers: getAuthHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({ liked: nextLiked })
                    });
                    if (!res.ok) throw new Error("Không thể cập nhật lượt thích.");
                    const data = await res.json().catch(() => null);
                    if (data && typeof data.likes === "number" && likeCountEl) {
                        likeCountEl.textContent = String(data.likes);
                    }
                } catch (err) {
                    likeBtn.classList.toggle("liked", !nextLiked);
                    likeBtn.style.color = !nextLiked ? "#0078ff" : "";
                    likeBtn.style.fontWeight = !nextLiked ? "700" : "";
                    if (likeCountEl) likeCountEl.textContent = String(currentNum);
                    notify(err.message || "Không thể cập nhật lượt thích.", "error");
                } finally {
                    likeBtn.disabled = false;
                }
            });

            const commentBtn = postCard.querySelector(".btn-comment");
            const commentSection = postCard.querySelector(".comment-section");
            const commentField = postCard.querySelector(".comment-field");
            commentBtn?.addEventListener("click", () => {
                if (!commentSection) return;
                const isHidden = commentSection.style.display === "none";
                commentSection.style.display = isHidden ? "block" : "none";
                if (isHidden) commentField?.focus();
            });

            commentField?.addEventListener("keydown", async e => {
                if (e.key !== "Enter" || !commentField.value.trim()) return;
                if (!homeAccessEnabled) return;
                e.preventDefault();
                const content = commentField.value.trim();
                commentField.disabled = true;
                try {
                    const res = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}/comments`, {
                        method: "POST",
                        credentials: "include",
                        headers: getAuthHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({ content })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Không thể gửi bình luận.");
                    commentField.value = "";
                    if (Array.isArray(data.comments)) {
                        savedComments = data.comments;
                    } else {
                        savedComments = [
                            ...savedComments,
                            {
                                name: viewer.name || viewer.email || "Bạn",
                                avatar: viewer.avatar || FALLBACK_AVATAR,
                                text: content
                            }
                        ];
                    }
                    renderCommentsIntoList(savedComments);
                } catch (err) {
                    notify(err.message || "Không thể gửi bình luận.", "error");
                } finally {
                    commentField.disabled = false;
                    commentField.focus();
                }
            });

            const actionsRow = document.createElement("div");
            actionsRow.className = "post-card-actions";
            const isOwner = String(post.userId || "") === viewerId;
            if (isOwner || viewer.isAdmin) {
                const delBtn = document.createElement("button");
                delBtn.type = "button";
                delBtn.className = "post-delete-button";
                delBtn.textContent = "Xóa bài viết";
                delBtn.addEventListener("click", async () => {
                    const ok = await askConfirm("Bạn có chắc muốn xóa bài viết này?", "Xóa bài viết", true);
                    if (!ok) return;
                    delBtn.disabled = true;
                    try {
                        const res = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}`, {
                            method: "DELETE",
                            credentials: "include",
                            headers: getAuthHeaders()
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "Không thể xóa bài viết.");
                        postCard.remove();
                        notify("Đã xóa bài viết.", "success");
                    } catch (err) {
                        notify(err.message || "Không thể xóa bài viết.", "error");
                        delBtn.disabled = false;
                    }
                });
                actionsRow.append(delBtn);
            }

            if (!isOwner) {
                const reportBtn = document.createElement("button");
                reportBtn.type = "button";
                reportBtn.className = "post-report-button";
                reportBtn.textContent = "⚑ Báo cáo";
                reportBtn.addEventListener("click", () => openReportModal(post));
                actionsRow.append(reportBtn);
            }

            if (actionsRow.children.length > 0) {
                postCard.append(actionsRow);
            }
            return postCard;
        }

        function renderPosts(posts) {
            if (!newsfeedContainer || !currentHomeUser) return;
            const viewerId = String(currentHomeUser.id || "");
            const viewerEmail = String(currentHomeUser.email || "").toLowerCase();

            const visiblePosts = (Array.isArray(posts) ? posts : []).filter(post => {
                if (["study-resource", "public-chat-room", "public-chat-message"].includes(post.type)) return false;
                if (post.visibility !== "private") return true;
                return String(post.userId || "") === viewerId ||
                    String(post.authorEmail || "").toLowerCase() === viewerEmail;
            });

            newsfeedContainer.replaceChildren();
            if (visiblePosts.length === 0) {
                const p = document.createElement("p");
                p.className = "empty-text";
                p.textContent = "Chưa có bài viết nào. Hãy là người đầu tiên đăng bài!";
                newsfeedContainer.append(p);
                return;
            }

            const recentPosts = visiblePosts.slice(0, 20);
            newsfeedContainer.append(...recentPosts.map(createPostCardElement));
        }

        async function loadPosts() {
            if (!newsfeedContainer || !homeAccessEnabled) return;
            try {
                const res = await fetch(POSTS_API, {
                    credentials: "include",
                    headers: getAuthHeaders()
                });
                const data = await res.json();
                if (res.status === 401) {
                    localStorage.removeItem("dieuNwUser");
                    localStorage.removeItem("session_token");
                    updateHomeAccess(null);
                    return;
                }
                if (!res.ok) throw new Error(data.error || "Không thể tải bài viết.");
                renderPosts(data.posts || []);
            } catch {
                newsfeedContainer.innerHTML = "<p style='color:#b42318; text-align:center; padding:16px;'>Không thể tải bài viết. Hãy thử tải lại trang.</p>";
            }
        }

        btnSubmit?.addEventListener("click", async () => {
            if (!homeAccessEnabled || !currentHomeUser) {
                updateHomeAccess(null);
                return;
            }

            const plainText = (richEditor?.innerText || "").trim();
            const rawHtml = richEditor?.innerHTML || "";
            const cleanHtml = sanitizePostHtml(rawHtml);

            let attachedMusic = { audioUrl: "", audioTitle: "" };
            if (musicWidget?.resolveAudio) {
                try {
                    attachedMusic = await musicWidget.resolveAudio();
                } catch (err) {
                    notify(err.message || "Không thể xử lý tệp nhạc đính kèm.", "error");
                    return;
                }
            }

            if (!plainText && !pendingImageDataUrl && !attachedMusic.audioUrl) {
                notify("Hãy nhập nội dung, chọn ảnh hoặc đính kèm nhạc trước khi đăng nhé!", "warn");
                return;
            }

            const visibility = document.querySelector('input[name="post-visibility"]:checked')?.value || "public";
            const payload = {
                content: plainText || (attachedMusic.audioTitle ? `Đang nghe: ${attachedMusic.audioTitle}` : ""),
                contentHtml: cleanHtml,
                image: pendingImageDataUrl,
                audioUrl: attachedMusic.audioUrl || "",
                audioTitle: attachedMusic.audioTitle || "",
                createdAt: new Date().toISOString(),
                likes: 0,
                comments: [],
                name: currentHomeUser.name || currentHomeUser.email,
                userId: String(currentHomeUser.id || ""),
                authorEmail: currentHomeUser.email || "",
                avatar: normalizeMediaPath(currentHomeUser.avatar, FALLBACK_AVATAR),
                visibility
            };

            const progress = typeof window.dieunwCreateProgressBar === "function" && uploadProgressHost
                ? window.dieunwCreateProgressBar(uploadProgressHost, "Đang đăng bài viết...")
                : null;

            btnSubmit.disabled = true;
            btnSubmit.textContent = "Đang đăng...";

            try {
                let data;
                if (typeof window.dieunwUploadWithProgress === "function") {
                    data = await window.dieunwUploadWithProgress("POST", POSTS_API, payload, pct => {
                        progress?.setProgress(pct, pct < 100 ? `Đang tải lên (${pct}%)...` : "Đang lưu bài viết...");
                    });
                } else {
                    const res = await fetch(POSTS_API, {
                        method: "POST",
                        credentials: "include",
                        headers: getAuthHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify(payload)
                    });
                    data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Đăng bài không thành công.");
                }

                progress?.finish("Đăng bài thành công!");
                if (richEditor) richEditor.innerHTML = "";
                clearSelectedImage();
                musicWidget?.reset?.();
                closeModal();

                if (data?.post && newsfeedContainer) {
                    const emptyText = newsfeedContainer.querySelector(".empty-text");
                    if (emptyText) emptyText.remove();
                    newsfeedContainer.prepend(createPostCardElement(data.post));
                } else {
                    await loadPosts();
                }
                notify("Đã đăng bài viết mới!", "success");
            } catch (err) {
                progress?.fail(err.message || "Đăng bài thất bại.");
                notify(err.message || "Đăng bài không thành công.", "error");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.textContent = "Đăng bài";
            }
        });

        fetch(`${API_BASE}/api/auth/me`, {
            credentials: "include",
            headers: getAuthHeaders()
        })
            .then(res => res.json())
            .then(data => {
                if (data?.user) {
                    localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
                    updateHomeAccess(data.user);
                } else {
                    localStorage.removeItem("dieuNwUser");
                    localStorage.removeItem("session_token");
                    updateHomeAccess(null);
                }
            })
            .catch(() => {});

        window.addEventListener("storage", event => {
            if (event.key === "dieuNwUser" && !event.newValue) {
                updateHomeAccess(null);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initHomePage);
    } else {
        initHomePage();
    }
})();