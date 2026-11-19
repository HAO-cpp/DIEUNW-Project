(() => {
    const API_BASE = "https://" + "dieunw" + ".onrender.com";
    const FALLBACK_AVATAR = "./DIEU.avif";
    const MUSIC_STATE_KEY = "dieunw_global_music_state";

    const originalFetch = window.fetch.bind(window);
    window.fetch = function (url, options = {}) {
        const urlStr = typeof url === "string" ? url : (url && typeof url.url === "string" ? url.url : "");
        if (urlStr.includes("dieunw" + ".onrender.com")) {
            const token = localStorage.getItem("session_token");
            if (token) {
                const headers = new Headers(options.headers || {});
                if (!headers.has("Authorization")) {
                    headers.set("Authorization", `Bearer ${token}`);
                }
                options = { ...options, headers };
            }
        }
        return originalFetch(url, options);
    };

    const GROUP_LAYOUT = [
        {
            label: "Khám phá & Giải trí",
            items: [
                { href: "index.html", text: "Trang chủ", span: "nav-span-2" },
                { href: "videos.html", text: "Video", span: "nav-span-2" },
                { href: "music.html", text: "Kho nhạc", span: "nav-span-2" }
            ]
        },
        {
            label: "Góc học tập",
            items: [
                { href: "tu-hoc.html", text: "Phòng tự học", span: "nav-span-3" },
                { href: "hoc-nhom.html", text: "Học nhóm", span: "nav-span-3" }
            ]
        },
        {
            label: "Kết nối bạn bè",
            items: [
                { href: "friends.html", text: "Bạn bè", span: "nav-span-3" },
                { href: "messages.html", text: "Tin nhắn", span: "nav-span-3" },
                { href: "tro-chuyen.html", text: "Phòng trò chuyện", span: "nav-span-6" }
            ]
        },
        {
            label: "Câu lạc bộ & Tin tức",
            items: [
                { href: "clubs.html", text: "CLB", span: "nav-span-3" },
                { href: "announcements.html", text: "Thông báo", span: "nav-span-3" }
            ]
        }
    ];

    function getSavedUser() {
        try {
            return JSON.parse(localStorage.getItem("dieuNwUser") || "null");
        } catch {
            return null;
        }
    }

    function resolveMedia(url) {
        const raw = String(url || "").trim();
        if (!raw) return "";
        if (raw.startsWith("/uploads/")) return `${API_BASE}${raw}`;
        return raw;
    }
    window.dieunwResolveMedia = resolveMedia;

    // =========================================================
    // 1. TOAST & HỘP THOẠI XÁC NHẬN THAY THẾ ALERT / CONFIRM
    // =========================================================
    function ensureToastHost() {
        let host = document.getElementById("dieunw-toast-host");
        if (!host && document.body) {
            host = document.createElement("div");
            host.id = "dieunw-toast-host";
            host.className = "dieunw-toast-host";
            host.style.cssText = "position:fixed;top:16px;right:16px;z-index:12000;display:grid;gap:8px;max-width:min(360px,calc(100vw - 32px));pointer-events:none;";
            document.body.appendChild(host);
        }
        return host;
    }

    function dieunwToast(message, type = "info", duration = 3400) {
        const msg = String(message || "").trim();
        if (!msg) return;
        const host = ensureToastHost();
        if (!host) return;

        const colors = {
            success: { bg: "#ecfdf5", border: "#34d399", text: "#065f46" },
            error: { bg: "#fef2f2", border: "#f87171", text: "#991b1b" },
            warning: { bg: "#fffbeb", border: "#fbbf24", text: "#92400e" },
            info: { bg: "#eff6ff", border: "#60a5fa", text: "#1e40af" }
        };
        const palette = colors[type] || colors.info;

        const toast = document.createElement("div");
        toast.className = `dieunw-toast dieunw-toast-${type}`;
        toast.style.cssText = `pointer-events:auto;padding:11px 14px;border-radius:11px;background:${palette.bg};border:1px solid ${palette.border};color:${palette.text};font-size:13.5px;font-weight:700;box-shadow:0 10px 26px rgba(15,23,42,0.16);display:flex;align-items:center;justify-content:space-between;gap:10px;animation:fadeIn 0.18s ease;`;
        const textSpan = document.createElement("span");
        textSpan.textContent = msg;
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.textContent = "×";
        closeBtn.style.cssText = "border:0;background:none;color:inherit;font-size:16px;font-weight:800;cursor:pointer;padding:0 4px;";
        closeBtn.onclick = () => toast.remove();

        toast.append(textSpan, closeBtn);
        host.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, duration);
    }
    window.dieunwToast = dieunwToast;
    window.alert = (msg) => dieunwToast(msg, "info");

    function dieunwConfirm(message) {
        return new Promise((resolve) => {
            if (!document.body) return resolve(false);
            const overlay = document.createElement("div");
            overlay.className = "dieunw-confirm-overlay";
            overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.52);display:flex;align-items:center;justify-content:center;padding:16px;z-index:12500;";

            const box = document.createElement("div");
            box.className = "dieunw-confirm-box";
            box.style.cssText = "width:min(400px,100%);background:#ffffff;color:#173853;border-radius:14px;padding:20px;box-shadow:0 20px 48px rgba(0,0,0,0.26);display:grid;gap:14px;";

            const p = document.createElement("p");
            p.style.cssText = "margin:0;font-size:14.5px;line-height:1.5;font-weight:600;";
            p.textContent = String(message || "Bạn có chắc muốn thực hiện thao tác này?");

            const actions = document.createElement("div");
            actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";

            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.textContent = "Hủy";
            cancelBtn.style.cssText = "padding:8px 16px;border-radius:9px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;font-weight:700;cursor:pointer;";

            const okBtn = document.createElement("button");
            okBtn.type = "button";
            okBtn.textContent = "Xác nhận";
            okBtn.style.cssText = "padding:8px 16px;border-radius:9px;border:0;background:#1769aa;color:#ffffff;font-weight:700;cursor:pointer;";

            const finish = (val) => {
                overlay.remove();
                resolve(val);
            };
            cancelBtn.onclick = () => finish(false);
            okBtn.onclick = () => finish(true);
            overlay.onclick = (e) => {
                if (e.target === overlay) finish(false);
            };

            actions.append(cancelBtn, okBtn);
            box.append(p, actions);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            okBtn.focus();
        });
    }
    window.dieunwConfirm = dieunwConfirm;
        // =========================================================
    // 2. NÉN ẢNH WEBP, XHR PROGRESS %, MUSIC WIDGET
    // =========================================================
    async function dieunwCompressImage(file, maxWidthOrOpts = 1440, quality = 0.82) {
        let maxDim = 1440;
        let q = quality;
        if (typeof maxWidthOrOpts === "object" && maxWidthOrOpts !== null) {
            maxDim = Number(maxWidthOrOpts.maxWidth || maxWidthOrOpts.maxSize || 1440);
            q = Number(maxWidthOrOpts.quality || 0.82);
        } else if (typeof maxWidthOrOpts === "number") {
            maxDim = maxWidthOrOpts;
        }
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error("Định dạng ảnh không hợp lệ."));
                img.onload = () => {
                    let { width, height } = img;
                    if (width > maxDim || height > maxDim) {
                        const scale = Math.min(maxDim / width, maxDim / height);
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                    }
                    const canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL("image/webp", q));
                };
                img.src = String(reader.result || "");
            };
            reader.readAsDataURL(file);
        });
    }
    window.dieunwCompressImage = dieunwCompressImage;

    function dieunwUploadWithProgress(url, options = {}, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(options.method || "POST", url, true);
            xhr.withCredentials = true;

            const headers = { ...(options.headers || {}) };
            const token = localStorage.getItem("session_token");
            if (token && url.includes("dieunw" + ".onrender.com") && !headers.Authorization) {
                headers.Authorization = `Bearer ${token}`;
            }
            Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

            xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable && typeof onProgress === "function") {
                    onProgress(Math.round((ev.loaded / ev.total) * 100));
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
            xhr.send(options.body || null);
        });
    }
    window.dieunwUploadWithProgress = dieunwUploadWithProgress;

    function dieunwCreateProgressBar(container) {
        if (!container) return null;
        container.innerHTML = `
            <div class="dieunw-progress-wrap" hidden style="margin-top:8px;">
                <div class="dieunw-progress-meta" style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#173853;margin-bottom:4px;">
                    <span class="dieunw-progress-label">Đang tải lên...</span>
                    <span class="dieunw-progress-pct">0%</span>
                </div>
                <div class="dieunw-progress-track" style="height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden;">
                    <div class="dieunw-progress-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#1769aa,#2aa889);transition:width 0.16s ease;"></div>
                </div>
            </div>
        `;
        const wrap = container.querySelector(".dieunw-progress-wrap");
        const labelEl = container.querySelector(".dieunw-progress-label");
        const pctEl = container.querySelector(".dieunw-progress-pct");
        const fillEl = container.querySelector(".dieunw-progress-fill");

        const update = (pct = 0, label) => {
            const safe = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
            wrap.hidden = false;
            if (label !== undefined) labelEl.textContent = label;
            pctEl.textContent = `${safe}%`;
            fillEl.style.width = `${safe}%`;
        };
        const reset = () => {
            wrap.hidden = true;
            pctEl.textContent = "0%";
            fillEl.style.width = "0%";
        };
        return {
            start: (lbl) => update(5, lbl || "Đang tải lên..."),
            update,
            setProgress: update,
            finish: (lbl) => update(100, lbl || "Hoàn tất!"),
            error: (msg) => {
                wrap.hidden = false;
                labelEl.textContent = msg || "Có lỗi xảy ra";
            },
            reset,
            hide: reset
        };
    }
    window.dieunwCreateProgressBar = dieunwCreateProgressBar;

    let sharedMusicCatalogPromise = null;
    function fetchMusicCatalog() {
        if (!sharedMusicCatalogPromise) {
            sharedMusicCatalogPromise = originalFetch(`${API_BASE}/api/music`, { credentials: "include" })
                .then(r => r.ok ? r.json() : { tracks: [] })
                .then(d => Array.isArray(d.tracks) ? d.tracks : [])
                .catch(() => []);
        }
        return sharedMusicCatalogPromise;
    }

    function dieunwCreateMusicAttachmentWidget(container, options = {}) {
        if (!container) return null;
        const titleText = options.title || "Đính kèm nhạc (tùy chọn)";
        container.innerHTML = `
            <div class="dieunw-music-attach-box" style="padding:10px 12px;border:1px solid #d5e2ec;border-radius:10px;background:#f8fbfe;">
                <label style="display:block;font-size:12.5px;font-weight:700;color:#173853;margin-bottom:6px;">${titleText}</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <select class="music-attach-select" style="flex:1;min-width:170px;padding:7px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font:inherit;font-size:13px;">
                        <option value="">-- Chọn từ Kho nhạc DIEUNW --</option>
                    </select>
                    <label class="dieunw-file-btn" style="cursor:pointer;padding:7px 12px;border-radius:8px;background:#1769aa;color:#fff;font-size:12.5px;font-weight:700;">
                        + Tệp từ máy
                        <input type="file" class="music-attach-file" accept="audio/*" hidden>
                    </label>
                    <button type="button" class="btn-clear-upload music-attach-clear" hidden style="padding:6px 10px;border-radius:8px;border:1px solid #f1c6c2;background:#fff5f5;color:#b42318;font-size:12px;font-weight:700;cursor:pointer;">Bỏ nhạc</button>
                </div>
                <p class="music-attach-status" style="font-size:12px;color:#526a7f;margin:5px 0 0;"></p>
            </div>
        `;
        const selectEl = container.querySelector(".music-attach-select");
        const fileEl = container.querySelector(".music-attach-file");
        const clearBtn = container.querySelector(".music-attach-clear");
        const statusEl = container.querySelector(".music-attach-status");
        let tracks = [];
        let pickedFile = null;
        let presetTrack = null;

        fetchMusicCatalog().then(list => {
            tracks = list;
            list.forEach(tr => {
                const opt = document.createElement("option");
                opt.value = tr.id;
                opt.textContent = `${tr.title} — ${tr.artist || tr.authorName || "Thành viên"}`;
                selectEl.appendChild(opt);
            });
        });

        selectEl.addEventListener("change", () => {
            if (selectEl.value) {
                pickedFile = null;
                presetTrack = null;
                fileEl.value = "";
                clearBtn.hidden = false;
                statusEl.textContent = `Đã chọn: ${selectEl.options[selectEl.selectedIndex].textContent}`;
            } else if (!pickedFile) {
                clearBtn.hidden = true;
                statusEl.textContent = "";
            }
        });

        fileEl.addEventListener("change", () => {
            const f = fileEl.files ? fileEl.files.item(0) : null;
            if (!f) return;
            pickedFile = f;
            presetTrack = null;
            selectEl.value = "";
            clearBtn.hidden = false;
            statusEl.textContent = `Tệp nhạc từ máy: ${f.name}`;
        });

        const reset = () => {
            pickedFile = null;
            presetTrack = null;
            fileEl.value = "";
            selectEl.value = "";
            clearBtn.hidden = true;
            statusEl.textContent = "";
        };
        clearBtn.addEventListener("click", reset);

        return {
            getValue() {
                if (pickedFile) {
                    return { mode: "file", file: pickedFile, audioFile: pickedFile, title: pickedFile.name.replace(/\.[^.]+$/, "") };
                }
                if (presetTrack) return presetTrack;
                const found = tracks.find(t => String(t.id) === String(selectEl.value));
                if (found) {
                    return {
                        mode: "library",
                        musicId: found.id,
                        id: found.id,
                                                musicUrl: found.audioUrl || found.audio_url || "",
                        audioUrl: found.audioUrl || found.audio_url || "",
                        musicTitle: found.title || "",
                        title: found.title || "",
                        musicArtist: found.artist || found.authorName || "",
                        artist: found.artist || found.authorName || ""
                    };
                }
                return null;
            },
            setValue(val) {
                if (!val) return reset();
                presetTrack = val;
                clearBtn.hidden = false;
                statusEl.textContent = `Đang gắn: ${val.musicTitle || val.title || "Nhạc đính kèm"}`;
            },
            reset
        };
    }
    window.dieunwCreateMusicAttachmentWidget = dieunwCreateMusicAttachmentWidget;

    // =========================================================
    // 3. NỀN WEB CÁ NHÂN HÓA (SITE BACKGROUND CHO TẤT CẢ TRANG)
    // =========================================================
    function dieunwApplySiteBg(rawConfig) {
        if (!document.body) return;
        let cfg = rawConfig;
        if (typeof cfg === "string" && cfg.trim()) {
            try { cfg = JSON.parse(cfg); } catch { cfg = { mode: "image", image: cfg }; }
        }
        let layer = document.getElementById("dieunw-site-bg-layer");
        if (!cfg || cfg.mode === "default" || cfg.mode === "none" || cfg.type === "none") {
            if (layer) layer.remove();
            document.body.classList.remove("has-site-bg");
            return;
        }
        if (!layer) {
            layer = document.createElement("div");
            layer.id = "dieunw-site-bg-layer";
            layer.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center;background-repeat:no-repeat;transition:background 0.25s ease;";
            document.body.prepend(layer);
        }

        const mode = cfg.mode || cfg.type || (cfg.image || cfg.imageUrl ? "image" : cfg.color2 ? "gradient" : "color");
        const imgUrl = resolveMedia(cfg.image || cfg.imageUrl || (mode === "image" ? cfg.value : ""));

        if (mode === "image" && imgUrl) {
            const dim = Math.min(0.8, Math.max(0, Number(cfg.dim ?? cfg.overlay ?? 0.25)));
            layer.style.backgroundImage = `linear-gradient(rgba(15,23,42,${dim}), rgba(15,23,42,${dim})), url("${imgUrl}")`;
            layer.style.backgroundColor = "transparent";
        } else if (mode === "gradient" || mode === "preset") {
            const grad = cfg.gradient || cfg.value || `linear-gradient(135deg, ${cfg.color1 || "#dbeafe"}, ${cfg.color2 || "#e0f2fe"})`;
            layer.style.backgroundImage = grad;
            layer.style.backgroundColor = "transparent";
        } else if (cfg.color || cfg.color1 || cfg.value) {
            layer.style.backgroundImage = "none";
            layer.style.backgroundColor = cfg.color || cfg.color1 || cfg.value;
        }
        document.body.classList.add("has-site-bg");
    }
    window.dieunwApplySiteBg = dieunwApplySiteBg;

    // =========================================================
    // 4. ĐỒNG BỘ AVATAR & TRẠNG THÁI NAVBAR
    // =========================================================
    function updateNavAvatar(user = getSavedUser()) {
        const avatarUrl = typeof user?.avatar === "string" && user.avatar.trim()
            ? resolveMedia(user.avatar.trim())
            : FALLBACK_AVATAR;
        const label = user?.name ? `Trang cá nhân của ${user.name}` : "Trang cá nhân";

        document.querySelectorAll(".nav-avatar-link").forEach(link => {
            const image = link.querySelector(".nav-user-avatar");
            if (image) {
                link.setAttribute("aria-label", label);
                link.title = label;
                image.src = avatarUrl;
                image.onerror = () => {
                    image.onerror = null;
                    image.src = FALLBACK_AVATAR;
                };
            }
            const dot = link.querySelector(".nav-status-dot");
            if (dot && user) {
                dot.dataset.status = user.presenceStatus || (user.ghostMode ? "offline" : "online");
            }
        });
    }
    window.updateNavAvatar = updateNavAvatar;

    // =========================================================
    // 5. TRÌNH PHÁT NHẠC ĐĨA QUAY TOÀN WEB + CHẠY XUYÊN TRANG
    // =========================================================
    let globalAudioEl = null;
    let globalPlaylist = [];
    let globalIndex = -1;
    let globalLoop = true;
    let musicBtnRef = null;
    let musicPopoverRef = null;
    let lastSaveTick = 0;
    let isPageUnloading = false;

    function openMusicDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open("DieunwLocalMusicDB", 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("files")) {
                    db.createObjectStore("files", { keyPath: "id" });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveLocalTrackToDB(id, fileBlob) {
        try {
            const db = await openMusicDB();
            const tx = db.transaction("files", "readwrite");
            tx.objectStore("files").put({ id, blob: fileBlob });
        } catch {}
    }

    async function getLocalTrackFromDB(id) {
        try {
            const db = await openMusicDB();
            return await new Promise((resolve) => {
                const tx = db.transaction("files", "readonly");
                const req = tx.objectStore("files").get(id);
                req.onsuccess = () => resolve(req.result?.blob || null);
                req.onerror = () => resolve(null);
            });
        } catch {
            return null;
        }
    }

    function ensureGlobalAudio() {
        if (!globalAudioEl) {
            globalAudioEl = document.getElementById("dieunw-global-audio");
            if (!globalAudioEl) {
                globalAudioEl = document.createElement("audio");
                globalAudioEl.id = "dieunw-global-audio";
                globalAudioEl.preload = "auto";
                document.body.appendChild(globalAudioEl);
            }
            const savedVol = parseFloat(localStorage.getItem("dieunw_global_music_vol"));
            globalAudioEl.volume = !Number.isNaN(savedVol) ? Math.min(1, Math.max(0, savedVol)) : 0.6;
        }
        return globalAudioEl;
    }

    function saveGlobalMusicState(force = false) {
        if (!globalAudioEl || isPageUnloading) return;
        const now = Date.now();
        if (!force && now - lastSaveTick < 350) return;
        lastSaveTick = now;

        if (!globalPlaylist.length) return;

        const cleanList = globalPlaylist.map(item => ({
            id: item.id,
            title: item.title,
            artist: item.artist || "",
            isLocal: Boolean(item.isLocal),
            audioUrl: item.isLocal ? "" : String(item.audioUrl || item.audio_url || item.url || "")
        }));

        const safeIdx = globalIndex >= 0 && globalIndex < cleanList.length ? globalIndex : 0;
        const state = {
            playlist: cleanList,
            index: safeIdx,
            currentTime: Number.isFinite(globalAudioEl.currentTime) ? globalAudioEl.currentTime : 0,
            isPlaying: Boolean(!globalAudioEl.paused && globalAudioEl.src),
            playbackRate: globalAudioEl.playbackRate || 1,
            loop: globalLoop,
            updatedAt: now
        };
        try {
            localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify(state));
        } catch {}
    }

    function readGlobalMusicState() {
        try {
            const raw = localStorage.getItem(MUSIC_STATE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.playlist) || !parsed.playlist.length) return null;
            return parsed;
        } catch {
            return null;
        }
    }
        function positionMusicPopover() {
        if (!musicBtnRef || !musicPopoverRef) return;
        const isHidden = musicPopoverRef.hidden || getComputedStyle(musicPopoverRef).display === "none";
        if (isHidden) return;

        const margin = 12;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const popW = Math.min(350, vw - margin * 2);
        const rect = musicBtnRef.getBoundingClientRect();

        let top = Math.round(rect.bottom + 10);
        if (top < margin || top > vh - 180) top = 68;

        let left;
        if (vw <= 600) {
            left = Math.round((vw - popW) / 2);
        } else {
            left = Math.round(rect.left);
            if (left + popW > vw - margin) left = vw - popW - margin;
            if (left < margin) left = margin;
        }

        musicPopoverRef.style.setProperty("position", "fixed", "important");
        musicPopoverRef.style.setProperty("top", `${top}px`, "important");
        musicPopoverRef.style.setProperty("left", `${left}px`, "important");
        musicPopoverRef.style.setProperty("right", "auto", "important");
        musicPopoverRef.style.setProperty("bottom", "auto", "important");
        musicPopoverRef.style.setProperty("width", `${popW}px`, "important");
        musicPopoverRef.style.setProperty("max-height", `${Math.max(220, vh - top - margin)}px`, "important");
        musicPopoverRef.style.setProperty("z-index", "9999", "important");
    }

    function setupGlobalMusicDock(dock) {
        if (!dock || document.getElementById("nav-music-btn")) {
            musicBtnRef = document.getElementById("nav-music-btn");
            musicPopoverRef = document.getElementById("nav-music-popover");
            return;
        }

        const audio = ensureGlobalAudio();

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "nav-music-btn";
        btn.className = "nav-music-btn";
        btn.title = "Trình phát nhạc nhanh";
        btn.setAttribute("aria-label", "Mở trình phát nhạc");
        btn.style.cssText = "position:relative;width:40px;height:40px;flex:0 0 40px;border-radius:50%;border:2px solid rgba(255,255,255,0.92);background:radial-gradient(circle at center,#2c3240 0%,#0f141d 60%,#1e293b 100%);display:grid;place-items:center;cursor:pointer;padding:0;box-shadow:0 3px 10px rgba(0,0,0,0.22);";
        btn.innerHTML = `
            <span class="nav-music-disc-center" style="width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,#38bdf8,#1769aa);border:2px solid #fff;display:block;"></span>
            <span style="position:absolute;top:-3px;right:-3px;width:16px;height:16px;border-radius:50%;background:#0ea5e9;color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center;border:1.5px solid #fff;">♪</span>
        `;

        const avatarLink = dock.querySelector(".nav-avatar-link");
        if (avatarLink) dock.insertBefore(btn, avatarLink);
        else dock.appendChild(btn);

        const popover = document.createElement("section");
        popover.id = "nav-music-popover";
        popover.className = "nav-music-popover";
        popover.hidden = true;
        popover.setAttribute("aria-label", "Trình phát nhạc DIEUNW");
        popover.style.cssText = "border-radius:14px;padding:14px;display:grid;gap:10px;";
        popover.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(148,163,184,0.28);padding-bottom:8px;">
                <strong style="font-size:14px;">♪ Trình phát nhạc</strong>
                <div style="display:flex;align-items:center;gap:10px;">
                    <a href="./music.html" style="font-size:12px;font-weight:700;color:#1769aa;text-decoration:none;">Mở Kho nhạc →</a>
                    <button type="button" id="nav-music-close" style="border:0;background:none;font-size:18px;font-weight:700;cursor:pointer;color:inherit;line-height:1;">&times;</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button type="button" id="nav-music-load-lib" style="padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#eff6ff;color:#124d7b;font-size:12px;font-weight:700;cursor:pointer;">Kho nhạc online</button>
                <label class="dieunw-file-btn" style="padding:6px 10px;border-radius:8px;background:#1769aa;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">
                    + Tệp từ máy
                    <input type="file" id="nav-music-file-input" accept="audio/*" multiple hidden>
                </label>
            </div>
            <p id="nav-music-now-title" style="margin:0;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Chọn Kho nhạc hoặc Tệp từ máy để phát</p>
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
                <button type="button" id="nav-music-prev" class="audio-ctrl-btn" style="min-width:34px;height:34px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;color:#173853;cursor:pointer;">⏮</button>
                <button type="button" id="nav-music-toggle" class="audio-ctrl-btn primary" style="min-width:42px;height:36px;border-radius:10px;border:0;background:#1769aa;color:#fff;font-weight:800;cursor:pointer;">▶</button>
                <button type="button" id="nav-music-next" class="audio-ctrl-btn" style="min-width:34px;height:34px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;color:#173853;cursor:pointer;">⏭</button>
                <button type="button" id="nav-music-loop" class="audio-ctrl-btn active" title="Lặp lại" style="min-width:34px;height:34px;border-radius:9px;border:1px solid #0284c7;background:#e0f2fe;color:#0369a1;cursor:pointer;">⇄</button>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <div style="display:flex;gap:4px;" id="nav-music-speeds">
                    <button type="button" class="nav-spd-btn" data-speed="0.5" style="padding:3px 7px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#173853;font-size:11.5px;font-weight:700;cursor:pointer;">0.5x</button>
                    <button type="button" class="nav-spd-btn active" data-speed="1" style="padding:3px 7px;border-radius:6px;border:1px solid #1769aa;background:#1769aa;color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;">1x</button>
                    <button type="button" class="nav-spd-btn" data-speed="1.5" style="padding:3px 7px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#173853;font-size:11.5px;font-weight:700;cursor:pointer;">1.5x</button>
                    <button type="button" class="nav-spd-btn" data-speed="2" style="padding:3px 7px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#173853;font-size:11.5px;font-weight:700;cursor:pointer;">2x</button>
                </div>
                <input type="range" id="nav-music-volume" class="dieunw-slider" min="0" max="1" step="0.05" value="${audio.volume}" style="width:95px;" aria-label="Âm lượng">
            </div>
            <ul id="nav-music-list" style="list-style:none;margin:0;padding:8px 0 0;border-top:1px dashed rgba(148,163,184,0.45);display:grid;gap:5px;max-height:165px;overflow-y:auto;"></ul>
        `;
        document.body.appendChild(popover);

        musicBtnRef = btn;
        musicPopoverRef = popover;

        const nowTitleEl = popover.querySelector("#nav-music-now-title");
        const toggleBtn = popover.querySelector("#nav-music-toggle");
        const loopBtn = popover.querySelector("#nav-music-loop");
        const listEl = popover.querySelector("#nav-music-list");
        const volSlider = popover.querySelector("#nav-music-volume");
        const fileInput = popover.querySelector("#nav-music-file-input");

        function applySpeedButtonUI(rate) {
            popover.querySelectorAll(".nav-spd-btn").forEach(b => {
                const isMatch = parseFloat(b.dataset.speed || "1") === Number(rate);
                b.style.background = isMatch ? "#1769aa" : "#fff";
                b.style.color = isMatch ? "#fff" : "#173853";
                b.style.borderColor = isMatch ? "#1769aa" : "#cbd5e1";
            });
        }

        function syncPlayState() {
            const playing = Boolean(audio && !audio.paused && audio.src);
            toggleBtn.textContent = playing ? "⏸" : "▶";
            btn.classList.toggle("is-playing", playing);
            btn.style.animation = playing ? "dieunwSpinSlow 4s linear infinite" : "";
        }

        function renderList() {
            listEl.innerHTML = "";
            if (!globalPlaylist.length) {
                const li = document.createElement("li");
                li.style.cssText = "font-size:12px;opacity:0.75;text-align:center;padding:4px 0;";
                li.textContent = "Chưa có bài nào trong hàng đợi";
                listEl.appendChild(li);
                return;
            }
            globalPlaylist.forEach((tr, idx) => {
                const li = document.createElement("li");
                const isAct = idx === globalIndex;
                li.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 8px;border-radius:8px;background:${isAct ? "rgba(23,105,170,0.16)" : "rgba(148,163,184,0.12)"};`;
                const pick = document.createElement("button");
                pick.type = "button";
                pick.style.cssText = "flex:1;border:0;background:none;text-align:left;font:inherit;font-size:12.5px;font-weight:700;color:inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
                pick.textContent = `${idx + 1}. ${tr.title}${tr.artist ? ` - ${tr.artist}` : ""}`;
                                pick.onclick = () => playAtIndex(idx);
                li.appendChild(pick);
                listEl.appendChild(li);
            });
        }

        function attemptAutoResumePlay(targetTime) {
            const resumePlayback = () => {
                if (typeof targetTime === "number" && targetTime > 0 && Number.isFinite(audio.duration)) {
                    audio.currentTime = Math.min(targetTime, Math.max(0, audio.duration - 0.5));
                }
                audio.play().then(() => {
                    syncPlayState();
                    saveGlobalMusicState(true);
                }).catch(() => {
                    const unlock = () => {
                        audio.play().then(() => {
                            syncPlayState();
                            saveGlobalMusicState(true);
                        }).catch(() => {});
                    };
                    ["pointerdown", "keydown", "touchstart"].forEach(evt => {
                        document.addEventListener(evt, unlock, { once: true });
                    });
                });
            };

            if (audio.readyState >= 1) {
                resumePlayback();
            } else {
                audio.addEventListener("loadedmetadata", resumePlayback, { once: true });
            }
        }

        async function playAtIndex(idx, options = {}) {
            if (!globalPlaylist.length) return;
            globalIndex = ((idx % globalPlaylist.length) + globalPlaylist.length) % globalPlaylist.length;
            const tr = globalPlaylist.at(globalIndex);
            if (!tr) return;

            let src = resolveMedia(tr.audioUrl || tr.audio_url || tr.url);
            if (tr.isLocal && (!src || src.startsWith("blob:"))) {
                const blob = await getLocalTrackFromDB(tr.id);
                if (blob) {
                    src = URL.createObjectURL(blob);
                    tr.audioUrl = src;
                }
            }
            if (!src) return;

            audio.src = src;
            if (options.playbackRate) {
                audio.playbackRate = options.playbackRate;
                applySpeedButtonUI(options.playbackRate);
            }

            nowTitleEl.textContent = `♪ ${tr.title || "Bài hát"}${tr.artist ? ` — ${tr.artist}` : ""}`;
            renderList();

            if (options.autoPlay === false) {
                if (typeof options.startTime === "number" && options.startTime > 0) {
                    const setPos = () => {
                        if (Number.isFinite(audio.duration)) {
                            audio.currentTime = Math.min(options.startTime, Math.max(0, audio.duration - 0.5));
                        }
                    };
                    if (audio.readyState >= 1) setPos();
                    else audio.addEventListener("loadedmetadata", setPos, { once: true });
                }
                syncPlayState();
                saveGlobalMusicState(true);
                return;
            }

            if (typeof options.startTime === "number" && options.startTime > 0) {
                attemptAutoResumePlay(options.startTime);
            } else {
                audio.play().catch(() => {});
                syncPlayState();
                saveGlobalMusicState(true);
            }
        }

        window.dieunwPlayGlobalTrack = (track, list) => {
            if (Array.isArray(list) && list.length) {
                globalPlaylist = list.slice();
                const foundIdx = globalPlaylist.findIndex(t => String(t.id) === String(track?.id));
                playAtIndex(foundIdx >= 0 ? foundIdx : 0);
            } else if (track) {
                const existingIdx = globalPlaylist.findIndex(t => String(t.id) === String(track.id));
                if (existingIdx >= 0) {
                    playAtIndex(existingIdx);
                } else {
                    globalPlaylist.unshift(track);
                    playAtIndex(0);
                }
            }
        };

        window.dieunwPauseGlobalMusic = () => {
            if (globalAudioEl && !globalAudioEl.paused) {
                globalAudioEl.pause();
                syncPlayState();
                saveGlobalMusicState(true);
            }
        };

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            popover.hidden = !popover.hidden;
            if (!popover.hidden) {
                positionMusicPopover();
                if (!globalPlaylist.length) {
                    fetchMusicCatalog().then(list => {
                        if (!globalPlaylist.length && list.length) {
                            globalPlaylist = list;
                            renderList();
                        }
                    });
                }
            }
        });

        popover.addEventListener("click", (e) => e.stopPropagation());
        popover.querySelector("#nav-music-close").addEventListener("click", () => {
            popover.hidden = true;
        });
        document.addEventListener("click", (e) => {
            if (!popover.hidden && !popover.contains(e.target) && !btn.contains(e.target)) {
                popover.hidden = true;
            }
        });

        popover.querySelector("#nav-music-load-lib").addEventListener("click", async () => {
            const list = await fetchMusicCatalog();
            if (!list.length) {
                dieunwToast("Kho nhạc online hiện chưa có bài hát nào.", "info");
                return;
            }
            globalPlaylist = list.slice();
            playAtIndex(0);
        });

        fileInput.addEventListener("change", async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            const start = globalPlaylist.length;
            for (const f of files) {
                const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                await saveLocalTrackToDB(localId, f);
                globalPlaylist.push({
                    id: localId,
                    title: f.name.replace(/\.[^.]+$/, ""),
                    artist: "Từ máy",
                    isLocal: true,
                    audioUrl: URL.createObjectURL(f)
                });
            }
            e.target.value = "";
            playAtIndex(start);
        });

        toggleBtn.addEventListener("click", () => {
            if (!globalPlaylist.length) {
                popover.querySelector("#nav-music-load-lib").click();
                return;
            }
            if (globalIndex === -1) return playAtIndex(0);
            if (audio.paused) audio.play().catch(() => {});
            else audio.pause();
            syncPlayState();
            saveGlobalMusicState(true);
        });

        popover.querySelector("#nav-music-prev").addEventListener("click", () => {
            if (globalPlaylist.length) playAtIndex(globalIndex - 1);
        });
        popover.querySelector("#nav-music-next").addEventListener("click", () => {
            if (globalPlaylist.length) playAtIndex(globalIndex + 1);
        });
        loopBtn.addEventListener("click", () => {
            globalLoop = !globalLoop;
            loopBtn.style.opacity = globalLoop ? "1" : "0.48";
            saveGlobalMusicState(true);
        });

        popover.querySelectorAll(".nav-spd-btn").forEach(spBtn => {
            spBtn.addEventListener("click", () => {
                const rate = parseFloat(spBtn.dataset.speed || "1") || 1;
                audio.playbackRate = rate;
                applySpeedButtonUI(rate);
                saveGlobalMusicState(true);
            });
        });

        volSlider.addEventListener("input", (e) => {
            const v = parseFloat(e.target.value);
            audio.volume = v;
            localStorage.setItem("dieunw_global_music_vol", String(v));
        });

        audio.addEventListener("timeupdate", () => saveGlobalMusicState(false));
        audio.addEventListener("play", () => {
            syncPlayState();
            saveGlobalMusicState(true);
        });
        audio.addEventListener("pause", () => {
            if (isPageUnloading) return;
            syncPlayState();
            saveGlobalMusicState(true);
        });
        audio.addEventListener("ended", () => {
            if (!globalPlaylist.length) return;
            if (globalIndex < globalPlaylist.length - 1 || globalLoop) {
                playAtIndex(globalIndex + 1);
            } else {
                syncPlayState();
                saveGlobalMusicState(true);
            }
        });

        const handleUnload = () => {
            saveGlobalMusicState(true);
            isPageUnloading = true;
        };
        window.addEventListener("beforeunload", handleUnload);
        window.addEventListener("pagehide", handleUnload);
        window.addEventListener("resize", positionMusicPopover);
        window.addEventListener("scroll", positionMusicPopover, { passive: true });

        const restored = readGlobalMusicState();
        if (restored) {
            globalPlaylist = restored.playlist;
            globalLoop = restored.loop !== false;
            loopBtn.style.opacity = globalLoop ? "1" : "0.48";
            const safeIdx = Math.min(Math.max(0, Number(restored.index) || 0), globalPlaylist.length - 1);
            playAtIndex(safeIdx, {
                autoPlay: Boolean(restored.isPlaying),
                startTime: Number(restored.currentTime) || 0,
                playbackRate: Number(restored.playbackRate) || 1
            });
        } else {
            renderList();
            syncPlayState();
        }
    }
        // =========================================================
    // 6. CHUẨN HÓA NAVBAR DOCK + MENU 6 CỘT KHÔNG BỊ LÕM
    // =========================================================
    function detectCurrentPageFile() {
        const path = (window.location.pathname || "").split("/").pop() || "index.html";
        return path.toLowerCase() || "index.html";
    }

    function syncMenuGridMode(menu) {
        if (!menu) return;
        const isDropdown = menu.classList.contains("nav-dropdown-panel") || getComputedStyle(menu).display === "grid";
        if (menu.hidden) {
            menu.classList.remove("dieunw-grouped-grid");
        } else {
            menu.classList.toggle("dieunw-grouped-grid", Boolean(isDropdown));
        }
    }

    function buildGroupedMenuContent(menu, existingLinks) {
        if (!menu || menu.dataset.gridBeautified === "1") return;
        menu.dataset.gridBeautified = "1";

        const currentFile = detectCurrentPageFile();
        const links = existingLinks || Array.from(menu.querySelectorAll("a.nav-item"));
        const findLink = (targetFile) => links.find(a => (a.getAttribute("href") || "").toLowerCase().endsWith(targetFile));

        const fragment = document.createDocumentFragment();
        const placed = new Set();

        GROUP_LAYOUT.forEach((group, groupIdx) => {
            const matchedInGroup = [];
            group.items.forEach(spec => {
                let link = findLink(spec.href);
                if (!link) {
                    link = document.createElement("a");
                    link.href = `./${spec.href}`;
                    link.className = "nav-item";
                    link.textContent = spec.text;
                }
                if (currentFile === spec.href) {
                    link.classList.add("active");
                    link.setAttribute("aria-current", "page");
                } else {
                    link.classList.remove("active");
                    link.removeAttribute("aria-current");
                }
                link.classList.remove("nav-span-2", "nav-span-3", "nav-span-6");
                link.classList.add(spec.span);
                matchedInGroup.push(link);
                placed.add(link);
            });

            if (groupIdx > 0) {
                const sep = document.createElement("span");
                sep.className = "nav-group-divider";
                sep.setAttribute("aria-hidden", "true");
                fragment.appendChild(sep);
            }

            const labelEl = document.createElement("div");
            labelEl.className = "nav-group-label";
            labelEl.textContent = group.label;
            fragment.appendChild(labelEl);

            matchedInGroup.forEach(link => fragment.appendChild(link));
        });

        links.forEach(link => {
            if (!placed.has(link)) {
                link.classList.add("nav-span-3");
                fragment.appendChild(link);
            }
        });

        menu.innerHTML = "";
        menu.appendChild(fragment);
        syncMenuGridMode(menu);
    }

    function initNavbarAndTheme() {
        const header = document.querySelector("header.navbar");
        if (!header) return;

        let dock = header.querySelector(".nav-corner-dock");
        let menu = header.querySelector("#main-nav-menu, .nav-menu");
        const existingLinks = menu ? Array.from(menu.querySelectorAll("a.nav-item")) : [];

        if (!dock) {
            const currentFile = detectCurrentPageFile();
            const isProfilePage = currentFile === "profile.html";

            header.className = "navbar nav-scroll";
            header.innerHTML = "";

            dock = document.createElement("div");
            dock.className = "nav-corner-dock";

            const brandBtn = document.createElement("button");
            brandBtn.type = "button";
            brandBtn.className = "nav-brand-toggle";
            brandBtn.setAttribute("aria-expanded", "false");
            brandBtn.setAttribute("aria-controls", "main-nav-menu");
            brandBtn.setAttribute("aria-label", "Mở menu điều hướng DIEUNW");
            brandBtn.innerHTML = `
                <picture>
                    <source srcset="./DIEU.avif" type="image/avif">
                    <source srcset="./DIEU.webp" type="image/webp">
                    <img src="./DIEU.avif" alt="DIEUNW" class="nav-brand-icon">
                </picture>
                <span class="nav-brand-caret">▾</span>
            `;

            const avatarLink = document.createElement("a");
            avatarLink.href = "./profile.html";
            avatarLink.className = `nav-avatar-link${isProfilePage ? " active" : ""}`;
            avatarLink.setAttribute("aria-label", "Trang cá nhân");
            avatarLink.title = "Trang cá nhân";
            if (isProfilePage) avatarLink.setAttribute("aria-current", "page");
            avatarLink.innerHTML = `
                <img class="nav-user-avatar" src="./DIEU.avif" alt="Trang cá nhân">
                <span class="nav-status-dot" data-status="offline" aria-hidden="true"></span>
            `;

            const themeBtn = document.createElement("button");
            themeBtn.type = "button";
            themeBtn.className = "nav-theme-toggle";
            themeBtn.id = "nav-theme-toggle";
            themeBtn.setAttribute("aria-label", "Bật/tắt chế độ tối");
            themeBtn.title = "Chế độ Sáng / Tối";
            themeBtn.textContent = "🌙";

            dock.append(brandBtn, avatarLink, themeBtn);

            menu = document.createElement("nav");
            menu.id = "main-nav-menu";
            menu.className = "nav-menu nav-dropdown-panel";
            menu.setAttribute("aria-label", "Điều hướng chính");
            menu.hidden = true;

            header.append(dock, menu);
        } else if (menu) {
            menu.classList.add("nav-dropdown-panel");
            menu.hidden = true;
        }

        buildGroupedMenuContent(menu, existingLinks);
        setupGlobalMusicDock(dock);

        const brandBtn = dock.querySelector(".nav-brand-toggle");
        if (brandBtn && menu && brandBtn.dataset.navBound !== "1") {
            brandBtn.dataset.navBound = "1";
            brandBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const willOpen = menu.hidden;
                menu.hidden = !willOpen;
                brandBtn.setAttribute("aria-expanded", String(willOpen));
                syncMenuGridMode(menu);
            });
            document.addEventListener("click", (e) => {
                if (!menu.hidden && !menu.contains(e.target) && !brandBtn.contains(e.target)) {
                    menu.hidden = true;
                    brandBtn.setAttribute("aria-expanded", "false");
                    syncMenuGridMode(menu);
                }
            });
        }

        const themeBtn = dock.querySelector("#nav-theme-toggle, .nav-theme-toggle");
        if (themeBtn && themeBtn.dataset.themeBound !== "1") {
            themeBtn.dataset.themeBound = "1";
            const savedDark = localStorage.getItem("dieunw_dark_mode") === "1";
            if (savedDark) {
                document.body.classList.add("dark-mode");
                themeBtn.textContent = "☀️";
            }
            themeBtn.addEventListener("click", () => {
                const isDark = document.body.classList.toggle("dark-mode");
                localStorage.setItem("dieunw_dark_mode", isDark ? "1" : "0");
                themeBtn.textContent = isDark ? "☀️" : "🌙";
            });
        }

        window.addEventListener("resize", () => syncMenuGridMode(menu));
    }

    // =========================================================
    // 7. KHỞI CHẠY MỘT LẦN KHI MỞ TRANG
    // =========================================================
    function boot() {
        initNavbarAndTheme();

        const savedUser = getSavedUser();
        updateNavAvatar(savedUser);
        if (savedUser?.siteBg || savedUser?.site_bg) {
            dieunwApplySiteBg(savedUser.siteBg || savedUser.site_bg);
        }

        originalFetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (data?.user) {
                    localStorage.setItem("dieuNwUser", JSON.stringify(data.user));
                    updateNavAvatar(data.user);
                    dieunwApplySiteBg(data.user.siteBg || data.user.site_bg || null);
                }
            })
            .catch(() => {});
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    window.addEventListener("storage", (event) => {
        if (event.key === "dieuNwUser") {
            const u = getSavedUser();
            updateNavAvatar(u);
            dieunwApplySiteBg(u?.siteBg || u?.site_bg || null);
        }
    });
})();