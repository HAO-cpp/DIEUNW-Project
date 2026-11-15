Link gửi mail: https://dashboard.emailjs.com/admin
Link API: https://mockapi.io/projects/6af30641d2377d6c370469d8 
10/11/2026: Hoàn thành trang chủ và API. Còn đang fix bug lỗi không gửi OTP xác nhận tài khoản và chưa làm xong trang html "tài khoản".
Mail mẫu: k18th.hao2802@nqd.edu.vn
11/11/2026: Đã hoàn thành xong trang cá nhân, phòng tự học, học nhóm, trò chuyện. Còn đang fix bug lỗi không gửi OTP xác nhận tài khoản và có ý tưởng là thêm phần nhập xác nhận lại mật khẩu ở phần đăng kí tài khoản và ẩn hoặc hiển thị mật khẩu ở đăng nhập và đăng kí.

**Cách xóa dữ liệu database:**
1. Dừng server bằng Ctrl+C, rồi đóng các kết nối SQLite đang mở bằng .quit.
2. Tại thư mục dự án, chuyển database cũ ra Desktop để giữ bản sao: mv data/dieunw.sqlite "$HOME/Desktop/dieunw-backup-truoc-demo.sqlite"
3. Chạy lại: npm start

-> Ứng dụng sẽ tự tạo database trống khi khởi động, theo cấu hình trong server.js:401. Không có key cần nhập. Khi khởi động, mã nguồn tự thêm địa chỉ email quản trị mặc định vào danh sách admin; tài khoản quản trị sẽ được tạo khi địa chỉ đó đăng ký (server.js:196).

-> Lưu ý: nội dung học tập và phòng công khai dùng MockAPI nên thao tác này không xóa dữ liệu ở MockAPI. Nếu host đã đặt DATABASE_PATH, phải sao lưu và thay database tại đường dẫn đó thay vì dieunw.sqlite. Chưa có dữ liệu nào được reset.

Post id: 192.168.1.18

HOST=0.0.0.0 PORT=4174 npm start

Lấy IP: ipconfig getifaddr en0

Cú pháp: http://<địa-chỉ-vừa-lấy>:4174