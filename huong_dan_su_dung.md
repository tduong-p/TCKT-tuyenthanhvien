# HƯỚNG DẪN SỬ DỤNG HỆ THỐNG PHỎNG VẤN

**Liên chi Đoàn khoa Ngoại ngữ** · Tuyển nhân sự 2026–2027

Tài liệu này cung cấp hướng dẫn chi tiết về cách vận hành hệ thống điều phối phỏng vấn dành cho tất cả các vai trò: **Quản trị viên (Admin)**, **Lễ tân (Receptionist)**, **Người phỏng vấn (Interviewer)** và **Ứng viên (Candidate)**.

---

## 1. Vai trò Quản trị viên (Admin)

Admin có toàn quyền quản lý hệ thống, từ nhân sự, danh sách ứng viên đến kết quả phỏng vấn.
*Truy cập bằng tài khoản có quyền admin. Giao diện tại: `/admin`*

### 1.1. Quản lý Nhân sự (Người phỏng vấn / Lễ tân)
- **Thêm nhân sự:** Điền `Tài khoản (để login)` (thường là mã sinh viên của nhân sự), `Họ và Tên`, chọn `Ban` và đánh dấu các vai trò (Phỏng vấn / Lễ tân / Admin). Sau đó nhấn **Thêm**.
- **Nhập nhân sự từ Excel:** Ở tab nhân sự, bấm **Nhập Excel** và chọn file có các cột `username`, `fullName`, `department`, `roles` (vd: `admin,interviewer`; để trống thì là người phỏng vấn). Bấm **Xem trước** để xem số người mới, cập nhật, không đổi và các dòng bị bỏ qua kèm lý do; chưa có gì được ghi cho tới khi bấm **Xác nhận**. Đổi file hay tuỳ chọn thì phải xem trước lại.
  - Ô **Xoá người không có trong file** xoá các tài khoản vắng mặt trong file (trừ chính bạn). Hệ thống từ chối nếu một trong số đó đang phỏng vấn. Bạn cũng không thể tự bỏ quyền admin của mình qua file.
- **Xuất nhân sự:** Bấm **Xuất Excel** ở tab nhân sự để tải danh sách đúng định dạng trên. Sửa file đó rồi nhập lại là cách nhanh để cập nhật hàng loạt.
- **Cấp / Thu hồi quyền:** Trong danh sách nhân sự, bạn có thể click vào các nút trạng thái (Quản trị, Lễ tân, Phỏng vấn) bên cạnh tên mỗi người để bật/tắt quyền tương ứng. Nút hiện màu xanh là đã cấp quyền, màu xám là chưa có.
- **Xóa nhân sự:** Nhấn biểu tượng thùng rác màu đỏ để xóa tài khoản nhân sự (hành động này cần xác nhận).

### 1.2. Quản lý Ứng viên
- **Nhập ứng viên từ Excel:** Ở tab ứng viên, bấm **Nhập Excel**, chọn file (export từ Google Forms / Microsoft Forms), chọn sheet, **Ban** và **Cột mã ứng viên** (mặc định là cột MSSV). Bấm **Xem trước** để xem số ứng viên mới, cập nhật, không đổi và các dòng bị bỏ qua (vd: thiếu MSSV), rồi bấm **Xác nhận**. Ứng viên đã có chỉ được cập nhật đơn; trạng thái phỏng vấn giữ nguyên.
  - Ô **Xoá ứng viên của ban này không có trong file** thay toàn bộ danh sách của ban. Hệ thống từ chối nếu ban đó đã có ứng viên check-in hoặc đã được chấm.
- **Xuất ứng viên:** Bấm **Xuất Excel** ở tab ứng viên để tải danh sách của ban đang xem: toàn bộ cột đơn đăng ký, cộng các cột bắt đầu bằng `[HT]` (trạng thái, giờ check-in, phòng, bàn, người phỏng vấn, điểm, kết quả). Khi nhập lại file này, các cột `[HT]` được bỏ qua.
- **Thêm ứng viên thủ công:** Điền mã ứng viên (MSSV) và họ tên rồi ấn **Thêm**.
- **Xóa toàn bộ dữ liệu:** Nhấn nút **Xóa/Làm sạch** để reset toàn bộ hệ thống (xóa hết kết quả đánh giá, reset trạng thái ứng viên về ban đầu). Yêu cầu nhập mật khẩu bảo mật (Password làm sạch).

### 1.3. Theo dõi Bảng điều khiển (Dashboard)
- Admin có thể theo dõi tiến độ tổng quan: số lượng người đang chờ, đang phỏng vấn, đã xong.
- **Đổi vai trò:** Người được cấp từ 2 vai trò trở lên sẽ được hỏi *"Bạn muốn vào với vai trò nào?"* ngay sau khi đăng nhập. Sau đó có thể đổi bất cứ lúc nào bằng menu **Đổi vai trò** trên thanh công cụ (có ở cả trang Admin, Lễ tân và Người phỏng vấn). Chọn Người phỏng vấn thì phải nhập số phòng và số bàn. Rời vai trò Người phỏng vấn sẽ giải phóng bàn; hệ thống không cho đổi khi đang có ứng viên ở bàn — hãy hoàn tất phỏng vấn trước.

### 1.4. Xem Báo cáo & Đánh giá
- **Xuất Excel:** Bấm nút **Xuất Excel** để tải báo cáo kết quả phỏng vấn chi tiết (điểm từng tiêu chí, nhận xét, quyết định) về máy tính.
- **Xem chi tiết:** Chọn bất kỳ ứng viên nào đã phỏng vấn xong để đọc lại bình luận và điểm số của người phỏng vấn.

---

## 2. Vai trò Lễ tân (Receptionist)

Lễ tân là người bao quát tình hình tại khu vực chờ, hỗ trợ ứng viên check-in và điều phối hiển thị màn hình TV.
*Truy cập bằng tài khoản có quyền lễ tân. Giao diện tại: `/receptionist`*

### 2.1. Quản lý Màn hình TV
- Nhấn nút **Mở màn hình TV** để bật giao diện bảng hàng chờ lớn (Dashboard).
- Giao diện này dùng để trình chiếu lên màn hình lớn/máy chiếu ở khu vực chờ để ứng viên tự theo dõi số thứ tự và trạng thái của mình: ai **Đang gọi** (vào phòng/bàn nào) và danh sách **Sắp đến lượt**.
- Phía trên màn hình TV có **mã QR**. Ứng viên quét mã bằng điện thoại để mở trang web hệ thống, đăng nhập bằng MSSV và tự check-in, xem thứ tự của mình.

### 2.2. Hỗ trợ Check-in hộ
Nếu ứng viên không mang điện thoại hoặc không tự truy cập web được:
1. Nhấn nút **Check-in Hộ**.
2. Nhập chính xác **MSSV** (Mã sinh viên) của ứng viên. Gõ chữ thường cũng được, hệ thống tự đổi sang chữ hoa.
3. Bấm **Check-in**. Hệ thống đối chiếu MSSV với danh sách ứng viên. Nếu có, ứng viên được đưa vào hàng chờ (thông báo *"Thành công!"*). Nếu không có, hệ thống báo **Lỗi**, hãy kiểm tra lại MSSV hoặc nhờ Admin thêm ứng viên.

---

## 3. Vai trò Người phỏng vấn (Interviewer)

Đây là chức năng dành cho các thành viên trực tiếp tham gia phỏng vấn tại các bàn.
*Truy cập bằng tài khoản có quyền phỏng vấn. Giao diện tại: `/interviewer`*

### 3.1. Thiết lập vị trí
- Ngay khi đăng nhập, hệ thống sẽ yêu cầu bạn nhập **Số Phòng** và **Số Bàn**. 
- Hãy nhập chính xác vì đây là vị trí mà hệ thống sẽ chỉ đường cho ứng viên tìm đến bạn.
- **Hai máy cùng một bàn** (ví dụ một máy chấm điểm, một máy xem hồ sơ): đăng nhập cả hai máy với cùng số phòng và số bàn, dùng chung một tài khoản hoặc hai tài khoản khác nhau. Hai máy thấy cùng một ứng viên, gọi hay huỷ ở máy nào cũng cập nhật sang máy kia.
  - Khi vào một bàn đã có người, hệ thống báo *"Bàn này đã có: …"*, và thanh tiêu đề hiện dòng **Cùng bàn: …**.
  - Mỗi ứng viên chỉ được chấm **một lần**: máy gửi sau sẽ nhận thông báo *"Ứng viên đã được chấm bởi …"*. Máy còn lại được báo *"… đã được chấm trên máy khác cùng bàn"* thay vì form tự biến mất.
  - Chỉ chấm được ứng viên đang ở đúng bàn của mình.
  - Một người **Rời bàn** hoặc đổi vai trò trong khi người kia vẫn ngồi thì ứng viên vẫn ở lại bàn; chỉ khi người cuối cùng rời bàn thì ứng viên mới được trả về hàng chờ.

### 3.2. Gọi ứng viên
Người phỏng vấn tự gọi ứng viên, hệ thống không tự đưa ứng viên vào bàn. Khi bàn trống, màn hình hiện **Bàn đang trống**:

- Bấm **Xem hàng chờ chung (N)** để xem danh sách ứng viên đang chờ (xếp theo thứ tự check-in).
- Bấm **GỌI** cạnh ứng viên muốn gọi. Nên gọi theo thứ tự từ trên xuống để ứng viên đến trước được phỏng vấn trước.

### 3.3. Quy trình một phiên phỏng vấn
1. **Chờ ứng viên di chuyển:** Sau khi được gọi, trạng thái ứng viên chuyển thành "Đang di chuyển". 
2. **Xác nhận có mặt:** Khi ứng viên đã bước tới bàn, hãy bấm nút **XÁC NHẬN ĐÃ CÓ MẶT**.
3. **Tiến hành phỏng vấn:** Màn hình sẽ hiện **Thông tin Ứng viên** (các câu trả lời trong đơn đăng ký) và Form Đánh giá. Form chỉ hiện sau khi đã xác nhận có mặt.
4. **Đánh giá:**

    - Kéo thanh điểm (1-10) cho 3 tiêu chí: *Thái độ & Tác phong*, *Kỹ năng chuyên môn*, *Xử lý tình huống*.
    - Nhập **Nhận xét chi tiết** vào khung chữ.
    - Chọn một trong ba quyết định: **Đạt**, **Cân nhắc thêm**, hoặc **Không đạt**.

5. **Hoàn tất:** Bấm **HOÀN TẤT & LƯU**. Ứng viên này kết thúc; bàn trống lại và bạn gọi ứng viên tiếp theo.

### 3.4. Các chức năng hỗ trợ khác
- **Tạm nghỉ:** Bấm **Tạm Nghỉ** trên thanh tiêu đề. Màn hình hiện *"Bàn đang đóng"* và hệ thống không gọi thêm ứng viên cho bạn. Bấm **Quay lại Bàn** để mở lại.
- **Rời bàn:** Bấm **Rời Bàn** rồi xác nhận **Rời đi**. Khi đăng nhập lại bạn phải nhập lại số phòng và số bàn.
- **Hủy lượt:** Nếu ứng viên được gọi mà không tới bàn, bấm **Hủy lượt & Đưa về hàng chờ** rồi xác nhận **Huỷ lượt** để trả họ về hàng chờ, giải phóng bàn.
- **Kênh Chat:** Sử dụng hộp Chat ở góc dưới bên phải để liên lạc nhanh với Admin, Lễ tân và các bàn phỏng vấn khác.

---

## 4. Vai trò Ứng viên (Candidate)

Ứng viên tự truy cập vào hệ thống bằng điện thoại cá nhân.
*Giao diện tại trang chủ hệ thống (Mặc định).*

### 4.1. Đăng nhập và Check-in
1. Ứng viên truy cập trang web hệ thống (hoặc quét mã QR trên màn hình TV).
2. Nhập **MSSV** của mình rồi bấm **TIẾP TỤC**.
3. Kiểm tra màn hình **Xác nhận thông tin** (MSSV, họ và tên, ban ứng tuyển) rồi bấm **Xác nhận**. Sai thông tin thì bấm **Nhập lại**.
4. Bấm nút **XÁC NHẬN CHECK-IN** trên màn hình để báo danh.

### 4.2. Theo dõi trạng thái
- Màn hình điện thoại hiện **Đang chờ** cùng **Thứ tự của bạn** trong hàng chờ.
- Ứng viên có thể cất điện thoại hoặc nhìn lên màn hình TV lớn.

### 4.3. Di chuyển đến bàn
- Khi đến lượt, điện thoại **phát chuông báo**, nền màn hình **nháy đỏ** và hiện **ĐẾN LƯỢT BẠN!** kèm **Phòng** và **Bàn số** cần đến.
- Ứng viên bấm **TÔI ĐÃ NHẬN THÔNG TIN** để báo đã thấy thông báo, rồi di chuyển tới bàn.
- Khi người phỏng vấn xác nhận có mặt, điện thoại chuyển sang **ĐANG PHỎNG VẤN** kèm lời chúc. Phỏng vấn xong, điện thoại hiện **HOÀN TẤT**: ứng viên có thể ra về.
- Ứng viên cần **giữ trang web mở** trong lúc chờ. Trên một số điện thoại (nhất là iPhone), trình duyệt có thể chặn chuông, nên hãy nhắc ứng viên để ý cả màn hình điện thoại và màn hình TV.

---

## 5. Lưu ý chung
- Hệ thống hoạt động theo thời gian thực (Real-time). Mọi thao tác check-in, chấm điểm, gọi người đều lập tức hiển thị cho tất cả mọi người (không cần phải tải lại trang/F5).
- Trong trường hợp mạng chập chờn, nếu thấy dữ liệu không khớp, chỉ cần F5 (làm mới) lại trình duyệt web.
- Vui lòng phân công 1 người trực tài khoản Admin để có thể xử lý các sự cố khẩn cấp (như việc nhầm lẫn MSSV) qua tính năng thêm/xóa ứng viên.
