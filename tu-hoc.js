document.addEventListener("DOMContentLoaded", () => {
    // 1. KHAI BÁO BIẾN ĐỒNG HỒ POMODORO
    let timerInterval = null;
    let timeLeft = 25 * 60; // Mặc định 25 phút (tính bằng giây)
    let currentMode = "focus";
    let completedSessions = parseInt(localStorage.getItem("dieunw_study_sessions")) || 0;

    const timerDisplay = document.getElementById("timer-display");
    const timerStatus = document.getElementById("timer-status-text");
    const streakBadge = document.getElementById("study-streak-badge");
    const btnStart = document.getElementById("btn-start-timer");
    const btnPause = document.getElementById("btn-pause-timer");
    const btnReset = document.getElementById("btn-reset-timer");
    const modeButtons = document.querySelectorAll(".mode-btn");

    // Hiển thị số phiên học đã hoàn thành từ trước
    streakBadge.innerText = `Đã hoàn thành: ${completedSessions} phiên`;

    // Hàm cập nhật hiển thị phút:giây lên màn hình và tiêu đề tab trình duyệt
    function updateTimerUI() {
        const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
        const seconds = (timeLeft % 60).toString().padStart(2, "0");
        const formattedTime = `${minutes}:${seconds}`;
        
        timerDisplay.innerText = formattedTime;
        document.title = `(${formattedTime}) Phòng Tự Học - DIEUNW`;
    }

    // Chuyển đổi chế độ (25p / 5p / 15p)
    modeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            clearInterval(timerInterval);
            timerInterval = null;
            
            modeButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const mins = parseInt(btn.getAttribute("data-time"));
            currentMode = btn.getAttribute("data-mode");
            timeLeft = mins * 60;

            btnStart.style.display = "inline-block";
            btnPause.style.display = "none";
            timerStatus.innerText = currentMode === "focus" ? "Sẵn sàng tập trung cao độ!" : "Thời gian thư giãn nghỉ ngơi!";
            updateTimerUI();
        });
    });

    // Bắt đầu đếm ngược
    btnStart.addEventListener("click", () => {
        if (timerInterval) return;

        btnStart.style.display = "none";
        btnPause.style.display = "inline-block";
        timerStatus.innerText = currentMode === "focus" ? "Đang trong giờ học tập trung..." : "Đang nghỉ ngơi...";

        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerUI();
            } else {
                clearInterval(timerInterval);
                timerInterval = null;
                handleTimerComplete();
            }
        }, 1000);
    });

    // Tạm dừng đồng hồ
    btnPause.addEventListener("click", () => {
        clearInterval(timerInterval);
        timerInterval = null;
        btnStart.style.display = "inline-block";
        btnPause.style.display = "none";
        timerStatus.innerText = "Đã tạm dừng đồng hồ.";
    });

    // Đặt lại thời gian ban đầu
    btnReset.addEventListener("click", () => {
        clearInterval(timerInterval);
        timerInterval = null;
        const activeBtn = document.querySelector(".mode-btn.active");
        timeLeft = parseInt(activeBtn.getAttribute("data-time")) * 60;
        
        btnStart.style.display = "inline-block";
        btnPause.style.display = "none";
        timerStatus.innerText = "Đã đặt lại thời gian.";
        updateTimerUI();
    });

    // Xử lý khi hết giờ
    function handleTimerComplete() {
        // Phát tiếng chuông báo hiệu nhẹ bằng Web Audio API (không cần file mp3 ngoài)
        playBellSound();

        if (currentMode === "focus") {
            completedSessions++;
            localStorage.setItem("dieunw_study_sessions", completedSessions);
            streakBadge.innerText = `Đã hoàn thành: ${completedSessions} phiên`;
            alert("Chúc mừng bạn đã hoàn thành 1 phiên tập trung 25 phút! Hãy nghỉ ngơi 5 phút nhé.");
        } else {
            alert("Hết giờ nghỉ ngơi rồi! Quay lại bàn học thôi nào!!!");
        }

        btnStart.style.display = "inline-block";
        btnPause.style.display = "none";
        timerStatus.innerText = "Hoàn thành phiên!";
    }

    function playBellSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime); // Nốt La cao
            osc.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) {}
    }
    
    // 2. XỬ LÝ ĐỔI CHỦ ĐỀ MÀU NỀN & TỰ CHỌN ÂM THANH NỀN
    const themeSelector = document.getElementById("theme-selector");
    const audioPlayer = document.getElementById("bg-audio-player");
    const customAudioInput = document.getElementById("custom-audio-upload");
    const audioFileName = document.getElementById("audio-file-name");
    const btnToggleAudio = document.getElementById("btn-toggle-audio");
    const audioVolume = document.getElementById("audio-volume");

    // Đổi màu nền
    themeSelector.addEventListener("change", (e) => {
        document.body.className = "";
        if (e.target.value !== "default") {
            document.body.classList.add(`theme-${e.target.value}`);
        }
    });

    // Xử lý khi người dùng chọn file nhạc từ máy
    customAudioInput.addEventListener("change", (e) => {
        const file = e.target.files[0]; // Lấy file đầu tiên được chọn
        if (file) {
            // Tạo link tạm từ file trên máy và phát nhạc
            const fileURL = URL.createObjectURL(file);
            audioPlayer.src = fileURL;
            audioPlayer.volume = audioVolume.value;
            audioPlayer.play();

            // Cập nhật tên file và hiện nút điều khiển
            audioFileName.innerText = `🎶 Đang phát: ${file.name}`;
            btnToggleAudio.style.display = "inline-block";
            btnToggleAudio.innerText = "⏸";
            audioVolume.style.display = "inline-block";
        }
    });

    // Nút Tạm dừng / Tiếp tục phát nhạc
    btnToggleAudio.addEventListener("click", () => {
        if (audioPlayer.paused) {
            audioPlayer.play();
            btnToggleAudio.innerText = "⏸";
        } else {
            audioPlayer.pause();
            btnToggleAudio.innerText = "▶";
        }
    });

    // Thanh kéo điều chỉnh âm lượng
    audioVolume.addEventListener("input", (e) => {
        audioPlayer.volume = e.target.value;
    });

    // 3. XỬ LÝ DANH SÁCH VIỆC CẦN LÀM (TO-DO LIST)
    const todoInput = document.getElementById("todo-input");
    const btnAddTodo = document.getElementById("btn-add-todo");
    const todoList = document.getElementById("todo-list");

    let tasks = JSON.parse(localStorage.getItem("dieunw_study_tasks")) || [];

    function renderTasks() {
        todoList.innerHTML = "";
        tasks.forEach((task, index) => {
            const li = document.createElement("li");
            li.className = `todo-item ${task.done ? "completed" : ""}`;
            li.innerHTML = `
                <span style="cursor:pointer;" onclick="toggleTask(${index})">${task.done ? "-" : "⬜"} ${task.text}</span>
                <div class="todo-actions">
                    <button onclick="deleteTask(${index})" title="Xóa">🗑️</button>
                </div>
            `;
            todoList.appendChild(li);
        });
    }

    function addTask() {
        const text = todoInput.value.trim();
        if (!text) return;
        tasks.push({ text, done: false });
        localStorage.setItem("dieunw_study_tasks", JSON.stringify(tasks));
        todoInput.value = "";
        renderTasks();
    }

    btnAddTodo.addEventListener("click", addTask);
    todoInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") addTask();
    });

    window.toggleTask = (index) => {
        tasks[index].done = !tasks[index].done;
        localStorage.setItem("dieunw_study_tasks", JSON.stringify(tasks));
        renderTasks();
    };

    window.deleteTask = (index) => {
        tasks.splice(index, 1);
        localStorage.setItem("dieunw_study_tasks", JSON.stringify(tasks));
        renderTasks();
    };

    renderTasks();
});
