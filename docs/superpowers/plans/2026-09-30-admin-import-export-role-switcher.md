# Nhập/xuất Excel trên trang admin + đổi vai trò nhanh — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin nhập/xuất ứng viên và nhân sự bằng Excel ngay trên web (có xem trước). Người nhiều vai trò đổi vai trò bằng một component dùng chung và được chọn vai trò khi đăng nhập.

**Architecture:** Trình duyệt đọc Excel bằng `xlsx`, gửi các dòng JSON lên `POST /api/admin/import/*` kèm `dryRun`. Logic nhập được tách khỏi 2 script CLI vào `backend/importers/{candidates,staff}.js` (`plan` + `apply`); cả CLI lẫn endpoint cùng dùng. Xuất: server trả JSON, trình duyệt tạo `.xlsx`. `RoleSwitcher` thay 3 đoạn code copy-paste; `switch-role` giải phóng bàn khi rời vai trò interviewer.

**Tech Stack:** Node 24, Express 5, Mongoose 9, React 19, Vite, Tailwind v4, `xlsx`; test bằng node:test + mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-09-30-admin-import-export-role-switcher-design.md`

## Global Constraints

- Bộ test E2E nằm **ngoài repo**: `$SCR/e2e`, với `SCR=/tmp/claude-1000/-home-duongpt-code-k71-interview-system/eba1b906-c7ee-4c91-a6cf-a122eef60bbd/scratchpad`. Chạy bằng `cd $SCR/e2e && node --test --test-concurrency=1 <file>`. Helper nằm ở `helpers.js`: `startMongo`, `startServer`, `api`, `seedStaff`, `seedCandidates`, `login`, `db`, `runScript`, `writeXlsx`, `tmpFile`, `STAFF_ROWS`, `D0`, `D1`, `orgCfg`.
- Toàn bộ suite phải xanh sau mỗi task: `cd $SCR/e2e && node --test --test-concurrency=1 > $SCR/e2e-run.log 2>&1; tail -15 $SCR/e2e-run.log`. Hiện có 81 test (71 server + 10 deploy-scripts).
- Script CLI giữ nguyên tham số và các thông báo đang được test assert: `unknown department`, `unknown role`, `not found`, `Column ... not found`.
- Cột hệ thống khi xuất ứng viên có tiền tố `[HT] ` với đúng các tên: `[HT] Đơn vị`, `[HT] Trạng thái`, `[HT] Giờ check-in`, `[HT] Phòng`, `[HT] Bàn`, `[HT] Người phỏng vấn`, `[HT] Điểm TB`, `[HT] Kết quả`. Khi nhập, mọi cột bắt đầu bằng `[HT] ` đều bị bỏ qua.
- Thứ tự ưu tiên vai trò: admin > receptionist > interviewer. Tài khoản đã có chỉ đổi `role` khi `role` hiện tại không còn nằm trong `roles` mới.
- `express.json({ limit: '5mb' })`.
- Chữ trên giao diện viết bằng tiếng Việt, theo phong cách các nút hiện có trong `AdminView.jsx`.
- Commit bằng `git -c user.name=duongpt -c user.email=instructor@qnet.edu.vn commit`. Message kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Không push.

## Review Focus

1. **Excel trả về số hoặc ngày thay vì chuỗi.** Ví dụ MSSV `20231234` là số, username là số. Chúng phải được `String()` và trim giống CLI. Nếu không, xuất rồi nhập lại sẽ ra "cập nhật" giả. Test round-trip ở Task 2 và 3 bắt lỗi này.
2. **`dryRun` rồi mới xác nhận, nhưng DB thay đổi ở giữa** (ví dụ ứng viên check-in trong lúc đó). Lần ghi phải tính lại `plan` và kiểm tra lại điều kiện 409, không được dùng kết quả xem trước. Task 2 có test cho trường hợp check-in xảy ra sau dry-run.
3. **`rows` không phải mảng, hoặc mảng rỗng.** Server phải trả 400, không được 500. Task 2 và 3 có test.
4. **Đổi vai trò khi token cũ vẫn còn trong localStorage.** Nếu không lưu token mới, `requireStaff` vẫn cho qua vì nó kiểm tra roles trong DB, nhưng `role` trong token sai sẽ làm socket và UI hiểu sai. Kiểm tra bằng tay ở Task 6.
5. **Admin nhập file nhân sự có dòng của chính mình với `roles=interviewer`.** Dòng đó phải vào `skipped`, admin vẫn giữ quyền. Task 3 có test.

---

### Task 1: Tách module nhập ứng viên + chặn `--replace`

**Files:**
- Create: `backend/importers/candidates.js`
- Modify: `backend/scripts/import-candidates.js` (thay thân vòng lặp và phần ghi bằng module)
- Test: `$SCR/e2e/10-import.test.js` (thêm test)

**Interfaces:**
- Produces:
  - `normalizeRows(rows, codeColumn) -> { byCode: Map<code, applicationData>, skipped: [{line, reason}] }`
  - `async plan({ department, codeColumn, rows, replace }) -> { error?, status?, create: [{interviewCode, applicationData}], update: [...same], unchanged: number, skipped: [{line, reason}], remove: [interviewCode] }`
  - `async apply(department, plan) -> { created, updated, removed }`
  - `SYSTEM_PREFIX = '[HT] '`
  - Mã lỗi: department sai → 400; thiếu cột mã → 400, message chứa `Column "<c>" not found. Columns: ...`; replace bị chặn → 409.

- [ ] **Step 1: Viết test lỗi** trong `10-import.test.js`:
  - `import-candidates --replace refuses when department has check-ins`: seed `A1`, `A2` vào D0; dùng `d.col('candidates').updateOne({interviewCode:'A1'},{$set:{status:'waiting'}})`; chạy lại với file chỉ có `A3` và `--replace` → `code === 1`, stderr khớp `/checked in|đã check-in/i`, số ứng viên D0 vẫn là 2.
  - `import-candidates ignores [HT] columns`: nhập 1 dòng `{[CODE]:'B1', [NAME]:'X', '[HT] Trạng thái':'completed'}` → `applicationData` không có key `'[HT] Trạng thái'`, status là `active`.
- [ ] **Step 2: Chạy** `node --test 10-import.test.js`. Kỳ vọng: 2 test mới FAIL (replace vẫn xoá; cột HT vẫn được lưu).
- [ ] **Step 3: Viết `backend/importers/candidates.js`.**
  - Chuẩn hoá như CLI hiện tại, bỏ thêm key bắt đầu bằng `SYSTEM_PREFIX`. Ô chỉ có một số cũng được `String()`.
  - `plan` đọc ứng viên hiện có của department bằng `Candidate.find({department}).lean()`. So sánh `applicationData` bằng JSON của các key đã sắp xếp để xếp vào `update` hoặc `unchanged`.
  - Khi `replace`: `remove` là các mã có trong DB mà không có trong file. Trả 409 nếu `Candidate.exists({department, status: {$ne: 'active'}})` hoặc `Evaluation.exists({department})`. Message: `Đơn vị <D> đã có ứng viên check-in hoặc đã chấm — không thể thay toàn bộ danh sách (already checked in)`.
  - `apply` dùng lại `updateOne` upsert như CLI, cộng thêm `deleteMany({department, interviewCode: {$in: remove}})`.
- [ ] **Step 4: Sửa CLI.** CLI vẫn tự đọc file và sheet, sau đó gọi `plan` rồi `apply`. Nếu `plan.error` thì in ra stderr và exit 1. Dòng in kết quả giữ nguyên dạng `<D>: X created, Y updated, Z rows skipped (empty <col>).`; `updated` bao gồm cả `unchanged`.
- [ ] **Step 5: Chạy** `node --test 10-import.test.js`, rồi chạy cả suite. Kỳ vọng: tất cả PASS.
- [ ] **Step 6: Commit** `refactor(import): candidate importer module; --replace refuses once interviews started`.

### Task 2: Endpoint nhập/xuất ứng viên

**Files:**
- Modify: `backend/server.js` (thêm `limit: '5mb'` cho json; thêm 2 route dưới `/api/admin`, đặt gần các route users)
- Test: `$SCR/e2e/60-candidates-io.test.js` (mới; before/after theo mẫu `40-admin.test.js`)

**Interfaces:**
- Consumes: `plan` và `apply` từ Task 1.
- Produces:
  - `POST /api/admin/import/candidates` với body `{department, codeColumn?, rows, replace?, dryRun}`. `dryRun` trả `200 {success:true, dryRun:true, create:n, update:n, unchanged:n, skipped:[...], remove:[codes], preview:{create:[codes], update:[codes]}}`. Ghi thật trả `200 {success:true, created, updated, removed, skipped}`. Lỗi trả `{success:false, message}` kèm mã 400/409.
  - `GET /api/admin/export/candidates?department=` trả `{columns: string[], rows: object[]}`.

- [ ] **Step 1: Viết test lỗi** trong `60-candidates-io.test.js`:
  - `dry-run reports and writes nothing`: seed A1 (D0); gửi rows A1 (đổi tên) + A2 + dòng thiếu mã → `create 1, update 1, skipped.length 1`; DB vẫn chỉ có 1 ứng viên D0.
  - `apply creates/updates and keeps status`: đặt A1 `status:'waiting'`; ghi thật → A2 được tạo, A1 có tên mới và status vẫn `waiting`; nhận được `board_update` qua `connectSocket` + `waitFor`.
  - `400 on bad department, missing code column, rows not array, empty rows`.
  - `replace 409 when a candidate checked in; after dry-run too`: dry-run replace → 200; sau đó đặt một ứng viên thành `waiting`; ghi thật replace → 409, không xoá gì.
  - `replace removes missing when nobody started`: ở D1 sạch, seed X1, X2; replace với chỉ X1 → `removed 1`.
  - `export → re-import is a no-op`: đặt số cho MSSV bằng cách seed qua CLI với giá trị kiểu số; tạo phiếu chấm cho A1 bằng `POST /api/evaluation` với token int1, theo mẫu `30-flow`. Export D0: `columns` chứa `CODE` và 8 cột `[HT] …`; dòng A1 có `[HT] Điểm TB` và `[HT] Người phỏng vấn`. Nhập lại chính `rows` đó dạng dry-run → `create 0, update 0`.
  - `non-admin gets 403`: token rec1 gọi cả 2 route.
- [ ] **Step 2: Chạy** file đó. Kỳ vọng: FAIL với 404 ở các route mới.
- [ ] **Step 3: Viết 2 route.**
  - Import: kiểm tra `Array.isArray(rows) && rows.length`; gọi `plan`; nếu không phải `dryRun` thì gọi `apply` rồi `io.emit('board_update')`.
  - Export: lấy ứng viên (lọc theo department nếu có), `Evaluation` của các mã đó (lấy phiếu mới nhất theo `createdAt`), và map `User` để lấy tên người phỏng vấn. Cột = `codeLabel` + các key `applicationData` theo thứ tự xuất hiện đầu tiên (bỏ key trùng `codeLabel`) + 8 cột `[HT]`. Giờ check-in: bỏ trống nếu null hoặc epoch 0, còn lại dùng ISO.
- [ ] **Step 4: Chạy** file mới, rồi chạy cả suite. Kỳ vọng: PASS.
- [ ] **Step 5: Commit** `feat(admin): candidate import (dry-run) and export endpoints`.

### Task 3: Module nhập nhân sự + endpoint nhập/xuất

**Files:**
- Create: `backend/importers/staff.js`
- Modify: `backend/scripts/import-staff.js`, `backend/server.js`; sửa `users/add` để `role` lấy theo thứ tự ưu tiên thay cho `roles[0]`
- Test: `$SCR/e2e/65-staff-io.test.js` (mới)

**Interfaces:**
- Produces:
  - `VALID_ROLES`, `ROLE_PRIORITY = ['admin','receptionist','interviewer']`, `pickRole(roles, current?) -> string`.
  - `async plan({ rows, removeMissing, actor, strict }) -> { error?, status?, create, update, unchanged, skipped, remove: [username] }`. `actor` là username của admin đang gọi; CLI truyền `null`. `strict: true` (CLI) sẽ ném lỗi ở dòng sai đầu tiên, giữ thông báo `Line N: unknown department|unknown role ...`. `strict: false` (web) thì đưa dòng sai vào `skipped`.
  - `async apply(plan) -> { created, updated, removed }`.
  - `POST /api/admin/import/staff` với body `{rows, removeMissing?, dryRun}`, phản hồi cùng dạng với Task 2. Ghi thật thì emit `staff_update`.
  - `GET /api/admin/export/staff` trả `{columns:['username','fullName','department','roles'], rows}`, trong đó `roles` là chuỗi ngăn cách bằng dấu phẩy.
  - CLI `--replace` vẫn `deleteMany({})` rồi mới chạy plan/apply như cũ.

- [ ] **Step 1: Viết test lỗi** trong `65-staff-io.test.js` (seed bằng `h.seedStaff`, đăng nhập admin1):
  - `dry-run merge`: rows gồm `int1` (đổi fullName), `new9` và một dòng có role `boss` → `create 1, update 1, skipped[0].reason` khớp `/boss/`; DB không đổi.
  - `apply keeps active role when still granted`: int1 có `roles` `interviewer,receptionist` → `role` vẫn là `interviewer`; rec1 có `roles` `interviewer` → `role` thành `interviewer`.
  - `admin cannot drop own admin`: dòng admin1 với `roles=interviewer` → nằm trong `skipped`; trong DB admin1 vẫn có `admin`.
  - `removeMissing never removes self; 409 if interviewing`: đặt int2 `status:'interviewing'`; file không có int2 → 409. Đặt lại int2 về `active` → `remove` chứa int2 và rec1 nhưng không có admin1.
  - `export → re-import no-op`: export → nhập lại `rows` dạng dry-run → `create 0, update 0`.
  - `400 rows not array; 403 for rec1`.
  - `users/add with roles [interviewer, receptionist] → role receptionist`.
- [ ] **Step 2: Chạy** file đó. Kỳ vọng: FAIL (404 / role sai).
- [ ] **Step 3: Viết module, sửa CLI (`strict: true`), thêm route, sửa `users/add`.** `unchanged` nghĩa là `fullName`, `department` và `roles` đều bằng nhau (so `roles` theo thứ tự).
- [ ] **Step 4: Chạy** file mới, `10-import`, `40-admin`, rồi cả suite. Kỳ vọng: PASS.
- [ ] **Step 5: Commit** `feat(admin): staff import (dry-run) and export; shared staff importer`.

### Task 4: `switch-role` giải phóng bàn

**Files:**
- Modify: `backend/server.js:673-697`
- Test: `$SCR/e2e/70-role-switch.test.js` (mới)

**Interfaces:**
- Produces: `POST /api/staff/switch-role {targetRole, tableNumber?, roomNumber?}`.
  - Thiếu bàn hoặc phòng khi `targetRole === 'interviewer'` → 400.
  - Rời vai trò interviewer (`user.role === 'interviewer'` và target khác): nếu `status === 'interviewing'` hoặc có ứng viên `moving`/`interviewing` tại (bàn, phòng, department) của họ → 409 `Đang có ứng viên ở bàn, hãy hoàn tất trước khi đổi vai trò`. Nếu không: `tableNumber = roomNumber = null`, `status = 'active'`.
  - Luôn emit `staff_update` và `board_update`.
  - Phản hồi như cũ `{success, role, tableNumber, roomNumber, token}`.

- [ ] **Step 1: Viết test lỗi:**
  - Seed thêm `multi` với `roles` `admin,interviewer,receptionist`, qua `h.runScript('import-staff.js', …)`.
  - `cycles through all 3 roles`: đăng nhập, rồi `switch-role` lần lượt sang interviewer (bàn 1, phòng 101) → receptionist → admin → interviewer. Mỗi lần giải mã payload của token mới (`JSON.parse(Buffer.from(tok.split('.')[1],'base64url'))`) và so `role` với vai trò đích. Sau mỗi lần gọi thêm một API của vai trò đó, kỳ vọng 200: `GET /api/users` cho admin; `POST /api/staff/status {status:'active'}` cho interviewer.
  - `leaving interviewer frees the table`: sau khi sang receptionist, DB có `tableNumber null`, `roomNumber null`, `status 'active'`.
  - `409 while a candidate is at the table`: multi làm interviewer ở bàn 1, phòng 101; đặt một ứng viên D0 `status:'moving', assignedTable:'1', assignedRoom:'101'` (department theo multi) → sang admin trả 409, bàn vẫn giữ nguyên.
  - `400 to interviewer without table`.
- [ ] **Step 2: Chạy.** Kỳ vọng: FAIL ở phần giải phóng bàn, 409 và 400.
- [ ] **Step 3: Sửa route.**
- [ ] **Step 4: Chạy** file mới, rồi cả suite. Kỳ vọng: PASS.
- [ ] **Step 5: Commit** `feat(staff): switch-role frees the table and refuses mid-interview`.

### Task 5: Giao diện nhập/xuất trên AdminView

**Files:**
- Create: `frontend/src/components/ImportModal.jsx`, `frontend/src/lib/excel.js`
- Modify: `frontend/src/pages/AdminView.jsx` (tab `users` ~705, tab `candidates` ~736, form thêm nhân sự ~214)

**Interfaces:**
- Consumes: các route của Task 2 và 3.
- Produces:
  - `excel.js`:
    - `readWorkbook(file) -> Promise<{ sheetNames, rowsOf(name) -> object[] }>` (dùng `XLSX.read` + `sheet_to_json({defval:''})`);
    - `downloadXlsx(filename, columns, rows)` (dùng `json_to_sheet` với `header: columns`);
    - `stamp() -> 'yyyymmdd-hhmm'`.
  - `<ImportModal kind="candidates"|"staff" open onClose onDone departments codeLabel />`.

- [ ] **Step 1: Viết `excel.js` và `ImportModal`** theo spec mục 5:
  - chọn file → chọn sheet (chỉ hiện khi có từ 2 sheet trở lên);
  - với ứng viên: chọn đơn vị và cột mã (từ `Object.keys(rows[0])`, mặc định là `codeLabel`), và checkbox "Xoá ứng viên của đơn vị không có trong file";
  - với nhân sự: checkbox "Xoá người không có trong file";
  - bấm **Xem trước** → POST `dryRun:true` → hiện các số đếm, bảng Bỏ qua (dòng, lý do) và danh sách Sẽ xoá;
  - bấm **Xác nhận** (chỉ bật khi đã có kết quả xem trước) → POST `dryRun:false` → `toast.success` → `onDone()`;
  - đổi file, sheet, đơn vị, cột hoặc checkbox thì xoá kết quả xem trước;
  - lỗi từ server hiện trong modal.
- [ ] **Step 2: Nối vào AdminView:**
  - Nút **Nhập Excel** và **Xuất Excel** ở cả 2 tab.
  - Xuất ứng viên dùng đơn vị đang xem ở tab (nếu có bộ lọc thì theo bộ lọc, không thì lấy tất cả), tên file `ung-vien-<DEPT|tat-ca>-<stamp>.xlsx`.
  - Xuất nhân sự: `nhan-su-<stamp>.xlsx`.
  - Form thêm nhân sự có 3 checkbox vai trò (mặc định interviewer) và gửi `roles`.
  - `onDone` tải lại danh sách tương ứng.
- [ ] **Step 3: Build** `cd frontend && npm run build`. Kỳ vọng: build thành công, không có lỗi.
- [ ] **Step 4: Kiểm tra bằng tay trên trình duyệt.**
  - Chạy mongodb-memory-server bằng script tạm ở `$SCR`, sau đó chạy `backend/server.js` với `frontend/dist`, rồi mở bằng `preview_start`. Seed dữ liệu bằng `seedStaff` và `seedCandidates`.
  - Nhập file ứng viên mẫu → xem trước → xác nhận → danh sách được cập nhật. Xuất → mở file bằng `xlsx` trong node và kiểm tra có đủ cột `[HT]`.
  - Làm tương tự cho nhân sự, kể cả trường hợp 409 khi chọn xoá.
  - Thêm nhân sự với 2 vai trò.
- [ ] **Step 5: Chạy cả suite** (server không đổi, nhưng suite phải vẫn xanh), rồi commit `feat(admin-ui): Excel import with preview and export for candidates and staff`.

### Task 6: `RoleSwitcher` + chọn vai trò khi đăng nhập

**Files:**
- Create: `frontend/src/components/RoleSwitcher.jsx`, `frontend/src/lib/switchRole.js`
- Modify: `frontend/src/pages/AdminView.jsx` (xoá `performSwitchToRole`, `handleSwitchToInterviewer`, modal phòng/bàn và các nút đổi vai trò ~22-60, 108-140, 537-546), `InterviewerView.jsx` (~303-312 và hàm tương ứng), `ReceptionistView.jsx` (~225-234 và hàm tương ứng), `Login.jsx`

**Interfaces:**
- Produces:
  - `switchRole(targetRole, {roomNumber, tableNumber}?) -> Promise<{ok:true, path} | {ok:false, message}>`. Hàm POST `/api/staff/switch-role`; khi thành công thì cập nhật `localStorage.user` (`token`, `role`, `roomNumber`, `tableNumber`), lưu `lastRoomNumber` và `lastTableNumber`, và trả `path` theo map `{admin:'/admin', interviewer:'/interviewer', receptionist:'/receptionist'}`.
  - `<RoleSwitcher />`: đọc user từ localStorage; chỉ render khi có ít nhất 1 vai trò khác trong `roles`. Nhãn: Admin / Người phỏng vấn / Lễ tân. Chọn interviewer thì mở modal phòng/bàn (bắt buộc, điền sẵn từ `lastRoomNumber`/`lastTableNumber`). Thành công thì `navigate(path)`; thất bại thì `toast.error(message)`.

- [ ] **Step 1: Viết `switchRole.js` và `RoleSwitcher.jsx`.**
- [ ] **Step 2: Thay code ở 3 trang** bằng `<RoleSwitcher />`, đặt đúng vị trí các nút cũ. Xoá state và hàm không còn dùng; `npm run build` không được báo import thừa gây lỗi.
- [ ] **Step 3: Sửa `Login.jsx`.** Thêm bước `1.9` "Bạn muốn vào với vai trò nào?", hiện khi `data.roles?.length >= 2`, với vai trò `data.role` được chọn sẵn.
  - Cùng vai trò: đi tiếp theo luồng hiện tại.
  - Vai trò khác là interviewer: chuyển sang step 2 để nhập phòng/bàn, rồi gọi `switchRole` (token vừa lưu).
  - Vai trò khác không phải interviewer: lưu user với token vừa nhận, gọi `switchRole`, rồi chuyển trang.
- [ ] **Step 4: Build.** Kỳ vọng: build thành công.
- [ ] **Step 5: Kiểm tra bằng tay** với server local của Task 5, dùng tài khoản `multi` có 3 vai trò:
  - đăng nhập → thấy màn chọn vai trò;
  - chọn Lễ tân → vào `/receptionist` → đổi sang Người phỏng vấn (nhập phòng/bàn) → `/interviewer` → đổi sang Admin → `/admin`;
  - sau mỗi lần đổi, dùng `javascript_tool` kiểm tra `role` trong payload của `JSON.parse(localStorage.user).token` khớp với trang;
  - tài khoản chỉ có 1 vai trò (`int1`) không thấy màn chọn và không thấy menu;
  - console không có lỗi.
- [ ] **Step 6: Chạy cả suite**, rồi commit `feat(ui): shared RoleSwitcher and role picker after login`.

### Task 7: Tài liệu

**Files:**
- Modify: `huong_dan_su_dung.md` (phần upload ứng viên và nhân sự), `docs/deploy-oracle.md` (mục 5, nhập dữ liệu), `README.md` nếu có nhắc tới việc nhập

- [ ] **Step 1: Viết tài liệu.**
  - Mô tả nút Nhập/Xuất Excel, bước xem trước, 2 ô "Xoá … không có trong file" cùng các trường hợp bị chặn, cột `[HT]`, và cách đổi vai trò.
  - Ghi rằng CLI vẫn dùng được cho lần khởi tạo, và `--replace` của ứng viên bị chặn khi đã có check-in.
- [ ] **Step 2:** `grep -n "upload\|Upload\|tải lên" huong_dan_su_dung.md` để chắc không còn mô tả sai.
- [ ] **Step 3: Commit** `docs: web import/export and role switching`.
