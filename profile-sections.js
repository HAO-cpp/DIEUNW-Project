(() => {
    const API_BASE = "https://dieunw.onrender.com";

    const FRAME_CATALOG = [
        { id: "none", name: "Mặc định", cost: 0 },
        { id: "study-warrior", name: "Chiến binh Tự học", cost: 50 },
        { id: "night-owl", name: "Cú đêm NQD", cost: 80 },
        { id: "exam-season", name: "Mùa thi rực lửa", cost: 100 },
        { id: "nqd-anniversary", name: "Kỷ niệm NQD", cost: 150 }
    ];

    const DEFAULT_ECARD_CONFIG = {
        bgImage: "",
        bgPos: "center center",
        color1: "#1769aa",
        color2: "#2298f8",
        overlayOpacity: 25,
        textTone: "light",
        tagline: ""
    };

    const state = {
        targetUserId: null,
        viewerUser: null,
        profileData: null,
        isSelf: false,
        storiesList: [],
        storyIndex: 0,
        activeEndorseTag: null,
        editingStudySetId: null,
        modTab: "posts",
        modWorkspaceData: null,
        activePostFilter: "mine",
        ecardDraft: { ...DEFAULT_ECARD_CONFIG }
    };

    function getAuthHeaders(extra = {}) {
        const token = localStorage.getItem("session_token") || localStorage.getItem("dieuNwToken");
        return {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...extra
        };
    }

    function resolveMediaUrl(url) {
        const raw = String(url || "").trim();
        if (!raw) return "";
        if (raw.startsWith("/uploads/")) return `${API_BASE}${raw}`;
        return raw;
    }

    async function api(path, options = {}) {
        const isForm = options.body instanceof FormData;
        const headers = isForm ? getAuthHeaders(options.headers || {}) : getAuthHeaders({
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        });
        const response = await fetch(`${API_BASE}${path}`, {
            credentials: "include",
            ...options,
            headers
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Yêu cầu không thành công.");
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

    function makeEl(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    async function toOptimizedImage(file, maxWidth = 1080) {
        if (!file) return "";
        if (window.DIEUNW?.compressImageToWebp) {
            return window.DIEUNW.compressImageToWebp(file, maxWidth, 0.84);
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
            reader.readAsDataURL(file);
        });
    }

    function openModal(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = false;
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    }

    document.addEventListener("click", event => {
        const closeBtn = event.target.closest("[data-close-modal]");
        if (closeBtn) {
            closeModal(closeBtn.getAttribute("data-close-modal"));
            return;
        }
        if (event.target.classList.contains("report-modal-overlay") || event.target.classList.contains("story-viewer-overlay")) {
            event.target.hidden = true;
        }
    });

    // =========================================================
    // PURE-JS QR CODE ENCODER (BYTE MODE + CANVAS RENDERER)
    // =========================================================
    function drawQrToCanvas(canvas, text) {
        if (!canvas || !text) return;
        const ctx = canvas.getContext("2d");
        const size = canvas.width;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);

        const matrix = buildQrMatrix(text);
        const dim = matrix.length;
        const quiet = 2;
        const cell = Math.floor(size / (dim + quiet * 2));
        const offset = Math.floor((size - cell * dim) / 2);

        ctx.fillStyle = "#0b1926";
        for (let r = 0; r < dim; r++) {
            for (let c = 0; c < dim; c++) {
                if (matrix[r][c]) {
                    ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
                }
            }
        }
    }

    function buildQrMatrix(text) {
        const bytes = Array.from(new TextEncoder().encode(text));
        const caps = [0, 17, 32, 53, 78, 106, 134];
        const eccPerBlock = [0, 7, 10, 15, 20, 26, 18];
        const totalCodewords = [0, 26, 44, 70, 100, 134, 172];
        let ver = 1;
        while (ver < 6 && bytes.length > caps[ver]) ver++;
        const dim = 17 + ver * 4;
        const mat = Array.from({ length: dim }, () => Array(dim).fill(null));
        const isFunc = Array.from({ length: dim }, () => Array(dim).fill(false));

        function setMod(r, c, val, fn = true) {
            if (r >= 0 && r < dim && c >= 0 && c < dim) {
                mat[r][c] = val ? 1 : 0;
                if (fn) isFunc[r][c] = true;
            }
        }

        function drawFinder(top, left) {
            for (let r = -1; r <= 7; r++) {
                for (let c = -1; c <= 7; c++) {
                    const rr = top + r, cc = left + c;
                    if (rr < 0 || rr >= dim || cc < 0 || cc >= dim) continue;
                    const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
                    const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
                    const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                    setMod(rr, cc, inOuter && (onBorder || inCenter), true);
                }
            }
        }
        drawFinder(0, 0);
        drawFinder(0, dim - 7);
        drawFinder(dim - 7, 0);

        if (ver >= 2) {
            const alignPos = dim - 7;
            for (let r = -2; r <= 2; r++) {
                for (let c = -2; c <= 2; c++) {
                    const onB = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
                    setMod(alignPos + r, alignPos + c, onB, true);
                }
            }
        }

        for (let i = 8; i < dim - 8; i++) {
            setMod(6, i, i % 2 === 0, true);
            setMod(i, 6, i % 2 === 0, true);
        }
        setMod(dim - 8, 8, 1, true);

        for (let i = 0; i < 9; i++) {
            if (i !== 6) {
                isFunc[8][i] = true;
                isFunc[i][8] = true;
            }
        }
        for (let i = dim - 8; i < dim; i++) {
            isFunc[8][i] = true;
            isFunc[i][8] = true;
        }

        const bits = [];
        const pushBits = (val, len) => {
            for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
        };
        pushBits(0b0100, 4);
        pushBits(bytes.length, 8);
        bytes.forEach(b => pushBits(b, 8));
        const dataCwCount = totalCodewords[ver] - eccPerBlock[ver] * (ver === 6 ? 2 : 1);
        for (let i = 0; i < 4 && bits.length < dataCwCount * 8; i++) bits.push(0);
        while (bits.length % 8 !== 0) bits.push(0);
        const padBytes = [0xec, 0x11];
        let pIdx = 0;
        while (bits.length < dataCwCount * 8) {
            pushBits(padBytes[pIdx % 2], 8);
            pIdx++;
        }

        const dataCw = [];
        for (let i = 0; i < bits.length; i += 8) {
            let v = 0;
            for (let b = 0; b < 8; b++) v = (v << 1) | bits[i + b];
            dataCw.push(v);
        }

        const gfExp = new Array(512);
        const gfLog = new Array(256).fill(0);
        let x = 1;
        for (let i = 0; i < 255; i++) {
            gfExp[i] = x;
            gfLog[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
        const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : gfExp[gfLog[a] + gfLog[b]];

        function computeEcc(block, eccLen) {
            let gen = [1];
            for (let i = 0; i < eccLen; i++) {
                const factor = [1, gfExp[i]];
                const next = new Array(gen.length + 1).fill(0);
                for (let j = 0; j < gen.length; j++) {
                    next[j] ^= gfMul(gen[j], factor[0]);
                    next[j + 1] ^= gfMul(gen[j], factor[1]);
                }
                gen = next;
            }
            const res = [...block, ...new Array(eccLen).fill(0)];
            for (let i = 0; i < block.length; i++) {
                const coef = res[i];
                if (coef !== 0) {
                    for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
                }
            }
            return res.slice(block.length);
        }

        let finalStream = [];
        if (ver === 6) {
            const half = dataCw.length / 2;
            const b1 = dataCw.slice(0, half);
            const b2 = dataCw.slice(half);
            const e1 = computeEcc(b1, 18);
            const e2 = computeEcc(b2, 18);
            for (let i = 0; i < half; i++) finalStream.push(b1[i], b2[i]);
            for (let i = 0; i < 18; i++) finalStream.push(e1[i], e2[i]);
        } else {
            const e = computeEcc(dataCw, eccPerBlock[ver]);
            finalStream = [...dataCw, ...e];
        }

        const outBits = [];
        finalStream.forEach(cw => {
            for (let i = 7; i >= 0; i--) outBits.push((cw >> i) & 1);
        });

        let bitIdx = 0;
        let up = true;
        for (let right = dim - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < dim; vert++) {
                const r = up ? dim - 1 - vert : vert;
                for (let lr = 0; lr < 2; lr++) {
                    const c = right - lr;
                    if (!isFunc[r][c]) {
                        let bit = bitIdx < outBits.length ? outBits[bitIdx++] : 0;
                        if ((r + c) % 2 === 0) bit ^= 1;
                        mat[r][c] = bit;
                    }
                }
            }
            up = !up;
        }

        const fmt = 0b111011111000100;
        for (let i = 0; i < 15; i++) {
            const bit = (fmt >> i) & 1;
            if (i < 6) mat[i][8] = bit;
            else if (i < 8) mat[i + 1][8] = bit;
            else mat[dim - 15 + i][8] = bit;

            if (i < 8) mat[8][dim - 1 - i] = bit;
            else if (i < 9) mat[8][15 - i] = bit;
            else mat[8][14 - i] = bit;
        }
        return mat;
    }

    // =========================================================
    // PROFILE DATA HYDRATION & STYLING (DIEUNW+ THEME, FRAMES, STATUS)
    // =========================================================
    function applyThemeAndFrames(user, isOwner) {
        if (!user) return;
        document.documentElement.style.setProperty("--profile-grad-1", user.themePrimary || "#1769aa");
        document.documentElement.style.setProperty("--profile-grad-2", user.themeSecondary || "#2298f8");

        const ring = document.getElementById("profile-avatar-ring");
        if (ring) {
            ring.className = `avatar-ring-wrap frame-${user.activeAvatarFrame || "none"}`;
            if (user.hasActiveStory) ring.classList.add("has-active-story");
        }

        const statusDot = document.getElementById("profile-avatar-status-dot");
        if (statusDot) {
            statusDot.dataset.status = user.presenceStatus || "offline";
            const labelMap = {
                online: "Đang trực tuyến",
                studying: "Đang trong Phòng tự học",
                offline: "Ngoại tuyến"
            };
            statusDot.title = labelMap[statusDot.dataset.status] || "Ngoại tuyến";
        }

        const cohortEl = document.getElementById("user-display-cohort");
        if (cohortEl) {
            if (user.cohort) {
                cohortEl.textContent = user.cohort;
                cohortEl.hidden = false;
            } else {
                cohortEl.hidden = true;
            }
        }

        const socialWrap = document.getElementById("profile-social-links");
        if (socialWrap) {
            socialWrap.replaceChildren();
            const socials = [
                { key: "socialFacebook", label: "Facebook" },
                { key: "socialInstagram", label: "Instagram" },
                { key: "socialGithub", label: "GitHub" }
            ];
            socials.forEach(s => {
                if (user[s.key]) {
                    const a = makeEl("a", "social-link-btn", s.label);
                    a.href = user[s.key];
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    socialWrap.append(a);
                }
            });
        }

        const hoursEl = document.getElementById("metric-weekly-hours");
        const streakEl = document.getElementById("metric-study-streak");
        const setStatsEl = document.getElementById("metric-studyset-stats");
        const scheduleEl = document.getElementById("metric-study-schedule");
        const statSetsEl = document.getElementById("stat-study-sets");

        if (hoursEl) hoursEl.textContent = `${Number(user.weeklyStudyHours || 0)} giờ`;
        if (streakEl) streakEl.textContent = `${Number(user.studyStreakDays || 0)} ngày`;
        if (setStatsEl) setStatsEl.textContent = `Đã tạo ${user.studySetCount || 0} bộ • ${user.studySetPlays || 0} lượt học từ bạn bè`;
        if (statSetsEl) statSetsEl.textContent = String(user.studySetCount || 0);
        if (scheduleEl) {
            if (user.studySchedule) {
                scheduleEl.textContent = `Giờ học thường online: ${user.studySchedule}`;
                scheduleEl.hidden = false;
            } else {
                scheduleEl.hidden = true;
            }
        }

        const clubsWrap = document.getElementById("profile-joined-clubs");
        if (clubsWrap) {
            clubsWrap.replaceChildren();
            const clubs = user.memberClubs || [];
            if (!clubs.length) {
                clubsWrap.append(makeEl("p", "profile-extra-empty", "Chưa tham gia CLB nào."));
            } else {
                clubs.forEach(c => {
                    const link = makeEl("a", "club-mini-chip");
                    link.href = `./profile.html?clubId=${encodeURIComponent(c.id)}`;
                    if (c.logo) {
                        const img = makeEl("img");
                        img.src = resolveMediaUrl(c.logo);
                        img.alt = c.name;
                        link.append(img);
                    } else {
                        link.append(makeEl("span", "club-mini-monogram", (c.name || "C")[0].toUpperCase()));
                    }
                    link.append(makeEl("span", "", c.name));
                    clubsWrap.append(link);
                });
            }
        }

        const ownerControls = [
            "btn-toggle-study-tag-form",
            "btn-open-note-modal",
            "profile-quick-media-actions",
            "btn-open-showcase-modal",
            "btn-open-studyset-builder",
            "btn-toggle-achievement-form",
            "btn-toggle-interest-form",
            "btn-toggle-album-form",
            "posts-subfilter-pills",
            "btn-dieunw-plus"
        ];
        ownerControls.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.hidden = !isOwner;
        });
    }

    // =========================================================
    // 24H NOTE, 24H MOMENT, STORIES 24H/48H
    // =========================================================
    function renderNote(user) {
        const display = document.getElementById("profile-note-display");
        const textEl = document.getElementById("profile-note-text");
        if (!display || !textEl) return;
        const valid = user?.noteText && (!user.noteExpiresAt || new Date(user.noteExpiresAt).getTime() > Date.now());
        if (valid) {
            textEl.textContent = user.noteText;
            display.hidden = false;
        } else {
            display.hidden = true;
        }
    }

    function renderMoment(moment, isOwner) {
        const section = document.getElementById("profile-moment-section");
        if (!section) return;
        if (!moment) {
            section.hidden = true;
            section.replaceChildren();
            return;
        }
        section.hidden = false;
        section.replaceChildren();

        const media = makeEl("div", "moment-media");
        const img = makeEl("img");
        img.src = resolveMediaUrl(moment.image);
        img.alt = moment.caption || "Khoảnh khắc 24h";
        media.append(img);
        if (moment.caption) {
            media.append(makeEl("div", "moment-caption-overlay", moment.caption));
        }

        const footer = makeEl("div", "moment-footer");
        const reactBar = makeEl("div", "moment-reactions-bar");
        const emojis = ["❤️", "🔥", "👏", "😂", "🎯"];
        const reactions = moment.reactors || moment.reactions || [];
        const myId = state.viewerUser?.id;

        emojis.forEach(emoji => {
            const matching = reactions.filter(r => r.emoji === emoji);
            const active = (moment.myReaction && moment.myReaction === emoji)
                || (myId && matching.some(r => String(r.userId) === String(myId)));
            const btn = makeEl("button", `moment-react-btn${active ? " active" : ""}`, `${emoji} ${matching.length || ""}`.trim());
            btn.type = "button";
            btn.addEventListener("click", async () => {
                try {
                    await api(`/api/moments/${encodeURIComponent(moment.id)}/react`, {
                        method: "POST",
                        body: JSON.stringify({ emoji })
                    });
                    await loadFullProfile();
                } catch (err) {
                    alert(err.message);
                }
            });
            reactBar.append(btn);
        });

        footer.append(reactBar);

        const totalReacts = Number(moment.reactionCount || reactions.length || 0);
        const reactorsSummary = reactions.length
            ? reactions.slice(0, 6).map(r => `${r.name || r.userName || "Bạn học"} ${r.emoji}`).join(", ")
                + (totalReacts > 6 ? ` +${totalReacts - 6}` : "")
            : "Chưa có tương tác";
        const rightMeta = makeEl("div", "", "");
        rightMeta.style.cssText = "display:flex; align-items:center; gap:8px; flex-wrap:wrap;";
        const reactorSpan = makeEl("span", "profile-extra-hint", reactorsSummary);
        rightMeta.append(reactorSpan);

        if (isOwner) {
            const delBtn = makeEl("button", "profile-extra-delete", "Xóa Moment");
            delBtn.type = "button";
            delBtn.addEventListener("click", async () => {
                if (!confirm("Xóa Khoảnh khắc 24h này?")) return;
                await api(`/api/profile/moments/${encodeURIComponent(moment.id)}`, { method: "DELETE" });
                await loadFullProfile();
            });
            rightMeta.append(delBtn);
        }
        footer.append(rightMeta);
        section.append(media, footer);
    }

    function openStoryViewer(stories, startIdx = 0) {
        if (!stories || !stories.length) return;
        const ownerUser = state.profileData?.user;
        state.storiesList = stories.map(s => ({
            ...s,
            userId: s.userId || ownerUser?.id || "",
            userName: s.userName || ownerUser?.name || "Học sinh NQD",
            userAvatar: resolveMediaUrl(s.userAvatar || ownerUser?.avatar || "./DIEU.avif"),
            mediaUrl: resolveMediaUrl(s.mediaUrl)
        }));
        state.storyIndex = Math.max(0, Math.min(startIdx, state.storiesList.length - 1));
        renderCurrentStory();
        openModal("story-viewer-overlay");
    }

    function renderCurrentStory() {
        const stories = state.storiesList;
        const story = stories[state.storyIndex];
        if (!story) {
            closeModal("story-viewer-overlay");
            return;
        }
        const track = document.getElementById("story-progress-track");
        track.replaceChildren(...stories.map((_, idx) => {
            const seg = makeEl("div", `story-progress-seg${idx < state.storyIndex ? " done" : idx === state.storyIndex ? " active" : ""}`);
            seg.append(makeEl("div", "story-progress-fill"));
            return seg;
        }));

        document.getElementById("story-viewer-avatar").src = story.userAvatar || "./DIEU.avif";
        document.getElementById("story-viewer-name").textContent = story.userName || "Học sinh NQD";
        document.getElementById("story-viewer-time").textContent = new Date(story.createdAt).toLocaleString("vi-VN");
        document.getElementById("story-viewer-caption").textContent = story.caption || "";
        document.getElementById("story-viewer-views").textContent = `${story.viewCount || 0} lượt xem`;
        document.getElementById("story-viewer-expiry").textContent = `Hết hạn: ${new Date(story.expiresAt).toLocaleString("vi-VN")}`;

        const delBtn = document.getElementById("story-viewer-delete");
        const isOwner = state.viewerUser && (String(state.viewerUser.id) === String(story.userId) || state.viewerUser.isAdmin);
        delBtn.hidden = !isOwner;
        delBtn.onclick = async () => {
            if (!confirm("Xóa Story này?")) return;
            await api(`/api/stories/${encodeURIComponent(story.id)}`, { method: "DELETE" });
            closeModal("story-viewer-overlay");
            await loadFullProfile();
        };

        const stage = document.getElementById("story-media-stage");
        const prevBtn = document.getElementById("story-prev-btn");
        const nextBtn = document.getElementById("story-next-btn");
        stage.querySelectorAll("img, video").forEach(n => n.remove());

        const isVideo = story.mediaType === "video" || /\.(mp4|webm)(\?|$)/i.test(story.mediaUrl || "");
        const mediaEl = document.createElement(isVideo ? "video" : "img");
        mediaEl.src = story.mediaUrl;
        if (isVideo) {
            mediaEl.controls = true;
            mediaEl.autoplay = true;
            mediaEl.playsInline = true;
        } else {
            mediaEl.alt = story.caption || "Story NQD";
        }
        stage.insertBefore(mediaEl, prevBtn);

        prevBtn.hidden = state.storyIndex === 0;
        nextBtn.hidden = state.storyIndex >= stories.length - 1;

        api(`/api/stories/${encodeURIComponent(story.id)}/view`, { method: "POST" }).catch(() => {});
    }

    document.getElementById("story-prev-btn")?.addEventListener("click", () => {
        if (state.storyIndex > 0) {
            state.storyIndex--;
            renderCurrentStory();
        }
    });

    document.getElementById("story-next-btn")?.addEventListener("click", () => {
        if (state.storyIndex < state.storiesList.length - 1) {
            state.storyIndex++;
            renderCurrentStory();
        }
    });

    document.getElementById("profile-avatar-ring")?.addEventListener("click", () => {
        const stories = state.profileData?.stories || [];
        if (stories.length) openStoryViewer(stories, 0);
    });

    // =========================================================
    // STUDY TAGS + FRIEND ENDORSEMENTS
    // =========================================================
    function renderStudyTags(tags, isOwner) {
        const strWrap = document.getElementById("study-tags-strength");
        const helpWrap = document.getElementById("study-tags-need-help");
        if (!strWrap || !helpWrap) return;
        strWrap.replaceChildren();
        helpWrap.replaceChildren();

        const getKind = t => t.kind || t.tagType || "strength";
        const getLabel = t => t.subject || t.subjectTag || "";

        const strengthTags = tags.filter(t => getKind(t) !== "need_help");
        const helpTags = tags.filter(t => getKind(t) === "need_help");

        const renderGroup = (list, container, emptyMsg) => {
            if (!list.length) {
                container.append(makeEl("p", "profile-extra-empty", emptyMsg));
                return;
            }
            list.forEach(tag => {
                const kind = getKind(tag);
                const label = getLabel(tag);
                const chip = makeEl("div", `study-tag-chip ${kind === "need_help" ? "is-need-help" : "is-strength"}`);
                chip.append(makeEl("span", "", label));

                if (kind !== "need_help") {
                    const count = tag.endorsementCount ?? tag.endorsements?.length ?? 0;
                    const endorsed = Boolean(tag.endorsedByMe) || Boolean(
                        state.viewerUser && (tag.endorsements || []).some(
                            e => String(e.endorserId || e.fromUserId) === String(state.viewerUser.id)
                        )
                    );
                    const btn = makeEl("button", `btn-endorse-tag${endorsed ? " is-endorsed" : ""}`, `+1 (${count})`);
                    btn.type = "button";
                    btn.title = "Xem nhận xét & Xác nhận thế mạnh";
                    btn.addEventListener("click", () => openEndorseModal(tag));
                    chip.append(btn);
                }

                if (isOwner) {
                    const del = makeEl("button", "admin-remove-btn", "×");
                    del.type = "button";
                    del.title = "Xóa thẻ";
                    del.addEventListener("click", async () => {
                        await api(`/api/profile/study-tags/${encodeURIComponent(tag.id)}`, { method: "DELETE" });
                        await loadFullProfile();
                    });
                    chip.append(del);
                }
                container.append(chip);
            });
        };

        renderGroup(strengthTags, strWrap, "Chưa có thẻ môn thế mạnh.");
        renderGroup(helpTags, helpWrap, "Chưa có thẻ môn cần hỗ trợ.");
    }

    function openEndorseModal(tag) {
        state.activeEndorseTag = tag;
        document.getElementById("endorse-tag-label").textContent = `Thẻ môn: ${tag.subject || tag.subjectTag || ""}`;
        const listEl = document.getElementById("endorse-existing-comments");
        listEl.replaceChildren();
        const comments = (tag.endorsements || []).filter(e => e.comment);
        if (!comments.length) {
            listEl.append(makeEl("p", "profile-extra-empty", "Chưa có nhận xét nào."));
        } else {
            comments.forEach(e => {
                const authorName = e.endorserName || e.fromUserName || "Bạn học";
                listEl.append(makeEl("div", "", `• ${authorName}: "${e.comment}"`));
            });
        }
        const canSubmit = state.viewerUser && !state.isSelf;
        document.getElementById("endorse-comment-input").hidden = !canSubmit;
        document.getElementById("btn-submit-endorse").hidden = !canSubmit;
        document.getElementById("endorse-status").textContent = canSubmit ? "" : "Chỉ bạn bè mới có thể bấm +1 Xác nhận cho bạn.";
        openModal("endorse-modal-overlay");
    }

    document.getElementById("btn-submit-endorse")?.addEventListener("click", async () => {
        if (!state.activeEndorseTag) return;
        const status = document.getElementById("endorse-status");
        const comment = document.getElementById("endorse-comment-input").value.trim();
        try {
            await api(`/api/study-tags/${encodeURIComponent(state.activeEndorseTag.id)}/endorse`, {
                method: "POST",
                body: JSON.stringify({ comment })
            });
            document.getElementById("endorse-comment-input").value = "";
            closeModal("endorse-modal-overlay");
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    // =========================================================
    // PINNED SHOWCASE
    // =========================================================
    function renderShowcase(items, isOwner) {
        const sec = document.getElementById("profile-showcase-section");
        const grid = document.getElementById("profile-showcase-grid");
        if (!sec || !grid) return;
        if (!items.length && !isOwner) {
            sec.hidden = true;
            return;
        }
        sec.hidden = false;
        grid.replaceChildren();
        if (!items.length) {
            grid.append(makeEl("p", "profile-extra-empty", "Ghim tối đa 6 sản phẩm CLB, poster hoặc liên kết nổi bật."));
            return;
        }
        items.forEach(item => {
            const card = makeEl("article", "showcase-item-card");
            if (item.image) {
                const img = makeEl("img");
                img.src = resolveMediaUrl(item.image);
                img.alt = item.title;
                img.loading = "lazy";
                card.append(img);
            }
            const body = makeEl("div", "showcase-item-body");
            body.append(makeEl("strong", "", item.title));
            if (item.description) body.append(makeEl("p", "profile-extra-hint", item.description));
            const row = makeEl("div", "", "");
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:6px; margin-top:4px;";
            const itemLink = item.link || item.url;
            if (itemLink) {
                const a = makeEl("a", "study-set-btn primary", "Mở liên kết");
                a.href = itemLink;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.style.textDecoration = "none";
                row.append(a);
            }
            if (isOwner) {
                const del = makeEl("button", "profile-extra-delete", "Gỡ");
                del.type = "button";
                del.addEventListener("click", async () => {
                    await api(`/api/profile/showcase/${encodeURIComponent(item.id)}`, { method: "DELETE" });
                    await loadFullProfile();
                });
                row.append(del);
            }
            body.append(row);
            card.append(body);
            grid.append(card);
        });
    }

    // =========================================================
    // STUDY SETS: BUILDER (FIXED API FIELDS), 3D FLASHCARD, QUIZ CHALLENGE + TOP 3
    // =========================================================
    function addBuilderItemRow(data = {}) {
        const container = document.getElementById("studyset-items-builder");
        const kind = document.getElementById("studyset-type-select").value === "quiz" ? "quiz" : "flashcard";
        const row = makeEl("div", "study-builder-item");

        const top = makeEl("div", "", "");
        top.style.cssText = "display:flex; justify-content:space-between; align-items:center;";
        top.append(makeEl("strong", "", kind === "quiz" ? "Câu hỏi Trắc nghiệm" : "Thẻ Flashcard"));
        const rem = makeEl("button", "admin-remove-btn", "×");
        rem.type = "button";
        rem.onclick = () => row.remove();
        top.append(rem);

        const front = makeEl("input", "sb-front");
        front.type = "text";
        front.placeholder = kind === "quiz" ? "Nội dung câu hỏi..." : "Mặt trước (Thuật ngữ / Câu hỏi)...";
        front.value = data.front || "";

        const colorWrap = makeEl("label", "", "");
        colorWrap.style.cssText = "display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700;";
        colorWrap.textContent = "Màu nhấn chữ: ";
        const colorInput = makeEl("input", "sb-color");
        colorInput.type = "color";
        colorInput.value = data.textColor || "#173853";
        colorInput.style.cssText = "width:30px; height:24px; padding:0; border:0;";
        colorWrap.append(colorInput);

        const imgInput = makeEl("input", "sb-image-file");
        imgInput.type = "file";
        imgInput.accept = "image/*";
        imgInput.dataset.existingImage = data.image || "";

        row.append(top, front, colorWrap, imgInput);

        if (kind === "quiz") {
            const optsGrid = makeEl("div", "", "");
            optsGrid.style.cssText = "display:grid; grid-template-columns:1fr 1fr; gap:6px;";
            const opts = Array.isArray(data.options) && data.options.length === 4 ? data.options : ["", "", "", ""];
            ["A", "B", "C", "D"].forEach((lbl, idx) => {
                const oi = makeEl("input", `sb-opt-${idx}`);
                oi.type = "text";
                oi.placeholder = `Đáp án ${lbl}`;
                oi.value = opts[idx] || "";
                optsGrid.append(oi);
            });
            const correctSel = makeEl("select", "sb-correct");
            ["A", "B", "C", "D"].forEach((lbl, idx) => {
                const op = makeEl("option", "", `Đáp án đúng: ${lbl}`);
                op.value = String(idx);
                if (Number(data.correctIndex || 0) === idx) op.selected = true;
                correctSel.append(op);
            });
            const expl = makeEl("input", "sb-back");
            expl.type = "text";
            expl.placeholder = "Giải thích đáp án (tùy chọn)...";
            expl.value = data.explanation || data.back || "";
            row.append(optsGrid, correctSel, expl);
        } else {
            const back = makeEl("input", "sb-back");
            back.type = "text";
            back.placeholder = "Mặt sau (Định nghĩa / Đáp án)...";
            back.value = data.back || "";
            row.append(back);
        }
        container.append(row);
    }

    document.getElementById("btn-open-studyset-builder")?.addEventListener("click", () => {
        state.editingStudySetId = null;
        document.getElementById("studyset-builder-title").textContent = "Tạo Bộ thẻ / Đề ôn tập";
        document.getElementById("studyset-builder-form").reset();
        document.getElementById("studyset-builder-status").textContent = "";
        document.getElementById("studyset-items-builder").replaceChildren();
        addBuilderItemRow();
        addBuilderItemRow();
        openModal("studyset-builder-overlay");
    });

    document.getElementById("studyset-type-select")?.addEventListener("change", () => {
        document.getElementById("studyset-builder-status").textContent = "";
        document.getElementById("studyset-items-builder").replaceChildren();
        addBuilderItemRow();
    });

    document.getElementById("btn-add-studyset-item")?.addEventListener("click", () => addBuilderItemRow());

    document.getElementById("studyset-builder-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const status = document.getElementById("studyset-builder-status");
        const title = document.getElementById("studyset-title-input").value.trim();
        const subject = document.getElementById("studyset-subject-input").value.trim() || "Chung";
        const kind = document.getElementById("studyset-type-select").value === "quiz" ? "quiz" : "flashcard";
        const pinned = document.getElementById("studyset-pin-checkbox").checked;

        if (!title) {
            status.textContent = "Vui lòng nhập Tên bộ thẻ / đề ôn tập.";
            return;
        }

        status.textContent = "Đang kiểm tra & lưu...";
        try {
            const rows = Array.from(document.querySelectorAll("#studyset-items-builder .study-builder-item"));
            const cards = [];

            for (let idx = 0; idx < rows.length; idx++) {
                const row = rows[idx];
                const cardNo = idx + 1;
                const front = row.querySelector(".sb-front")?.value.trim() || "";
                const back = row.querySelector(".sb-back")?.value.trim() || "";
                const textColor = row.querySelector(".sb-color")?.value || "#173853";
                const fileInput = row.querySelector(".sb-image-file");
                const hasNewImg = Boolean(fileInput?.files?.[0]);
                const options = kind === "quiz"
                    ? [0, 1, 2, 3].map(i => row.querySelector(`.sb-opt-${i}`)?.value.trim() || "")
                    : [];
                const hasAnySecondaryInput = Boolean(back || hasNewImg || options.some(Boolean));

                // Bỏ qua dòng hoàn toàn trống nếu đã có hoặc sẽ có thẻ khác
                if (!front && !hasAnySecondaryInput) continue;

                // Nếu đã gõ nội dung phụ nhưng quên nhập câu hỏi / mặt trước thì báo rõ vị trí
                if (!front && hasAnySecondaryInput) {
                    throw new Error(`Thẻ/Câu #${cardNo} đang thiếu nội dung ${kind === "quiz" ? "câu hỏi" : "mặt trước"}.`);
                }

                let image = fileInput?.dataset.existingImage || "";
                if (hasNewImg) image = await toOptimizedImage(fileInput.files[0], 720);

                if (kind === "quiz") {
                    const filledCount = options.filter(Boolean).length;
                    if (filledCount < 2) {
                        throw new Error(`Câu #${cardNo} cần nhập ít nhất 2 phương án trả lời (A, B...).`);
                    }
                    const correctIndex = Number(row.querySelector(".sb-correct")?.value || 0);
                    cards.push({ front, options, correctIndex, explanation: back, textColor, image });
                } else {
                    if (!back && !image) {
                        throw new Error(`Thẻ #${cardNo} cần nhập Mặt sau (định nghĩa/đáp án) hoặc chọn ảnh minh họa.`);
                    }
                    cards.push({ front, back, textColor, image });
                }
            }

            if (!cards.length) {
                throw new Error(kind === "quiz"
                    ? "Hãy nhập ít nhất 1 câu hỏi và tối thiểu 2 đáp án."
                    : "Hãy nhập ít nhất 1 thẻ Flashcard (cả Mặt trước và Mặt sau).");
            }

            const payload = {
                kind,
                title,
                subject,
                description: "",
                cards,
                pinned
            };

            if (state.editingStudySetId) {
                await api(`/api/study-sets/${encodeURIComponent(state.editingStudySetId)}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                });
            } else {
                await api("/api/study-sets", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
            }
            status.textContent = "";
            closeModal("studyset-builder-overlay");
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message || "Không thể lưu bộ ôn tập.";
        }
    });

    function openStudySetPlayer(studySet, startChallenge = false) {
        const titleEl = document.getElementById("studyset-player-title");
        const bodyEl = document.getElementById("studyset-player-body");
        if (!titleEl || !bodyEl) return;
        titleEl.textContent = studySet.title;

        const cards = Array.isArray(studySet.cards) ? studySet.cards : (Array.isArray(studySet.items) ? studySet.items : []);
        const kind = studySet.kind || studySet.setType || "flashcard";
        if (!cards.length) {
            bodyEl.innerHTML = `<p class="profile-extra-empty">Bộ học liệu này chưa có thẻ nào.</p>`;
            openModal("studyset-player-overlay");
            return;
        }

        if (kind === "quiz") {
            runQuizPlayer(studySet, cards, bodyEl, startChallenge);
        } else {
            runFlashcardPlayer(studySet, cards, bodyEl);
        }
        openModal("studyset-player-overlay");
    }

    function runFlashcardPlayer(studySet, items, bodyEl) {
        const queue = items.map((_, i) => i);
        let mastered = 0;

        function renderCard() {
            bodyEl.replaceChildren();
            if (!queue.length) {
                const done = makeEl("div", "empty-illustration-box");
                done.innerHTML = `<h4>Hoàn thành lượt ôn tập!</h4><p>Bạn đã nắm vững toàn bộ ${items.length} thẻ trong bộ "${escapeHtml(studySet.title)}".</p>`;
                const replay = makeEl("button", "btn-auth", "Ôn lại từ đầu");
                replay.type = "button";
                replay.style.width = "auto";
                replay.onclick = () => runFlashcardPlayer(studySet, items, bodyEl);
                done.append(replay);
                bodyEl.append(done);
                api(`/api/study-sets/${encodeURIComponent(studySet.id)}/attempt`, {
                    method: "POST",
                    body: JSON.stringify({ score: items.length, total: items.length, durationMs: 0 })
                }).catch(() => {});
                return;
            }

            const idx = queue[0];
            const card = items[idx];
            bodyEl.append(makeEl("div", "sr-queue-pill", `Còn lại: ${queue.length} thẻ • Đã thuộc: ${mastered}/${items.length} (Bấm vào thẻ để lật 3D)`));

            const scene = makeEl("div", "flashcard-scene");
            const inner = makeEl("div", "flashcard-inner");

            const front = makeEl("div", "flashcard-face flashcard-front");
            const fText = makeEl("div", "", card.front || "");
            fText.style.cssText = `font-size:18px; font-weight:800; color:${card.textColor || "var(--text-main)"};`;
            front.append(fText);
            if (card.image) {
                const im = makeEl("img");
                im.src = resolveMediaUrl(card.image);
                im.alt = card.front;
                front.append(im);
            }

            const back = makeEl("div", "flashcard-face flashcard-back");
            const bText = makeEl("div", "", card.back || "(Trống)");
            bText.style.cssText = "font-size:17px; font-weight:700;";
            back.append(bText);

            inner.append(front, back);
            scene.append(inner);
            scene.addEventListener("click", () => inner.classList.toggle("is-flipped"));

            const controls = makeEl("div", "flashcard-controls");
            const btnKnown = makeEl("button", "btn-fc-known", "Đã thuộc (Xanh lá)");
            btnKnown.type = "button";
            btnKnown.onclick = () => {
                queue.shift();
                mastered++;
                renderCard();
            };

            const btnReview = makeEl("button", "btn-fc-review", "Cần ôn lại (+3 thẻ sau)");
            btnReview.type = "button";
            btnReview.onclick = () => {
                const current = queue.shift();
                const insertPos = Math.min(3, queue.length);
                queue.splice(insertPos, 0, current);
                renderCard();
            };

            controls.append(btnReview, btnKnown);
            bodyEl.append(scene, controls);
        }
        renderCard();
    }

    function runQuizPlayer(studySet, items, bodyEl, isChallenge) {
        let idx = 0;
        let score = 0;
        const startedAt = Date.now();
        let timerInterval = null;

        function renderQuestion() {
            bodyEl.replaceChildren();
            if (idx >= items.length) {
                if (timerInterval) clearInterval(timerInterval);
                const durationMs = Date.now() - startedAt;
                const sec = (durationMs / 1000).toFixed(1);
                bodyEl.innerHTML = `<div class="empty-illustration-box"><h4>Kết quả: ${score}/${items.length} câu đúng</h4><p>Thời gian hoàn thành: ${sec} giây</p></div>`;
                api(`/api/study-sets/${encodeURIComponent(studySet.id)}/attempt`, {
                    method: "POST",
                    body: JSON.stringify({ score, total: items.length, durationMs })
                }).then(res => {
                    const top3 = res.studySet?.leaderboard || res.leaderboard || studySet.leaderboard || [];
                    if (top3.length) renderLeaderboard(top3, bodyEl);
                }).catch(() => {});
                return;
            }

            if (isChallenge) {
                const timerBar = makeEl("div", "challenge-timer-bar");
                timerBar.innerHTML = `<span>CHẾ ĐỘ THÁCH ĐẤU · Câu ${idx + 1}/${items.length}</span><span id="quiz-live-timer">0.0s</span>`;
                bodyEl.append(timerBar);
                if (!timerInterval) {
                    timerInterval = setInterval(() => {
                        const t = document.getElementById("quiz-live-timer");
                        if (!t) { clearInterval(timerInterval); timerInterval = null; return; }
                        t.textContent = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
                    }, 100);
                }
            } else {
                bodyEl.append(makeEl("div", "sr-queue-pill", `Câu hỏi ${idx + 1} / ${items.length} • Điểm: ${score}`));
            }

            const q = items[idx];
            const qTitle = makeEl("h4", "", q.front);
            qTitle.style.cssText = `font-size:17px; color:${q.textColor || "var(--text-main)"};`;
            bodyEl.append(qTitle);
            if (q.image) {
                const im = makeEl("img");
                im.src = resolveMediaUrl(q.image);
                im.style.cssText = "max-height:160px; border-radius:8px; object-fit:cover;";
                bodyEl.append(im);
            }

            const optsList = makeEl("div", "quiz-options-list");
            const explBox = makeEl("p", "profile-extra-hint", "");
            const nextBtn = makeEl("button", "btn-auth", idx === items.length - 1 ? "Xem kết quả" : "Câu tiếp theo →");
            nextBtn.type = "button";
            nextBtn.hidden = true;
            nextBtn.onclick = () => { idx++; renderQuestion(); };

            const renderedButtons = [];
            (q.options || []).forEach((optText, oIdx) => {
                if (!optText) return;
                const btn = makeEl("button", "quiz-option-btn", `${["A", "B", "C", "D"][oIdx]}. ${optText}`);
                btn.type = "button";
                btn.dataset.optIndex = String(oIdx);
                btn.onclick = () => {
                    optsList.querySelectorAll("button").forEach(b => { b.disabled = true; });
                    const correctIdx = Number(q.correctIndex || 0);
                    if (oIdx === correctIdx) {
                        btn.classList.add("is-correct");
                        score++;
                    } else {
                        btn.classList.add("is-wrong");
                        const rightBtn = renderedButtons.find(b => Number(b.dataset.optIndex) === correctIdx);
                        rightBtn?.classList.add("is-correct");
                    }
                    if (q.explanation) explBox.textContent = `Giải thích: ${q.explanation}`;
                    nextBtn.hidden = false;
                };
                renderedButtons.push(btn);
                optsList.append(btn);
            });

            bodyEl.append(optsList, explBox, nextBtn);
            if (Array.isArray(studySet.leaderboard) && studySet.leaderboard.length) {
                renderLeaderboard(studySet.leaderboard, bodyEl);
            }
        }
        renderQuestion();
    }

    function renderLeaderboard(top3, container) {
        const box = makeEl("div", "challenge-leaderboard");
        box.append(makeEl("strong", "", "BXH Top 3 Thách đấu"));
        top3.slice(0, 3).forEach((row, i) => {
            const r = makeEl("div", "leaderboard-row");
            const displayName = row.name || row.userName || "Bạn học";
            r.innerHTML = `<span>#${i + 1} ${escapeHtml(displayName)}</span><strong>${row.score}/${row.total} (${((row.durationMs || 0) / 1000).toFixed(1)}s)</strong>`;
            box.append(r);
        });
        container.append(box);
    }

    function renderStudySets(sets, isOwner) {
        const list = document.getElementById("profile-studysets-list");
        if (!list) return;
        list.replaceChildren();
        if (!sets.length) {
            if (window.DIEUNW?.createEmptyIllustrationHtml) {
                list.innerHTML = window.DIEUNW.createEmptyIllustrationHtml({
                    title: "Chưa có bộ thẻ hay đề ôn tập",
                    subtitle: "Tạo Flashcard lật 3D hoặc Quiz trắc nghiệm để tự ôn và thách đấu bạn bè."
                });
            } else {
                list.append(makeEl("p", "profile-extra-empty", "Chưa có bộ thẻ hay đề ôn tập nào."));
            }
            return;
        }
        sets.forEach(s => {
            const kind = s.kind || s.setType || "flashcard";
            const cards = Array.isArray(s.cards) ? s.cards : (Array.isArray(s.items) ? s.items : []);
            const pinned = Boolean(s.pinned ?? s.isPinned);
            const studyCount = Number(s.studyCount ?? s.playCount ?? 0);

            const card = makeEl("article", "study-set-card");
            const badge = makeEl("span", "study-set-badge", `${kind === "quiz" ? "Quiz" : "Flashcard"} · ${s.subject || "Tổng hợp"}`);
            const title = makeEl("strong", "", `${pinned ? "[Đã ghim] " : ""}${s.title}`);
            const meta = makeEl("p", "profile-extra-hint", `${cards.length} thẻ/câu · ${studyCount} lượt học`);

            const actions = makeEl("div", "study-set-actions");
            const btnStudy = makeEl("button", "study-set-btn primary", kind === "quiz" ? "Làm bài" : "Học Flashcard");
            btnStudy.type = "button";
            btnStudy.onclick = () => openStudySetPlayer(s, false);
            actions.append(btnStudy);

            if (kind === "quiz") {
                const btnChal = makeEl("button", "study-set-btn challenge", "Thách đấu");
                btnChal.type = "button";
                btnChal.onclick = () => openStudySetPlayer(s, true);
                actions.append(btnChal);
            }

            if (state.viewerUser && !isOwner) {
                const btnFork = makeEl("button", "study-set-btn", "Fork & Sửa");
                btnFork.type = "button";
                btnFork.onclick = async () => {
                    await api(`/api/study-sets/${encodeURIComponent(s.id)}/fork`, { method: "POST" });
                    alert("Đã sao chép bộ ôn tập về kho của bạn!");
                };
                actions.append(btnFork);
            }

            if (isOwner) {
                const btnPost = makeEl("button", "study-set-btn", "Đăng lên Feed");
                btnPost.type = "button";
                btnPost.onclick = async () => {
                    await api("/api/posts", {
                        method: "POST",
                        body: JSON.stringify({
                            content: `Mình vừa chia sẻ bộ ôn tập "${s.title}" (${cards.length} câu/thẻ). Vào thử sức ngay nhé!`,
                            studySetId: s.id,
                            visibility: "public"
                        })
                    });
                    alert("Đã chia sẻ lên Bảng tin!");
                };
                const btnDel = makeEl("button", "profile-extra-delete", "Xóa");
                btnDel.type = "button";
                btnDel.onclick = async () => {
                    if (!confirm("Xóa bộ ôn tập này?")) return;
                    await api(`/api/study-sets/${encodeURIComponent(s.id)}`, { method: "DELETE" });
                    await loadFullProfile();
                };
                actions.append(btnPost, btnDel);
            }
            card.append(badge, title, meta, actions);
            list.append(card);
        });
    }
	// =========================================================
    // SAVED & SHARED MATERIALS TAB
    // =========================================================
    async function loadSavedMaterialsTab() {
        const container = document.getElementById("profile-materials-list");
        if (!container) return;
        if (window.DIEUNW?.createSkeletonCardsHtml) {
            container.innerHTML = window.DIEUNW.createSkeletonCardsHtml(2);
        }
        try {
            const [bookmarksData, postsData] = await Promise.all([
                state.isSelf ? api("/api/bookmarks").catch(() => ({ resources: [] })) : Promise.resolve({ resources: [] }),
                api("/api/posts").catch(() => ({ posts: [] }))
            ]);
            const targetId = String(state.profileData?.user?.id || "");
            const shared = (postsData.posts || []).filter(p => p.type === "study-resource" && String(p.userId) === targetId);
            const saved = bookmarksData.resources || [];

            container.replaceChildren();
            const combined = [
                ...shared.map(r => ({ ...r, _tag: "Đã chia sẻ" })),
                ...saved.map(r => ({ ...r, _tag: "Đã lưu từ Kệ sách" }))
            ];
            if (!combined.length) {
                container.innerHTML = window.DIEUNW?.createEmptyIllustrationHtml
                    ? window.DIEUNW.createEmptyIllustrationHtml({
                        title: "Chưa có tài liệu nào",
                        subtitle: "Tài liệu bạn đăng hoặc bấm Lưu trong mục Học nhóm sẽ xuất hiện ở đây."
                    })
                    : `<p class="profile-extra-empty">Chưa có tài liệu nào.</p>`;
                return;
            }
            combined.forEach(res => {
                const title = res.resource_title || res.title || "Tài liệu học tập";
                const subject = res.resource_subject || res.subject || "Tài liệu";
                const desc = res.resource_description || res.description || "";
                const rawFileUrl = res.resource_file_url || res.fileUrl || "";
                const fileUrl = resolveMediaUrl(rawFileUrl);
                const extLink = res.resource_link || res.resourceUrl || "";
                const fileName = res.resource_file_name || "tai-lieu";

                const card = makeEl("article", "study-set-card");
                card.append(makeEl("span", "study-set-badge", `${res._tag} · ${subject}`));
                card.append(makeEl("strong", "", title));
                if (desc) card.append(makeEl("p", "profile-extra-hint", desc));

                const actions = makeEl("div", "study-set-actions");
                if (fileUrl) {
                    const dl = makeEl("a", "study-set-btn primary", "Mở / Tải tệp");
                    dl.href = `${fileUrl}${fileUrl.includes("?") ? "&" : "?"}download=1&name=${encodeURIComponent(fileName)}`;
                    dl.target = "_blank";
                    dl.rel = "noopener noreferrer";
                    dl.style.textDecoration = "none";
                    actions.append(dl);
                }
                if (extLink) {
                    const a = makeEl("a", "study-set-btn", "Mở liên kết");
                    a.href = extLink;
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    a.style.textDecoration = "none";
                    actions.append(a);
                }
                if (actions.children.length) card.append(actions);
                container.append(card);
            });
        } catch (err) {
            container.innerHTML = `<p class="profile-extra-empty">${escapeHtml(err.message)}</p>`;
        }
    }

    // =========================================================
    // ACHIEVEMENTS, INTERESTS & ALBUM (WITH PRIVACY LOCK & COLLAPSED FORMS)
    // =========================================================
    function renderAchievements(list, locked, isOwner) {
        const container = document.getElementById("profile-achievements-list");
        if (!container) return;
        container.replaceChildren();
        if (locked) {
            container.append(makeEl("p", "profile-extra-empty", "Người dùng đã giới hạn quyền xem Góc thành tích."));
            return;
        }
        if (!list.length) {
            container.append(makeEl("p", "profile-extra-empty", "Chưa có thành tích nào được thêm."));
            return;
        }
        list.forEach(a => {
            const item = makeEl("article", "profile-achievement-item");
            item.append(makeEl("span", "profile-achievement-tag", a.title));
            if (a.certificateImage) {
                const certUrl = resolveMediaUrl(a.certificateImage);
                const link = makeEl("a", "profile-certificate-link");
                link.href = certUrl;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                const img = makeEl("img", "profile-certificate-image");
                img.src = certUrl;
                img.alt = a.title;
                link.append(img, makeEl("span", "", "Xem chứng nhận"));
                item.append(link);
            }
            if (isOwner) {
                const del = makeEl("button", "profile-extra-delete", "Xóa");
                del.type = "button";
                del.onclick = async () => {
                    if (!confirm("Xóa thành tích này?")) return;
                    await api(`/api/profile/achievements/${encodeURIComponent(a.id)}`, { method: "DELETE" });
                    await loadFullProfile();
                };
                item.append(del);
            }
            container.append(item);
        });
    }

    function renderInterests(list, isOwner) {
        const container = document.getElementById("profile-interests-list");
        if (!container) return;
        container.replaceChildren();
        if (!list.length) {
            container.append(makeEl("p", "profile-extra-empty", "Chưa có sở thích nào."));
            return;
        }
        list.forEach(item => {
            const tag = makeEl("span", "profile-interest-tag");
            tag.append(makeEl("span", "", item.name));
            if (isOwner) {
                const del = makeEl("button", "profile-extra-delete", "×");
                del.type = "button";
                del.onclick = async () => {
                    await api(`/api/profile/interests/${encodeURIComponent(item.id)}`, { method: "DELETE" });
                    await loadFullProfile();
                };
                tag.append(del);
            }
            container.append(tag);
        });
    }

    function renderAlbum(photos, locked, isOwner) {
        const container = document.getElementById("profile-album-list");
        if (!container) return;
        container.replaceChildren();
        if (locked) {
            container.append(makeEl("p", "profile-extra-empty", "Người dùng đã giới hạn quyền xem Album ảnh."));
            return;
        }
        if (!photos.length) {
            container.append(makeEl("p", "profile-extra-empty", "Chưa có ảnh nào trong album."));
            return;
        }
        photos.forEach(photo => {
            const card = makeEl("article", "profile-album-item");
            const img = makeEl("img", "profile-album-image");
            img.src = resolveMediaUrl(photo.image);
            img.alt = photo.caption || "Ảnh album";
            img.loading = "lazy";
            card.append(img);
            if (photo.caption) card.append(makeEl("p", "profile-album-caption", photo.caption));
            if (isOwner) {
                const del = makeEl("button", "profile-extra-delete", "Xóa");
                del.type = "button";
                del.onclick = async () => {
                    await api(`/api/profile/photos/${encodeURIComponent(photo.id)}`, { method: "DELETE" });
                    await loadFullProfile();
                };
                card.append(del);
            }
            container.append(card);
        });
    }

    // =========================================================
    // E-STUDENT QR CARD & LEFT-TO-CENTER BACKGROUND CUSTOMIZER
    // =========================================================
    function getEcardLocalKey(userId) {
        return `dieunw_ecard_config_${userId || "me"}`;
    }

    function loadUserEcardConfig(user) {
        let saved = user?.ecardConfig || null;
        if (!saved && user?.id) {
            try {
                const raw = localStorage.getItem(getEcardLocalKey(user.id));
                if (raw) saved = JSON.parse(raw);
            } catch {
                saved = null;
            }
        }
        return {
            ...DEFAULT_ECARD_CONFIG,
            color1: user?.themePrimary || DEFAULT_ECARD_CONFIG.color1,
            color2: user?.themeSecondary || DEFAULT_ECARD_CONFIG.color2,
            ...(saved && typeof saved === "object" ? saved : {})
        };
    }

    function applyEcardPreviewConfig(cfg) {
        const card = document.getElementById("ecard-preview-card");
        const photoEl = document.getElementById("ecard-custom-bg-photo");
        const taglineEl = document.getElementById("ecard-tagline-label");
        if (!card) return;

        const safe = { ...DEFAULT_ECARD_CONFIG, ...(cfg || {}) };
        card.dataset.tone = safe.textTone === "dark" ? "dark" : "light";
        card.style.setProperty("--ecard-c1", safe.color1 || "#1769aa");
        card.style.setProperty("--ecard-c2", safe.color2 || "#2298f8");
        card.style.setProperty("--ecard-bg-pos", safe.bgPos || "center center");
        const opacity = Math.max(0, Math.min(80, Number(safe.overlayOpacity ?? 25))) / 100;
        card.style.setProperty("--ecard-overlay", String(opacity));

        if (photoEl) {
            if (safe.bgImage) {
                photoEl.style.backgroundImage = `url("${resolveMediaUrl(safe.bgImage)}")`;
            } else {
                photoEl.style.backgroundImage = "none";
            }
        }

        if (taglineEl) {
            const tag = String(safe.tagline || "").trim();
            taglineEl.textContent = tag;
            taglineEl.hidden = !tag;
        }
    }

    function syncEcardCustomizerInputs(cfg) {
        const posEl = document.getElementById("ecard-bg-pos");
        const toneEl = document.getElementById("ecard-text-tone");
        const c1El = document.getElementById("ecard-c1");
        const c2El = document.getElementById("ecard-c2");
        const rangeEl = document.getElementById("ecard-overlay-range");
        const rangeLbl = document.getElementById("ecard-overlay-label");
        const taglineInput = document.getElementById("ecard-tagline-input");
        const clearBgBtn = document.getElementById("btn-clear-ecard-bg");
        const fileEl = document.getElementById("ecard-bg-file");

        if (posEl) posEl.value = cfg.bgPos || "center center";
        if (toneEl) toneEl.value = cfg.textTone === "dark" ? "dark" : "light";
        if (c1El) c1El.value = cfg.color1 || "#1769aa";
        if (c2El) c2El.value = cfg.color2 || "#2298f8";
        if (rangeEl) rangeEl.value = String(cfg.overlayOpacity ?? 25);
        if (rangeLbl) rangeLbl.textContent = `${cfg.overlayOpacity ?? 25}%`;
        if (taglineInput) taglineInput.value = cfg.tagline || "";
        if (clearBgBtn) clearBgBtn.hidden = !cfg.bgImage;
        if (fileEl) fileEl.value = "";
    }

    document.getElementById("btn-ecard-open")?.addEventListener("click", () => {
        const user = state.profileData?.user || state.viewerUser;
        if (!user) return;
        document.getElementById("ecard-avatar-img").src = resolveMediaUrl(user.avatar || "./DIEU.avif");
        document.getElementById("ecard-name-label").textContent = user.name || "Học sinh NQD";
        document.getElementById("ecard-class-label").textContent = user.studentClass ? `Lớp ${user.studentClass}` : "Học sinh trường NQD";
        document.getElementById("ecard-cohort-label").textContent = user.cohort || "NQD";
        document.getElementById("ecard-email-label").textContent = user.email || "";

        state.ecardDraft = loadUserEcardConfig(user);
        applyEcardPreviewConfig(state.ecardDraft);
        syncEcardCustomizerInputs(state.ecardDraft);

        const customSection = document.getElementById("ecard-custom-section");
        const customAcc = document.getElementById("ecard-custom-accordion");
        const toggleBtn = document.getElementById("btn-toggle-ecard-custom");
        const statusEl = document.getElementById("ecard-custom-status");
        if (customSection) customSection.hidden = !state.isSelf;
        if (customAcc) customAcc.hidden = true;
        if (toggleBtn) {
            toggleBtn.setAttribute("aria-expanded", "false");
            toggleBtn.textContent = "Tùy chỉnh nền & giao diện thẻ ▾";
        }
        if (statusEl) statusEl.textContent = "";

        const profileUrl = `${location.origin}${location.pathname}?userId=${encodeURIComponent(user.id)}`;
        drawQrToCanvas(document.getElementById("ecard-qr-canvas"), profileUrl);
        openModal("ecard-modal-overlay");
    });

    document.getElementById("btn-toggle-ecard-custom")?.addEventListener("click", () => {
        const acc = document.getElementById("ecard-custom-accordion");
        const btn = document.getElementById("btn-toggle-ecard-custom");
        if (!acc || !btn) return;
        acc.hidden = !acc.hidden;
        const isOpen = !acc.hidden;
        btn.setAttribute("aria-expanded", String(isOpen));
        btn.textContent = isOpen ? "Thu gọn phần tùy chỉnh ▴" : "Tùy chỉnh nền & giao diện thẻ ▾";
    });

    document.getElementById("ecard-bg-file")?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        const statusEl = document.getElementById("ecard-custom-status");
        if (!file) return;
        try {
            if (statusEl) statusEl.textContent = "Đang tối ưu ảnh nền...";
            const compressed = await toOptimizedImage(file, 900);
            state.ecardDraft.bgImage = compressed;
            const clearBtn = document.getElementById("btn-clear-ecard-bg");
            if (clearBtn) clearBtn.hidden = false;
            applyEcardPreviewConfig(state.ecardDraft);
            if (statusEl) statusEl.textContent = "Đã xem trước ảnh nền. Bấm \"Lưu mẫu thẻ\" để lưu lại.";
        } catch (err) {
            if (statusEl) statusEl.textContent = err.message;
        }
    });

    document.getElementById("btn-clear-ecard-bg")?.addEventListener("click", () => {
        state.ecardDraft.bgImage = "";
        const fileEl = document.getElementById("ecard-bg-file");
        const clearBtn = document.getElementById("btn-clear-ecard-bg");
        if (fileEl) fileEl.value = "";
        if (clearBtn) clearBtn.hidden = true;
        applyEcardPreviewConfig(state.ecardDraft);
    });

    document.getElementById("ecard-bg-pos")?.addEventListener("change", e => {
        state.ecardDraft.bgPos = e.target.value;
        applyEcardPreviewConfig(state.ecardDraft);
    });

    document.getElementById("ecard-text-tone")?.addEventListener("change", e => {
        state.ecardDraft.textTone = e.target.value === "dark" ? "dark" : "light";
        applyEcardPreviewConfig(state.ecardDraft);
    });

    document.getElementById("ecard-c1")?.addEventListener("input", e => {
        state.ecardDraft.color1 = e.target.value;
        applyEcardPreviewConfig(state.ecardDraft);
    });

    document.getElementById("ecard-c2")?.addEventListener("input", e => {
        state.ecardDraft.color2 = e.target.value;
        applyEcardPreviewConfig(state.ecardDraft);
    });

    document.querySelectorAll(".ecard-swatch-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const c1 = btn.dataset.ec1 || "#1769aa";
            const c2 = btn.dataset.ec2 || "#2298f8";
            state.ecardDraft.color1 = c1;
            state.ecardDraft.color2 = c2;
            const c1El = document.getElementById("ecard-c1");
            const c2El = document.getElementById("ecard-c2");
            if (c1El) c1El.value = c1;
            if (c2El) c2El.value = c2;
            applyEcardPreviewConfig(state.ecardDraft);
        });
    });

    document.getElementById("ecard-overlay-range")?.addEventListener("input", e => {
        const val = Number(e.target.value || 0);
        state.ecardDraft.overlayOpacity = val;
        const lbl = document.getElementById("ecard-overlay-label");
        if (lbl) lbl.textContent = `${val}%`;
        applyEcardPreviewConfig(state.ecardDraft);
    });

    document.getElementById("ecard-tagline-input")?.addEventListener("input", e => {
        state.ecardDraft.tagline = e.target.value.slice(0, 60);
        applyEcardPreviewConfig(state.ecardDraft);
    });

    document.getElementById("btn-reset-ecard-custom")?.addEventListener("click", () => {
        const user = state.profileData?.user || state.viewerUser;
        state.ecardDraft = {
            ...DEFAULT_ECARD_CONFIG,
            color1: user?.themePrimary || DEFAULT_ECARD_CONFIG.color1,
            color2: user?.themeSecondary || DEFAULT_ECARD_CONFIG.color2
        };
        syncEcardCustomizerInputs(state.ecardDraft);
        applyEcardPreviewConfig(state.ecardDraft);
        const statusEl = document.getElementById("ecard-custom-status");
        if (statusEl) statusEl.textContent = "Đã khôi phục mặc định. Bấm \"Lưu mẫu thẻ\" nếu muốn ghi đè mẫu cũ.";
    });

    document.getElementById("btn-save-ecard-custom")?.addEventListener("click", async () => {
        const user = state.profileData?.user || state.viewerUser;
        const statusEl = document.getElementById("ecard-custom-status");
        if (!user) return;
        const payloadCfg = { ...state.ecardDraft };

        try {
            if (statusEl) statusEl.textContent = "Đang lưu mẫu thẻ...";
            try {
                localStorage.setItem(getEcardLocalKey(user.id), JSON.stringify(payloadCfg));
            } catch {}

            const res = await api("/api/users/me", {
                method: "PATCH",
                body: JSON.stringify({ ecardConfig: payloadCfg })
            });
            if (res.user) {
                state.viewerUser = res.user;
                if (state.profileData) state.profileData.user = res.user;
                localStorage.setItem("dieuNwUser", JSON.stringify(res.user));
            }
            if (statusEl) statusEl.textContent = "Đã lưu tùy chỉnh Thẻ học sinh điện tử!";
        } catch (err) {
            if (statusEl) {
                statusEl.textContent = `Đã lưu trên thiết bị này (đồng bộ server gặp lỗi: ${err.message}).`;
            }
        }
    });

    document.getElementById("btn-copy-profile-link")?.addEventListener("click", async () => {
        const user = state.profileData?.user || state.viewerUser;
        if (!user) return;
        const url = `${location.origin}${location.pathname}?userId=${encodeURIComponent(user.id)}`;
        await navigator.clipboard?.writeText(url).catch(() => {});
        alert("Đã sao chép liên kết hồ sơ!");
    });

    function loadCanvasImage(src) {
        return new Promise((resolve, reject) => {
            if (!src) return resolve(null);
            const img = new Image();
            if (!src.startsWith("data:") && !src.startsWith("blob:")) {
                img.crossOrigin = "anonymous";
            }
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Image load failed"));
            img.src = src;
        });
    }

    function drawRoundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    document.getElementById("btn-download-ecard")?.addEventListener("click", async () => {
        const qrCanvas = document.getElementById("ecard-qr-canvas");
        const user = state.profileData?.user || state.viewerUser;
        if (!qrCanvas || !user) return;

        const cfg = state.ecardDraft || loadUserEcardConfig(user);
        const W = 760;
        const H = 430;
        const outCanvas = document.createElement("canvas");
        outCanvas.width = W;
        outCanvas.height = H;
        const ctx = outCanvas.getContext("2d");

        try {
            // Card clip & right-half clean base
            ctx.save();
            drawRoundRectPath(ctx, 0, 0, W, H, 28);
            ctx.clip();

            const isDarkText = cfg.textTone === "dark";
            const rightBaseGrad = ctx.createLinearGradient(0, 0, W, H);
            if (isDarkText) {
                rightBaseGrad.addColorStop(0, "#f8fafc");
                rightBaseGrad.addColorStop(1, "#dbeafe");
            } else {
                rightBaseGrad.addColorStop(0, "#0b2236");
                rightBaseGrad.addColorStop(1, "#133a5c");
            }
            ctx.fillStyle = rightBaseGrad;
            ctx.fillRect(0, 0, W, H);

            // Left-to-near-center custom background zone (68% width fading out toward QR zone)
            const bgLayer = document.createElement("canvas");
            bgLayer.width = W;
            bgLayer.height = H;
            const bctx = bgLayer.getContext("2d");

            const zoneGrad = bctx.createLinearGradient(0, 0, W * 0.68, H);
            zoneGrad.addColorStop(0, cfg.color1 || "#1769aa");
            zoneGrad.addColorStop(1, cfg.color2 || "#2298f8");
            bctx.fillStyle = zoneGrad;
            bctx.fillRect(0, 0, W, H);

            if (cfg.bgImage) {
                const bgImg = await loadCanvasImage(resolveMediaUrl(cfg.bgImage)).catch(() => null);
                if (bgImg) {
                    const zoneW = W * 0.72;
                    const scale = Math.max(zoneW / bgImg.width, H / bgImg.height);
                    const dw = bgImg.width * scale;
                    const dh = bgImg.height * scale;
                    let dx = (zoneW - dw) / 2;
                    let dy = (H - dh) / 2;
                    if (cfg.bgPos === "left center") dx = 0;
                    else if (cfg.bgPos === "right center") dx = zoneW - dw;
                    else if (cfg.bgPos === "center top") dy = 0;
                    else if (cfg.bgPos === "center bottom") dy = H - dh;
                    bctx.drawImage(bgImg, dx, dy, dw, dh);
                }
            }

            const overlayAlpha = Math.max(0, Math.min(80, Number(cfg.overlayOpacity ?? 25))) / 100;
            if (overlayAlpha > 0) {
                bctx.fillStyle = `rgba(7, 17, 29, ${overlayAlpha})`;
                bctx.fillRect(0, 0, W, H);
            }

            // Smooth horizontal mask so left-to-center custom area blends seamlessly before QR zone
            bctx.globalCompositeOperation = "destination-in";
            const maskGrad = bctx.createLinearGradient(0, 0, W * 0.74, 0);
            maskGrad.addColorStop(0, "rgba(0,0,0,1)");
            maskGrad.addColorStop(0.68, "rgba(0,0,0,0.92)");
            maskGrad.addColorStop(0.92, "rgba(0,0,0,0.22)");
            maskGrad.addColorStop(1, "rgba(0,0,0,0)");
            bctx.fillStyle = maskGrad;
            bctx.fillRect(0, 0, W, H);

            ctx.drawImage(bgLayer, 0, 0);

            // Typography & header
            const textColor = isDarkText ? "#0f172a" : "#ffffff";
            const mutedColor = isDarkText ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.88)";

            ctx.fillStyle = isDarkText ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.82)";
            ctx.font = "700 16px system-ui, -apple-system, sans-serif";
            ctx.fillText("DIEUNW · E-STUDENT CARD", 36, 48);

            // Cohort pill on top-right
            const cohortText = (user.cohort || "NQD").slice(0, 24);
            ctx.font = "700 15px system-ui, -apple-system, sans-serif";
            const pillW = Math.max(76, ctx.measureText(cohortText).width + 28);
            drawRoundRectPath(ctx, W - 36 - pillW, 26, pillW, 32, 16);
            ctx.fillStyle = isDarkText ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.18)";
            ctx.fill();
            ctx.fillStyle = textColor;
            ctx.textAlign = "center";
            ctx.fillText(cohortText, W - 36 - pillW / 2, 47);
            ctx.textAlign = "left";

            // Avatar circle
            const avImg = await loadCanvasImage(resolveMediaUrl(user.avatar || "./DIEU.avif")).catch(() => null);
            ctx.save();
            ctx.beginPath();
            ctx.arc(76, 134, 40, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            if (avImg) {
                ctx.drawImage(avImg, 36, 94, 80, 80);
            } else {
                ctx.fillStyle = "#1769aa";
                ctx.fillRect(36, 94, 80, 80);
            }
            ctx.restore();
            ctx.strokeStyle = isDarkText ? "rgba(15,23,42,0.28)" : "#ffffff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(76, 134, 40, 0, Math.PI * 2);
            ctx.stroke();

            // Student identity text on left zone
            ctx.fillStyle = textColor;
            ctx.font = "800 28px system-ui, -apple-system, sans-serif";
            ctx.fillText((user.name || "Học sinh NQD").slice(0, 26), 36, 222);

            ctx.fillStyle = mutedColor;
            ctx.font = "600 19px system-ui, -apple-system, sans-serif";
            ctx.fillText(user.studentClass ? `Lớp ${user.studentClass}` : "Học sinh trường NQD", 36, 258);

            ctx.font = "500 16px system-ui, -apple-system, sans-serif";
            ctx.fillText(user.email || "", 36, 290);

            if (cfg.tagline) {
                const tag = String(cfg.tagline).trim().slice(0, 48);
                ctx.font = "700 15px system-ui, -apple-system, sans-serif";
                const tagW = Math.min(410, ctx.measureText(tag).width + 24);
                drawRoundRectPath(ctx, 36, 318, tagW, 34, 17);
                ctx.fillStyle = isDarkText ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.20)";
                ctx.fill();
                ctx.fillStyle = textColor;
                ctx.fillText(tag, 48, 340, 386);
            }

            // Right QR Box
            const qrBoxSize = 216;
            const qrX = W - 36 - qrBoxSize;
            const qrY = 114;
            drawRoundRectPath(ctx, qrX, qrY, qrBoxSize, qrBoxSize, 20);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.drawImage(qrCanvas, qrX + 14, qrY + 14, qrBoxSize - 28, qrBoxSize - 28);

            ctx.fillStyle = isDarkText ? "rgba(15,23,42,0.70)" : "rgba(255,255,255,0.75)";
            ctx.font = "600 13px system-ui, -apple-system, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Quét mã để mở hồ sơ", qrX + qrBoxSize / 2, qrY + qrBoxSize + 24);
            ctx.textAlign = "left";
            ctx.restore();

            const link = document.createElement("a");
            link.download = `the-hoc-sinh-${(user.name || "nqd").toLowerCase().replace(/\s+/g, "-")}.png`;
            link.href = outCanvas.toDataURL("image/png");
            link.click();
        } catch {
            const link = document.createElement("a");
            link.download = "dieunw-qr-card.png";
            link.href = qrCanvas.toDataURL("image/png");
            link.click();
        }
    });

    // =========================================================
    // DIEUNW+ MODAL
    // =========================================================
    async function renderDieunwPlusModal() {
        const user = state.profileData?.user || state.viewerUser;
        if (!user) return;
        document.getElementById("plus-grad-1").value = user.themePrimary || "#1769aa";
        document.getElementById("plus-grad-2").value = user.themeSecondary || "#2298f8";
        document.getElementById("plus-ghost-mode").checked = Boolean(user.ghostMode);
        document.getElementById("plus-privacy-album").value = user.privacyAlbum || "public";
        document.getElementById("plus-privacy-achievements").value = user.privacyAchievements || "public";
        document.getElementById("plus-privacy-activity").value = user.privacyActivity || "public";
        document.getElementById("plus-study-points-badge").textContent = `${user.studyPoints || 0} điểm tự học`;

        const unlocked = new Set(Array.isArray(user.unlockedFrames) ? user.unlockedFrames : ["none"]);
        const shopGrid = document.getElementById("plus-frame-shop-grid");
        shopGrid.replaceChildren();
        FRAME_CATALOG.forEach(frame => {
            const owned = unlocked.has(frame.id) || frame.cost === 0;
            const active = (user.activeAvatarFrame || "none") === frame.id;
            const card = makeEl("div", `frame-shop-card${active ? " is-active" : ""}`);
            card.append(makeEl("strong", "", frame.name));
            card.append(makeEl("span", "profile-extra-hint", owned ? "Đã sở hữu" : `${frame.cost} điểm tự học`));

            const btn = makeEl("button", `study-set-btn${active ? " primary" : ""}`, active ? "Đang dùng" : owned ? "Áp dụng" : "Mở khóa");
            btn.type = "button";
            btn.onclick = async () => {
                try {
                    if (!owned) {
                        const res = await api("/api/study/frames/unlock", {
                            method: "POST",
                            body: JSON.stringify({ frameId: frame.id })
                        });
                        if (res.user) {
                            state.viewerUser = res.user;
                            localStorage.setItem("dieuNwUser", JSON.stringify(res.user));
                        }
                    }
                    const res2 = await api("/api/users/me", {
                        method: "PATCH",
                        body: JSON.stringify({ activeAvatarFrame: frame.id })
                    });
                    if (res2.user) {
                        state.viewerUser = res2.user;
                        localStorage.setItem("dieuNwUser", JSON.stringify(res2.user));
                    }
                    await loadFullProfile();
                    renderDieunwPlusModal();
                } catch (err) {
                    document.getElementById("plus-save-status").textContent = err.message;
                }
            };
            card.append(btn);
            shopGrid.append(card);
        });

        await refreshStickersInModal();
    }

    async function refreshStickersInModal() {
        const listEl = document.getElementById("plus-stickers-list");
        if (!listEl) return;
        try {
            const data = await api("/api/stickers");
            const stickers = data.stickers || [];
            listEl.replaceChildren();
            if (!stickers.length) {
                listEl.append(makeEl("p", "profile-extra-empty", "Chưa có sticker nào."));
                return;
            }
            stickers.forEach(st => {
                const box = makeEl("div", "sticker-thumb-btn");
                box.style.position = "relative";
                const im = makeEl("img");
                im.src = resolveMediaUrl(st.image || st.imageUrl);
                im.alt = st.name || "Sticker";
                box.append(im);
                const ownerId = st.owner_id || st.ownerUserId;
                if (state.viewerUser && String(ownerId) === String(state.viewerUser.id)) {
                    const x = makeEl("button", "admin-remove-btn", "×");
                    x.type = "button";
                    x.style.cssText = "position:absolute; top:2px; right:3px; background:rgba(255,255,255,0.9); border-radius:50%; width:16px; height:16px; font-size:11px;";
                    x.onclick = async () => {
                        await api(`/api/stickers/${encodeURIComponent(st.id)}`, { method: "DELETE" });
                        window.DIEUNW?.invalidateStickerCache?.();
                        refreshStickersInModal();
                    };
                    box.append(x);
                }
                listEl.append(box);
            });
        } catch {
            listEl.replaceChildren();
        }
    }

    document.getElementById("btn-dieunw-plus")?.addEventListener("click", async () => {
        await renderDieunwPlusModal();
        openModal("dieunw-plus-overlay");
    });

    document.querySelectorAll(".gradient-swatch-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.getElementById("plus-grad-1").value = btn.dataset.g1;
            document.getElementById("plus-grad-2").value = btn.dataset.g2;
        });
    });

    document.getElementById("btn-add-sticker")?.addEventListener("click", async () => {
        const file = document.getElementById("plus-sticker-file").files[0];
        const name = document.getElementById("plus-sticker-name").value.trim() || "Sticker";
        const status = document.getElementById("plus-save-status");
        if (!file) {
            status.textContent = "Hãy chọn file PNG/WEBP/GIF làm sticker.";
            return;
        }
        try {
            status.textContent = "Đang tải sticker...";
            const image = await toOptimizedImage(file, 256);
            await api("/api/stickers", {
                method: "POST",
                body: JSON.stringify({ name, image })
            });
            document.getElementById("plus-sticker-name").value = "";
            document.getElementById("plus-sticker-file").value = "";
            window.DIEUNW?.invalidateStickerCache?.();
            status.textContent = "Đã thêm sticker vào bộ sưu tập!";
            await refreshStickersInModal();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    document.getElementById("btn-save-dieunw-plus")?.addEventListener("click", async () => {
        const status = document.getElementById("plus-save-status");
        status.textContent = "Đang lưu cài đặt...";
        try {
            const payload = {
                themePrimary: document.getElementById("plus-grad-1").value,
                themeSecondary: document.getElementById("plus-grad-2").value,
                ghostMode: document.getElementById("plus-ghost-mode").checked,
                privacyAlbum: document.getElementById("plus-privacy-album").value,
                privacyAchievements: document.getElementById("plus-privacy-achievements").value,
                privacyActivity: document.getElementById("plus-privacy-activity").value
            };
            const data = await api("/api/users/me", {
                method: "PATCH",
                body: JSON.stringify(payload)
            });
            if (data.user) {
                state.viewerUser = data.user;
                localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
                window.updateNavAvatar?.(data.user);
            }
            closeModal("dieunw-plus-overlay");
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    // =========================================================
    // RBAC PRIVILEGED WORKSPACE (DYNAMIC MOUNT ONLY WHEN AUTHORIZED)
    // =========================================================
    async function loadPrivilegedWorkspace() {
        const mount = document.getElementById("privileged-workspace-mount");
        if (!mount) return;
        mount.replaceChildren();
        if (!state.isSelf || !state.viewerUser) return;

        try {
            const data = await api("/api/admin/workspace");
            if (!data.isAdmin && !data.isModerator) return;
            state.modWorkspaceData = data;
            renderPrivilegedWorkspace(mount, data);
        } catch {
            mount.replaceChildren();
        }
    }

    function renderPrivilegedWorkspace(mount, data) {
        mount.replaceChildren();

        if (data.isAdmin) {
            const adminSec = makeEl("section", "admin-tools");
            adminSec.innerHTML = `
                <div>
                    <p class="clubs-eyebrow">QUẢN TRỊ HỆ THỐNG (RBAC)</p>
                    <h2>Quản lý Admin &amp; Ban duyệt bài</h2>
                </div>
                <form id="dyn-admin-add-form" class="admin-add-form">
                    <label for="dyn-admin-email-input">Thêm Admin (Email trường)</label>
                    <div class="admin-add-row">
                        <input id="dyn-admin-email-input" type="email" placeholder="ten@nqd.edu.vn" required>
                        <button class="clubs-button" type="submit">Thêm Admin</button>
                    </div>
                    <p id="dyn-admin-status" class="clubs-form-status"></p>
                </form>
                <ul id="dyn-admin-list" class="admin-list"></ul>
                <hr class="admin-tools-divider">
                <form id="dyn-mod-add-form" class="admin-add-form">
                    <label for="dyn-mod-email-input">Thêm Ban duyệt bài (Email trường)</label>
                    <div class="admin-add-row">
                        <input id="dyn-mod-email-input" type="email" placeholder="duyetbai@nqd.edu.vn" required>
                        <button class="clubs-button" type="submit">Thêm Ban duyệt bài</button>
                    </div>
                    <p id="dyn-mod-status" class="clubs-form-status"></p>
                </form>
                <ul id="dyn-mod-list" class="admin-list"></ul>
            `;
            mount.append(adminSec);

            const adminUl = adminSec.querySelector("#dyn-admin-list");
            (data.admins || []).forEach(em => adminUl.append(makeEl("li", "", em)));

            const modUl = adminSec.querySelector("#dyn-mod-list");
            (data.moderators || []).forEach(em => {
                const li = makeEl("li", "", `${em} `);
                const rm = makeEl("button", "admin-remove-btn", "×");
                rm.type = "button";
                rm.onclick = async () => {
                    await api(`/api/moderators/${encodeURIComponent(em)}`, { method: "DELETE" });
                    await loadPrivilegedWorkspace();
                };
                li.append(rm);
                modUl.append(li);
            });

            adminSec.querySelector("#dyn-admin-add-form").onsubmit = async e => {
                e.preventDefault();
                const em = adminSec.querySelector("#dyn-admin-email-input").value.trim();
                const st = adminSec.querySelector("#dyn-admin-status");
                try {
                    await api("/api/admins", { method: "POST", body: JSON.stringify({ email: em }) });
                    st.textContent = `Đã thêm ${em} làm Admin.`;
                    await loadPrivilegedWorkspace();
                } catch (err) {
                    st.textContent = err.message;
                }
            };

            adminSec.querySelector("#dyn-mod-add-form").onsubmit = async e => {
                e.preventDefault();
                const em = adminSec.querySelector("#dyn-mod-email-input").value.trim();
                const st = adminSec.querySelector("#dyn-mod-status");
                try {
                    await api("/api/moderators", { method: "POST", body: JSON.stringify({ email: em }) });
                    st.textContent = `Đã thêm ${em} vào Ban duyệt bài.`;
                    await loadPrivilegedWorkspace();
                } catch (err) {
                    st.textContent = err.message;
                }
            };
        }

        const modSec = makeEl("section", "moderation-panel");
        modSec.style.marginTop = "16px";
        const postCount = (data.reportQueuePosts || []).length;
        const userCount = (data.reportQueueUsers || []).length;
        const logCount = (data.auditLogs || []).length;

        modSec.innerHTML = `
            <div>
                <p class="clubs-eyebrow">BAN DUYỆT BÀI</p>
                <h2>Hàng đợi báo cáo (Max-Heap) &amp; Nhật ký</h2>
            </div>
            <div class="mod-tabs" role="tablist">
                <button type="button" class="mod-tab${state.modTab === "posts" ? " active" : ""}" data-dyn-mod-tab="posts">Bài viết (${postCount})</button>
                <button type="button" class="mod-tab${state.modTab === "users" ? " active" : ""}" data-dyn-mod-tab="users">Tài khoản (${userCount})</button>
                <button type="button" class="mod-tab${state.modTab === "audit" ? " active" : ""}" data-dyn-mod-tab="audit">Nhật ký xử lý (${logCount})</button>
            </div>
            <div id="dyn-mod-content" class="mod-queue-list"></div>
        `;
        mount.append(modSec);

        modSec.querySelectorAll("[data-dyn-mod-tab]").forEach(btn => {
            btn.onclick = () => {
                state.modTab = btn.getAttribute("data-dyn-mod-tab");
                renderPrivilegedWorkspace(mount, data);
            };
        });

        const content = modSec.querySelector("#dyn-mod-content");
        if (state.modTab === "audit") {
            const logs = data.auditLogs || [];
            if (!logs.length) {
                content.append(makeEl("p", "profile-extra-empty", "Chưa có nhật ký xử lý nào."));
            } else {
                const list = makeEl("div", "audit-log-list");
                logs.forEach(log => {
                    const actor = log.actor_name || log.actorName || log.actor_email || log.actorEmail || "Ban kiểm duyệt";
                    const action = log.action || log.actionLabel || "";
                    const detail = log.target_label || log.details || log.detail || "";
                    const ts = log.created_at || log.createdAt;
                    const item = makeEl("div", "audit-log-item");
                    item.innerHTML = `<strong>${escapeHtml(actor)} · ${escapeHtml(action)}</strong><span class="audit-log-meta">${escapeHtml(detail)}${detail ? " • " : ""}${ts ? new Date(ts).toLocaleString("vi-VN") : ""}</span>`;
                    list.append(item);
                });
                content.append(list);
            }
            return;
        }

        const queue = state.modTab === "users" ? (data.reportQueueUsers || []) : (data.reportQueuePosts || []);
        if (!queue.length) {
            content.append(makeEl("p", "profile-extra-empty", "Hàng đợi trống, không có báo cáo mới."));
            return;
        }

        queue.forEach(entry => {
            const titleText = entry.targetTitle
                || (entry.post ? `Bài viết của ${entry.post.name || "Thành viên"}` : null)
                || (entry.account ? `${entry.account.name} (${entry.account.email})` : null)
                || entry.targetId;
            const previewText = entry.targetPreview
                || (entry.post ? String(entry.post.content || "").replace(/<[^>]+>/g, " ").slice(0, 90) : null)
                || `${entry.reportCount} báo cáo đang chờ duyệt`;

            const card = makeEl("button", "mod-queue-card");
            card.type = "button";
            const info = makeEl("div", "mod-queue-info");
            info.append(makeEl("strong", "", titleText));
            info.append(makeEl("p", "", previewText));
            const badge = makeEl("span", "mod-count-badge", `${entry.reportCount} báo cáo`);
            card.append(info, badge);
            card.onclick = () => openModInspectModal({ ...entry, targetTitle: titleText }, state.modTab === "users" ? "user" : "post");
            content.append(card);
        });
    }

    function openModInspectModal(entry, targetType) {
        const body = document.getElementById("mod-inspect-body");
        const actions = document.getElementById("mod-inspect-actions");
        const postContentHtml = entry.post?.content
            ? `<div style="padding:10px; border-radius:10px; background:var(--bg-surface-soft); margin-bottom:10px; font-size:13.5px;">${escapeHtml(String(entry.post.content).replace(/<[^>]+>/g, " ").slice(0, 320))}</div>`
            : "";

        body.innerHTML = `
            <p style="font-weight:700; margin-bottom:8px;">${escapeHtml(entry.targetTitle || entry.targetId)}</p>
            ${postContentHtml}
            <div class="mod-reasons-list">
                ${(entry.reasons || []).map(r => `<div class="mod-reason-item"><strong>${escapeHtml(r.reporterName || "Ẩn danh")}:</strong> ${escapeHtml(r.reason)}</div>`).join("")}
            </div>
        `;
        actions.replaceChildren();
        if (targetType === "post") {
            const delBtn = makeEl("button", "btn-logout", "Xóa bài viết vi phạm");
            delBtn.type = "button";
            delBtn.onclick = async () => {
                await api("/api/moderation/resolve", {
                    method: "POST",
                    body: JSON.stringify({ targetType: "post", targetId: entry.targetId, action: "delete_post" })
                });
                closeModal("mod-inspect-overlay");
                await loadPrivilegedWorkspace();
            };
            actions.append(delBtn);
        }
        const dismissBtn = makeEl("button", "btn-auth outline", "Bỏ qua / Hợp lệ");
        dismissBtn.type = "button";
        dismissBtn.style.width = "auto";
        dismissBtn.onclick = async () => {
            await api("/api/moderation/resolve", {
                method: "POST",
                body: JSON.stringify({ targetType, targetId: entry.targetId, action: "dismiss" })
            });
            closeModal("mod-inspect-overlay");
            await loadPrivilegedWorkspace();
        };
        actions.append(dismissBtn);
        openModal("mod-inspect-overlay");
    }

    document.getElementById("mod-inspect-close")?.addEventListener("click", () => closeModal("mod-inspect-overlay"));

    // =========================================================
    // TABS, POSTS SUBFILTER (CỦA TÔI / BÀI ĐÃ LƯU) & ACCORDION FORMS
    // =========================================================
    document.querySelectorAll("[data-profile-tab]").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.getAttribute("data-profile-tab");
            document.querySelectorAll("[data-profile-tab]").forEach(b => b.classList.toggle("active", b === btn));
            document.querySelectorAll("[data-tab-panel]").forEach(p => {
                p.hidden = p.getAttribute("data-tab-panel") !== tab;
            });
            if (tab === "saved-materials") loadSavedMaterialsTab();
        });
    });

    async function renderSavedPostsList() {
        const container = document.getElementById("my-posts-container");
        if (!container) return;
        container.innerHTML = `<p class="profile-extra-empty">Đang tải bài viết đã lưu...</p>`;
        try {
            const data = await api("/api/bookmarks");
            const savedPosts = data.posts || [];
            container.replaceChildren();
            if (!savedPosts.length) {
                container.innerHTML = `<p class="profile-extra-empty">Bạn chưa lưu bài viết nào từ Bảng tin.</p>`;
                return;
            }
            savedPosts.forEach(p => {
                const card = makeEl("article", "post-card");
                const head = makeEl("div", "post-header");
                const left = makeEl("div", "", "");
                left.style.cssText = "display:flex; align-items:center; gap:10px;";
                const av = makeEl("img", "post-avatar");
                av.src = resolveMediaUrl(p.avatar || "./DIEU.avif");
                av.alt = p.name || "Thành viên";
                const meta = makeEl("div", "", "");
                meta.append(makeEl("strong", "", p.name || "Thành viên"));
                const dt = makeEl("div", "profile-extra-hint", p.createdAt ? new Date(p.createdAt).toLocaleString("vi-VN") : "");
                meta.append(dt);
                left.append(av, meta);

                const unsaveBtn = makeEl("button", "profile-extra-delete", "Bỏ lưu");
                unsaveBtn.type = "button";
                unsaveBtn.onclick = async () => {
                    await api("/api/bookmarks/toggle", {
                        method: "POST",
                        body: JSON.stringify({ itemType: "post", itemId: p.id })
                    });
                    renderSavedPostsList();
                };
                head.append(left, unsaveBtn);

                const body = makeEl("div", "post-content");
                if (p.isRichHtml) {
                    body.innerHTML = String(p.content || "");
                } else {
                    body.textContent = p.content || "";
                }
                card.append(head, body);
                if (p.image) {
                    const im = makeEl("img", "post-image");
                    im.src = resolveMediaUrl(p.image);
                    im.alt = "Ảnh bài viết";
                    card.append(im);
                }
                container.append(card);
            });
        } catch (err) {
            container.innerHTML = `<p class="profile-extra-empty">${escapeHtml(err.message)}</p>`;
        }
    }

    document.querySelectorAll("#posts-subfilter-pills [data-post-filter]").forEach(btn => {
        btn.addEventListener("click", () => {
            const filter = btn.getAttribute("data-post-filter") || "mine";
            state.activePostFilter = filter;
            document.querySelectorAll("#posts-subfilter-pills [data-post-filter]").forEach(b => b.classList.toggle("active", b === btn));
            const heading = document.getElementById("posts-section-heading");
            if (heading) heading.textContent = filter === "saved" ? "Bài viết đã lưu" : "Bài viết đã đăng";

            if (filter === "saved") {
                renderSavedPostsList();
            } else {
                window.dispatchEvent(new CustomEvent("dieu-profile-post-filter", { detail: { filter: "mine" } }));
                if (typeof window.loadProfilePosts === "function") {
                    window.loadProfilePosts();
                } else {
                    location.reload();
                }
            }
        });
    });

    function bindAccordionToggle(btnId, accId) {
        document.getElementById(btnId)?.addEventListener("click", () => {
            const acc = document.getElementById(accId);
            if (acc) acc.hidden = !acc.hidden;
        });
    }
    bindAccordionToggle("btn-toggle-study-tag-form", "study-tag-accordion");
    bindAccordionToggle("btn-toggle-achievement-form", "achievement-accordion");
    bindAccordionToggle("btn-toggle-interest-form", "interest-accordion");
    bindAccordionToggle("btn-toggle-album-form", "album-accordion");

    document.getElementById("btn-open-note-modal")?.addEventListener("click", () => {
        document.getElementById("note-text-input").value = state.profileData?.user?.noteText || "";
        openModal("note-modal-overlay");
    });

    document.getElementById("btn-save-note")?.addEventListener("click", async () => {
        const text = document.getElementById("note-text-input").value.trim();
        await api("/api/profile/note", { method: "PUT", body: JSON.stringify({ text }) });
        closeModal("note-modal-overlay");
        await loadFullProfile();
    });

    document.getElementById("btn-clear-note")?.addEventListener("click", async () => {
        await api("/api/profile/note", { method: "PUT", body: JSON.stringify({ text: "" }) });
        closeModal("note-modal-overlay");
        await loadFullProfile();
    });

    document.getElementById("btn-open-moment-modal")?.addEventListener("click", () => openModal("moment-modal-overlay"));
    document.getElementById("moment-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const status = document.getElementById("moment-form-status");
        const file = document.getElementById("moment-image-file").files[0];
        if (!file) return;
        try {
            status.textContent = "Đang nén & đăng Moment...";
            const image = await toOptimizedImage(file, 1080);
            await api("/api/profile/moments", {
                method: "POST",
                body: JSON.stringify({ image, caption: document.getElementById("moment-caption-input").value.trim() })
            });
            e.currentTarget.reset();
            status.textContent = "";
            closeModal("moment-modal-overlay");
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    document.getElementById("btn-open-story-modal")?.addEventListener("click", () => openModal("story-modal-overlay"));
    document.getElementById("story-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const status = document.getElementById("story-form-status");
        const file = document.getElementById("story-media-file").files[0];
        if (!file) return;
        try {
            status.textContent = "Đang tải Story lên...";
            const caption = document.getElementById("story-caption-input").value.trim();
            const durationHours = Number(document.getElementById("story-duration-select").value || 24);
            if (file.type.startsWith("image/")) {
                const mediaUrl = await toOptimizedImage(file, 1080);
                await api("/api/stories", {
                    method: "POST",
                    body: JSON.stringify({ mediaUrl, caption, durationHours })
                });
            } else {
                const fd = new FormData();
                fd.append("media", file);
                fd.append("caption", caption);
                fd.append("durationHours", String(durationHours));
                await api("/api/stories", { method: "POST", body: fd });
            }
            e.currentTarget.reset();
            status.textContent = "";
            closeModal("story-modal-overlay");
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    document.getElementById("btn-open-showcase-modal")?.addEventListener("click", () => openModal("showcase-modal-overlay"));
    document.getElementById("showcase-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const status = document.getElementById("showcase-form-status");
        try {
            status.textContent = "Đang lưu...";
            const file = document.getElementById("showcase-image-file").files[0];
            const image = file ? await toOptimizedImage(file, 900) : "";
            await api("/api/profile/showcase", {
                method: "POST",
                body: JSON.stringify({
                    title: document.getElementById("showcase-title-input").value.trim(),
                    description: document.getElementById("showcase-desc-input").value.trim(),
                    link: document.getElementById("showcase-url-input").value.trim(),
                    image
                })
            });
            e.currentTarget.reset();
            status.textContent = "";
            closeModal("showcase-modal-overlay");
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    document.getElementById("study-tag-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const status = document.getElementById("study-tag-status");
        try {
            status.textContent = "Đang thêm...";
            await api("/api/profile/study-tags", {
                method: "POST",
                body: JSON.stringify({
                    subject: document.getElementById("study-tag-input").value.trim(),
                    kind: document.getElementById("study-tag-type").value
                })
            });
            e.currentTarget.reset();
            status.textContent = "";
            document.getElementById("study-tag-accordion").hidden = true;
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    document.getElementById("achievement-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const status = document.getElementById("achievement-status");
        try {
            status.textContent = "Đang lưu...";
            const certFile = document.getElementById("achievement-certificate").files[0];
            const certificateImage = certFile ? await toOptimizedImage(certFile, 900) : "";
            await api("/api/profile/achievements", {
                method: "POST",
                body: JSON.stringify({ title: document.getElementById("achievement-title").value.trim(), certificateImage })
            });
            e.currentTarget.reset();
            status.textContent = "Đã thêm thành tích!";
            document.getElementById("achievement-accordion").hidden = true;
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    document.getElementById("interest-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const status = document.getElementById("interest-status");
        try {
            await api("/api/profile/interests", {
                method: "POST",
                body: JSON.stringify({ name: document.getElementById("interest-name").value.trim() })
            });
            e.currentTarget.reset();
            status.textContent = "Đã thêm sở thích!";
            document.getElementById("interest-accordion").hidden = true;
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    document.getElementById("album-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const status = document.getElementById("album-status");
        const file = document.getElementById("album-photo").files[0];
        if (!file) return;
        try {
            status.textContent = "Đang tối ưu & tải ảnh...";
            const image = await toOptimizedImage(file, 1080);
            await api("/api/profile/photos", {
                method: "POST",
                body: JSON.stringify({ image, caption: document.getElementById("album-caption").value.trim() })
            });
            e.currentTarget.reset();
            status.textContent = "Đã thêm ảnh vào album!";
            document.getElementById("album-accordion").hidden = true;
            await loadFullProfile();
        } catch (err) {
            status.textContent = err.message;
        }
    });

    // =========================================================
    // CLUB FANPAGE JOIN BUTTON HOOK (profile.html?clubId=...)
    // =========================================================
    async function initClubFanpageJoinButton(clubId) {
        if (!clubId) return;
        const bar = document.getElementById("profile-actions-bar");
        if (!bar) return;

        try {
            const data = await api(`/api/clubs/${encodeURIComponent(clubId)}`);
            const club = data.club;
            if (!club) return;

            let btn = document.getElementById("btn-fanpage-join-club");
            if (!btn) {
                btn = makeEl("button", "btn-club-join");
                btn.id = "btn-fanpage-join-club";
                btn.type = "button";
                const editBtn = document.getElementById("btn-edit-profile");
                if (editBtn && editBtn.parentNode === bar) {
                    editBtn.insertAdjacentElement("afterend", btn);
                } else {
                    bar.prepend(btn);
                }
            }

            let joined = Boolean(club.isMember);
            const syncBtn = () => {
                btn.classList.toggle("is-joined", joined);
                btn.textContent = joined ? "✓ Đã tham gia" : "Tham gia CLB";
                btn.setAttribute("aria-pressed", String(joined));
            };
            syncBtn();

            btn.onclick = async () => {
                btn.disabled = true;
                try {
                    await api(`/api/clubs/${encodeURIComponent(club.id)}/join`, {
                        method: joined ? "DELETE" : "POST"
                    });
                    joined = !joined;
                    syncBtn();
                } catch (err) {
                    alert(err.message || "Vui lòng đăng nhập tài khoản DIEUNW để tham gia CLB.");
                } finally {
                    btn.disabled = false;
                }
            };
        } catch {
            // Silent fallback if club cannot be loaded
        }
    }

    // =========================================================
    // MASTER LOADER
    // =========================================================
    async function loadFullProfile() {
        const params = new URLSearchParams(window.location.search);
        const clubId = params.get("clubId");
        if (clubId) {
            initClubFanpageJoinButton(clubId);
            return;
        }
        const targetId = params.get("userId") || state.targetUserId || "me";
        try {
            const data = await api(`/api/users/${encodeURIComponent(targetId)}/profile`);
            state.profileData = data;
            if (!state.viewerUser) {
                try {
                    state.viewerUser = JSON.parse(localStorage.getItem("dieuNwUser") || "null");
                } catch {
                    state.viewerUser = null;
                }
            }
            state.isSelf = Boolean(state.viewerUser && data.user && String(state.viewerUser.id) === String(data.user.id));
            applyThemeAndFrames(data.user, state.isSelf);
            renderNote(data.user);
            renderMoment(data.activeMoment, state.isSelf);
            renderStudyTags(data.studyTags || [], state.isSelf);
            renderShowcase(data.showcase || [], state.isSelf);
            renderStudySets(data.studySets || [], state.isSelf);
            renderAchievements(data.achievements || [], data.privacyLocked?.achievements, state.isSelf);
            renderInterests(data.interests || [], state.isSelf);
            renderAlbum(data.photos || [], data.privacyLocked?.album, state.isSelf);
            await loadPrivilegedWorkspace();
        } catch {
            // Silent when not logged in on profile.html
        }
    }

    window.addEventListener("dieu-profile-loaded", event => {
        const detail = event.detail || {};
        if (detail.isClub) {
            const clubId = detail.clubId || new URLSearchParams(window.location.search).get("clubId");
            if (clubId) initClubFanpageJoinButton(clubId);
            return;
        }
        state.viewerUser = detail.viewerUser || null;
        state.targetUserId = detail.targetUserId || "me";
        loadFullProfile();
    });

    window.addEventListener("dieu-profile-ready", () => {
        loadFullProfile();
    });

    document.addEventListener("DOMContentLoaded", () => {
        const clubId = new URLSearchParams(window.location.search).get("clubId");
        if (clubId) initClubFanpageJoinButton(clubId);
    });

    window.DIEUNW_PROFILE = {
        loadFullProfile,
        openStudySetPlayer,
        openStoryViewer
    };
})();