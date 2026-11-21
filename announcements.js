document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = (window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.startsWith("192.168.") || window.location.port === "4174")) ? window.location.origin : "https://dieunw.onrender.com";
	const feed = document.getElementById("announcement-feed");
	const composer = document.getElementById("announcement-composer");
	const form = document.getElementById("announcement-form");

	const imageInput = document.getElementById("announcement-image-file");
	const imageNameEl = document.getElementById("announcement-image-name");
	const imageClearBtn = document.getElementById("announcement-image-clear");
	const imagePreviewWrap = document.getElementById("announcement-image-preview-wrap");
	const imagePreviewEl = document.getElementById("announcement-image-preview");

	const fileInput = document.getElementById("announcement-file");
	const fileNameEl = document.getElementById("announcement-file-name");
	const fileClearBtn = document.getElementById("announcement-file-clear");

	const musicMount = document.getElementById("ann-music-picker");
	const progressMount = document.getElementById("ann-upload-progress");

	let currentUser = null;
	let publishableClubs = [];
	let compressedImageDataUrl = "";
	let musicWidget = null;
	let progressBar = null;
	let activeInlineAudio = null;

	function notify(message, type = "info") {
		if (typeof window.dieunwToast === "function") {
			window.dieunwToast(message, type);
		}
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

	async function api(url, options = {}) {
		const response = await fetch(`${API_BASE}${url}`, {
			credentials: "include",
			...options
		});
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || "Không thể hoàn tất yêu cầu.");
		}
		return data;
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

	async function compressImage(file) {
		if (typeof window.dieunwCompressImage === "function") {
			const res = await window.dieunwCompressImage(file, 1440, 0.82);
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
			reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
			reader.onload = () => {
				const img = new Image();
				img.onerror = () => reject(new Error("Ảnh không hợp lệ."));
				img.onload = () => {
					const maxDim = 1440;
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
					resolve(canvas.toDataURL("image/webp", 0.82));
				};
				img.src = String(reader.result || "");
			};
			reader.readAsDataURL(file);
		});
	}

	function setupMusicAndProgressWidgets() {
		if (progressMount && typeof window.dieunwCreateProgressBar === "function") {
			progressBar = window.dieunwCreateProgressBar(progressMount);
		}
		if (!musicMount) return;
		if (typeof window.dieunwCreateMusicAttachmentWidget === "function") {
			musicWidget = window.dieunwCreateMusicAttachmentWidget(musicMount, {
				title: "Đính kèm nhạc nền thông báo (tùy chọn)"
			});
			return;
		}
		musicMount.innerHTML = `
			<div class="dieunw-music-attach-box">
				<label>Đính kèm nhạc (Kho nhạc online hoặc tệp từ máy)</label>
				<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
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
		const selectEl = musicMount.querySelector(".music-attach-select");
		const fileEl = musicMount.querySelector(".music-attach-file");
		const clearBtn = musicMount.querySelector(".music-attach-clear");
		const statusEl = musicMount.querySelector(".music-attach-status");
		let tracks = [];
		let pickedAudio = null;

		api("/api/music")
			.then(data => {
				tracks = Array.isArray(data.tracks) ? data.tracks : [];
				tracks.forEach(t => {
					const opt = document.createElement("option");
					opt.value = t.id;
					opt.textContent = `${t.title} - ${t.artist || t.authorName || "Thành viên"}`;
					selectEl.append(opt);
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

	function updateProgress(percent, label) {
		if (progressBar) {
			if (typeof progressBar.update === "function") progressBar.update(percent, label);
			else if (typeof progressBar.setProgress === "function") progressBar.setProgress(percent, label);
		} else if (progressMount) {
			progressMount.innerHTML = `
				<div class="dieunw-progress-wrap">
					<div class="dieunw-progress-meta"><span>${label || "Đang tải lên..."}</span><span>${Math.round(percent)}%</span></div>
					<div class="dieunw-progress-track"><div class="dieunw-progress-fill" style="width:${Math.min(100, Math.max(0, percent))}%"></div></div>
				</div>
			`;
		}
	}

	function clearProgress() {
		if (progressBar && typeof progressBar.reset === "function") progressBar.reset();
		else if (progressBar && typeof progressBar.hide === "function") progressBar.hide();
		else if (progressMount) progressMount.innerHTML = "";
	}

	function clearImageAttachment() {
		compressedImageDataUrl = "";
		if (imageInput) imageInput.value = "";
		if (imageNameEl) imageNameEl.textContent = "Không có ảnh";
		if (imagePreviewEl) imagePreviewEl.src = "";
		if (imagePreviewWrap) imagePreviewWrap.hidden = true;
		if (imageClearBtn) imageClearBtn.hidden = true;
	}

	function clearFileAttachment() {
		if (fileInput) fileInput.value = "";
		if (fileNameEl) fileNameEl.textContent = "Không có tệp";
		if (fileClearBtn) fileClearBtn.hidden = true;
	}

	imageInput?.addEventListener("change", async () => {
		const f = imageInput.files?.[0];
		if (!f) {
			clearImageAttachment();
			return;
		}
		imageNameEl.textContent = `${f.name} (đang tối ưu...)`;
		try {
			compressedImageDataUrl = await compressImage(f);
			imageNameEl.textContent = f.name;
			imagePreviewEl.src = compressedImageDataUrl;
			imagePreviewWrap.hidden = false;
			imageClearBtn.hidden = false;
		} catch (err) {
			clearImageAttachment();
			notify(err.message || "Không thể xử lý ảnh.", "error");
		}
	});
	imageClearBtn?.addEventListener("click", clearImageAttachment);

	fileInput?.addEventListener("change", () => {
		const f = fileInput.files?.[0];
		if (!f) {
			clearFileAttachment();
			return;
		}
		fileNameEl.textContent = f.name;
		fileClearBtn.hidden = false;
	});
	fileClearBtn?.addEventListener("click", clearFileAttachment);

	function element(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function renderPost(post, index) {
		const article = element("article", "announcement-post");
		article.style.setProperty("--club-color", post.tagColor || "#1769aa");
		article.style.setProperty("--post-index", String(index));

		const header = element("header", "announcement-post-header");
		if (post.clubLogo) {
			const logo = element("img", "announcement-club-logo");
			logo.src = resolveMedia(post.clubLogo);
			logo.alt = "";
			header.append(logo);
		} else {
			header.append(element("span", "announcement-club-monogram", (post.clubName || "C").slice(0, 1).toUpperCase()));
		}

		const identity = element("div", "announcement-post-identity");
		identity.append(
			element("h2", "", post.clubName || "Câu lạc bộ"),
			element("p", "", `${post.author?.name || "Ban chủ nhiệm"} · ${new Date(post.createdAt).toLocaleString("vi-VN")}`)
		);
		header.append(identity);
		header.append(element("span", "announcement-label", "THÔNG BÁO"));
		article.append(header, element("p", "announcement-post-content", post.content || ""));

		// Hiển thị ảnh đính kèm
		const imgUrl = resolveMedia(post.image);
		if (imgUrl) {
			const img = element("img", "announcement-post-image");
			img.src = imgUrl;
			img.loading = "lazy";
			img.alt = `Ảnh thông báo từ ${post.clubName || "CLB"}`;
			article.append(img);
		}

		// Hiển thị tệp đính kèm
		const fileUrl = resolveMedia(post.fileUrl);
		if (fileUrl) {
			const fileLink = element("a", "announcement-file-link", `Tải tệp đính kèm: ${post.fileName || "Tệp tài liệu"}`);
			fileLink.href = fileUrl;
			fileLink.target = "_blank";
			fileLink.rel = "noopener noreferrer";
			article.append(fileLink);
		}

		// Hiển thị nhạc đính kèm thông báo
		const musicUrl = resolveMedia(post.musicUrl || post.music_url || "");
		if (musicUrl) {
			const musicBox = element("div", "inline-music-card announcement-music-box");
			const meta = element("div", "inline-music-meta");
			meta.append(
				element("span", "inline-music-badge", "♪ Nhạc CLB"),
				element("strong", "", post.musicTitle || post.music_title || "Âm thanh đính kèm")
			);
			const artist = post.musicArtist || post.music_artist || "";
			if (artist) meta.append(element("small", "", artist));

			const audio = document.createElement("audio");
			audio.className = "inline-music-audio";
			audio.controls = true;
			audio.preload = "none";
			audio.src = musicUrl;
			audio.addEventListener("play", () => {
				if (typeof window.dieunwPauseGlobalMusic === "function") {
					window.dieunwPauseGlobalMusic();
				}
				if (activeInlineAudio && activeInlineAudio !== audio) {
					activeInlineAudio.pause();
				}
				activeInlineAudio = audio;
			});

			musicBox.append(meta, audio);
			article.append(musicBox);
		}

		return article;
	}

	async function loadFeed() {
		const { posts } = await api("/api/announcements");
		feed.replaceChildren(...posts.map(renderPost));
		if (!posts.length) {
			feed.append(element("p", "clubs-empty", "Chưa có thông báo nào. Các cập nhật của CLB sẽ xuất hiện tại đây."));
		}
	}

	form?.addEventListener("submit", async event => {
		event.preventDefault();
		const formEl = event.currentTarget;
		const button = formEl.querySelector("button[type='submit']");
		const status = document.getElementById("announcement-status");
		const content = document.getElementById("announcement-content").value.trim();
		const clubId = document.getElementById("announcement-club").value;

		if (!content) {
			notify("Vui lòng nhập nội dung thông báo.", "warning");
			return;
		}

		button.disabled = true;
		if (status) status.textContent = "Đang tải lên thông báo...";

		try {
			const musicSelection = musicWidget ? musicWidget.getValue() : null;
			let musicId = "";
			let musicUrl = "";
			let musicTitle = "";
			let musicArtist = "";

			if (musicSelection) {
				const localAudio = musicSelection.file || musicSelection.audioFile;
				if (localAudio instanceof File) {
					updateProgress(5, "Đang tải tệp nhạc lên Kho nhạc...");
					const audioFd = new FormData();
					audioFd.append("title", musicSelection.title || localAudio.name.replace(/\.[^.]+$/, ""));
					audioFd.append("artist", currentUser?.name || "CLB");
					audioFd.append("genre", "CLB");
					audioFd.append("audio", localAudio);

					const musicRes = await uploadWithProgress(`${API_BASE}/api/music`, {
						method: "POST",
						body: audioFd
					}, pct => updateProgress(Math.round(pct * 0.5), `Đang tải nhạc (${pct}%)...`));

					const tr = musicRes.track || {};
					musicId = tr.id || "";
					musicUrl = tr.audioUrl || tr.audio_url || "";
					musicTitle = tr.title || musicSelection.title || localAudio.name;
					musicArtist = tr.artist || "";
				} else {
					musicId = musicSelection.musicId || musicSelection.id || "";
					musicUrl = musicSelection.musicUrl || musicSelection.audioUrl || "";
					musicTitle = musicSelection.musicTitle || musicSelection.title || "";
					musicArtist = musicSelection.musicArtist || musicSelection.artist || "";
				}
			}

			const fd = new FormData();
			fd.append("content", content);
			if (compressedImageDataUrl) fd.append("imageData", compressedImageDataUrl);
			if (fileInput?.files?.[0]) fd.append("file", fileInput.files[0]);
			if (musicId) fd.append("musicId", musicId);
			if (musicUrl) fd.append("musicUrl", musicUrl);
			if (musicTitle) fd.append("musicTitle", musicTitle);
			if (musicArtist) fd.append("musicArtist", musicArtist);

			const baseOffset = musicSelection?.file ? 55 : 10;
			updateProgress(baseOffset, "Đang đăng thông báo CLB...");

			const res = await uploadWithProgress(`${API_BASE}/api/clubs/${encodeURIComponent(clubId)}/posts`, {
				method: "POST",
				body: fd
			}, pct => {
				const mapped = musicSelection?.file ? 55 + Math.round(pct * 0.45) : Math.max(10, pct);
				updateProgress(mapped, `Đang đăng (${mapped}%)...`);
			});

			updateProgress(100, "Hoàn tất!");
			formEl.reset();
			clearImageAttachment();
			clearFileAttachment();
			if (musicWidget && typeof musicWidget.reset === "function") musicWidget.reset();
			clearProgress();

			if (status) status.textContent = "Thông báo đã được đăng.";
			notify("Đã đăng thông báo CLB thành công!", "success");

			if (res?.post) {
				const emptyEl = feed.querySelector(".clubs-empty");
				if (emptyEl) emptyEl.remove();
				feed.prepend(renderPost(res.post, 0));
			} else {
				await loadFeed();
			}
		} catch (error) {
			clearProgress();
			if (status) status.textContent = error.message;
			notify(error.message || "Không thể đăng thông báo.", "error");
		} finally {
			button.disabled = false;
		}
	});

	setupMusicAndProgressWidgets();

	Promise.all([api("/api/auth/me").catch(() => ({ user: null })), api("/api/clubs")])
		.then(([auth, clubData]) => {
			currentUser = auth.user;
			publishableClubs = (clubData.clubs || []).filter(club => club.status === "approved"
				&& (currentUser?.isAdmin || club.manager?.id === currentUser?.id));
			if (publishableClubs.length) {
				const select = document.getElementById("announcement-club");
				for (const club of publishableClubs) {
					const option = document.createElement("option");
					option.value = club.id;
					option.textContent = club.name;
					select.append(option);
				}
				composer.hidden = false;
			}
			return loadFeed();
		})
		.catch(error => {
			const statusEl = document.getElementById("announcement-feed-status");
			if (statusEl) statusEl.textContent = error.message;
		});
});