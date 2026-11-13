# HƯỚNG DẪN SỬ DỤNG MÃ NGUỒN DIEUNW

## Chạy trên máy cá nhân

Cần Node.js phiên bản 22.13 trở lên. Backend sử dụng module SQLite có sẵn trong Node.js nên không cần chạy `npm install`.

```sh
npm start
```

Mở `http://127.0.0.1:4173` trên trình duyệt. SQLite sẽ tạo file `data/dieunw.sqlite` trong lần chạy đầu tiên. Hãy sao lưu file này nếu muốn giữ lại tài khoản, bài viết, danh sách bạn bè và tin nhắn riêng.

## Xác minh email

Khi đăng ký hoặc khôi phục mật khẩu, hệ thống gửi mã OTP qua dịch vụ EmailJS hiện có. Có thể cấu hình lại các giá trị sau bằng biến môi trường:

- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`
- `EMAILJS_PUBLIC_KEY`

Trong môi trường phát triển trên máy cá nhân, nếu gửi email thất bại, API sẽ trả mã OTP chỉ dùng cho môi trường phát triển. Không chạy với `NODE_ENV=production` khi chưa cấu hình EmailJS. Ở môi trường production, API không trả mã OTP.

Khi triển khai qua HTTPS, đặt `COOKIE_SECURE=1`. Giữ kín file cơ sở dữ liệu SQLite và các bản sao lưu.

## Chạy kiểm thử

```sh
npm test
```

Các tài nguyên học tập và phòng học/trò chuyện công khai vẫn sử dụng MockAPI. Tài khoản, phiên đăng nhập, danh sách bạn bè, bài viết và cuộc trò chuyện riêng được lưu trong SQLite của ứng dụng.

## Quản trị viên và câu lạc bộ

Tài khoản `k18th.hao2802@nqd.edu.vn` được thiết lập làm quản trị viên khi server khởi động. Các tài khoản đã tồn tại sẽ được cập nhật tự động. Nếu địa chỉ email này đăng ký sau, tài khoản sẽ nhận quyền quản trị ngay khi đăng ký. Quản trị viên có thể thêm địa chỉ email của trường tại trang hồ sơ, kể cả địa chỉ chưa đăng ký.

Thành viên đã đăng nhập có thể gửi yêu cầu tạo trang câu lạc bộ tại mục **CLB**. Người được chọn làm quản lý phải có tài khoản DIEUNW. Quản trị viên sẽ duyệt hoặc từ chối yêu cầu. Quản lý câu lạc bộ đã được duyệt sẽ có nhãn chức vụ theo màu câu lạc bộ trên hồ sơ và có thể đăng bài trong mục **Thông báo**. Thông tin câu lạc bộ, quyết định duyệt, email quản trị viên và thông báo được lưu trong SQLite.