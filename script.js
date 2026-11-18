const HOME_API_BASE = "https://dieunw.onrender.com";
const POSTS_API = `${HOME_API_BASE}/api/posts`;

const modalOverlay = document.getElementById("post-modal-overlay");
const triggerInput = document.getElementById("trigger-modal-input");
const btnTriggerOpen = document.getElementById("btn-trigger-open");
const btnModalClose = document.getElementById("btn-modal-close");
const btnSubmit = document.getElementById("btn-submit-post");
const postRichEditor = document.getElementById("post-rich-editor");
const newsfeedContainer = document.getElementById("newsfeed-container");
const feedAuthGate = document.getElementById("feed-auth-gate");
const feedTriggerBox = document.getElementById("feed-trigger-box");
const storyBarEl = document.getElementById("story-bar");

let homeAccessEnabled = false;
let currentHomeUser = null;
let pendingPostImageData = "";
let activeHomeReportTarget = null;
let homeStoriesQueue = [];
let homeStoryIdx = 0;

function getHomeHeaders(extra = {}) {
    const token = localStorage.getItem("session_token");
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra
    };
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

    function clean(node) {
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType !== Node.ELEMENT_NODE) {
            node.remove();
            return;
        }
        if (!allowedTags.has(node.tagName)) {
            node.replaceWith(document.createTextNode(node.textContent || ""));
            return;
        }
        Array.from(node.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            if (name === "class" && attr.value.includes("mention-tag")) return;
            if (name === "href" && node.tagName === "A" && /^(https?:\/\/|\.\/profile\.html\?userId=)/i.test(attr.value)) return;
            if (name === "color" && node.tagName === "FONT") return;
            if (name === "style") {
                const m = attr.value.match(/color\s*:\s*([^;]+)/i);
                if (m) {
                    node.setAttribute("style", `color: ${m[1]}`);
                    return;
                }
            }
            node.removeAttribute(attr.name);
        });
        Array.from(node.childNodes).forEach(clean);
    }
    Array.from(tpl.content.childNodes).forEach(clean);
    return tpl.innerHTML;
}

function updateHomeAccess(user = null) {
    const isAuth = Boolean(user?.id);
    currentHomeUser = isAuth ? user : null;
    if (feedAuthGate) feedAuthGate.hidden = isAuth;
    if (feedTriggerBox) feedTriggerBox.hidden = !isAuth;
    if (storyBarEl) storyBarEl.hidden = !isAuth;
    if (newsfeedContainer) newsfeedContainer.hidden = !isAuth;

    if (isAuth) {
        const name = user.name || user.email;
        const authorName = document.getElementById("post-author-name");
        const authorAvatar = document.getElementById("post-author-avatar");
        const triggerAvatar = document.getElementById("feed-trigger-avatar");
        const triggerText = document.getElementById("trigger-modal-input");
        if (authorName) authorName.textContent = name;
        if (authorAvatar) authorAvatar.src = user.avatar || "./DIEU.avif";
        if (triggerAvatar) triggerAvatar.src = user.avatar || "./DIEU.avif";
        if (triggerText) triggerText.textContent = `${name} ơi, bạn đang nghĩ gì thế?`;
        if (!homeAccessEnabled) {
            loadStoriesBar();
            loadPosts();
            populateMyStudySetsSelect();
        }
    } else {
        closeModal();
    }
    homeAccessEnabled = isAuth;
}
window.updateHomeAccess = updateHomeAccess;

function showHomeAuth(view) {
    const authContainer = document.getElementById("auth-container");
    if (!authContainer) return;
    authContainer.style.display = "block";
    if (view === "register") {
        document.getElementById("link-to-register")?.click();
    } else {
        document.getElementById("login-view").style.display = "block";
        document.getElementById("register-view").style.display = "none";
        document.getElementById("forgot-view").style.display = "none";
    }
    authContainer.scrollIntoView({ behavior: "smooth", block: "center" });
}
document.getElementById("feed-login-button")?.addEventListener("click", () => showHomeAuth("login"));
document.getElementById("feed-register-button")?.addEventListener("click", () => showHomeAuth("register"));

// =========================================================
// STORIES BAR & VIEWER (24H / 48H)
// =========================================================
async function loadStoriesBar() {
    if (!storyBarEl || !currentHomeUser) return;
    try {
        const res = await fetch(`${HOME_API_BASE}/api/stories`, {
            credentials: "include",
            headers: getHomeHeaders()
        });
        const data = await res.json();
        const stories = data.stories || [];
        storyBarEl.replaceChildren();

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "story-item";
        addBtn.innerHTML = `
            <span class="story-ring is-add">
                <img src="${escapeHtml(currentHomeUser.avatar || "./DIEU.avif")}" alt="">
                <span class="story-add-plus">+</span>
            </span>
            <span class="story-item-label">Đăng Story</span>
        `;
        addBtn.onclick = () => {
            document.getElementById("home-story-modal-overlay").hidden = false;
        };
        storyBarEl.append(addBtn);

        // Group stories by author
        const grouped = new Map();
        stories.forEach(s => {
            const key = String(s.userId);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(s);
        });

        grouped.forEach(userStories => {
            const first = userStories[0];
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "story-item";
            btn.innerHTML = `
                <span class="story-ring${first.viewedByMe ? " is-seen" : ""}">
                    <img src="${escapeHtml(first.userAvatar || "./DIEU.avif")}" alt="${escapeHtml(first.userName)}">
                </span>
                <span class="story-item-label">${escapeHtml(first.userName)}</span>
            `;
            btn.onclick = () => openHomeStoryViewer(userStories, 0);
            storyBarEl.append(btn);
        });
    } catch {
        // Silent
    }
}

function openHomeStoryViewer(stories, idx = 0) {
    if (!stories.length) return;
    homeStoriesQueue = stories;
    homeStoryIdx = idx;
    renderHomeStory();
    document.getElementById("home-story-viewer-overlay").hidden = false;
}

function renderHomeStory() {
    const s = homeStoriesQueue[homeStoryIdx];
    if (!s) {
        document.getElementById("home-story-viewer-overlay").hidden = true;
        return;
    }
    const track = document.getElementById("home-story-progress-track");
    track.replaceChildren(...homeStoriesQueue.map((_, i) => {
        const seg = document.createElement("div");
        seg.className = `story-progress-seg${i < homeStoryIdx ? " done" : i === homeStoryIdx ? " active" : ""}`;
        const fill = document.createElement("div");
        fill.className = "story-progress-fill";
        seg.append(fill);
        return seg;
    }));
    document.getElementById("home-story-viewer-avatar").src = s.userAvatar || "./DIEU.avif";
    document.getElementById("home-story-viewer-name").textContent = s.userName || "Bạn học";
    document.getElementById("home-story-viewer-time").textContent = new Date(s.createdAt).toLocaleString("vi-VN");
    document.getElementById("home-story-viewer-caption").textContent = s.caption || "";
    document.getElementById("home-story-viewer-views").textContent = `${s.viewCount || 0} lượt xem`;
    document.getElementById("home-story-viewer-expiry").textContent = `Hết hạn: ${new Date(s.expiresAt).toLocaleString("vi-VN")}`;

    const stage = document.getElementById("home-story-media-stage");
    const prev = document.getElementById("home-story-prev");
    const next = document.getElementById("home-story-next");
    stage.querySelectorAll("img, video").forEach(n => n.remove());

    const isVideo = s.mediaType === "video" || /\.(mp4|webm)(\?|$)/i.test(s.mediaUrl || "");
    const el = document.createElement(isVideo ? "video" : "img");
    el.src = s.mediaUrl;
    if (isVideo) { el.controls = true; el.autoplay = true; el.playsInline = true; }
    stage.insertBefore(el, prev);

    prev.hidden = homeStoryIdx === 0;
    next.hidden = homeStoryIdx >= homeStoriesQueue.length - 1;

    fetch(`${HOME_API_BASE}/api/stories/${encodeURIComponent(s.id)}/view`, {
        method: "POST",
        credentials: "include",
        headers: getHomeHeaders()
    }).catch(() => {});
}

document.getElementById("home-story-prev")?.addEventListener("click", () => { if (homeStoryIdx > 0) { homeStoryIdx--; renderHomeStory(); } });
document.getElementById("home-story-next")?.addEventListener("click", () => { if (homeStoryIdx < homeStoriesQueue.length - 1) { homeStoryIdx++; renderHomeStory(); } });
document.getElementById("home-story-viewer-close")?.addEventListener("click", () => { document.getElementById("home-story-viewer-overlay").hidden = true; });
document.getElementById("home-story-close")?.addEventListener("click", () => { document.getElementById("home-story-modal-overlay").hidden = true; });

document.getElementById("home-story-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const status = document.getElementById("home-story-status");
    const file = document.getElementById("home-story-file").files[0];
    if (!file) return;
    try {
        status.textContent = "Đang tải Story lên...";
        const caption = document.getElementById("home-story-caption").value.trim();
        const durationHours = Number(document.getElementById("home-story-duration").value || 24);
        if (file.type.startsWith("image/")) {
            const mediaUrl = window.DIEUNW?.compressImageToWebp ? await window.DIEUNW.compressImageToWebp(file, 1080, 0.85) : "";
            await fetch(`${HOME_API_BASE}/api/stories`, {
                method: "POST",
                credentials: "include",
                headers: getHomeHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ mediaUrl, caption, durationHours })
            });
        } else {
            const fd = new FormData();
            fd.append("media", file);
            fd.append("caption", caption);
            fd.append("durationHours", String(durationHours));
            await fetch(`${HOME_API_BASE}/api/stories`, {
                method: "POST",
                credentials: "include",
                headers: getHomeHeaders(),
                body: fd
            });
        }
        e.currentTarget.reset();
        status.textContent = "";
        document.getElementById("home-story-modal-overlay").hidden = true;
        await loadStoriesBar();
    } catch (err) {
        status.textContent = err.message || "Lỗi đăng Story.";
    }
});

// =========================================================
// COMPOSER: RICH TEXT, @MENTION, IMAGE UPLOAD, STUDY SET EMBED
// =========================================================
async function populateMyStudySetsSelect() {
    const sel = document.getElementById("post-studyset-select");
    if (!sel) return;
    try {
        const res = await fetch(`${HOME_API_BASE}/api/users/me/profile`, {
            credentials: "include",
            headers: getHomeHeaders()
        });
        const data = await res.json();
        const sets = data.studySets || [];
        sel.innerHTML = `<option value="">Không đính kèm bộ ôn tập</option>`;
        sets.forEach(s => {
            const op = document.createElement("option");
            op.value = s.id;
            op.textContent = `[${s.setType === "quiz" ? "Quiz" : "Flashcard"}] ${s.title}`;
            sel.append(op);
        });
    } catch {
        // Ignore
    }
}

document.querySelectorAll('input[name="post-visibility"]').forEach(opt => {
    opt.addEventListener("change", () => {
        const lbl = document.getElementById("post-privacy-label");
        if (lbl) lbl.textContent = opt.value === "private" ? "Riêng tư" : "Công khai";
    });
});

function openModal() {
    if (!homeAccessEnabled || !modalOverlay) return;
    modalOverlay.hidden = false;
    requestAnimationFrame(() => modalOverlay.classList.add("open"));
    postRichEditor?.focus();
}

function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("open");
    modalOverlay.hidden = true;
}

triggerInput?.addEventListener("click", openModal);
btnTriggerOpen?.addEventListener("click", openModal);
btnModalClose?.addEventListener("click", closeModal);
modalOverlay?.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });

// Rich Text Toolbar & Mentions on Home Composer
(() => {
    const wrapper = document.getElementById("post-rte-wrapper");
    const dropdown = document.getElementById("post-mention-dropdown");
    if (!wrapper || !postRichEditor) return;

    wrapper.querySelectorAll(".rte-btn[data-cmd]").forEach(btn => {
        btn.addEventListener("click", () => {
            postRichEditor.focus();
            document.execCommand(btn.getAttribute("data-cmd"), false, null);
        });
    });

    document.getElementById("post-heading-select")?.addEventListener("change", e => {
        postRichEditor.focus();
        document.execCommand("formatBlock", false, e.target.value);
    });

    document.getElementById("post-color-picker")?.addEventListener("input", e => {
        postRichEditor.focus();
        document.execCommand("foreColor", false, e.target.value);
    });

    async function searchHomeMentions(query) {
        if (!dropdown) return;
        try {
            const res = await fetch(`${HOME_API_BASE}/api/users/search?q=${encodeURIComponent(query)}`, {
                credentials: "include",
                headers: getHomeHeaders()
            });
            const data = await res.json();
            const users = data.users || [];
            if (!users.length) return (dropdown.hidden = true);
            dropdown.replaceChildren();
            users.slice(0, 6).forEach(u => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "mention-option";
                btn.innerHTML = `<img src="${escapeHtml(u.avatar || "./DIEU.avif")}" alt=""><div class="mention-option-meta"><strong>${escapeHtml(u.name)}</strong><span>${escapeHtml(u.email)}</span></div>`;
                btn.onclick = () => {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount) {
                        const range = sel.getRangeAt(0);
                        const node = range.startContainer;
                        if (node.nodeType === Node.TEXT_NODE) {
                            const idx = node.textContent.lastIndexOf("@", range.startOffset);
                            if (idx !== -1) {
                                range.setStart(node, idx);
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
                dropdown.append(btn);
            });
            dropdown.hidden = false;
        } catch {
            dropdown.hidden = true;
        }
    }

    document.getElementById("post-mention-trigger")?.addEventListener("click", () => {
        postRichEditor.focus();
        document.execCommand("insertText", false, "@");
        searchHomeMentions("");
    });

    postRichEditor.addEventListener("keyup", () => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const r = sel.getRangeAt(0);
        if (r.startContainer.nodeType !== Node.TEXT_NODE) return (dropdown.hidden = true);
        const before = r.startContainer.textContent.slice(0, r.startOffset);
        const match = before.match(/@([^\s@]{0,24})$/);
        if (match) searchHomeMentions(match[1]);
        else dropdown.hidden = true;
    });
})();

document.getElementById("post-image-file")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const filenameEl = document.getElementById("post-image-filename");
    const previewWrap = document.getElementById("post-image-preview-wrap");
    const previewImg = document.getElementById("post-image-preview");
    const clearBtn = document.getElementById("post-image-clear");
    filenameEl.textContent = "Đang tối ưu WebP...";
    try {
        pendingPostImageData = window.DIEUNW?.compressImageToWebp
            ? await window.DIEUNW.compressImageToWebp(file, 1080, 0.84)
            : "";
        filenameEl.textContent = file.name;
        previewImg.src = pendingPostImageData;
        previewWrap.hidden = false;
        clearBtn.hidden = false;
    } catch {
        filenameEl.textContent = "Lỗi đọc ảnh";
    }
});

document.getElementById("post-image-clear")?.addEventListener("click", () => {
    pendingPostImageData = "";
    document.getElementById("post-image-file").value = "";
    document.getElementById("post-image-filename").textContent = "Chưa chọn ảnh";
    document.getElementById("post-image-preview-wrap").hidden = true;
    document.getElementById("post-image-clear").hidden = true;
});

btnSubmit?.addEventListener("click", async () => {
    if (!homeAccessEnabled || !currentHomeUser) return;
    const plainText = postRichEditor.textContent.trim();
    const htmlContent = postRichEditor.innerHTML.trim();
    const studySetId = document.getElementById("post-studyset-select")?.value || "";
    if (!plainText && !pendingPostImageData && !studySetId) {
        return alert("Hãy nhập nội dung, chọn ảnh hoặc đính kèm bộ ôn tập nhé!");
    }
    const visibility = document.querySelector('input[name="post-visibility"]:checked')?.value || "public";
    btnSubmit.innerText = "Đang đăng...";
    btnSubmit.disabled = true;
    try {
        const res = await fetch(POSTS_API, {
            method: "POST",
            credentials: "include",
            headers: getHomeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                content: htmlContent || plainText,
                isRichHtml: true,
                image: pendingPostImageData || "",
                studySetId: studySetId || undefined,
                visibility
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Đăng bài không thành công.");
        postRichEditor.innerHTML = "";
        pendingPostImageData = "";
        document.getElementById("post-image-file").value = "";
        document.getElementById("post-image-filename").textContent = "Chưa chọn ảnh";
        document.getElementById("post-image-preview-wrap").hidden = true;
        document.getElementById("post-image-clear").hidden = true;
        if (document.getElementById("post-studyset-select")) document.getElementById("post-studyset-select").value = "";
        closeModal();
        await loadPosts();
    } catch (err) {
        alert(err.message || "Lỗi kết nối máy chủ.");
    } finally {
        btnSubmit.innerText = "Đăng";
        btnSubmit.disabled = false;
    }
});

// =========================================================
// INLINE INTERACTIVE STUDY SET PLAYER ON HOME FEED
// =========================================================
function openHomeStudySetPlayer(studySet) {
    const overlay = document.getElementById("home-studyset-player-overlay");
    const titleEl = document.getElementById("home-studyset-player-title");
    const bodyEl = document.getElementById("home-studyset-player-body");
    if (!overlay || !bodyEl) return;
    titleEl.textContent = studySet.title;
    const items = Array.isArray(studySet.items) ? studySet.items : [];
    overlay.hidden = false;

    if (!items.length) {
        bodyEl.innerHTML = `<p class="profile-extra-empty">Bộ học liệu trống.</p>`;
        return;
    }

    if (studySet.setType === "quiz") {
        let idx = 0, score = 0;
        const start = Date.now();
        const renderQ = () => {
            bodyEl.replaceChildren();
            if (idx >= items.length) {
                const dur = Date.now() - start;
                bodyEl.innerHTML = `<div class="empty-illustration-box"><h4>Điểm: ${score}/${items.length}</h4><p>Hoàn thành trong ${(dur / 1000).toFixed(1)} giây</p></div>`;
                fetch(`${HOME_API_BASE}/api/study-sets/${encodeURIComponent(studySet.id)}/attempt`, {
                    method: "POST",
                    credentials: "include",
                    headers: getHomeHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ score, total: items.length, durationMs: dur })
                }).catch(() => {});
                return;
            }
            const q = items[idx];
            const h4 = document.createElement("h4");
            h4.textContent = `${idx + 1}/${items.length}. ${q.front}`;
            bodyEl.append(h4);
            const opts = document.createElement("div");
            opts.className = "quiz-options-list";
            const nextBtn = document.createElement("button");
            nextBtn.type = "button";
            nextBtn.className = "btn-auth";
            nextBtn.textContent = idx === items.length - 1 ? "Hoàn tất" : "Câu tiếp →";
            nextBtn.hidden = true;
            nextBtn.onclick = () => { idx++; renderQ(); };
            (q.options || []).forEach((t, oIdx) => {
                if (!t) return;
                const b = document.createElement("button");
                b.type = "button";
                b.className = "quiz-option-btn";
                b.textContent = `${["A", "B", "C", "D"][oIdx]}. ${t}`;
                b.onclick = () => {
                    opts.querySelectorAll("button").forEach(x => { x.disabled = true; });
                    const ok = Number(q.correctIndex || 0);
                    if (oIdx === ok) { b.classList.add("is-correct"); score++; }
                    else { b.classList.add("is-wrong"); opts.querySelectorAll("button")[ok]?.classList.add("is-correct"); }
                    nextBtn.hidden = false;
                };
                opts.append(b);
            });
            bodyEl.append(opts, nextBtn);
        };
        renderQ();
    } else {
        const queue = items.map((_, i) => i);
        const renderFC = () => {
            bodyEl.replaceChildren();
            if (!queue.length) {
                bodyEl.innerHTML = `<div class="empty-illustration-box"><h4>Đã thuộc toàn bộ thẻ!</h4><p>${escapeHtml(studySet.title)}</p></div>`;
                return;
            }
            const card = items[queue[0]];
            const pill = document.createElement("div");
            pill.className = "sr-queue-pill";
            pill.textContent = `Còn ${queue.length} thẻ • Chạm vào thẻ để lật 3D`;
            const scene = document.createElement("div");
            scene.className = "flashcard-scene";
            const inner = document.createElement("div");
            inner.className = "flashcard-inner";
            inner.innerHTML = `<div class="flashcard-face flashcard-front"><strong>${escapeHtml(card.front)}</strong></div><div class="flashcard-face flashcard-back"><strong>${escapeHtml(card.back || "")}</strong></div>`;
            scene.append(inner);
            scene.onclick = () => inner.classList.toggle("is-flipped");
            const ctrl = document.createElement("div");
            ctrl.className = "flashcard-controls";
            const b1 = document.createElement("button");
            b1.type = "button";
            b1.className = "btn-fc-review";
            b1.textContent = "Cần ôn lại (+3)";
            b1.onclick = () => { const c = queue.shift(); queue.splice(Math.min(3, queue.length), 0, c); renderFC(); };
            const b2 = document.createElement("button");
            b2.type = "button";
            b2.className = "btn-fc-known";
            b2.textContent = "Đã thuộc";
            b2.onclick = () => { queue.shift(); renderFC(); };
            ctrl.append(b1, b2);
            bodyEl.append(pill, scene, ctrl);
        };
        renderFC();
    }
}
document.getElementById("home-studyset-player-close")?.addEventListener("click", () => {
    document.getElementById("home-studyset-player-overlay").hidden = true;
});

// =========================================================
// LOAD & RENDER NEWSFEED POSTS
// =========================================================
async function loadPosts() {
    if (!newsfeedContainer || !homeAccessEnabled) return;
    if (window.DIEUNW?.createSkeletonCardsHtml && !newsfeedContainer.children.length) {
        newsfeedContainer.innerHTML = window.DIEUNW.createSkeletonCardsHtml(3);
    }
    try {
        const res = await fetch(POSTS_API, { credentials: "include", headers: getHomeHeaders() });
        const data = await res.json();
        if (res.status === 401) {
            localStorage.removeItem("dieuNwUser");
            updateHomeAccess(null);
            return;
        }
        if (!res.ok) throw new Error(data.error || "Không thể tải bài viết.");
        renderPosts(data.posts || []);
    } catch {
        newsfeedContainer.innerHTML = "<p style='color:#dc2626; text-align:center;'>Không thể tải bài viết. Hãy tải lại trang.</p>";
    }
}

function renderPosts(posts) {
    const viewer = currentHomeUser;
    if (!viewer) return;
    const viewerId = String(viewer.id || "");
    const viewerEmail = String(viewer.email || "").toLowerCase();

    posts = posts.filter(p => {
        if (["study-resource", "public-chat-room", "public-chat-message"].includes(p.type)) return false;
        if (p.visibility !== "private") return true;
        return String(p.userId || "") === viewerId || String(p.authorEmail || "").toLowerCase() === viewerEmail;
    });

    newsfeedContainer.replaceChildren();
    if (!posts.length) {
        newsfeedContainer.innerHTML = window.DIEUNW?.createEmptyIllustrationHtml
            ? window.DIEUNW.createEmptyIllustrationHtml({
                title: "Bảng tin đang trống",
                subtitle: "Hãy là người đầu tiên chia sẻ bài viết, ảnh hoặc bộ đề ôn tập cùng bạn bè!"
            })
            : `<p class="empty-text">Chưa có bài viết nào.</p>`;
        return;
    }

    posts.slice(0, 20).forEach(post => {
        const el = document.createElement("article");
        el.className = "post-card";
        const hasValidImg = post.image && post.image.trim() !== "" && !post.image.includes("placeholder");
        const imgHtml = hasValidImg ? `<img src="${escapeHtml(post.image)}" class="post-card-image" loading="lazy" alt="Ảnh bài viết">` : "";
        const bodyHtml = post.isRichHtml
            ? `<div class="post-rich-content">${sanitizeRichHtml(post.content || "")}</div>`
            : `<p>${escapeHtml(post.content || "")}</p>`;
        const badgesHtml = window.DIEUNW?.renderAuthorBadgesHtml ? window.DIEUNW.renderAuthorBadgesHtml(post) : "";
        const savedComments = Array.isArray(post.comments) ? post.comments : [];
        const profileHref = post.clubId
            ? `./profile.html?clubId=${encodeURIComponent(post.clubId)}`
            : `./profile.html?userId=${encodeURIComponent(post.userId)}`;

        const commentsHtml = savedComments.map(cmt => {
            const stHtml = cmt.stickerUrl ? `<img src="${escapeHtml(cmt.stickerUrl)}" class="comment-sticker-img" alt="Sticker">` : "";
            return `
                <div class="comment-item">
                    <img src="${escapeHtml(cmt.avatar || "./DIEU.avif")}" class="post-card-avatar" style="width:32px !important; height:32px !important;">
                    <div class="comment-content-box">
                        <h5>${escapeHtml(cmt.name || "Thành viên")}</h5>
                        ${cmt.text ? `<p>${escapeHtml(cmt.text)}</p>` : ""}
                        ${stHtml}
                    </div>
                </div>
            `;
        }).join("");

        el.innerHTML = `
            <div class="post-card-header">
                <div class="post-avatar-wrap">
                    <a href="${profileHref}">
                        <img src="${escapeHtml(post.avatar || "./DIEU.avif")}" class="post-card-avatar" alt="Avatar">
                    </a>
                    ${post.presenceStatus ? `<span class="nav-status-dot" data-status="${escapeHtml(post.presenceStatus)}"></span>` : ""}
                </div>
                <div>
                    <h4 class="post-card-author">
                        <a class="post-card-author-link" href="${profileHref}">${escapeHtml(post.name || "Thành viên DIEUNW")}</a>
                        ${badgesHtml}
                    </h4>
                    <span class="post-card-time">${new Date(post.createdAt).toLocaleString("vi-VN")}</span>
                </div>
            </div>
            <div class="post-card-body">
                ${bodyHtml}
                ${imgHtml}
            </div>
            <div class="post-visibility-label">${post.visibility === "private" ? "Riêng tư" : "Công khai"}</div>
            <div class="post-status-info">
                <span class="like-count-text">
                    <picture><source srcset="./icon-like.avif" type="image/avif"><source srcset="./icon-like.webp" type="image/webp"><img src="./icon-like.png" class="status-like-icon" alt="Like"></picture>
                    <span class="count">${post.likes || 0}</span> lượt thích
                </span>
                <span class="comment-count-text">
                    <picture><source srcset="./icon-comment.avif" type="image/avif"><source srcset="./icon-comment.webp" type="image/webp"><img src="./icon-comment.png" class="status-comment-icon" alt="Comment"></picture>
                    <span class="comment-count">${savedComments.length}</span> bình luận
                </span>
            </div>
            <div class="post-interact-bar">
                <button type="button" class="btn-interact btn-like${post.likedByMe ? " liked" : ""}" style="${post.likedByMe ? "color:#0078ff; font-weight:bold;" : ""}">
                    <picture><source srcset="./icon-like.avif" type="image/avif"><source srcset="./icon-like.webp" type="image/webp"><img src="./icon-like.png" class="custom-interact-icon" alt=""></picture> Thích
                </button>
                <button type="button" class="btn-interact btn-comment">
                    <picture><source srcset="./icon-comment.avif" type="image/avif"><source srcset="./icon-comment.webp" type="image/webp"><img src="./icon-comment.png" class="custom-interact-icon" alt=""></picture> Bình luận
                </button>
                <button type="button" class="btn-interact btn-bookmark">Lưu bài</button>
            </div>
            <div class="comment-section" style="display:none;">
                <div class="comment-input-group">
                    <img src="${escapeHtml(viewer.avatar || "./DIEU.avif")}" class="user-avatar-mini" style="width:32px; height:32px;">
                    <input type="text" class="comment-field" placeholder="Viết bình luận công khai hoặc chọn Sticker...">
                </div>
                <div class="comments-list">${commentsHtml}</div>
            </div>
        `;

        // Embedded Study Set Card
        if (post.studySet) {
            const setBox = document.createElement("div");
            setBox.className = "study-set-inline-card";
            setBox.innerHTML = `
                <span class="study-set-badge">${post.studySet.setType === "quiz" ? "Quiz Tương tác" : "Flashcard 3D"} · ${escapeHtml(post.studySet.subject || "Học tập")}</span>
                <strong>${escapeHtml(post.studySet.title)}</strong>
                <div class="study-set-actions">
                    <button type="button" class="study-set-btn primary btn-open-inline-set">Mở học / Thi thử ngay</button>
                </div>
            `;
            setBox.querySelector(".btn-open-inline-set").onclick = () => openHomeStudySetPlayer(post.studySet);
            el.querySelector(".post-card-body").append(setBox);
        }

        el.querySelector(".btn-like").onclick = async btn => {
            await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}/like`, {
                method: "POST",
                credentials: "include",
                headers: getHomeHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ liked: !post.likedByMe })
            });
            await loadPosts();
        };

        const cmtSec = el.querySelector(".comment-section");
        const cmtField = el.querySelector(".comment-field");
        const cmtGroup = el.querySelector(".comment-input-group");
        el.querySelector(".btn-comment").onclick = () => {
            cmtSec.style.display = cmtSec.style.display === "none" ? "block" : "none";
            if (cmtSec.style.display === "block") cmtField.focus();
        };

        const submitCmt = async (text, stickerUrl = "") => {
            await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}/comments`, {
                method: "POST",
                credentials: "include",
                headers: getHomeHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ content: text, stickerUrl })
            });
            await loadPosts();
        };

        cmtField.addEventListener("keypress", async e => {
            if (e.key === "Enter" && cmtField.value.trim()) {
                e.preventDefault();
                await submitCmt(cmtField.value.trim());
            }
        });

        window.DIEUNW?.attachStickerPicker?.(cmtGroup, sticker => {
            submitCmt(cmtField.value.trim(), sticker.imageUrl);
        });

        const bmBtn = el.querySelector(".btn-bookmark");
        bmBtn.onclick = async () => {
            const res = await fetch(`${HOME_API_BASE}/api/bookmarks/toggle`, {
                method: "POST",
                credentials: "include",
                headers: getHomeHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ itemType: "post", itemId: post.id })
            });
            const d = await res.json();
            bmBtn.classList.toggle("is-saved", Boolean(d.saved));
            bmBtn.textContent = d.saved ? "Đã lưu" : "Lưu bài";
        };

        const actions = document.createElement("div");
        actions.className = "post-card-actions";
        if (String(post.userId || "") !== viewerId) {
            const rep = document.createElement("button");
            rep.type = "button";
            rep.className = "post-report-button";
            rep.textContent = "⚑ Báo cáo";
            rep.onclick = () => {
                activeHomeReportTarget = { targetType: "post", targetId: post.id };
                document.getElementById("report-target-label").textContent = `Báo cáo bài viết của ${post.name}`;
                document.getElementById("report-reason-input").value = "";
                document.getElementById("report-modal-status").textContent = "";
                document.getElementById("report-modal-overlay").hidden = false;
            };
            actions.append(rep);
        }
        if (String(post.userId || "") === viewerId || viewer.isAdmin) {
            const del = document.createElement("button");
            del.type = "button";
            del.className = "post-delete-button";
            del.textContent = "Xóa bài viết";
            del.onclick = async () => {
                if (!confirm("Bạn có chắc muốn xóa bài viết này?")) return;
                await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}`, {
                    method: "DELETE",
                    credentials: "include",
                    headers: getHomeHeaders()
                });
                await loadPosts();
            };
            actions.append(del);
        }
        if (actions.childElementCount) el.append(actions);
        newsfeedContainer.append(el);
    });
}

// Report Modal Handlers
document.querySelectorAll("#report-modal-overlay .report-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll("#report-modal-overlay .report-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        const input = document.getElementById("report-reason-input");
        if (input && !input.value.trim()) input.value = chip.dataset.reason || "";
    });
});
document.getElementById("report-modal-close")?.addEventListener("click", () => { document.getElementById("report-modal-overlay").hidden = true; });
document.getElementById("report-modal-cancel")?.addEventListener("click", () => { document.getElementById("report-modal-overlay").hidden = true; });
document.getElementById("report-modal-submit")?.addEventListener("click", async () => {
    if (!activeHomeReportTarget) return;
    const reason = document.getElementById("report-reason-input").value.trim();
    const status = document.getElementById("report-modal-status");
    if (!reason) return (status.textContent = "Vui lòng nhập lý do báo cáo.");
    try {
        const res = await fetch(`${HOME_API_BASE}/api/reports`, {
            method: "POST",
            credentials: "include",
            headers: getHomeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ ...activeHomeReportTarget, reason })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không thể gửi báo cáo.");
        document.getElementById("report-modal-overlay").hidden = true;
        alert("Đã gửi báo cáo thành công!");
    } catch (err) {
        status.textContent = err.message;
    }
});

updateHomeAccess(null);
fetch(`${HOME_API_BASE}/api/auth/me`, { credentials: "include", headers: getHomeHeaders() })
    .then(r => r.json())
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