(() => {
    const API_BASE = "https://dieunw.onrender.com";
    const POSTS_API = `${API_BASE}/api/posts`;
    const REPORTS_API = `${API_BASE}/api/reports`;
    const MUSIC_API = `${API_BASE}/api/music`;

    const modalOverlay = document.getElementById("post-modal-overlay");
    const triggerInput = document.getElementById("trigger-modal-input");
    const triggerAvatar = document.getElementById("trigger-user-avatar");
    const btnTriggerOpen = document.getElementById("btn-trigger-open");
    const btnModalClose = document.getElementById("btn-modal-close");
    const btnSubmit = document.getElementById("btn-submit-post");

    const richEditor = document.getElementById("post-rich-editor");
    const headingSelect = document.getElementById("post-heading-select");
    const colorPicker = document.getElementById("post-color-picker");
    const mentionTrigger = document.getElementById("post-mention-trigger");
    const mentionDropdown = document.getElementById("post-mention-dropdown");

    const imageFileInput = document.getElementById("post-image-file");
    const imageFileNameEl = document.getElementById("post-image-filename");
    const imageClearBtn = document.getElementById("post-image-clear");
    const imagePreviewWrap = document.getElementById("post-image-preview-wrap");
    const imagePreviewEl = document.getElementById("post-image-preview");

    const postMusicMount = document.getElementById("post-music-picker");
    const postProgressMount = document.getElementById("post-upload-progress");

    const newsfeedContainer = document.getElementById("newsfeed-container");
    const feedAuthGate = document.getElementById("feed-auth-gate");
    const feedTriggerBox = document.getElementById("feed-trigger-box");

    // Modal báo cáo
    const reportModalOverlay = document.getElementById("report-modal-overlay");
    const reportTargetLabel = document.getElementById("report-target-label");
    const reportReasonInput = document.getElementById("report-reason-input");
    const reportStatusEl = document.getElementById("report-modal-status");
    const reportSubmitBtn = document.getElementById("report-modal-submit");
    const reportCloseBtn = document.getElementById("report-modal-close");
    const reportCancelBtn = document.getElementById("report-modal-cancel");

    let homeAccessEnabled = false;
    let currentHomeUser = null;
    let cachedPosts = [];
    let selectedCompressedImageDataUrl = "";
    let musicWidget = null;
    let progressBar = null;
    let usersCache = null;
    let activeReportTarget = null;
    let activeInlineAudio = null;

    function notify(message, type = "info") {
        if (typeof window.dieunwToast === "function") {
            window.dieunwToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    async function askConfirm(message) {
        if (typeof window.dieunwConfirm === "function") {
            return window.dieunwConfirm(message);
        }
        return window.confirm(message);
    }

    function resolveMedia(url) {
        if (typeof window.dieunwResolveMedia === "function") {
            return window.dieunwResolveMedia(url);
        }
        const raw = String(url || "").trim();
        if (!raw) return "";
        if (raw.startsWith("/uploads/")) return `${API_BASE}${raw}`;
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

    // Lọc HTML an toàn khi hiển thị bài viết Rich Text
    function sanitizeRichHtml(rawHtml) {
        const template = document.createElement("template");
        template.innerHTML = String(rawHtml || "");
        const allowedTags = new Set([
            "B", "STRONG", "I", "EM", "U", "S", "H1", "H2", "H3", "H4", "H5",
            "P", "DIV", "BR", "SPAN", "UL", "OL", "LI", "BLOCKQUOTE", "A"
        ]);
        const walk = (node) => {
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
                // Xóa các thuộc tính nguy hiểm (onclick, onerror, ...)
                for (const attr of Array.from(child.attributes)) {
                    const name = attr.name.toLowerCase();
                    if (name === "style") {
                        const safeColor = attr.value.match(/color\s*:\s*([^;]+)/i);
                        child.setAttribute("style", safeColor ? `color:${safeColor[1].trim()}` : "");
                        if (!safeColor) child.removeAttribute("style");
                    } else if (name === "class" && child.classList.contains("mention-chip")) {
                        child.className = "mention-chip";
                    } else if (tag === "A" && name === "href") {
                        const href = attr.value.trim();
                        if (!/^https?:\/\//i.test(href) && !href.startsWith("./")) {
                            child.removeAttribute("href");
                        } else {
                            child.setAttribute("target", "_blank");
                            child.setAttribute("rel", "noopener noreferrer");
                        }
                    } else {
                        child.removeAttribute(attr.name);
                    }
                }
                walk(child);
            }
        };
        walk(template.content);
        return template.innerHTML;
    }

    // Khởi tạo widget chọn nhạc & thanh tiến trình
    function ensureComposerWidgets() {
        if (postMusicMount && !musicWidget) {
            if (typeof window.dieunwCreateMusicAttachmentWidget === "function") {
                musicWidget = window.dieunwCreateMusicAttachmentWidget(postMusicMount, {
                    title: "Nhạc nền bài viết (tùy chọn)"
                });
            } else {
                musicWidget = createFallbackMusicWidget(postMusicMount);
            }
        }
        if (postProgressMount && !progressBar && typeof window.dieunwCreateProgressBar === "function") {
            progressBar = window.dieunwCreateProgressBar(postProgressMount);
        }
    }

    function createFallbackMusicWidget(container) {
        container.innerHTML = `
            <div class="dieunw-music-attach-box">
                <label class="music-attach-label">Đính kèm nhạc (tùy chọn)</label>
                <div class="music-attach-controls" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
                    <select class="music-attach-select" style="flex:1; min-width:180px;">
                        <option value="">-- Chọn từ Kho nhạc DIEUNW --</option>
                    </select>
                    <label class="dieunw-file-btn" style="cursor:pointer;">
                        Tải tệp nhạc
                        <input type="file" class="music-attach-file" accept="audio/*" hidden>
                    </label>
                    <button type="button" class="btn-clear-upload music-attach-clear" hidden>Bỏ nhạc</button>
                </div>
                <p class="music-attach-status" style="font-size:12px; color:#5e7488; margin-top:4px;"></p>
            </div>
        `;
        const selectEl = container.querySelector(".music-attach-select");
        const fileEl = container.querySelector(".music-attach-file");
        const clearBtn = container.querySelector(".music-attach-clear");
        const statusEl = container.querySelector(".music-attach-status");
        let tracks = [];
        let pickedFile = null;

        fetch(MUSIC_API, { credentials: "include" })
            .then(r => r.ok ? r.json() : { tracks: [] })
            .then(data => {
                tracks = Array.isArray(data.tracks) ? data.tracks : [];
                tracks.forEach(tr => {
                    const opt = document.createElement("option");
                    opt.value = tr.id;
                    opt.textContent = `${tr.title} - ${tr.artist || tr.authorName || "Thành viên"}`;
                    selectEl.appendChild(opt);
                });
            })
            .catch(() => {});

        selectEl.addEventListener("change", () => {
            if (selectEl.value) {
                pickedFile = null;
                fileEl.value = "";
                clearBtn.hidden = false;
                statusEl.textContent = `Đã chọn: ${selectEl.options[selectEl.selectedIndex].textContent}`;
            } else if (!pickedFile) {
                clearBtn.hidden = true;
                statusEl.textContent = "";
            }
        });

        fileEl.addEventListener("change", () => {
            const f = fileEl.files?.[0];
            if (!f) return;
            pickedFile = f;
            selectEl.value = "";
            clearBtn.hidden = false;
            statusEl.textContent = `Tệp nhạc từ máy: ${f.name}`;
        });

        clearBtn.addEventListener("click", () => {
            pickedFile = null;
            fileEl.value = "";
            selectEl.value = "";
            clearBtn.hidden = true;
            statusEl.textContent = "";
        });

        return {
            getValue() {
                if (pickedFile) {
                    return { mode: "file", file: pickedFile, title: pickedFile.name.replace(/\.[^.]+$/, "") };
                }
                const found = tracks.find(t => String(t.id) === String(selectEl.value));
                if (found) {
                    return {
                        mode: "library",
                        musicId: found.id,
                        musicUrl: found.audioUrl || found.audio_url || "",
                        musicTitle: found.title || "",
                        musicArtist: found.artist || found.authorName || ""
                    };
                }
                return null;
            },
            reset() {
                pickedFile = null;
                fileEl.value = "";
                selectEl.value = "";
                clearBtn.hidden = true;
                statusEl.textContent = "";
            }
        };
    }

    function updateProgressUI(percent, label) {
        if (progressBar) {
            if (typeof progressBar.update === "function") {
                progressBar.update(percent, label);
            } else if (typeof progressBar.setProgress === "function") {
                progressBar.setProgress(percent, label);
            }
        } else if (postProgressMount) {
            postProgressMount.innerHTML = `
                <div class="dieunw-progress-wrap">
                    <div class="dieunw-progress-meta"><span>${escapeHtml(label || "Đang tải lên...")}</span><span>${Math.round(percent)}%</span></div>
                    <div class="dieunw-progress-track"><div class="dieunw-progress-fill" style="width:${Math.min(100, Math.max(0, percent))}%"></div></div>
                </div>
            `;
        }
    }

    function resetProgressUI() {
        if (progressBar && typeof progressBar.reset === "function") {
            progressBar.reset();
        } else if (progressBar && typeof progressBar.hide === "function") {
            progressBar.hide();
        } else if (postProgressMount) {
            postProgressMount.innerHTML = "";
        }
    }

    function uploadRequestWithProgress(url, { method = "POST", body, headers = {} }, onPercent) {
        if (typeof window.dieunwUploadWithProgress === "function") {
            return window.dieunwUploadWithProgress(url, { method, body, headers }, onPercent);
        }
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.withCredentials = true;
            Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
            xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable && typeof onPercent === "function") {
                    onPercent(Math.round((ev.loaded / ev.total) * 100));
                }
            };
            xhr.onload = () => {
                let parsed = {};
                try { parsed = JSON.parse(xhr.responseText || "{}"); } catch {}
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(parsed);
                } else {
                    reject(new Error(parsed.error || `Lỗi máy chủ (${xhr.status})`));
                }
            };
            xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải lên."));
            xhr.send(body);
        });
    }

    // Nén ảnh sang WebP trước khi đăng để tăng tốc cực nhanh
    async function compressPostImage(file) {
        if (typeof window.dieunwCompressImage === "function") {
            const result = await window.dieunwCompressImage(file, 1440, 0.82);
            if (typeof result === "string") return result;
            if (result instanceof Blob) {
                return await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ""));
                    reader.readAsDataURL(result);
                });
            }
        }
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error("Định dạng ảnh không hợp lệ."));
                img.onload = () => {
                    const maxDim = 1440;
                    let { width, height } = img;
                    if (width > maxDim || height > maxDim) {
                        const scale = Math.min(maxDim / width, maxDim / height);
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                    }
                    const canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL("image/webp", 0.82));
                };
                img.src = String(reader.result || "");
            };
            reader.readAsDataURL(file);
        });
    }

    // Cập nhật quyền truy cập trang chủ
    function updateHomeAccess(user = null) {
        const isAuthenticated = Boolean(user?.id);
        const wasAuthenticated = homeAccessEnabled;
        currentHomeUser = isAuthenticated ? user : null;
        homeAccessEnabled = isAuthenticated;

        if (feedAuthGate) feedAuthGate.hidden = isAuthenticated;
        if (feedTriggerBox) feedTriggerBox.hidden = !isAuthenticated;
        if (newsfeedContainer) newsfeedContainer.hidden = !isAuthenticated;
        if (!isAuthenticated) {
            closeModal();
            return;
        }

        const name = user.name || user.email;
        const avatar = resolveMedia(user.avatar) || "./DIEU.png";
        const authorName = document.getElementById("post-author-name");
        const authorAvatar = document.getElementById("post-author-avatar");
        if (authorName) authorName.textContent = name;
        if (authorAvatar) authorAvatar.src = avatar;
        if (triggerAvatar) triggerAvatar.src = avatar;
        if (triggerInput) triggerInput.textContent = `${name} ơi, bạn đang nghĩ gì thế?`;

        if (!wasAuthenticated) {
            ensureComposerWidgets();
            loadPosts();
        }
    }
    window.updateHomeAccess = updateHomeAccess;

    function showHomeAuth(view) {
        const authContainer = document.getElementById("auth-container");
        if (!authContainer) return;
        authContainer.style.display = "block";
        if (view === "register") {
            document.getElementById("link-to-register")?.click();
        } else {
            const loginView = document.getElementById("login-view");
            const regView = document.getElementById("register-view");
            const forgotView = document.getElementById("forgot-view");
            if (loginView) loginView.style.display = "block";
            if (regView) regView.style.display = "none";
            if (forgotView) forgotView.style.display = "none";
        }
        authContainer.scrollIntoView({ behavior: "smooth", block: "center" });
        if (view === "login") document.getElementById("login-email")?.focus();
    }

    document.getElementById("feed-login-button")?.addEventListener("click", () => showHomeAuth("login"));
    document.getElementById("feed-register-button")?.addEventListener("click", () => showHomeAuth("register"));

    document.querySelectorAll('input[name="post-visibility"]').forEach(option => {
        option.addEventListener("change", () => {
            const label = document.getElementById("post-privacy-label");
            if (label) label.textContent = option.value === "private" ? "Riêng tư" : "Công khai";
        });
    });

    // --- 1. POPUP SOẠN BÀI VIẾT ---
    function openModal() {
        if (!homeAccessEnabled || !modalOverlay) return;
        ensureComposerWidgets();
        resetProgressUI();
        modalOverlay.hidden = false;
        requestAnimationFrame(() => modalOverlay.classList.add("open"));
        setTimeout(() => richEditor?.focus(), 60);
    }

    function closeModal() {
        if (!modalOverlay) return;
        modalOverlay.classList.remove("open");
        modalOverlay.hidden = true;
        if (mentionDropdown) mentionDropdown.hidden = true;
    }

    if (triggerInput) triggerInput.addEventListener("click", openModal);
    if (btnTriggerOpen) btnTriggerOpen.addEventListener("click", openModal);
    if (btnModalClose) btnModalClose.addEventListener("click", closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    // --- 2. THANH CÔNG CỤ RICH TEXT & @TAG ---
    document.querySelectorAll("#post-rte-wrapper .rte-btn[data-cmd]").forEach(btn => {
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => {
            richEditor?.focus();
            document.execCommand(btn.getAttribute("data-cmd"), false, null);
        });
    });

    if (headingSelect) {
        headingSelect.addEventListener("change", () => {
            richEditor?.focus();
            document.execCommand("formatBlock", false, headingSelect.value);
        });
    }

    if (colorPicker) {
        colorPicker.addEventListener("input", () => {
            richEditor?.focus();
            document.execCommand("foreColor", false, colorPicker.value);
        });
    }

    async function fetchUsersForMention() {
        if (Array.isArray(usersCache)) return usersCache;
        try {
            const res = await fetch(`${API_BASE}/api/users`, { credentials: "include" });
            const data = await res.json();
            usersCache = Array.isArray(data.users) ? data.users : [];
        } catch {
            usersCache = [];
        }
        return usersCache;
    }

    function insertMentionChip(user) {
        if (!richEditor) return;
        richEditor.focus();
        const label = `@${user.name || user.email}`;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                const textBefore = node.textContent.slice(0, range.startOffset);
                const match = textBefore.match(/@([^\s@]*)$/);
                if (match) {
                    range.setStart(node, range.startOffset - match[0].length);
                    range.deleteContents();
                }
            }
            const chip = document.createElement("span");
            chip.className = "mention-chip";
            chip.contentEditable = "false";
            chip.textContent = label;
            const space = document.createTextNode("\u00A0");
            range.insertNode(space);
            range.insertNode(chip);
            range.setStartAfter(space);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            richEditor.innerHTML += `<span class="mention-chip" contenteditable="false">${escapeHtml(label)}</span>&nbsp;`;
        }
        if (mentionDropdown) mentionDropdown.hidden = true;
    }

    async function showMentionSuggestions(query) {
        if (!mentionDropdown) return;
        const users = await fetchUsersForMention();
        const q = String(query || "").toLowerCase();
        const matches = users
            .filter(u => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q))
            .slice(0, 6);

        if (!matches.length) {
            mentionDropdown.hidden = true;
            return;
        }
        mentionDropdown.innerHTML = "";
        matches.forEach(u => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "mention-item";
            item.innerHTML = `
                <img src="${escapeHtml(resolveMedia(u.avatar) || "./DIEU.png")}" alt="">
                <span><strong>${escapeHtml(u.name || "Thành viên")}</strong> <small>${escapeHtml(u.email || "")}</small></span>
            `;
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                insertMentionChip(u);
            });
            mentionDropdown.appendChild(item);
        });
        mentionDropdown.hidden = false;
    }

    if (mentionTrigger) {
        mentionTrigger.addEventListener("mousedown", (e) => e.preventDefault());
        mentionTrigger.addEventListener("click", () => {
            richEditor?.focus();
            document.execCommand("insertText", false, "@");
            showMentionSuggestions("");
        });
    }

    if (richEditor) {
        richEditor.addEventListener("input", () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) {
                const before = node.textContent.slice(0, range.startOffset);
                const match = before.match(/@([^\s@]{0,24})$/);
                if (match) {
                    showMentionSuggestions(match[1]);
                    return;
                }
            }
            if (mentionDropdown) mentionDropdown.hidden = true;
        });
    }

    // --- 3. CHỌN ẢNH TỪ MÁY + NÉN WEBP ---
    function clearSelectedImage() {
        selectedCompressedImageDataUrl = "";
        if (imageFileInput) imageFileInput.value = "";
        if (imageFileNameEl) imageFileNameEl.textContent = "Chưa chọn ảnh";
        if (imagePreviewEl) imagePreviewEl.src = "";
        if (imagePreviewWrap) imagePreviewWrap.hidden = true;
        if (imageClearBtn) imageClearBtn.hidden = true;
    }

    if (imageFileInput) {
        imageFileInput.addEventListener("change", async () => {
            const file = imageFileInput.files?.[0];
            if (!file) {
                clearSelectedImage();
                return;
            }
            if (imageFileNameEl) imageFileNameEl.textContent = `${file.name} (đang tối ưu...)`;
            try {
                const dataUrl = await compressPostImage(file);
                selectedCompressedImageDataUrl = dataUrl;
                if (imageFileNameEl) imageFileNameEl.textContent = file.name;
                if (imagePreviewEl) imagePreviewEl.src = dataUrl;
                if (imagePreviewWrap) imagePreviewWrap.hidden = false;
                if (imageClearBtn) imageClearBtn.hidden = false;
            } catch (err) {
                clearSelectedImage();
                notify(err.message || "Không thể xử lý ảnh đã chọn.", "error");
            }
        });
    }
    if (imageClearBtn) imageClearBtn.addEventListener("click", clearSelectedImage);

    // --- 4. TẢI & HIỂN THỊ BÀI VIẾT ---
    async function loadPosts() {
        if (!newsfeedContainer || !homeAccessEnabled) return;
        try {
            const response = await fetch(POSTS_API, { credentials: "include" });
            const data = await response.json();
            if (response.status === 401) {
                localStorage.removeItem("dieuNwUser");
                updateHomeAccess(null);
                return;
            }
            if (!response.ok) throw new Error(data.error || "Không thể tải bài viết.");
            cachedPosts = Array.isArray(data.posts) ? data.posts : [];
            renderPosts(cachedPosts);
        } catch (error) {
            newsfeedContainer.innerHTML = `<p style="color:#b42318; text-align:center;">${escapeHtml(error.message || "Không thể tải bài viết. Hãy tải lại trang.")}</p>`;
        }
    }

    function createPostCardElement(post) {
        const viewer = currentHomeUser;
        const viewerId = String(viewer?.id || "");
        const postElement = document.createElement("article");
        postElement.className = "post-card";
        postElement.dataset.postId = post.id;

        const resolvedImg = resolveMedia(post.image);
        const hasValidImage = resolvedImg && !resolvedImg.includes("placeholder") && !resolvedImg.includes("faker");
        const postImageHtml = hasValidImage
            ? `<img src="${escapeHtml(resolvedImg)}" class="post-card-image" loading="lazy" alt="Ảnh bài viết">`
            : "";

        const countLikes = Number(post.likes || 0);
        const authorName = escapeHtml(post.name || viewer?.name || viewer?.email || "Thành viên DIEUNW");
        const authorAvatar = escapeHtml(resolveMedia(post.avatar) || "./DIEU.png");
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

        const bodyHtml = post.isRichHtml
            ? `<div class="post-card-rich-body">${sanitizeRichHtml(post.content || "")}</div>`
            : `<p>${escapeHtml(post.content || "")}</p>`;

        // Khung nhạc đính kèm bài viết (nếu có)
        const musicUrl = resolveMedia(post.musicUrl || post.music_url || "");
        const musicTitle = post.musicTitle || post.music_title || "Nhạc đính kèm";
        const musicArtist = post.musicArtist || post.music_artist || "";
        const musicBlockHtml = musicUrl ? `
            <div class="inline-music-card">
                <div class="inline-music-meta">
                    <span class="inline-music-badge">♪ Âm nhạc</span>
                    <strong>${escapeHtml(musicTitle)}</strong>
                    ${musicArtist ? `<small>${escapeHtml(musicArtist)}</small>` : ""}
                </div>
                <audio class="inline-music-audio" controls preload="none" src="${escapeHtml(musicUrl)}"></audio>
            </div>
        ` : "";

        const clubBadgeHtml = post.clubName
            ? `<span class="post-club-pill">CLB ${escapeHtml(post.clubName)}</span>`
            : "";

        const isLiked = Boolean(post.likedByMe);
        const canDelete = String(post.userId || "") === viewerId || Boolean(viewer?.isAdmin || viewer?.isModerator);

        postElement.innerHTML = `
            <div class="post-card-header">
                <img src="${authorAvatar}" class="post-card-avatar" alt="">
                <div style="min-width:0; flex:1;">
                    <h4 class="post-card-author">${authorName} ${clubBadgeHtml}</h4>
                    <span class="post-card-time">${new Date(post.createdAt).toLocaleString("vi-VN")} · ${visibilityLabel}</span>
                </div>
                <button type="button" class="post-report-btn" title="Báo cáo bài viết">Báo cáo</button>
            </div>
            <div class="post-card-body">
                ${bodyHtml}
                ${postImageHtml}
                ${musicBlockHtml}
            </div>
            <div class="post-status-info">
                <span class="like-count-text">
                    <img src="./icon-like.png" class="status-like-icon" alt="Like">
                    <span class="count">${countLikes}</span> lượt thích
                </span>
                <span class="comment-count-text">
                    <img src="./icon-comment.png" class="status-comment-icon" alt="Comment">
                    <span class="comment-count">${savedComments.length}</span> bình luận
                </span>
            </div>
            <div class="post-interact-bar">
                <button type="button" class="btn-interact btn-like ${isLiked ? "liked" : ""}" ${isLiked ? 'style="color:#0078ff;font-weight:bold;"' : ""}>
                    <img src="./icon-like.png" class="custom-interact-icon" alt="Like"> Thích
                </button>
                <button type="button" class="btn-interact btn-comment">
                    <img src="./icon-comment.png" class="custom-interact-icon" alt="Comment"> Bình luận
                </button>
            </div>
            <div class="comment-section" style="display: none;">
                <div class="comment-input-group">
                    <img src="${escapeHtml(resolveMedia(viewer?.avatar) || "./DIEU.png")}" class="user-avatar-mini" style="width:32px; height:32px;" alt="">
                    <input type="text" class="comment-field" placeholder="Viết bình luận công khai...">
                </div>
                <div class="comments-list"></div>
            </div>
        `;

        // Render bình luận ban đầu
        const commentsListEl = postElement.querySelector(".comments-list");
        savedComments.forEach(cmt => appendCommentDom(commentsListEl, cmt, post.name));

        // Tự động dừng audio khác nếu người dùng phát audio trong bài viết
        const inlineAudio = postElement.querySelector(".inline-music-audio");
        if (inlineAudio) {
            inlineAudio.addEventListener("play", () => {
                if (typeof window.dieunwPauseGlobalMusic === "function") {
                    window.dieunwPauseGlobalMusic();
                }
                if (activeInlineAudio && activeInlineAudio !== inlineAudio) {
                    activeInlineAudio.pause();
                }
                activeInlineAudio = inlineAudio;
            });
        }

        // Thích bài viết (cập nhật ngay lập tức, không reload cả feed)
        const likeBtn = postElement.querySelector(".btn-like");
        const likeCountEl = postElement.querySelector(".like-count-text .count");
        likeBtn.addEventListener("click", async () => {
            if (!homeAccessEnabled) return;
            const nextLiked = !likeBtn.classList.contains("liked");
            likeBtn.disabled = true;
            try {
                const res = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}/like`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ liked: nextLiked })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Không thể cập nhật lượt thích.");
                likeBtn.classList.toggle("liked", nextLiked);
                likeBtn.style.color = nextLiked ? "#0078ff" : "";
                likeBtn.style.fontWeight = nextLiked ? "bold" : "";
                if (likeCountEl) likeCountEl.textContent = String(data.likes ?? (nextLiked ? countLikes + 1 : Math.max(0, countLikes - 1)));
                post.likedByMe = nextLiked;
                post.likes = Number(data.likes ?? post.likes);
            } catch (err) {
                notify(err.message || "Không thể thích bài viết.", "error");
            } finally {
                likeBtn.disabled = false;
            }
        });

        // Bật/tắt khung bình luận
        const commentBtn = postElement.querySelector(".btn-comment");
        const commentSection = postElement.querySelector(".comment-section");
        const commentField = postElement.querySelector(".comment-field");
        const commentCountEl = postElement.querySelector(".comment-count");

        commentBtn.addEventListener("click", () => {
            const isHidden = commentSection.style.display === "none";
            commentSection.style.display = isHidden ? "block" : "none";
            if (isHidden) commentField?.focus();
        });

        commentField.addEventListener("keypress", async (ev) => {
            if (ev.key !== "Enter") return;
            const content = commentField.value.trim();
            if (!content || !homeAccessEnabled) return;
            ev.preventDefault();
            commentField.disabled = true;
            try {
                const res = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}/comments`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Không thể gửi bình luận.");
                commentField.value = "";
                const createdCmt = data.comment || {
                    name: viewer?.name || viewer?.email || "Bạn",
                    avatar: viewer?.avatar || "./DIEU.png",
                    text: content
                };
                appendCommentDom(commentsListEl, createdCmt, viewer?.name);
                savedComments.push(createdCmt);
                if (commentCountEl) commentCountEl.textContent = String(savedComments.length);
            } catch (err) {
                notify(err.message || "Không thể gửi bình luận.", "error");
            } finally {
                commentField.disabled = false;
                commentField.focus();
            }
        });

        // Báo cáo bài viết
        postElement.querySelector(".post-report-btn")?.addEventListener("click", () => {
            openReportModal("post", post.id, `Bài viết của ${post.name || "Thành viên"}`);
        });

        // Xóa bài viết (cập nhật DOM trực tiếp)
        if (canDelete) {
            const actions = document.createElement("div");
            actions.className = "post-card-actions";
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "post-delete-button";
            deleteButton.textContent = "Xóa bài viết";
            deleteButton.addEventListener("click", async () => {
                const ok = await askConfirm("Bạn có chắc muốn xóa bài viết này?");
                if (!ok) return;
                deleteButton.disabled = true;
                try {
                    const response = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}`, {
                        method: "DELETE",
                        credentials: "include"
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Không thể xóa bài viết.");
                    cachedPosts = cachedPosts.filter(p => String(p.id) !== String(post.id));
                    postElement.remove();
                    if (!newsfeedContainer.querySelector(".post-card")) {
                        newsfeedContainer.innerHTML = "<p class='empty-text'>Chưa có bài viết nào. Hãy là người đầu tiên đăng bài!</p>";
                    }
                    notify("Đã xóa bài viết.", "success");
                } catch (error) {
                    notify(error.message || "Không thể xóa bài viết.", "error");
                    deleteButton.disabled = false;
                }
            });
            actions.appendChild(deleteButton);
            postElement.appendChild(actions);
        }

        return postElement;
    }

    function appendCommentDom(container, cmt, fallbackName) {
        if (!container) return;
        const item = document.createElement("div");
        item.className = "comment-item";
        const avatarSrc = escapeHtml(resolveMedia(cmt.avatar) || "./DIEU.png");
        const stickerHtml = cmt.stickerUrl
            ? `<img src="${escapeHtml(resolveMedia(cmt.stickerUrl))}" alt="Sticker" style="max-width:110px; border-radius:8px; margin-top:4px;">`
            : "";
        item.innerHTML = `
            <img src="${avatarSrc}" class="post-card-avatar" style="width:32px; height:32px;" alt="">
            <div class="comment-content-box">
                <h5>${escapeHtml(cmt.name || fallbackName || "Thành viên")}</h5>
                ${cmt.text ? `<p>${escapeHtml(cmt.text)}</p>` : ""}
                ${stickerHtml}
            </div>
        `;
        container.appendChild(item);
    }

    function renderPosts(posts) {
        const viewer = currentHomeUser;
        if (!viewer || !newsfeedContainer) return;
        const viewerId = String(viewer.id || "");
        const viewerEmail = String(viewer.email || "").toLowerCase();

        const visiblePosts = posts.filter(post => {
            if (["study-resource", "public-chat-room", "public-chat-message"].includes(post.type)) return false;
            if (post.visibility !== "private") return true;
            return String(post.userId || "") === viewerId || String(post.authorEmail || "").toLowerCase() === viewerEmail;
        });

        newsfeedContainer.innerHTML = "";
        if (!visiblePosts.length) {
            newsfeedContainer.innerHTML = "<p class='empty-text'>Chưa có bài viết nào. Hãy là người đầu tiên đăng bài!</p>";
            return;
        }

        const fragment = document.createDocumentFragment();
        visiblePosts.slice(0, 25).forEach(post => {
            fragment.appendChild(createPostCardElement(post));
        });
        newsfeedContainer.appendChild(fragment);
    }

    // --- 5. ĐĂNG BÀI VIẾT MỚI (CÓ NÉN ẢNH + NHẠC + % PROGRESS + CHÈN NHANH) ---
    if (btnSubmit) {
        btnSubmit.addEventListener("click", async () => {
            const loggedInUser = currentHomeUser;
            if (!homeAccessEnabled || !loggedInUser) {
                updateHomeAccess(null);
                return;
            }

            const plainText = (richEditor?.innerText || "").trim();
            const rawHtml = (richEditor?.innerHTML || "").trim();
            if (!plainText) {
                notify("Bạn ơi, hãy nhập nội dung bài viết trước khi đăng nhé!", "warning");
                richEditor?.focus();
                return;
            }

            const visibility = document.querySelector('input[name="post-visibility"]:checked')?.value || "public";
            const musicSelection = musicWidget ? musicWidget.getValue() : null;

            btnSubmit.disabled = true;
            btnSubmit.textContent = "Đang đăng...";

            try {
                let musicId = "";
                let musicUrl = "";
                let musicTitle = "";
                let musicArtist = "";

                if (musicSelection) {
                    const localFile = musicSelection.file || musicSelection.audioFile;
                    if (localFile instanceof File) {
                        updateProgressUI(5, "Đang tải tệp nhạc lên Kho nhạc...");
                        const fd = new FormData();
                        fd.append("title", musicSelection.title || localFile.name.replace(/\.[^.]+$/, ""));
                        fd.append("artist", loggedInUser.name || loggedInUser.email || "Thành viên");
                        fd.append("genre", "Khác");
                        fd.append("audio", localFile);

                        const musicRes = await uploadRequestWithProgress(MUSIC_API, {
                            method: "POST",
                            body: fd
                        }, (pct) => updateProgressUI(Math.round(pct * 0.55), `Đang tải nhạc (${pct}%)...`));

                        const uploadedTrack = musicRes.track || {};
                        musicId = uploadedTrack.id || "";
                        musicUrl = uploadedTrack.audioUrl || uploadedTrack.audio_url || "";
                        musicTitle = uploadedTrack.title || musicSelection.title || localFile.name;
                        musicArtist = uploadedTrack.artist || loggedInUser.name || "";
                    } else {
                        musicId = musicSelection.musicId || musicSelection.id || "";
                        musicUrl = musicSelection.musicUrl || musicSelection.audioUrl || "";
                        musicTitle = musicSelection.musicTitle || musicSelection.title || "";
                        musicArtist = musicSelection.musicArtist || musicSelection.artist || "";
                    }
                }

                updateProgressUI(musicSelection?.file ? 60 : 15, "Đang đăng bài viết...");

                const payload = {
                    content: rawHtml || escapeHtml(plainText),
                    image: selectedCompressedImageDataUrl || "",
                    visibility,
                    isRichHtml: true,
                    musicId: musicId || undefined,
                    musicUrl: musicUrl || undefined,
                    musicTitle: musicTitle || undefined,
                    musicArtist: musicArtist || undefined
                };

                const data = await uploadRequestWithProgress(POSTS_API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }, (pct) => {
                    const mapped = musicSelection?.file ? 60 + Math.round(pct * 0.4) : Math.max(15, pct);
                    updateProgressUI(mapped, `Đang tải lên (${mapped}%)...`);
                });

                updateProgressUI(100, "Hoàn tất!");

                // Chèn bài viết mới trực tiếp lên đầu feed (siêu nhanh, không phải load lại toàn bộ)
                if (data?.post) {
                    cachedPosts.unshift(data.post);
                    const emptyText = newsfeedContainer?.querySelector(".empty-text, .loading-text");
                    if (emptyText) emptyText.remove();
                    if (newsfeedContainer) {
                        newsfeedContainer.prepend(createPostCardElement(data.post));
                    }
                } else {
                    await loadPosts();
                }

                // Reset form modal
                if (richEditor) richEditor.innerHTML = "";
                clearSelectedImage();
                if (musicWidget && typeof musicWidget.reset === "function") musicWidget.reset();
                resetProgressUI();
                closeModal();
                notify("Đăng bài viết thành công!", "success");
            } catch (error) {
                resetProgressUI();
                notify(error.message || "Đăng bài không thành công, vui lòng thử lại!", "error");
            } finally {
                btnSubmit.textContent = "Đăng";
                btnSubmit.disabled = false;
            }
        });
    }

    // --- 6. MODAL BÁO CÁO VI PHẠM ---
    function openReportModal(targetType, targetId, labelText) {
        if (!reportModalOverlay) return;
        activeReportTarget = { targetType, targetId };
        if (reportTargetLabel) reportTargetLabel.textContent = labelText || "";
        if (reportReasonInput) reportReasonInput.value = "";
        if (reportStatusEl) reportStatusEl.textContent = "";
        document.querySelectorAll(".report-chip").forEach(c => c.classList.remove("active"));
        reportModalOverlay.hidden = false;
    }

    function closeReportModal() {
        if (reportModalOverlay) reportModalOverlay.hidden = true;
        activeReportTarget = null;
    }

    document.querySelectorAll(".report-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".report-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            if (reportReasonInput && !reportReasonInput.value.trim()) {
                reportReasonInput.value = chip.getAttribute("data-reason") || "";
            }
        });
    });

    reportCloseBtn?.addEventListener("click", closeReportModal);
    reportCancelBtn?.addEventListener("click", closeReportModal);
    reportModalOverlay?.addEventListener("click", (e) => {
        if (e.target === reportModalOverlay) closeReportModal();
    });

    reportSubmitBtn?.addEventListener("click", async () => {
        if (!activeReportTarget) return;
        const selectedChip = document.querySelector(".report-chip.active")?.getAttribute("data-reason") || "";
        const reason = (reportReasonInput?.value || selectedChip || "Vi phạm nội quy").trim();
        reportSubmitBtn.disabled = true;
        if (reportStatusEl) reportStatusEl.textContent = "Đang gửi báo cáo...";
        try {
            const res = await fetch(REPORTS_API, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    targetType: activeReportTarget.targetType,
                    targetId: activeReportTarget.targetId,
                    reason
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Không thể gửi báo cáo.");
            closeReportModal();
            notify("Đã gửi báo cáo tới Ban kiểm duyệt.", "success");
        } catch (err) {
            if (reportStatusEl) reportStatusEl.textContent = err.message || "Lỗi gửi báo cáo.";
        } finally {
            reportSubmitBtn.disabled = false;
        }
    });

    // --- 7. ĐỒNG BỘ TRẠNG THÁI ĐĂNG NHẬP ---
    updateHomeAccess(null);
    fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
        .then(response => response.json())
        .then(data => {
            if (data.user) {
                localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
                updateHomeAccess(data.user);
            }
        })
        .catch(() => {});

    window.addEventListener("storage", event => {
        if (event.key === "dieuNwUser" && !event.newValue) updateHomeAccess(null);
    });
})();