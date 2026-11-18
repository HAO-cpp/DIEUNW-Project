document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const VIDEOS_API = `${API_BASE}/api/videos`;
	const MUSIC_API = `${API_BASE}/api/music`;

	const feedSnap = document.getElementById("videos-feed-snap");
	const btnOpenUpload = document.getElementById("btn-open-video-upload");
	const uploadModal = document.getElementById("video-upload-modal");
	const btnCloseUpload = document.getElementById("btn-close-video-upload");
	const uploadForm = document.getElementById("video-upload-form");
	const videoFileInput = document.getElementById("video-file-input");
	const videoFileNameEl = document.getElementById("video-file-name");
	const videoCoverInput = document.getElementById("video-cover-input");
	const videoCoverNameEl = document.getElementById("video-cover-name");
	const videoMusicMount = document.getElementById("video-music-picker");
	const videoProgressMount = document.getElementById("video-upload-progress");

	const btnPrevVideo = document.getElementById("btn-video-prev");
	const btnNextVideo = document.getElementById("btn-video-next");

	const commentsDrawer = document.getElementById("video-comments-drawer");
	const btnCloseComments = document.getElementById("btn-close-video-comments");
	const commentsListEl = document.getElementById("video-comments-list");
	const commentForm = document.getElementById("video-comment-form");
	const commentInput = document.getElementById("video-comment-input");

	let currentUser = null;
	let videos = [];
	let compressedCoverDataUrl = "";
	let musicWidget = null;
	let progressBar = null;
	let isMutedGlobal = false;
	let activeSlideObserver = null;
	let currentCommentsVideo = null;
	const viewedVideoIds = new Set();

	function notify(message, type = "info") {
		if (typeof window.dieunwToast === "function") {
			window.dieunwToast(message, type);
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

	function uploadWithProgress(url, { method = "POST", body, headers = {} }, onPercent) {
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
				if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
				else reject(new Error(parsed.error || `Lỗi máy chủ (${xhr.status})`));
			};
			xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải lên."));
			xhr.send(body);
		});
	}

	async function compressCover(file) {
		if (typeof window.dieunwCompressImage === "function") {
			const res = await window.dieunwCompressImage(file, 720, 0.8);
			if (typeof res === "string") return res;
			if (res instanceof Blob) {
				return await new Promise((resolve) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result || ""));
					reader.readAsDataURL(res);
				});
			}
		}
		return await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("Không đọc được ảnh bìa."));
			reader.onload = () => {
				const img = new Image();
				img.onerror = () => reject(new Error("Ảnh bìa không hợp lệ."));
				img.onload = () => {
					const maxDim = 720;
					let { width, height } = img;
					if (width > maxDim || height > maxDim) {
						const ratio = Math.min(maxDim / width, maxDim / height);
						width = Math.round(width * ratio);
						height = Math.round(height * ratio);
					}
					const canvas = document.createElement("canvas");
					canvas.width = width;
					canvas.height = height;
					canvas.getContext("2d").drawImage(img, 0, 0, width, height);
					resolve(canvas.toDataURL("image/webp", 0.8));
				};
				img.src = String(reader.result || "");
			};
			reader.readAsDataURL(file);
		});
	}

	function setupWidgets() {
		if (videoProgressMount && typeof window.dieunwCreateProgressBar === "function") {
			progressBar = window.dieunwCreateProgressBar(videoProgressMount);
		}
		if (!videoMusicMount) return;
		if (typeof window.dieunwCreateMusicAttachmentWidget === "function") {
			musicWidget = window.dieunwCreateMusicAttachmentWidget(videoMusicMount, {
				title: "Nhạc nền Video (Kho nhạc hoặc từ máy)"
			});
			return;
		}
		videoMusicMount.innerHTML = `
			<div class="dieunw-music-attach-box">
				<label style="font-size:13px; font-weight:700; color:#173853;">Nhạc nền Video (tùy chọn)</label>
				<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
					<select class="music-attach-select" style="flex:1; min-width:170px; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1;">
						<option value="">-- Chọn từ Kho nhạc DIEUNW --</option>
					</select>
					<label class="dieunw-file-btn" style="cursor:pointer;">
						Tệp nhạc từ máy
						<input type="file" class="music-attach-file" accept="audio/*" hidden>
					</label>
					<button type="button" class="btn-clear-upload music-attach-clear" hidden>Bỏ nhạc</button>
				</div>
				<p class="music-attach-status" style="font-size:12px; color:#5e7488; margin:4px 0 0;"></p>
			</div>
		`;
		const selectEl = videoMusicMount.querySelector(".music-attach-select");
		const fileEl = videoMusicMount.querySelector(".music-attach-file");
		const clearBtn = videoMusicMount.querySelector(".music-attach-clear");
		const statusEl = videoMusicMount.querySelector(".music-attach-status");
		let tracks = [];
		let pickedAudio = null;

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
				pickedAudio = null;
				fileEl.value = "";
				clearBtn.hidden = false;
				statusEl.textContent = `Đã chọn: ${selectEl.options[selectEl.selectedIndex].textContent}`;
			} else if (!pickedAudio) {
				clearBtn.hidden = true;
				statusEl.textContent = "";
			}
		});
		fileEl.addEventListener("change", () => {
			const f = fileEl.files?.[0];
			if (!f) return;
			pickedAudio = f;
			selectEl.value = "";
			clearBtn.hidden = false;
			statusEl.textContent = `Tệp nhạc: ${f.name}`;
		});
		clearBtn.addEventListener("click", () => {
			pickedAudio = null;
			fileEl.value = "";
			selectEl.value = "";
			clearBtn.hidden = true;
			statusEl.textContent = "";
		});

		musicWidget = {
			getValue() {
				if (pickedAudio) {
					return { mode: "file", file: pickedAudio, title: pickedAudio.name.replace(/\.[^.]+$/, "") };
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
				pickedAudio = null;
				fileEl.value = "";
				selectEl.value = "";
				clearBtn.hidden = true;
				statusEl.textContent = "";
			}
		};
	}

	function updateProgress(pct, label) {
		if (progressBar) {
			if (typeof progressBar.update === "function") progressBar.update(pct, label);
			else if (typeof progressBar.setProgress === "function") progressBar.setProgress(pct, label);
		} else if (videoProgressMount) {
			videoProgressMount.innerHTML = `
				<div class="dieunw-progress-wrap">
					<div class="dieunw-progress-meta"><span>${label || "Đang tải lên..."}</span><span>${Math.round(pct)}%</span></div>
					<div class="dieunw-progress-track"><div class="dieunw-progress-fill" style="width:${Math.min(100, Math.max(0, pct))}%"></div></div>
				</div>
			`;
		}
	}

	function resetProgress() {
		if (progressBar && typeof progressBar.reset === "function") progressBar.reset();
		else if (progressBar && typeof progressBar.hide === "function") progressBar.hide();
		else if (videoProgressMount) videoProgressMount.innerHTML = "";
	}

	// Mở / đóng modal đăng video
	btnOpenUpload?.addEventListener("click", () => {
		if (!uploadModal) return;
		setupWidgets();
		resetProgress();
		uploadModal.hidden = false;
		requestAnimationFrame(() => uploadModal.classList.add("open"));
	});

	function closeUploadModal() {
		if (!uploadModal) return;
		uploadModal.classList.remove("open");
		uploadModal.hidden = true;
	}
	btnCloseUpload?.addEventListener("click", closeUploadModal);
	uploadModal?.addEventListener("click", (e) => {
		if (e.target === uploadModal) closeUploadModal();
	});

	videoFileInput?.addEventListener("change", () => {
		const f = videoFileInput.files?.[0];
		videoFileNameEl.textContent = f ? `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)` : "Chưa chọn video";
	});

	videoCoverInput?.addEventListener("change", async () => {
		const f = videoCoverInput.files?.[0];
		if (!f) {
			compressedCoverDataUrl = "";
			videoCoverNameEl.textContent = "Tự động";
			return;
		}
		videoCoverNameEl.textContent = "Đang tối ưu ảnh bìa...";
		try {
			compressedCoverDataUrl = await compressCover(f);
			videoCoverNameEl.textContent = f.name;
		} catch (err) {
			compressedCoverDataUrl = "";
			videoCoverNameEl.textContent = "Tự động";
			notify(err.message || "Không thể xử lý ảnh bìa.", "error");
		}
	});

	// Đăng video mới
	uploadForm?.addEventListener("submit", async (e) => {
		e.preventDefault();
		const formEl = e.currentTarget;
		const videoFile = videoFileInput?.files?.[0];
		if (!videoFile) {
			notify("Vui lòng chọn tệp video trước khi đăng.", "warning");
			return;
		}

		const submitBtn = document.getElementById("btn-submit-video");
		submitBtn.disabled = true;
		submitBtn.textContent = "Đang tải lên...";

		try {
			const musicSelection = musicWidget ? musicWidget.getValue() : null;
			let musicId = "";
			let musicUrl = "";
			let musicTitle = "";
			let musicArtist = "";

			if (musicSelection) {
				const localAudio = musicSelection.file || musicSelection.audioFile;
				if (localAudio instanceof File) {
					updateProgress(4, "Đang tải nhạc nền lên Kho nhạc...");
					const audioFd = new FormData();
					audioFd.append("title", musicSelection.title || localAudio.name.replace(/\.[^.]+$/, ""));
					audioFd.append("artist", currentUser?.name || "Thành viên");
					audioFd.append("genre", "Nhạc Video");
					audioFd.append("audio", localAudio);

					const musicRes = await uploadWithProgress(MUSIC_API, {
						method: "POST",
						body: audioFd
					}, (pct) => updateProgress(Math.round(pct * 0.25), `Đang tải nhạc nền (${pct}%)...`));

					const tr = musicRes.track || {};
					musicId = tr.id || "";
					musicUrl = tr.audioUrl || tr.audio_url || "";
					musicTitle = tr.title || musicSelection.title || localAudio.name;
					musicArtist = tr.artist || currentUser?.name || "";
				} else {
					musicId = musicSelection.musicId || musicSelection.id || "";
					musicUrl = musicSelection.musicUrl || musicSelection.audioUrl || "";
					musicTitle = musicSelection.musicTitle || musicSelection.title || "";
					musicArtist = musicSelection.musicArtist || musicSelection.artist || "";
				}
			}

			const fd = new FormData();
			fd.append("video", videoFile);
			fd.append("caption", document.getElementById("video-caption-input").value.trim());
			if (compressedCoverDataUrl) fd.append("coverData", compressedCoverDataUrl);
			if (musicId) fd.append("musicId", musicId);
			if (musicUrl) fd.append("musicUrl", musicUrl);
			if (musicTitle) fd.append("musicTitle", musicTitle);
			if (musicArtist) fd.append("musicArtist", musicArtist);

			const offset = musicSelection?.file ? 28 : 5;
			updateProgress(offset, "Đang tải video lên máy chủ...");
			const res = await uploadWithProgress(VIDEOS_API, {
				method: "POST",
				body: fd
			}, (pct) => {
				const mapped = musicSelection?.file ? 28 + Math.round(pct * 0.72) : Math.max(5, pct);
				updateProgress(mapped, `Đang tải video (${mapped}%)...`);
			});

			updateProgress(100, "Hoàn tất!");
			formEl.reset();
			videoFileNameEl.textContent = "Chưa chọn video";
			videoCoverNameEl.textContent = "Tự động";
			compressedCoverDataUrl = "";
			if (musicWidget && typeof musicWidget.reset === "function") musicWidget.reset();
			resetProgress();
			closeUploadModal();

			if (res?.video) {
				videos.unshift(res.video);
				renderFeed();
				feedSnap.scrollTo({ top: 0, behavior: "smooth" });
			} else {
				await loadVideos();
			}
			notify("Đã đăng video ngắn thành công!", "success");
		} catch (err) {
			resetProgress();
			notify(err.message || "Không thể đăng video.", "error");
		} finally {
			submitBtn.disabled = false;
			submitBtn.textContent = "Đăng Video";
		}
	});

	function syncMuteIcons() {
		document.querySelectorAll(".video-slide").forEach(slide => {
			const vid = slide.querySelector(".video-player-el");
			const bgAudio = slide.querySelector(".short-video-bg-audio");
			const iconEl = slide.querySelector(".mute-toggle-btn .video-rail-icon");
			const labelEl = slide.querySelector(".mute-toggle-btn .mute-label");
			if (vid) vid.muted = isMutedGlobal || Boolean(bgAudio);
			if (bgAudio) bgAudio.muted = isMutedGlobal;
			if (iconEl) iconEl.textContent = isMutedGlobal ? "🔇" : "🔊";
			if (labelEl) labelEl.textContent = isMutedGlobal ? "Tắt tiếng" : "Âm thanh";
		});
	}

	function playSlide(slide) {
		if (!slide) return;
		window.dieunwPauseGlobalMusic?.();

		document.querySelectorAll(".video-slide").forEach(other => {
			if (other !== slide) pauseSlide(other);
		});

		const videoEl = slide.querySelector(".video-player-el");
		const bgAudio = slide.querySelector(".short-video-bg-audio");
		if (!videoEl) return;

		videoEl.muted = isMutedGlobal || Boolean(bgAudio);
		videoEl.play().then(() => {
			slide.classList.remove("is-paused");
			if (bgAudio) {
				bgAudio.muted = isMutedGlobal;
				bgAudio.play().catch(() => {});
			}
		}).catch(() => {
			// Fallback tự động phát ở chế độ tắt tiếng nếu trình duyệt chặn autoplay có tiếng
			isMutedGlobal = true;
			syncMuteIcons();
			videoEl.muted = true;
			videoEl.play().then(() => {
				slide.classList.remove("is-paused");
				if (bgAudio) {
					bgAudio.muted = true;
					bgAudio.play().catch(() => {});
				}
			}).catch(() => {
				slide.classList.add("is-paused");
			});
		});

		const videoId = slide.dataset.videoId;
		if (videoId && !viewedVideoIds.has(videoId)) {
			viewedVideoIds.add(videoId);
			fetch(`${VIDEOS_API}/${encodeURIComponent(videoId)}/view`, {
				method: "POST",
				credentials: "include"
			}).then(r => r.ok ? r.json() : null).then(data => {
				if (data && typeof data.views === "number") {
					const viewsEl = slide.querySelector(".video-views-text");
					if (viewsEl) viewsEl.textContent = `· ${data.views} lượt xem`;
				}
			}).catch(() => {});
		}
	}

	function pauseSlide(slide) {
		if (!slide) return;
		const videoEl = slide.querySelector(".video-player-el");
		const bgAudio = slide.querySelector(".short-video-bg-audio");
		videoEl?.pause();
		bgAudio?.pause();
		slide.classList.add("is-paused");
	}

	function createVideoSlide(video) {
		const slide = document.createElement("article");
		slide.className = "video-slide is-paused";
		slide.dataset.videoId = video.id;

		const videoEl = document.createElement("video");
		videoEl.className = "video-player-el";
		videoEl.src = resolveMedia(video.videoUrl || video.video_url);
		if (video.coverUrl || video.cover_url) {
			videoEl.poster = resolveMedia(video.coverUrl || video.cover_url);
		}
		videoEl.loop = true;
		videoEl.playsInline = true;
		videoEl.preload = "metadata";

		const musicUrl = resolveMedia(video.musicUrl || video.music_url || "");
		let bgAudio = null;
		if (musicUrl) {
			bgAudio = document.createElement("audio");
			bgAudio.className = "short-video-bg-audio";
			bgAudio.src = musicUrl;
			bgAudio.loop = true;
			bgAudio.preload = "auto";
			videoEl.muted = true;
			slide.appendChild(bgAudio);
		}

		videoEl.addEventListener("click", () => {
			if (videoEl.paused) {
				playSlide(slide);
			} else {
				pauseSlide(slide);
			}
		});

		const pauseIndicator = document.createElement("div");
		pauseIndicator.className = "video-pause-indicator";
		pauseIndicator.innerHTML = `<div class="video-pause-circle">▶</div>`;

		const bottomGrad = document.createElement("div");
		bottomGrad.className = "video-bottom-gradient";

		const authorRow = document.createElement("div");
		authorRow.className = "video-author-row";
		const authorNameEl = document.createElement("a");
		authorNameEl.className = "video-author-name";
		const uid = video.userId || video.user_id || "";
		authorNameEl.href = uid ? `./profile.html?userId=${encodeURIComponent(uid)}` : "./profile.html";
		authorNameEl.textContent = `@${video.authorName || video.name || "dieuer"}`;

		const viewsEl = document.createElement("span");
		viewsEl.className = "video-views-text";
		viewsEl.textContent = `· ${Number(video.views || 0)} lượt xem`;
		authorRow.append(authorNameEl, viewsEl);

		const captionEl = document.createElement("p");
		captionEl.className = "video-caption";
		captionEl.textContent = video.caption || "";

		bottomGrad.append(authorRow, captionEl);

		if (musicUrl || video.musicTitle || video.music_title) {
			const musicTicker = document.createElement("button");
			musicTicker.type = "button";
			musicTicker.className = "video-music-ticker";
			const mTitle = video.musicTitle || video.music_title || "Nhạc nền gốc";
			const mArtist = video.musicArtist || video.music_artist || "";
			musicTicker.innerHTML = `<span>♪ ${mTitle}${mArtist ? ` — ${mArtist}` : ""}</span>`;
			musicTicker.addEventListener("click", () => {
				if (musicUrl && typeof window.dieunwPlayGlobalTrack === "function") {
					pauseSlide(slide);
					window.dieunwPlayGlobalTrack({
						id: video.musicId || video.music_id || `vid-music-${video.id}`,
						title: mTitle,
						artist: mArtist || video.authorName || "",
						audioUrl: musicUrl,
						coverUrl: resolveMedia(video.coverUrl || video.cover_url) || "./DIEU.png"
					});
					notify(`Đang phát "${mTitle}" ở đĩa nhạc góc trên!`, "success");
				}
			});
			bottomGrad.appendChild(musicTicker);
		}

		const rightRail = document.createElement("div");
		rightRail.className = "video-right-rail";

		const avatarImg = document.createElement("img");
		avatarImg.className = "video-rail-avatar";
		avatarImg.src = resolveMedia(video.authorAvatar || video.avatar) || "./DIEU.png";
		avatarImg.alt = "";

		const likeBtn = document.createElement("button");
		likeBtn.type = "button";
		likeBtn.className = `video-rail-btn ${video.likedByMe ? "liked" : ""}`;
		likeBtn.innerHTML = `<span class="video-rail-icon">♥</span><span class="like-count">${Number(video.likes || 0)}</span>`;
		likeBtn.addEventListener("click", async () => {
			if (!currentUser) {
				notify("Vui lòng đăng nhập để thả tim video.", "warning");
				return;
			}
			const nextLiked = !Boolean(video.likedByMe);
			likeBtn.disabled = true;
			try {
				const res = await fetch(`${VIDEOS_API}/${encodeURIComponent(video.id)}/like`, {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ liked: nextLiked })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.error || "Không thể thích video.");
				video.likedByMe = nextLiked;
				video.likes = Number(data.likes ?? (nextLiked ? Number(video.likes || 0) + 1 : Math.max(0, Number(video.likes || 0) - 1)));
				likeBtn.classList.toggle("liked", nextLiked);
				likeBtn.querySelector(".like-count").textContent = String(video.likes);
			} catch (err) {
				notify(err.message || "Lỗi cập nhật lượt thích.", "error");
			} finally {
				likeBtn.disabled = false;
			}
		});

		const cmtBtn = document.createElement("button");
		cmtBtn.type = "button";
		cmtBtn.className = "video-rail-btn";
		const cmtCount = Number(video.commentsCount ?? video.comments_count ?? 0);
		cmtBtn.innerHTML = `<span class="video-rail-icon">💬</span><span class="cmt-count">${cmtCount}</span>`;
		cmtBtn.addEventListener("click", () => openCommentsDrawer(video, cmtBtn.querySelector(".cmt-count")));

		const muteBtn = document.createElement("button");
		muteBtn.type = "button";
		muteBtn.className = "video-rail-btn mute-toggle-btn";
		muteBtn.innerHTML = `<span class="video-rail-icon">${isMutedGlobal ? "🔇" : "🔊"}</span><span class="mute-label">${isMutedGlobal ? "Tắt tiếng" : "Âm thanh"}</span>`;
		muteBtn.addEventListener("click", () => {
			isMutedGlobal = !isMutedGlobal;
			syncMuteIcons();
		});

		rightRail.append(avatarImg, likeBtn, cmtBtn, muteBtn);

		const ownerId = String(video.userId || video.user_id || "");
		const canDelete = currentUser && (String(currentUser.id) === ownerId || currentUser.isAdmin || currentUser.isModerator);
		if (canDelete) {
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.className = "video-rail-btn danger";
			delBtn.innerHTML = `<span class="video-rail-icon">🗑</span><span>Xóa</span>`;
			delBtn.addEventListener("click", async () => {
				const ok = await askConfirm("Bạn có chắc muốn xóa video này?");
				if (!ok) return;
				delBtn.disabled = true;
				try {
					const res = await fetch(`${VIDEOS_API}/${encodeURIComponent(video.id)}`, {
						method: "DELETE",
						credentials: "include"
					});
					const data = await res.json();
					if (!res.ok) throw new Error(data.error || "Không thể xóa video.");
					videos = videos.filter(v => String(v.id) !== String(video.id));
					renderFeed();
					notify("Đã xóa video.", "success");
				} catch (err) {
					notify(err.message || "Không thể xóa video.", "error");
					delBtn.disabled = false;
				}
			});
			rightRail.appendChild(delBtn);
		}

		slide.append(videoEl, pauseIndicator, bottomGrad, rightRail);
		return slide;
	}

	function setupSlideObserver() {
		if (activeSlideObserver) activeSlideObserver.disconnect();
		activeSlideObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
					playSlide(entry.target);
				} else {
					pauseSlide(entry.target);
				}
			});
		}, {
			root: feedSnap,
			threshold: [0.2, 0.65]
		});

		feedSnap.querySelectorAll(".video-slide").forEach(slide => activeSlideObserver.observe(slide));
	}

	function renderFeed() {
		feedSnap.innerHTML = "";
		if (!videos.length) {
			feedSnap.innerHTML = `<div class="video-empty-state"><h3>Chưa có video nào</h3><p>Hãy là người đầu tiên chia sẻ video học tập hoặc giải trí lên DIEUNW Reels!</p></div>`;
			return;
		}
		const frag = document.createDocumentFragment();
		videos.forEach(v => frag.appendChild(createVideoSlide(v)));
		feedSnap.appendChild(frag);
		setupSlideObserver();
		syncMuteIcons();
	}

	function scrollRelativeSlide(direction) {
		const h = feedSnap?.clientHeight || 0;
		if (!h) return;
		feedSnap.scrollBy({ top: direction * h, behavior: "smooth" });
	}

	btnPrevVideo?.addEventListener("click", () => scrollRelativeSlide(-1));
	btnNextVideo?.addEventListener("click", () => scrollRelativeSlide(1));
	document.addEventListener("keydown", (e) => {
		if (uploadModal && !uploadModal.hidden) return;
		if (commentsDrawer && !commentsDrawer.hidden) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			scrollRelativeSlide(1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			scrollRelativeSlide(-1);
		}
	});

	// Ngăn kéo bình luận
	let activeCommentCountEl = null;

	function appendCommentRow(cmt) {
		const row = document.createElement("div");
		row.className = "video-comment-row";
		const img = document.createElement("img");
		img.src = resolveMedia(cmt.avatar || cmt.authorAvatar) || "./DIEU.png";
		img.alt = "";
		const bubble = document.createElement("div");
		bubble.className = "video-comment-bubble";
		const strong = document.createElement("strong");
		strong.textContent = cmt.name || cmt.authorName || "Thành viên DIEUNW";
		const p = document.createElement("p");
		p.textContent = cmt.content || cmt.text || "";
		bubble.append(strong, p);
		row.append(img, bubble);
		commentsListEl.appendChild(row);
	}

	async function openCommentsDrawer(video, countEl) {
		currentCommentsVideo = video;
		activeCommentCountEl = countEl;
		commentsListEl.innerHTML = "<p style='color:#64748b; text-align:center;'>Đang tải bình luận...</p>";
		commentsDrawer.hidden = false;
		try {
			const res = await fetch(`${VIDEOS_API}/${encodeURIComponent(video.id)}/comments`, {
				credentials: "include"
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Không thể tải bình luận.");
			const list = Array.isArray(data.comments) ? data.comments : [];
			commentsListEl.innerHTML = "";
			if (!list.length) {
				commentsListEl.innerHTML = "<p class='empty-cmt-note' style='color:#64748b; text-align:center;'>Chưa có bình luận nào. Hãy mở lời đầu tiên!</p>";
			} else {
				list.forEach(appendCommentRow);
			}
		} catch (err) {
			commentsListEl.innerHTML = `<p style='color:#b42318; text-align:center;'>${err.message || "Lỗi tải bình luận."}</p>`;
		}
	}

	function closeCommentsDrawer() {
		if (commentsDrawer) commentsDrawer.hidden = true;
		currentCommentsVideo = null;
		activeCommentCountEl = null;
	}
	btnCloseComments?.addEventListener("click", closeCommentsDrawer);
	commentsDrawer?.addEventListener("click", (e) => {
		if (e.target === commentsDrawer) closeCommentsDrawer();
	});

	commentForm?.addEventListener("submit", async (e) => {
		e.preventDefault();
		const formEl = e.currentTarget;
		if (!currentCommentsVideo) return;
		if (!currentUser) {
			notify("Vui lòng đăng nhập để bình luận.", "warning");
			return;
		}
		const content = (commentInput?.value || "").trim();
		if (!content) return;
		const submitBtn = formEl.querySelector("button[type='submit']");
		submitBtn.disabled = true;

		try {
			const res = await fetch(`${VIDEOS_API}/${encodeURIComponent(currentCommentsVideo.id)}/comments`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Không thể gửi bình luận.");

			formEl.reset();
			commentsListEl.querySelector(".empty-cmt-note")?.remove();
			appendCommentRow(data.comment || {
				name: currentUser.name || currentUser.email,
				avatar: currentUser.avatar || "./DIEU.png",
				content
			});
			currentCommentsVideo.commentsCount = Number(currentCommentsVideo.commentsCount || 0) + 1;
			if (activeCommentCountEl) {
				activeCommentCountEl.textContent = String(currentCommentsVideo.commentsCount);
			}
		} catch (err) {
			notify(err.message || "Không thể gửi bình luận.", "error");
		} finally {
			submitBtn.disabled = false;
			commentInput?.focus();
		}
	});

	async function loadVideos() {
		try {
			const res = await fetch(VIDEOS_API, { credentials: "include" });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Không thể tải danh sách video.");
			videos = Array.isArray(data.videos) ? data.videos : [];
			renderFeed();
		} catch (err) {
			feedSnap.innerHTML = `<div class="video-empty-state">${err.message || "Không thể tải video lúc này."}</div>`;
		}
	}

	fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
		.then(r => r.ok ? r.json() : { user: null })
		.then(data => {
			currentUser = data.user || null;
			if (btnOpenUpload) btnOpenUpload.hidden = !Boolean(currentUser?.id);
		})
		.catch(() => {})
		.finally(() => loadVideos());
});