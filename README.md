# Hệ thống phỏng vấn tuyển thành viên

Hệ thống điều phối phỏng vấn gồm các màn hình: check-in ứng viên, lễ tân, người phỏng vấn, màn hình TV phòng chờ và trang quản trị.

Mỗi đơn vị chạy **một bản triển khai riêng** (một app Railway và một database MongoDB). Mọi thông tin riêng của đơn vị nằm trong `config/`, gồm tên, các ban, logo, tiêu chí chấm điểm và nhãn MSSV. Đơn vị không cần sửa code.

## Triển khai cho một đơn vị mới

1. **Fork hoặc copy repo** này.
2. **Sửa `config/org.config.json`.** Bắt đầu từ file [`config/org.config.example.json`](config/org.config.example.json), rồi đặt ảnh vào `config/assets/`. Trong config, ảnh được tham chiếu bằng đường dẫn `/org-assets/<tên-file>`.
3. **Commit** thư mục `config/`. Railway build từ git nên config phải nằm trong repo.
4. **Tạo database MongoDB** riêng, ví dụ trên MongoDB Atlas.
5. **Tạo project Railway** trỏ tới repo. `railway.toml` đã có sẵn. Build command là `npm run build`.
6. **Đặt biến môi trường** trên Railway (xem bảng bên dưới).
7. **Import nhân sự và ứng viên** (xem mục *Import dữ liệu*).

### Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `MONGODB_URI` | ✅ | Chuỗi kết nối MongoDB. Mỗi đơn vị dùng một database riêng. |
| `JWT_SECRET` | ✅ | Chuỗi ngẫu nhiên dài, tạo bằng `openssl rand -hex 32`. Nếu không đặt, mỗi lần server khởi động lại thì mọi người đều bị đăng xuất. |
| `STAFF_PASSWORD` | ✅ | Mật khẩu chung cho tài khoản nhân sự. Trên production, nếu không đặt thì nhân sự không đăng nhập được. |
| `ADMIN_CLEAN_PASSWORD` | Khuyến nghị | Mật khẩu xác nhận cho nút "Làm sạch dữ liệu" của admin. Nếu không đặt thì chức năng này bị tắt. |
| `ORG_CONFIG` | Không | Đường dẫn tới file config khác, thay cho `config/org.config.json`. |
| `ORG_ASSETS_DIR` | Không | Thư mục ảnh khác, thay cho `config/assets/`. |

Khi chạy local, copy `backend/.env.example` thành `backend/.env`. Không commit file `.env`.

## Cấu hình `org.config.json`

| Khoá | Ý nghĩa |
|---|---|
| `appTitle` | Tiêu đề tab trình duyệt và tiêu đề trang. |
| `systemName` | Tên hệ thống hiển thị ở trang quản trị. |
| `branding.favicon`, `branding.background` | Favicon và ảnh nền. |
| `branding.qrImage` | Mã QR hiển thị trên TV phòng chờ. Để trống nếu không dùng. |
| `branding.decorations` | Tối đa 12 ảnh trang trí ở trang đăng nhập. Có thể để `[]`. |
| `footer` | Tiêu đề, logo (có link) và dòng credits ở chân trang. |
| `candidate.codeLabel` | Tên mã ứng viên, ví dụ `MSSV`. Đây cũng là tên cột mặc định khi import. |
| `candidate.nameFields`, `candidate.phoneFields` | Tên các cột trong file Excel chứa họ tên và số điện thoại. Hệ thống lấy cột đầu tiên có dữ liệu. |
| `candidate.hiddenFields` | Các cột trong đơn đăng ký không hiển thị cho người phỏng vấn. |
| `departments[]` | Các ban tuyển. Mỗi ban có các khoá sau:<br>• `code`: mã, không đổi sau khi đã có dữ liệu<br>• `shortName`, `name`<br>• `titleImage`: không bắt buộc<br>• `tvTitleScale`<br>• `theme`: một trong `blue`, `emerald`, `purple`, `rose`, `amber`, `cyan` |
| `evaluation.criteria[]` | Tiêu chí chấm điểm. Mỗi tiêu chí có `key`, `label`, `shortLabel`, `min`, `max`, `default`. Điểm trung bình được tính trên các tiêu chí này. |
| `evaluation.results[]` | Các kết quả có thể chọn. Mỗi kết quả có `value` và `tone` (`success`, `danger` hoặc `warning`). |
| `waitWarningMinutes` | Số phút chờ; ứng viên chờ lâu hơn mức này sẽ được đánh dấu cảnh báo. |

Server kiểm tra config khi khởi động. Nếu config sai (thiếu ban, trùng mã, JSON lỗi), server báo lỗi và dừng.

## Import dữ liệu

Chạy trong thư mục `backend/`, với `MONGODB_URI` trỏ tới database của đơn vị. Để chạy trên database của Railway, đặt biến này trong `.env` hoặc dùng `railway run`.

**Nhân sự.** File Excel cần các cột sau:
- `username`: bắt buộc
- `fullName`
- `department`: mã ban trong config
- `roles`: các vai trò cách nhau bằng dấu phẩy, gồm `admin`, `interviewer`, `receptionist`

```bash
npm run import:staff -- nhan_su.xlsx
```

**Ứng viên.** Import từng ban một. Dùng file export từ Google Forms hoặc Microsoft Forms. Toàn bộ các cột được lưu làm đơn đăng ký.

```bash
npm run import:candidates -- don_ban_a.xlsx --department BAN_A --code-column "MSSV"
```

- `--code-column`: tên cột chứa mã ứng viên. Mặc định là `candidate.codeLabel`.
- `--sheet <tên>`: chọn sheet. Mặc định là sheet đầu tiên.
- `--replace`: xoá ứng viên cũ của ban trước khi import. Nếu không có tuỳ chọn này, script cập nhật đơn của ứng viên đã tồn tại và giữ nguyên trạng thái phỏng vấn của họ.

## Chạy local

```bash
npm run build
cd backend && npm start
```

Sau đó mở http://localhost:5000. Khi `NODE_ENV` không phải `production`, mật khẩu nhân sự mặc định là `Abc@123`.
