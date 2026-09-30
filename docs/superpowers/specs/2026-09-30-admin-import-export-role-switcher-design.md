# Thiết kế: Nhập/xuất Excel ứng viên & nhân sự trên trang admin + đổi vai trò nhanh

Ngày: 2026-09-30 · Nhánh làm việc: `feat/configurable-org`

## 1. Mục tiêu

1. Admin **nhập** danh sách ứng viên từ Excel ngay trên web. Hiện tại chỉ làm được bằng CLI, trong khi `huong_dan_su_dung.md` lại mô tả một nút upload không có thật. Admin cũng **xuất** được danh sách ứng viên kèm tình trạng và kết quả.
2. Admin **nhập/xuất** danh sách nhân sự bằng Excel trên web, và chọn được vai trò khi thêm nhân sự bằng tay.
3. Một người có nhiều vai trò (ví dụ vừa phỏng vấn, vừa admin, vừa lễ tân) đổi vai trò nhanh bằng một thành phần dùng chung, thay cho 3 đoạn code copy-paste. Sau khi đăng nhập, người có từ 2 vai trò trở lên được chọn vai trò muốn vào.

Không nằm trong phạm vi: câu hỏi phỏng vấn theo đơn vị; tiêu chí chấm theo đơn vị; URL check-in riêng cho ứng viên; các vấn đề bảo mật đã biết (mật khẩu nhân sự dùng chung, CORS `*`, đoán MSSV để xem đơn); chấm chéo đơn vị (giữ nguyên).

## 2. Kiến trúc

Trình duyệt đọc file Excel bằng thư viện `xlsx` (đã có trong frontend vì dùng cho xuất kết quả) và gửi **các dòng dạng JSON** lên server. Server không nhận file, không cần multer.

Logic nhập hiện nằm trong 2 script CLI. Logic đó được tách ra thành module dùng chung:

- `backend/importers/candidates.js`
- `backend/importers/staff.js`

Mỗi module export:

- `plan(rows, options)`: kiểm tra và so sánh với DB, **không ghi**. Trả về `{ create: [...], update: [...], unchanged: n, skipped: [{ line, reason }], remove: [...] }`. Có lỗi chặn thì trả về `{ error, status }`.
- `apply(plan)`: ghi đúng những gì `plan` đã tính.

Script CLI `backend/scripts/import-candidates.js` và `import-staff.js` gọi lại các module này. Tham số dòng lệnh và kết quả in ra không đổi, trừ trường hợp `--replace` bị chặn (mục 3.1, 4.1).

`express.json` nâng giới hạn lên `5mb`, đủ cho vài nghìn dòng.

## 3. Ứng viên

### 3.1 Nhập — `POST /api/admin/import/candidates` (chỉ admin)

Body: `{ department, codeColumn?, rows, replace?: boolean, dryRun: boolean }`

- `department` phải là mã đơn vị trong config, nếu không thì trả 400. `codeColumn` mặc định là `config.candidate.codeLabel`. Nếu dòng đầu không có cột đó, trả 400 kèm danh sách cột.
- Chuẩn hoá giống CLI:
  - mã ứng viên được trim và viết hoa;
  - bỏ giá trị rỗng;
  - ngày chuyển sang ISO;
  - số điện thoại (`config.candidate.phoneFields`) bị Excel mất số 0 đầu thì được thêm lại;
  - nếu trùng mã, dòng sau thắng.
- Dòng không có mã sẽ vào `skipped` với lý do "thiếu <codeColumn>".
- **Gộp** theo khoá `(interviewCode, department)`. Ứng viên mới có `status: 'active'`. Ứng viên đã có chỉ được cập nhật `applicationData`. Trạng thái, giờ check-in, phòng/bàn **giữ nguyên**. Ứng viên có `applicationData` giống hệt thì tính vào `unchanged`.
- **Cột hệ thống** do file xuất sinh ra (mục 3.2) bị bỏ qua khi nhập lại. Nhờ vậy, file vừa xuất nhập lại ngay sẽ cho 0 thay đổi.
- `replace: true`: các ứng viên của đơn vị này không có trong file sẽ nằm trong `remove`. Nếu đơn vị có **bất kỳ** ứng viên nào đã check-in (status khác `active`) hoặc đã có phiếu chấm, server trả **409** và không ghi gì. CLI `--replace` áp dụng cùng quy tắc chặn này.
- `dryRun: true` chỉ trả về kết quả `plan`. `dryRun: false` thì chạy `plan` lại rồi `apply`, sau đó emit `board_update`.

### 3.2 Xuất — `GET /api/admin/export/candidates?department=` (chỉ admin)

Tham số `department` là tuỳ chọn; bỏ trống nghĩa là tất cả đơn vị. Server trả JSON `{ columns, rows }`, còn trình duyệt tạo file `.xlsx`.

Mỗi dòng gồm:

- cột mã (`codeLabel`), rồi toàn bộ cột trong `applicationData` theo thứ tự xuất hiện;
- sau đó là các cột hệ thống, gắn tiền tố `[HT]` để khi nhập lại nhận ra và bỏ qua: `[HT] Đơn vị`, `[HT] Trạng thái`, `[HT] Giờ check-in`, `[HT] Phòng`, `[HT] Bàn`, `[HT] Người phỏng vấn`, `[HT] Điểm TB`, `[HT] Kết quả`.

Tên file có dạng `ung-vien-<DEPT|tat-ca>-<yyyymmdd-hhmm>.xlsx`. Nút xuất kết quả hiện có (`AdminView.jsx`) giữ nguyên.

## 4. Nhân sự

### 4.1 Nhập — `POST /api/admin/import/staff` (chỉ admin)

Body: `{ rows, removeMissing?: boolean, dryRun: boolean }`. Các cột: `username`, `fullName`, `department`, `roles`, giống CLI.

- Kiểm tra từng dòng giống CLI:
  - đơn vị trống thì lấy đơn vị mặc định;
  - đơn vị hoặc vai trò không hợp lệ thì dòng đó vào `skipped` kèm lý do (CLI vẫn dừng hẳn như cũ);
  - `roles` trống thì mặc định là `interviewer`.
- Gộp theo `username`. Tài khoản đã có thì cập nhật `fullName`, `department` và `roles`. `role` đang dùng chỉ đổi khi không còn nằm trong `roles` mới; lúc đó lấy theo thứ tự admin > receptionist > interviewer. Bàn, phòng và trạng thái giữ nguyên.
- Admin đang đăng nhập **không thể tự mất vai trò admin**. Nếu dòng của chính họ bỏ `admin`, dòng đó vào `skipped`.
- `removeMissing: true`: những người không có trong file nằm trong `remove`, **trừ admin đang đăng nhập**. Nếu có người trong danh sách xoá đang `status: 'interviewing'`, server trả **409**. CLI `--replace` giữ nguyên hành vi cũ (xoá tất cả), vì đây là công cụ khởi tạo.
- `dryRun` hoạt động như mục 3.1. Khi ghi thật, server emit `staff_update`.

### 4.2 Xuất — `GET /api/admin/export/staff` (chỉ admin)

Trả về các dòng `{ username, fullName, department, roles: "admin,interviewer" }`, đúng định dạng file nhập. Nhờ vậy, xuất rồi nhập lại sẽ cho 0 thay đổi.

### 4.3 Thêm nhân sự bằng tay

Form thêm nhân sự có thêm ô chọn nhiều vai trò, mặc định là `interviewer`. `POST /api/users/add` nhận `roles` và kiểm tra theo `VALID_ROLES`.

## 5. Giao diện admin

Tab Ứng viên và tab Nhân sự mỗi tab có 2 nút: **Nhập Excel** và **Xuất Excel**.

Modal nhập (component `ImportModal` dùng chung, truyền cấu hình theo loại):

1. Chọn file (`.xlsx`, `.xls`, `.csv`), chọn sheet nếu file có nhiều sheet.
2. Với ứng viên: chọn đơn vị và cột mã (danh sách cột lấy từ file, mặc định là `codeLabel`), cùng ô "Xoá ứng viên của đơn vị không có trong file". Với nhân sự: ô "Xoá người không có trong file".
3. Bấm **Xem trước**. Server được gọi với `dryRun: true` và modal hiện số lượng Mới / Cập nhật / Không đổi / Bỏ qua (kèm dòng và lý do) / Sẽ xoá (kèm danh sách tên). Lỗi 409 hoặc 400 hiện ngay trong modal.
4. Bấm **Xác nhận** để gửi lại cùng dữ liệu với `dryRun: false`, rồi báo kết quả và tải lại danh sách.

Đổi file hoặc tuỳ chọn sẽ xoá phần xem trước, nên phải xem trước lại mới xác nhận được.

## 6. Đổi vai trò

### 6.1 Component `RoleSwitcher`

Component nằm ở `frontend/src/components/RoleSwitcher.jsx` và được dùng ở cả 3 trang: AdminView, InterviewerView, ReceptionistView. Code đổi vai trò đang copy-paste ở 3 trang sẽ bị xoá.

- Nó là một nút có menu, liệt kê các vai trò trong `user.roles` trừ vai trò đang dùng. Nếu không có vai trò nào khác thì không hiển thị.
- Chọn **interviewer** sẽ mở modal hỏi Phòng và Bàn (bắt buộc), điền sẵn giá trị lần trước từ `localStorage`.
- Gọi `POST /api/staff/switch-role`. Khi thành công, **lưu token mới** cùng `role`, `roomNumber`, `tableNumber` vào `localStorage`, rồi chuyển trang: `/interviewer`, `/admin` hoặc `/receptionist` (dùng đúng các route hiện có).
- Server trả lỗi thì hiện toast và giữ nguyên trang.

### 6.2 Thay đổi server ở `switch-role`

Khi rời vai trò interviewer để sang vai trò khác:

- Nếu `status` đang là `interviewing`, hoặc có ứng viên đang `moving`/`interviewing` ở bàn của họ, server trả **409** "Đang có ứng viên ở bàn, hãy hoàn tất trước khi đổi vai trò".
- Nếu không, server xoá `tableNumber`/`roomNumber`, đặt `status: 'active'`, rồi emit `staff_update` và `board_update`. Bàn trống sẽ không bị tự động xếp ứng viên nữa.

Khi chuyển sang interviewer, server **bắt buộc** có `tableNumber` và `roomNumber`, thiếu thì trả 400.

Quy tắc cũ "admin được đổi sang bất kỳ vai trò nào" giữ nguyên ở server. Riêng menu chỉ hiện các vai trò trong `roles`.

### 6.3 Chọn vai trò sau khi đăng nhập

Trong `Login.jsx`, nếu kết quả đăng nhập nhân sự có `roles.length >= 2`, trang hiện bước mới "Bạn muốn vào với vai trò nào?" với các nút cho từng vai trò; vai trò lần trước (`data.role`) được chọn sẵn.

- Chọn đúng vai trò hiện tại thì đi tiếp như cũ. Interviewer vẫn cần phòng/bàn thì sang bước 2.
- Chọn vai trò khác: nếu là interviewer thì sang bước 2 nhập phòng/bàn trước. Sau đó gọi `switch-role` bằng token vừa nhận, lưu token mới và chuyển trang.
- Người chỉ có 1 vai trò không thấy bước này.

## 7. Kiểm thử

Viết thêm E2E trong bộ test hiện có (node:test + mongodb-memory-server, gọi HTTP thật vào server):

- Nhập ứng viên:
  - dry-run không ghi gì;
  - ghi thật tạo và cập nhật đúng, giữ nguyên trạng thái của ứng viên đã check-in;
  - dòng thiếu mã bị bỏ qua;
  - cột sai trả 400;
  - `replace` trả 409 khi đơn vị đã có check-in hoặc phiếu chấm, và xoá đúng khi chưa có.
- Xuất ứng viên rồi nhập lại file đó: 0 mới, 0 cập nhật.
- Nhập nhân sự:
  - gộp đúng;
  - dòng sai vào `skipped`;
  - không tự bỏ quyền admin của mình;
  - `removeMissing` không xoá chính mình, trả 409 khi có người đang phỏng vấn;
  - xuất rồi nhập lại cho 0 thay đổi.
- Người không phải admin gọi các endpoint nhập/xuất: nhận 403.
- `users/add` có `roles`.
- Đổi vai trò:
  - tài khoản có 3 vai trò đổi qua lại được cả 3, và token mới mang đúng `role`;
  - dùng token mới gọi được API của vai trò đó;
  - rời vai trò interviewer thì bàn được giải phóng;
  - có ứng viên ở bàn thì trả 409;
  - sang interviewer mà thiếu bàn thì trả 400.
- CLI: 2 script vẫn chạy như cũ (test hiện có ở `10-import`), và `--replace` ứng viên bị chặn khi đã có check-in.

Giao diện được kiểm tra bằng tay trên trình duyệt với server local: nhập/xuất cả 2 loại, đăng nhập bằng tài khoản 3 vai trò rồi đổi vòng qua cả 3 trang.

Cuối cùng, sửa `huong_dan_su_dung.md` và `docs/deploy-oracle.md` (mục nhập dữ liệu) để mô tả nút nhập/xuất trên web.
