const POSTS_API = "https://dieunw.onrender.com/api/posts";

// DOM Các phần tử liên quan đến Bảng tin & Popup Box trên Trang chủ
const modalOverlay = document.getElementById('post-modal-overlay');
const triggerInput = document.getElementById('trigger-modal-input');
const btnTriggerOpen = document.getElementById('btn-trigger-open');
const btnModalClose = document.getElementById('btn-modal-close');
const btnSubmit = document.getElementById('btn-submit-post');
const postTextInput = document.getElementById('post-text-input');
const postImageInput = document.getElementById('post-image-input');
const newsfeedContainer = document.getElementById('newsfeed-container');
const feedAuthGate = document.getElementById('feed-auth-gate');
const feedTriggerBox = document.getElementById('feed-trigger-box');
let homeAccessEnabled = false;
let currentHomeUser = null;

function updateHomeAccess(user = null) {
    const isAuthenticated = Boolean(user?.id);
    currentHomeUser = isAuthenticated ? user : null;
    if (feedAuthGate) feedAuthGate.hidden = isAuthenticated;
    if (feedTriggerBox) feedTriggerBox.hidden = !isAuthenticated;
    if (newsfeedContainer) newsfeedContainer.hidden = !isAuthenticated;
    if (!isAuthenticated) closeModal();

    if (isAuthenticated) {
        const name = user.name || user.email;
        const authorName = document.getElementById('post-author-name');
        const authorAvatar = document.getElementById('post-author-avatar');
        const triggerText = document.getElementById('trigger-modal-input');
        if (authorName) authorName.textContent = name;
        if (authorAvatar) authorAvatar.src = user.avatar || './DIEU.png';
        if (triggerText) triggerText.textContent = `${name} ơi, bạn đang nghĩ gì thế?`;
        if (!homeAccessEnabled) loadPosts();
    } else if (modalOverlay) {
        closeModal();
    }

    homeAccessEnabled = isAuthenticated;
}

window.updateHomeAccess = updateHomeAccess;

function showHomeAuth(view) {
    const authContainer = document.getElementById('auth-container');
    if (!authContainer) return;
    authContainer.style.display = 'block';
    if (view === 'register') {
        document.getElementById('link-to-register')?.click();
    } else {
        document.getElementById('login-view').style.display = 'block';
        document.getElementById('register-view').style.display = 'none';
        document.getElementById('forgot-view').style.display = 'none';
    }
    authContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (view === 'login') document.getElementById('login-email')?.focus();
}

document.getElementById('feed-login-button')?.addEventListener('click', () => showHomeAuth('login'));
document.getElementById('feed-register-button')?.addEventListener('click', () => showHomeAuth('register'));

document.querySelectorAll('input[name="post-visibility"]').forEach(option => {
    option.addEventListener('change', () => {
        const label = document.getElementById('post-privacy-label');
        if (label) label.textContent = option.value === 'private' ? 'Riêng tư' : 'Công khai';
    });
});

// --- 1. XỬ LÝ ẨN / HIỆN POPUP BOX TẠO BÀI VIẾT ---
function openModal() {
    if (!homeAccessEnabled) return;
    if (modalOverlay) {
        modalOverlay.hidden = false;
        requestAnimationFrame(() => modalOverlay.classList.add('open'));
        if (postTextInput) postTextInput.focus();
    }
}
function closeModal() {
    if (modalOverlay) {
        modalOverlay.classList.remove('open');
        modalOverlay.hidden = true;
    }
}

if (triggerInput) triggerInput.addEventListener('click', openModal);
if (btnTriggerOpen) btnTriggerOpen.addEventListener('click', openModal);
if (btnModalClose) btnModalClose.addEventListener('click', closeModal);
if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
}

// --- 2. HÀM TẢI BÀI VIẾT TỪ MÁY CHỦ MOCKAPI ---
// Hàm tải bài viết tối ưu tốc độ (Dùng Cache + Lazy Load)
async function loadPosts() {
    if (!newsfeedContainer) return;
    if (!homeAccessEnabled) return;

    try {
        const response = await fetch(POSTS_API, { credentials: "include" });
        const data = await response.json();
        if (response.status === 401) {
            localStorage.removeItem("dieuNwUser");
            updateHomeAccess(null);
            return;
        }
        if (!response.ok) throw new Error(data.error || "Không thể tải bài viết.");
        renderPosts(data.posts);
    } catch (error) {
        newsfeedContainer.innerHTML = "<p style='color:red; text-align:center;'>Không thể tải bài viết. Hãy tải lại trang.</p>";
    }
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

// Hàm phụ trợ chuyên vẽ giao diện bài viết ra màn hình
function renderPosts(posts) {
    const viewer = currentHomeUser;
    if (!viewer) return;
    const viewerId = String(viewer.id || "");
    const viewerEmail = String(viewer.email || "").toLowerCase();
    posts = posts.filter(post => {
        if (["study-resource", "public-chat-room", "public-chat-message"].includes(post.type)) return false;
        if (post.visibility !== "private") return true;
        return String(post.userId || "") === viewerId || String(post.authorEmail || "").toLowerCase() === viewerEmail;
    });
    newsfeedContainer.innerHTML = ""; 

    if (posts.length === 0) {
        newsfeedContainer.innerHTML = "<p class='empty-text'>Chưa có bài viết nào. Hãy là người đầu tiên đăng bài!</p>";
        return;
    }

    // Chỉ lấy tối đa 15 bài mới nhất để trang web luôn nhẹ và mượt
    const recentPosts = posts.slice(0, 15);

    recentPosts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.classList.add('post-card');
        
        const hasValidImage = post.image && post.image.trim() !== "" && !post.image.includes("placeholder") && !post.image.includes("faker");
        
        // Đã thêm loading="lazy" để tăng tốc độ tải ảnh
        const postImageHtml = hasValidImage ? `<img src="${escapeHtml(post.image)}" class="post-card-image" loading="lazy">` : '';
        
        const countLikes = post.likes || 0; 
        const authorName = escapeHtml(post.name || viewer.name || viewer.email || "Thành viên DIEUNW");
        const authorAvatar = escapeHtml(post.avatar || "./DIEU.png");
        const visibilityLabel = post.visibility === "private" ? "Riêng tư" : "Công khai";

        let savedComments = [];
        if (post.comments) {
            try {
                savedComments = typeof post.comments === 'string' ? JSON.parse(post.comments) : post.comments;
            } catch (e) {
                savedComments = [];
            }
        }
        const countComments = savedComments.length;

        const isLiked = Boolean(post.likedByMe);
        const likedClass = isLiked ? 'liked' : '';
        const likedStyle = isLiked ? 'style="color: #0078ff; font-weight: bold;"' : '';

        let commentsListHtml = '';
        if (Array.isArray(savedComments)) {
            savedComments.forEach(cmt => {
                commentsListHtml += `
                    <div class="comment-item">
                        <img src="./DIEU.png" class="post-card-avatar" style="width:32px; height:32px;">
                        <div class="comment-content-box">
                            <h5>${escapeHtml(cmt.name || post.name || "Thành viên")}</h5>
                            <p>${escapeHtml(cmt.text || "")}</p>
                        </div>
                    </div>
                `;
            });
        }

        postElement.innerHTML = `
            <div class="post-card-header">
                <img src="${authorAvatar}" class="post-card-avatar">
                <div>
                    <h4 class="post-card-author">${authorName}</h4>
                    <span class="post-card-time">${new Date(post.createdAt).toLocaleString('vi-VN')}</span>
                </div>
            </div>
            <div class="post-card-body">
                <p>${escapeHtml(post.content || "")}</p>
                ${postImageHtml}
            </div>
            <div class="post-visibility-label">${visibilityLabel}</div>
            
            <div class="post-status-info">
                <span class="like-count-text">
                    <img src="./icon-like.png" class="status-like-icon" alt="Like"> 
                    <span class="count">${countLikes}</span> lượt thích
                </span>
                <span class="comment-count-text">
                    <img src="./icon-comment.png" class="status-comment-icon" alt="Comment"> 
                    <span class="comment-count">${countComments}</span> bình luận
                </span>
            </div>

            <div class="post-interact-bar">
                <button class="btn-interact btn-like ${likedClass}" ${likedStyle} onclick="handleLike(this, '${post.id}', ${countLikes})">
                    <img src="./icon-like.png" class="custom-interact-icon" alt="Like"> Thích
                </button>
                <button class="btn-interact btn-comment" onclick="toggleCommentBox(this)">
                    <img src="./icon-comment.png" class="custom-interact-icon" alt="Comment"> Bình luận
                </button>
            </div>

            <div class="comment-section" style="display: none;">
                <div class="comment-input-group">
                    <img src="./DIEU.png" class="user-avatar-mini" style="width:32px; height:32px;">
                    <input type="text" class="comment-field" placeholder="Viết bình luận công khai..." 
                           onkeypress="submitComment(event, this, '${post.id}', '${encodeURIComponent(JSON.stringify(savedComments))}')">
                </div>
                <div class="comments-list">${commentsListHtml}</div>
            </div>
        `;

        if (String(post.userId || "") === viewerId) {
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
                    const response = await fetch(`${POSTS_API}/${encodeURIComponent(post.id)}`, {
                        method: "DELETE",
                        credentials: "include"
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Không thể xóa bài viết.");
                    await loadPosts();
                } catch (error) {
                    alert(error.message || "Không thể xóa bài viết.");
                    deleteButton.disabled = false;
                }
            });
            actions.append(deleteButton);
            postElement.append(actions);
        }
        newsfeedContainer.appendChild(postElement);
    });
}

// --- 3. XỬ LÝ ĐĂNG BÀI VIẾT MỚI LÊN MÁY CHỦ (POST) ---
if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
        const loggedInUser = currentHomeUser;
        if (!homeAccessEnabled || !loggedInUser) {
            updateHomeAccess(null);
            return;
        }

        const content = postTextInput.value.trim();
        const imageUrl = postImageInput.value.trim();

        if (!content) {
            alert("Bạn ơi, hãy nhập nội dung gì đó trước khi đăng nhé!");
            return;
        }

        const visibility = document.querySelector('input[name="post-visibility"]:checked')?.value || "public";

        const newPost = {
            content: content,
            image: imageUrl,
            createdAt: new Date().toISOString(),
            likes: 0,
            comments: [],
            name: loggedInUser.name || loggedInUser.email,
            userId: String(loggedInUser.id || ""),
            authorEmail: loggedInUser.email || "",
            avatar: loggedInUser.avatar || "./DIEU.png",
            visibility: visibility
        };

        try {
            btnSubmit.innerText = "Đang đăng...";
            btnSubmit.disabled = true;

            const response = await fetch(POSTS_API, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newPost)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Đăng bài không thành công.");

            postTextInput.value = "";
            postImageInput.value = "";
            btnSubmit.innerText = "Đăng";
            btnSubmit.disabled = false;
            
            closeModal();
            loadPosts(); 
        } catch (error) {
            alert(error.message || "Đăng bài không thành công, vui lòng kiểm tra kết nối mạng!");
            btnSubmit.innerText = "Đăng";
            btnSubmit.disabled = false;
        }
    });
}

// --- 4. CÁC HÀM XỬ LÝ TƯƠNG TÁC BÀI VIẾT ---
async function handleLike(button, postId, currentLikes) {
    if (!homeAccessEnabled) return;
    const liked = !button.classList.contains('liked');
    button.disabled = true;
    try {
        const response = await fetch(`${POSTS_API}/${encodeURIComponent(postId)}/like`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ liked })
        });
        if (!response.ok) throw new Error("Không thể cập nhật lượt thích.");
        await loadPosts();
    } catch (error) {
        console.error("Lỗi cập nhật lượt thích:", error);
        button.disabled = false;
    }
}

function toggleCommentBox(button) {
    const postCard = button.closest('.post-card');
    const commentSection = postCard.querySelector('.comment-section');
    if (commentSection.style.display === 'none') {
        commentSection.style.display = 'block';
        commentSection.querySelector('.comment-field').focus();
    } else {
        commentSection.style.display = 'none';
    }
}

async function submitComment(event, input, postId) {
    if (event.key === 'Enter' && input.value.trim() !== '') {
        if (!homeAccessEnabled) return;
        event.preventDefault();
        const content = input.value.trim();
        try {
            const response = await fetch(`${POSTS_API}/${encodeURIComponent(postId)}/comments`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Không thể gửi bình luận.");
            input.value = "";
            await loadPosts();
        } catch (error) {
            alert(error.message || "Không thể gửi bình luận.");
        }
    }
}

updateHomeAccess(null);
fetch("https://dieunw.onrender.com/api/auth/me", { credentials: "include" })
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
