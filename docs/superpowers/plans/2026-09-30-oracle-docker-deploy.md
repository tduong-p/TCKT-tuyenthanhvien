# E2E tests + Oracle VM Docker deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chạy test E2E cho các luồng cần DB và sửa bug tìm được. Sau đó đóng gói app thành image Docker chạy trên Oracle VM (compose gồm app và mongo, nằm gọn trong `/opt/interview`), tự deploy khi push lên nhánh `fofl`.

**Architecture:**
- **Test.** Harness chạy bằng `node --test`, đặt trong scratchpad (không đưa vào repo). Harness khởi động `backend/server.js` như tiến trình con, dùng mongod từ `mongodb-memory-server`, rồi gọi HTTP và socket như client thật.
- **Image.** Build multi-stage, cho ra image `node:20-slim` với cấu hình được đóng sẵn vào image.
- **Chạy trên VM.** `deploy/compose.yml` gồm 2 service là app và `mongo:8`. nginx trên host proxy vào app ở `127.0.0.1:5000`.
- **CI.** GitHub Actions trên runner ARM native: build, smoke test, rồi push lên GHCR. Riêng khi push lên nhánh `fofl` thì chạy thêm bước SSH vào VM để `compose up --wait`.

**Tech Stack:** Node 20, Express 5, Mongoose 9, Socket.io 4, Vite 8, Docker/Compose v5, GitHub Actions (`ubuntu-24.04-arm`), GHCR, nginx + certbot, `mongo:8`.

**Spec:** `docs/superpowers/specs/2026-09-30-oracle-docker-deploy-design.md`

## Global Constraints

- Harness E2E nằm ở `$SCRATCH/e2e`, với `$SCRATCH=/tmp/claude-1000/-home-duongpt-code-k71-interview-system/eba1b906-c7ee-4c91-a6cf-a122eef60bbd/scratchpad`. **Không** sửa `package.json` hay `package-lock.json` của dự án chỉ để phục vụ việc test.
- Commit bằng `git -c user.name=duongpt -c user.email=instructor@qnet.edu.vn commit`. Cuối message thêm dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Image: `ghcr.io/phamvietbach2006-max/k71-interview-system`, chỉ build arm64, có 2 tag là `:<git sha>` và `:fofl`.
- Domain: `fofl-k71-phongvan.duckdns.org`. App lắng nghe ở `127.0.0.1:5000`. Compose project tên `interview`, thư mục trên VM là `/opt/interview`.
- Giới hạn tài nguyên: mongo dùng `mem_limit: 768m` và `--wiredTigerCacheSizeGB 0.25`; app dùng `mem_limit: 384m`.
- VM có dự án ultimate-tckt đang chạy production. **Không** đụng vào `/opt/ultimate-tckt`, `/opt/infra`, container, site nginx hay chứng chỉ của dự án đó. **Không** chạy `docker image prune` hay `docker system prune` trên toàn máy.
- Mọi lệnh làm thay đổi VM (Task 10–11), mọi lần `git push`, và việc điền GitHub secrets đều phải **hỏi người dùng trước**, mỗi hành động hỏi riêng.
- Secret chỉ sinh ra trên VM, hoặc do người dùng tự dán vào GitHub. Không đưa secret vào chat hay commit vào repo.

## Review Focus

1. **Mất kết nối Mongo lúc đang chạy.** Healthcheck phải chuyển sang unhealthy (503), không được tiếp tục báo 200. Test nằm ở Task 3.
2. **Chấm điểm cho ứng viên không tồn tại, hoặc thuộc ban khác.** Hiện tại server vẫn lưu Evaluation mồ côi. Kỳ vọng: trả 404 và không lưu gì. Việc chặn chấm điểm ứng viên ban khác cần người dùng quyết định (xem Task 5). Test nằm ở Task 5.
3. **Body của `/api/login` thiếu `code`.** Hiện tại `code.replace` gây lỗi 500. Kỳ vọng: trả 400. Test nằm ở Task 3.
4. **Socket ẩn danh, hoặc ứng viên A gửi `candidate_checkin` với mã của B.** Kỳ vọng: không có gì thay đổi. Test nằm ở Task 4.
5. **Import lại file ứng viên sau khi đã có người check-in.** Kỳ vọng: giữ nguyên `status` và chỉ cập nhật `applicationData`. Test nằm ở Task 2.

---

### Task 1: Dựng harness E2E

**Files:**
- Create: `$SCRATCH/e2e/package.json`, `$SCRATCH/e2e/helpers.js`, `$SCRATCH/e2e/00-smoke.test.js`

**Interfaces:**
- Produces (`helpers.js`, CommonJS):
  - `REPO = '/home/duongpt/code/k71-interview-system'`, `STAFF_PASSWORD = 'Test@Staff1'`, `CLEAN_PASSWORD = 'Test@Clean1'`
  - `async startMongo(): Promise<{ uri: string, stop(): Promise<void> }>`: dùng `MongoMemoryServer.create()`. Mỗi file test dùng một DB riêng, tên là `uri + dbName`.
  - `async startServer({ mongoUri, env? }): Promise<{ base: string, port: number, stop(): Promise<void>, logs(): string }>`: spawn `node backend/server.js` với `cwd=REPO`, `PORT` là một cổng ngẫu nhiên còn trống, `NODE_ENV=production`, `JWT_SECRET='e2e-secret'`, `STAFF_PASSWORD`, `ADMIN_CLEAN_PASSWORD=CLEAN_PASSWORD`, `MONGODB_URI=mongoUri`. Hàm chờ tới khi log có dòng `MongoDB connected` và `GET /api/public/config` trả 200 (timeout 20 giây).
  - `async api(base, method, path, { token?, body? }): Promise<{ status: number, body: any }>`: gọi `fetch`, parse JSON nếu content-type là JSON.
  - `async runScript(script, args, mongoUri): Promise<{ code: number, stdout: string, stderr: string }>`: chạy `node backend/scripts/<script>` với `cwd=REPO/backend`, truyền `MONGODB_URI`.
  - `writeXlsx(file, rows: object[], sheetName = 'Sheet1')`: dùng package `xlsx` trong harness.
  - `async seedStaff(mongoUri, file)`: chạy `import-staff.js` với fixture `STAFF_ROWS`.
  - `STAFF_ROWS`: các user `admin1` (roles `admin`, ban `D0`), `rec1` (roles `receptionist`, ban `D0`), `int1` (roles `interviewer`, ban `D0`), `int2` (roles `interviewer`, ban `D1`). Trong đó `D0` và `D1` là `code` của 2 ban đầu tiên trong `config/org.config.json`, đọc bằng `require(REPO+'/backend/config').departmentCodes`.
  - `async login(base, username, extra = {}): Promise<string>`: trả về token, và assert `status === 200`.
  - `connectSocket(base, token?): Promise<Socket>`: dùng `socket.io-client`. `waitFor(socket, event, ms=5000): Promise<any>`.

- [ ] **Step 1:** Trong `$SCRATCH/e2e`, chạy `npm init -y && npm i mongodb-memory-server@10 socket.io-client@4 xlsx@0.18.5`. Kết quả mong đợi: cài xong, `git -C $REPO status` vẫn sạch.
- [ ] **Step 2:** Viết `helpers.js` theo đúng các interface ở trên.
- [ ] **Step 3:** Viết `00-smoke.test.js` gồm:
  - `server boots against memory mongo`: kiểm tra `/api/public/config` trả 200, và `body.departments.length >= 2` (nếu config chỉ có 1 ban thì chỉ cần `>= 1`, và bỏ qua các test cần tới `D1`).
  - `/api/users without token → 401`.
- [ ] **Step 4:** Chạy `cd $SCRATCH/e2e && node --test --test-concurrency=1`. Kết quả mong đợi: 2 test pass. Lần chạy đầu sẽ tải binary mongod.

### Task 2: Test 2 script import

**Files:** Create `$SCRATCH/e2e/10-import.test.js`

**Interfaces:** Consumes `startMongo`, `runScript`, `writeXlsx`, `STAFF_ROWS` từ Task 1. Assert trực tiếp bằng `mongoose` từ `REPO/backend/node_modules` (`require(REPO+'/backend/node_modules/mongoose')`).

- [ ] **Step 1:** Viết các test sau:
  - `import-staff creates users with highest-priority role`: `admin1` có `role==='admin'`; user có roles `interviewer,receptionist` có `role==='receptionist'`; `status==='active'` (mặc định khi upsert).
  - `import-staff rejects unknown department`: exit code 1, stderr có `unknown department`, và DB không có user nào được thêm.
  - `import-staff rejects unknown role`: exit code 1, stderr có `unknown role`.
  - `import-candidates upserts, keeps status` (Review Focus 5): import 2 dòng. Đặt `status='waiting'` cho một ứng viên, rồi import lại với `applicationData` đã đổi. Kết quả: `status` vẫn là `'waiting'`, `applicationData` là bản mới.
  - `import-candidates uppercases code, last row wins, skips empty code`: stdout có `1 rows skipped`.
  - `import-candidates --code-column + --replace`: trước khi import chỉ xoá ứng viên của đúng ban đó, ứng viên của ban khác vẫn còn.
  - `import-candidates pads phone leading 0`: một cột trong `phoneFields` có giá trị `912345678` thì được lưu thành `'0912345678'`.
  - `import-candidates unknown department / missing column`: exit code 1, thông báo lỗi rõ ràng.
- [ ] **Step 2:** Chạy `node --test 10-import.test.js`. Test nào fail thì chuyển bug đó sang Task 5.

### Task 3: Đăng nhập, phân quyền, health endpoint

**Files:**
- Create `$SCRATCH/e2e/20-auth.test.js`
- Modify `backend/server.js`: thêm route health cạnh `/api/public/config` (dòng 87), thêm vào whitelist của `authMiddleware` (dòng 45); sửa `/api/login` (dòng 225)

**Interfaces:** Produces `GET /api/public/health` với response `200 {ok:true}` hoặc `503 {ok:false}`. Task 6 và Task 8 dùng route này.

- [ ] **Step 1:** Viết test (phải thấy fail trước):
  - `health 200 when db connected`.
  - `health 503 after mongo stops` (Review Focus 1): gọi `mongo.stop()`, sau đó poll tối đa 15 giây cho tới khi nhận `503`.
  - `login without code → 400` (Review Focus 3).
- [ ] **Step 2:** Chạy test. Kết quả mong đợi: cả 3 fail (route health chưa có nên trả HTML của SPA hoặc 401; login trả 500).
- [ ] **Step 3:** Cài đặt route `app.get('/api/public/health', …)` dựa trên `mongoose.connection.readyState === 1`, và thêm `'/public/health'` vào whitelist. Trong `/api/login`, nếu `typeof code !== 'string' || !code.trim()` thì trả `400 {success:false, message:'Thiếu mã đăng nhập'}`.
- [ ] **Step 4:** Chạy lại test. Kết quả mong đợi: PASS.
- [ ] **Step 5:** Viết các test cho hành vi hiện có (kỳ vọng pass ngay):
  - Staff đăng nhập không kèm password thì nhận `requirePassword:true`. Sai mật khẩu thì 401. Username không phân biệt hoa thường (`ADMIN1` vẫn đăng nhập được). Đăng nhập lại với `STAFF_PASSWORD` rỗng trong môi trường production thì 503 (khởi động thêm một server với `env:{STAFF_PASSWORD:''}`).
  - Ứng viên đăng nhập được bằng mã viết thường. Ứng viên thuộc 2 ban thì nhận `requireDepartment`. Ứng viên đã xong hết thì nhận `candidate_completed`.
  - **Ma trận phân quyền** (dạng bảng, dùng vòng lặp): mỗi hàng là `[method, path, body, allowedRoles]`, cột là token của `admin1`, `rec1`, `int1`, của ứng viên, và không có token. Không token thì 401, token ứng viên thì 403, staff sai vai trò thì 403, đúng vai trò thì khác 401 và khác 403. Các route cần có: `GET /api/candidates` (receptionist), `POST /api/candidates/checkin` (receptionist), `POST /api/candidates/add` (receptionist), `POST /api/evaluation` (interviewer), `POST /api/interviewer/call` (interviewer), `GET /api/evaluations` (admin), `GET /api/users` (admin), `POST /api/users/add` (admin), `DELETE /api/users/x` (admin), `POST /api/candidates/reset-checkin` (admin), `POST /api/admin/clean-data` (admin), `GET /api/staff` (mọi staff), `GET /api/messages` (mọi staff).
  - `token bị sửa (đổi ký tự cuối) → 401`. User bị xoá sau khi đã có token thì 401.
  - `switch-role`: `int1` không đổi được sang `admin` (403); `admin1` đổi được sang `interviewer`.
- [ ] **Step 6:** Chạy toàn bộ harness. Kết quả mong đợi: pass hết, trừ các test đã chuyển sang Task 5.
- [ ] **Step 7:** Commit phần sửa `backend/server.js` với message `fix: add /api/public/health and reject login without code`.

### Task 4: Luồng phỏng vấn, socket, chấm điểm, dữ liệu xuất Excel

**Files:** Create `$SCRATCH/e2e/30-flow.test.js`

**Interfaces:** Consumes các hàm helper của Task 1. Config chấm điểm đọc từ `require(REPO+'/backend/config').config.evaluation`.

- [ ] **Step 1:** Viết test cho luồng chính, chạy tuần tự trong một `describe`:
  1. Lễ tân check-in ứng viên `C1` (ban `D0`): status chuyển thành `waiting`. Check-in lần 2 thì 400. Mã không tồn tại thì 404.
  2. Một socket ẩn danh (giả làm TV) nhận được `board_update` sau khi check-in.
  3. `int1` đăng nhập với `roomNumber:'P1', tableNumber:'1'`, rồi gọi `POST /api/interviewer/call {interviewCode:'C1'}`: trả 200. Socket ẩn danh nhận `candidate_assigned`, trong đó `roomNumber==='P1'`. Gọi thêm một ứng viên khác trong khi bàn đang bận thì 400.
  4. `int2` (ban `D1`) gọi `C1` thì 400, vì ứng viên không thuộc ban của `int2`.
  5. Socket của `int1` gửi `interviewer_confirm_presence {interviewCode:'C1', department:D0}`: status chuyển thành `interviewing`.
  6. Chấm điểm: tạo `scores` với mọi tiêu chí bằng `default`, rồi `POST /api/evaluation` với `result` = `results[0].value`. Kết quả 200; `averageScore` bằng trung bình các `default`, làm tròn 1 chữ số thập phân; ứng viên chuyển `completed`; `int1` có `status==='active'`.
  7. Validate điểm: một tiêu chí có điểm `max+1` thì 400; thiếu một tiêu chí thì 400; `result:'XYZ'` thì 400. Sau các lần này, số Evaluation trong DB không tăng.
  8. `GET /api/evaluations` bằng token `admin1`: mỗi phần tử có `interviewCode`, `department`, `scores[] {key,label,score}`, `averageScore`, `result`, `notes`, `candidateName`, `interviewerName`. So danh sách trường với những trường mà `frontend/src/pages/AdminView.jsx` đọc khi xuất Excel (tìm bằng `grep -n "XLSX\|json_to_sheet" -A30`), và mỗi trường được đọc phải có mặt.
  9. `GET /api/board`: gọi ẩn danh thì `applicationData` chỉ còn các trường tên (không có SĐT); gọi bằng token staff thì có đủ.
- [ ] **Step 2:** Viết test cho socket (Review Focus 4):
  - Socket ẩn danh gửi `candidate_checkin {interviewCode:'C2'}`: sau 500ms, `C2` vẫn là `active`.
  - Socket của ứng viên `C3` gửi `candidate_checkin {interviewCode:'C2'}`: `C2` vẫn là `active`. Gửi với mã của chính mình (`C3`) thì status chuyển thành `waiting`.
  - Socket ẩn danh gửi `interviewer_confirm_presence`: không có gì thay đổi.
  - `user_online` gửi từ socket có token staff thì nhận `online_users` chứa username đó; gửi từ socket ẩn danh thì không có tác dụng.
- [ ] **Step 3:** Viết test cho auto-assign: bật `POST /api/interviewer/settings {autoAssign:true}` cho `int1` (ban `D0`) và cho một ứng viên `waiting` check-in. Trong vòng 8 giây, ứng viên phải chuyển sang `moving` với phòng và bàn của `int1`.
- [ ] **Step 4:** Viết `40-admin.test.js` với các test sau:
  - `users/add`: thêm user mới thì trả 200. Thêm trùng username thì 400. Role hoặc ban không hợp lệ thì 400.
  - `users/update roles:['receptionist']`: `role` được cập nhật thành `'receptionist'`.
  - `DELETE /api/users/<chính mình>`: trả 400. Xoá user khác thì 200.
  - `reset-checkin`: ứng viên quay về `active`, còn `applicationData` giữ nguyên.
  - `clean-data`: sai mật khẩu thì 401. Đúng mật khẩu thì xoá hết Evaluation và Message, mọi ứng viên về `active`, nhưng User vẫn còn.
  - Chạy lại server với `ADMIN_CLEAN_PASSWORD=''` thì `clean-data` trả 503.
  - `POST /api/messages` với `receiver:'group_all'`: `int1` nhận 403, `admin1` nhận 200. Tin nhắn 1–1 thì `sender` là user lấy từ token, dù body gửi kèm `sender` giả.
- [ ] **Step 5:** Chạy toàn bộ harness. Test nào fail thì chuyển sang Task 5.

### Task 5: Sửa bug tìm được (TDD, mỗi bug một commit)

**Files:** Modify `backend/server.js` và/hoặc `backend/scripts/*.js` (tuỳ bug). Test tương ứng đã nằm trong các file của Task 2–4.

Đã biết trước 1 bug (Review Focus 2). Các bug khác lấy từ những test fail ở Task 2–4.

- [ ] **Step 1:** Thêm vào `30-flow.test.js` test `evaluation for unknown candidate → 404, no Evaluation saved`. Chạy và xác nhận test fail (hiện tại trả 200).
- [ ] **Step 2:** Trong `POST /api/evaluation`, trước khi `new Evaluation`, chạy `Candidate.findOne({ interviewCode, department })`. Nếu không tìm thấy thì trả `404 {success:false, message:'Không tìm thấy ứng viên'}`.
- [ ] **Step 3:** Chạy lại harness để xác nhận đã pass. Commit `fix: reject evaluation for unknown candidate`.
- [ ] **Step 4:** **Hỏi người dùng** có muốn chặn trường hợp interviewer chấm điểm ứng viên thuộc ban khác không (trả 403, admin vẫn được phép). Chỉ làm khi người dùng đồng ý, và làm theo đúng quy trình Step 1–3.
- [ ] **Step 5:** Với mỗi test fail còn lại: xác nhận nguyên nhân gốc, sửa tối thiểu, chạy lại **toàn bộ** harness, rồi commit `fix: <mô tả>`. Nếu cách sửa làm thay đổi hành vi mà người dùng thấy được, hỏi người dùng trước khi làm.
- [ ] **Step 6:** Chạy `cd frontend && npm run build` để xác nhận frontend vẫn build được. Chạy toàn bộ harness và ghi lại số test pass/fail cho báo cáo.

### Task 6: Dockerfile + .dockerignore

**Files:** Create `Dockerfile`, `.dockerignore`

**Interfaces:** Produces image lắng nghe ở cổng `PORT` (mặc định 5000), healthcheck gọi `/api/public/health`, `CMD ["node","backend/server.js"]`, chạy bằng user `node`, và có LABEL `org.opencontainers.image.source=https://github.com/phamvietbach2006-max/k71-interview-system`. Thư mục làm việc (`WORKDIR`) là `/app`. Ảnh chứa `/app/backend`, `/app/frontend/dist` và `/app/config`.

- [ ] **Step 1:** Viết `Dockerfile` với 3 stage theo spec §5:
  - `frontend`: copy `frontend/package*.json`, chạy `npm ci`, copy phần còn lại của `frontend/`, rồi `npm run build`. Vite build cần đọc `config/` hoặc `/org-assets` không? Hãy kiểm tra `frontend/vite.config.js` và `frontend/index.html`. Nếu cần thì copy thêm `config/` vào stage này.
  - `deps`: copy `backend/package*.json` và chạy `npm ci --omit=dev`.
  - Runtime: stage cuối.

  Đặt `HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3`.
- [ ] **Step 2:** Viết `.dockerignore`, loại bỏ: `**/node_modules`, `frontend/dist`, `.git`, `.github`, `**/.env`, `**/.env.*`, `*.doc`, `*.docx`, `*.xlsx`, `Theme`, `huong_dan_su_dung_files`, `huong_dan_su_dung.md`, `docs`, `deploy`. **Không** được loại `config/`.
- [ ] **Step 3:** Kiểm tra: máy dev không có Docker, nên việc build thật sẽ chạy trên CI (Task 8). Ở bước này, xác nhận mọi đường dẫn `COPY` đều tồn tại: `ls backend/package-lock.json frontend/package-lock.json config/org.config.json`. Và `.dockerignore` không loại mất file nào mà `COPY` cần.
- [ ] **Step 4:** Commit `feat(docker): multi-stage image with healthcheck, non-root`.

### Task 7: Các file deploy cho VM

**Files:** Create `deploy/compose.yml`, `deploy/.env.example`, `deploy/backup.sh`, `deploy/uninstall.sh`, `deploy/nginx/interview.conf`

**Interfaces:**
- `compose.yml`: `name: interview`. Có 2 service `mongo` và `app`, cấu hình theo spec §6.
  - `app.image: ghcr.io/phamvietbach2006-max/k71-interview-system:${IMAGE_TAG:-fofl}`.
  - `app.environment.MONGODB_URI: mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASSWORD}@mongo:27017/interview?authSource=admin`.
  - `app.env_file: .env`.
  - `mongo.volumes: ./data/mongo:/data/db`.
  - `mongo.command: ["--wiredTigerCacheSizeGB","0.25"]`.
  - Healthcheck của mongo: `mongosh --quiet --eval "db.adminCommand('ping').ok" | grep -q 1`.
  - Để sẵn dạng comment: `# - ./config:/app/config:ro` và `# ORG_CONFIG: /app/config/org.config.json`.
- `backup.sh [--keep N]` (mặc định N=14): `cd "$(dirname "$0")"`, rồi chạy `docker compose exec -T mongo sh -c 'mongodump --archive --gzip --db interview -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > backups/interview-$(date +%Y%m%d-%H%M).archive.gz`. Nếu file rỗng thì xoá file đó và exit 1. Sau đó chỉ giữ lại N file mới nhất.
- `uninstall.sh [--dry-run]`: làm theo các bước ở spec §9. Hàm `run()` in ra lệnh trước khi chạy; khi có `--dry-run` thì chỉ in, không chạy. Có một lời hỏi xác nhận: người dùng phải gõ `interview`. Không chạy lệnh `rm` nào nằm ngoài `/opt/interview`, ngoại trừ file site nginx `interview.conf`. Xoá cron bằng `crontab -l | grep -v '# interview-backup' | crontab -`.
- `nginx/interview.conf`: file cấu hình ban đầu chỉ lắng nghe cổng 80 (`server_name fofl-k71-phongvan.duckdns.org`, `proxy_pass http://127.0.0.1:5000`), gồm các header WebSocket và `X-Forwarded-*`, `proxy_read_timeout 3600s`, `client_max_body_size 10m`, `gzip on; gzip_types text/css application/javascript application/json;`. Certbot sẽ tự thêm khối 443 vào file.

- [ ] **Step 1:** Viết 5 file trên. Chạy `chmod +x deploy/*.sh`.
- [ ] **Step 2:** Kiểm tra:
  - `bash -n deploy/*.sh` (nếu có `shellcheck` thì chạy thêm `shellcheck deploy/*.sh`).
  - `python3 -c "import yaml;yaml.safe_load(open('deploy/compose.yml'))"`.
  - `bash deploy/uninstall.sh --dry-run </dev/null`: phải in ra đúng danh sách lệnh và không chạy lệnh nào.
- [ ] **Step 3:** Kiểm tra `compose.yml` trên VM. Lệnh này chỉ đọc, không tạo container: `ssh ut-vm 'cd $(mktemp -d) && cat > compose.yml && printf "MONGO_ROOT_USER=u\nMONGO_ROOT_PASSWORD=p\n" > .env && docker compose config -q && echo OK; rm -rf "$PWD"' < deploy/compose.yml`. Kết quả mong đợi: `OK`.
- [ ] **Step 4:** Commit `feat(deploy): compose stack, backup/uninstall scripts, nginx site`.

### Task 8: GitHub Actions workflow

**Files:** Create `.github/workflows/deploy.yml`

**Interfaces:** Consumes `Dockerfile` (Task 6), `deploy/compose.yml`, `deploy/*.sh` (Task 7), `/api/public/health` (Task 3). Secrets (đặt trong environment `production`): `VM_HOST`, `VM_USER`, `VM_SSH_KEY`.

- [ ] **Step 1:** Viết workflow theo spec §8.
  - `on: { push: { branches: ['**'] }, workflow_dispatch: {} }`.
  - `env.IMAGE: ghcr.io/phamvietbach2006-max/k71-interview-system`.
  - **Job `build`** (`runs-on: ubuntu-24.04-arm`, `permissions: {contents: read, packages: write}`):
    1. `actions/checkout@v4`, `docker/setup-buildx-action@v3`.
    2. `docker/build-push-action@v6` với `load: true`, `tags: ${IMAGE}:${{ github.sha }}`, `cache-from/to: type=gha`.
    3. Bước smoke test: tạo network, `docker run -d mongo:8`, rồi `docker run -d` app với env `MONGODB_URI=mongodb://mongo-smoke:27017/smoke`, `JWT_SECRET`, `STAFF_PASSWORD`. Poll `docker inspect -f '{{.State.Health.Status}}'` tới khi thành `healthy`, tối đa 90 giây. `curl` kiểm tra: health trả 200, config trả 200, `/` chứa `<div id="root"`, `/api/users` trả 401. Nếu có bước fail thì in `docker logs` ra.
    4. Chỉ khi `github.ref == 'refs/heads/fofl'`: chạy `docker/login-action@v3` (registry `ghcr.io`, `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`), rồi push 2 tag `:<sha>` và `:fofl`. Có thể build lại bằng build-push-action với `push: true`, lấy từ cache.
  - **Job `deploy`** (`needs: build`, `if: github.ref == 'refs/heads/fofl'`, `environment: production`, `runs-on: ubuntu-24.04-arm`):
    1. Ghi key ra `~/.ssh/id_ed25519` (quyền 600), rồi `ssh-keyscan -t ed25519 $VM_HOST >> known_hosts`.
    2. `scp deploy/compose.yml deploy/backup.sh deploy/uninstall.sh` vào `/opt/interview/`.
    3. SSH vào VM chạy một script `set -euo pipefail`:
       - `cd /opt/interview`
       - Cập nhật `IMAGE_TAG=<sha>` trong `.env`: `sed -i` nếu đã có dòng đó, không thì thêm vào cuối file.
       - `docker compose pull app`
       - `docker compose up -d --wait --wait-timeout 120`
       - Dọn image: `docker image ls "$IMAGE" --format '{{.Tag}} {{.ID}}'`, giữ lại tag `<sha>` hiện tại và tag `fofl`, cùng **1** tag của lần deploy trước đó (ghi vào file `.prev_tag`). Xoá các tag còn lại bằng `docker image rm`, bỏ qua nếu gặp lỗi.
  - `concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: false }`.
- [ ] **Step 2:** Kiểm tra: `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/deploy.yml'))"`. Nếu có sẵn `actionlint` thì chạy thêm; nếu không có thì bỏ qua (không tải về).
- [ ] **Step 3:** Commit `ci: build, smoke-test, push to GHCR and deploy fofl to Oracle VM`.
- [ ] **Step 4:** **Hỏi người dùng** trước khi `git push origin feat/configurable-org`. Nhánh này có 8 commit mới trở lên. Việc push sẽ chạy job build và smoke test, chưa deploy.
- [ ] **Step 5:** Theo dõi run bằng cách mở trang Actions trên trình duyệt tích hợp. Repo public nên xem được mà không cần đăng nhập. Hoặc gọi `curl https://api.github.com/repos/phamvietbach2006-max/k71-interview-system/actions/runs?branch=feat/configurable-org`. Kết quả mong đợi: `conclusion: success`. Nếu fail thì đọc log, sửa, commit rồi push lại (hỏi người dùng trước mỗi lần push).

### Task 9: Tài liệu + README + xoá railway.toml

**Files:** Create `docs/deploy-oracle.md`. Modify `README.md` (phần "Triển khai cho một đơn vị mới", mục import với `railway run`, "Chạy local"). Delete `railway.toml`.

- [ ] **Step 1:** Viết `docs/deploy-oracle.md` gồm các mục theo spec §10:
  1. Yêu cầu hệ thống.
  2. Setup VM lần đầu:
     - Cài Docker bằng `get.docker.com`, rồi `usermod -aG docker ubuntu`.
     - Mở port 80/443 ở hai nơi: trong Security List/NSG của Oracle, và trong iptables trên VM. Với iptables, chèn rule ngay trước rule `REJECT` bằng `sudo iptables -I INPUT <n> -p tcp --dport 80 -j ACCEPT` (và tương tự với 443), rồi chạy `sudo netfilter-persistent save`. Lấy số `<n>` bằng lệnh `iptables -L INPUT --line-numbers`.
     - Tạo bản ghi trên DuckDNS.
     - Tạo `/opt/interview` và sinh `.env` bằng `openssl rand -hex`, đặt quyền 600.
     - Cài nginx site và chạy certbot với `--cert-name interview`.
     - Thêm cron backup.
  3. Tạo key CI và điền 3 secret vào environment `production`.
  4. Deploy và rollback.
  5. Import dữ liệu bằng `docker compose run --rm -v "$PWD/import:/import:ro" app node backend/scripts/import-staff.js /import/<file>`.
  6. Backup và khôi phục bằng `mongorestore --archive --gzip --drop`.
  7. Gỡ bỏ: dùng `uninstall.sh`, hoặc làm tay.
  8. Xử lý sự cố: 502 từ nginx, socket không kết nối được (thiếu header Upgrade), `IMAGE_TAG` không khớp, package trên GHCR đang để private.
- [ ] **Step 2:** Sửa README: bỏ mọi nhắc tới Railway, thêm link tới `docs/deploy-oracle.md`, và thêm mục "Chạy bằng Docker (local)" gồm lệnh `docker build -t interview .` và `docker run` kèm một Mongo container.
- [ ] **Step 3:** `git rm railway.toml`. Sau đó chạy `grep -rni railway --exclude-dir=node_modules --exclude-dir=.git .`. Kết quả mong đợi: không còn chỗ nào ngoài thư mục `docs/superpowers/`.
- [ ] **Step 4:** Commit `docs: Oracle VM deploy guide; drop Railway`.

### Task 10: Setup VM lần đầu (mọi bước đều hỏi người dùng trước)

**Files:** Không sửa file nào trong repo. Mọi thay đổi diễn ra trên `ut-vm`.

- [ ] **Step 1:** Kiểm tra `getent hosts fofl-k71-phongvan.duckdns.org` trả về `168.107.68.32`. Nếu chưa đúng, dừng lại và nhắc người dùng.
- [ ] **Step 2 (hỏi trước):**
  - `sudo mkdir -p /opt/interview/{data/mongo,backups} && sudo chown -R ubuntu:ubuntu /opt/interview`.
  - Tạo `.env` ngay trên VM bằng `openssl rand -hex 24`, gồm `MONGO_ROOT_PASSWORD`, `JWT_SECRET`, `STAFF_PASSWORD`, `ADMIN_CLEAN_PASSWORD` và `MONGO_ROOT_USER=interview_root`. Đặt `chmod 600`.
  - **Không** in secret ra màn hình. Cho người dùng biết lệnh để tự đọc `STAFF_PASSWORD`: `sudo cat`/`grep` trên VM.
- [ ] **Step 3 (hỏi trước):** Tạo key CI trong scratchpad: `ssh-keygen -t ed25519 -N "" -C ci@k71-interview -f $SCRATCH/ci_key`. Thêm `ci_key.pub` vào `authorized_keys` trên VM. Hướng dẫn người dùng dán nội dung `ci_key` vào secret `VM_SSH_KEY` (trong environment `production`), cùng với `VM_HOST=168.107.68.32` và `VM_USER=ubuntu`. Sau khi người dùng xác nhận đã dán xong thì xoá `$SCRATCH/ci_key`.
- [ ] **Step 4 (hỏi trước):**
  - `scp deploy/nginx/interview.conf` lên VM, `sudo mv` vào `sites-available`, rồi `sudo ln -s` sang `sites-enabled`.
  - `sudo nginx -t && sudo systemctl reload nginx`.
  - `sudo certbot --nginx -d fofl-k71-phongvan.duckdns.org --cert-name interview --redirect -n --agree-tos`. Certbot dùng lại email đã đăng ký sẵn trên máy. Nếu certbot hỏi email thì dừng lại và hỏi người dùng.
- [ ] **Step 5 (hỏi trước):** `(crontab -l 2>/dev/null; echo '15 3 * * * /opt/interview/backup.sh >> /opt/interview/backups/backup.log 2>&1 # interview-backup') | crontab -`.
- [ ] **Step 6:** Kiểm tra: `curl -sI https://tckt-hub.duckdns.org` và các site cũ vẫn trả status như trước khi làm. `docker ps` vẫn có đủ 8 container `ultimate-tckt-*` với trạng thái Up, thời gian uptime không bị reset.

### Task 11: Deploy lần đầu và nghiệm thu

- [ ] **Step 1 (hỏi trước):** Merge `feat/configurable-org` vào `fofl` (tạo nhánh `fofl` nếu chưa có), rồi `git push origin fofl`.
- [ ] **Step 2:** Theo dõi Actions. Nếu job deploy fail vì pull image bị `denied`, nghĩa là package đang private: nhờ người dùng vào Package settings → Change visibility → Public, rồi chạy lại job.
- [ ] **Step 3:** Nghiệm thu theo spec §12:
  - `curl -s https://fofl-k71-phongvan.duckdns.org/api/public/health` trả `{"ok":true}`.
  - Mở trang bằng trình duyệt tích hợp: login screen render được, không có lỗi trong console.
  - Có kết nối `wss` tới socket.io với status 101 (kiểm tra bằng `read_network_requests`).
  - `ssh ut-vm 'cd /opt/interview && ./backup.sh && ls -la backups'`: có file backup lớn hơn 0 byte.
  - `ssh ut-vm 'cd /opt/interview && ./uninstall.sh --dry-run'`: chỉ in danh sách lệnh.
  - 8 container của ultimate-tckt vẫn Up.
- [ ] **Step 4:** Báo cáo kết quả cho người dùng, gồm:
  - Tổng hợp các bug đã sửa.
  - Các lỗ hổng đã biết nhưng chưa xử lý: mật khẩu staff dùng chung, lộ đơn đăng ký qua MSSV, CORS `*`.
  - Nhắc người dùng đăng nhập bằng `STAFF_PASSWORD` trên VM và chạy import dữ liệu thật.
