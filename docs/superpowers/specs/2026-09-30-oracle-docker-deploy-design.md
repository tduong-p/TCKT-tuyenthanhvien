# Thiết kế: Test E2E + deploy Docker lên Oracle VM + CI/CD

Ngày: 2026-09-30 · Nhánh làm việc: `feat/configurable-org` · Nhánh deploy: `fofl`

## 1. Mục tiêu

1. Kiểm chứng các luồng cần DB (đăng nhập, phân quyền theo vai trò, check-in, gọi ứng viên, chấm điểm theo config, dữ liệu cho xuất Excel, socket, 2 script import) và sửa bug nếu có.
2. Chạy hệ thống trên Oracle VM có sẵn bằng Docker, thay cho Railway.
3. Push lên nhánh `fofl` thì tự động build, test và deploy.
4. **Gỡ khỏi host sạch sẽ và đơn giản.** Đây là tiêu chí quan trọng nhất do người dùng đặt ra.

Không nằm trong phạm vi lần này (đã biết, chưa sửa): nhân sự dùng chung mật khẩu, lộ đơn đăng ký nếu đoán được MSSV, CORS `*`, mật khẩu Atlas trong git history (người dùng quyết định bỏ qua).

## 2. Ràng buộc từ VM (đã kiểm tra ngày 2026-09-30, chỉ đọc)

- `168.107.68.32`, alias `ut-vm`, user `ubuntu`. Ubuntu 24.04, aarch64 Neoverse-N1, **1 OCPU, 5.8GB RAM (còn trống khoảng 3.6GB), không có swap**, disk còn trống 34GB.
- Docker 29.8 + Compose v5; user `ubuntu` thuộc group `docker`.
- VM đang chạy **ultimate-tckt (staging + production, dữ liệu thật)**: 8 container, dùng các port `127.0.0.1:3000,3001,3306,3307,8000,8001`. **Không đụng tới** `/opt/ultimate-tckt`, `/opt/infra`, các container, site nginx hay chứng chỉ của dự án đó.
- iptables đã mở 22, 80, 443. nginx + certbot đã chạy, có một chứng chỉ dùng chung cho 4 domain `*.duckdns.org`.
- Repo `phamvietbach2006-max/k71-interview-system` là **public**, nên dùng được runner `ubuntu-24.04-arm` miễn phí.

## 3. Các quyết định

| Chủ đề | Quyết định |
|---|---|
| Kiến trúc | Compose project `interview` gồm 2 container: `app` và `mongo:8` |
| Domain | `fofl-k71-phongvan.duckdns.org`. Người dùng tạo bản ghi DuckDNS trỏ về `168.107.68.32` |
| HTTPS | nginx trên host proxy tới `127.0.0.1:5000`. Chứng chỉ **riêng** `--cert-name interview` |
| Kiến trúc CPU | Chỉ build arm64, native trên `ubuntu-24.04-arm` |
| Registry | `ghcr.io/phamvietbach2006-max/k71-interview-system`, **public**, nên VM không cần `docker login` |
| Backup | `mongodump` chạy hằng ngày qua crontab của user `ubuntu`, giữ 14 bản |
| `railway.toml` | Xoá (Railway không còn là nơi deploy). *Người dùng chưa trả lời; nếu muốn giữ thì phản hồi khi duyệt spec.* |

## 4. Test E2E (phần 1)

- Harness đặt trong scratchpad của phiên. Cài `mongodb-memory-server`, `socket.io-client` và `xlsx` ở đó; **không đổi `package.json` của dự án**.
- Harness khởi động `backend/server.js` như một tiến trình con, với `MONGODB_URI` trỏ tới mongod trong bộ nhớ, `NODE_ENV=production`, `STAFF_PASSWORD`, `JWT_SECRET` và `ADMIN_CLEAN_PASSWORD`. Sau đó gọi HTTP và socket như client thật.
- Các nhóm test:
  1. **Import**: sinh file xlsx nhân sự và ứng viên, chạy `import-staff.js` và `import-candidates.js`. Kiểm tra số bản ghi, hành vi upsert (giữ nguyên trạng thái phỏng vấn), `--replace`, `--code-column`, và mã ban không hợp lệ.
  2. **Đăng nhập**: sai mật khẩu, user không tồn tại, và đăng nhập đúng với từng vai trò. Token hợp lệ.
  3. **Phân quyền**: ma trận route × vai trò. Không có token thì trả 401, sai vai trò thì trả 403. Server không tin identity do client gửi lên (ví dụ `username` trong body).
  4. **Luồng phỏng vấn**: lễ tân check-in, người phỏng vấn gọi ứng viên, ứng viên chuyển trạng thái, chấm điểm, rồi đến board và TV board.
  5. **Chấm điểm theo config**: điểm ngoài `[min,max]`, thiếu tiêu chí, `result` không có trong config, và điểm trung bình tính đúng.
  6. **Dữ liệu cho xuất Excel**: `/api/evaluations` (chỉ admin) trả về đủ các trường mà `AdminView.jsx` cần để xuất file.
  7. **Socket**: kết nối không có token hoặc token sai thì bị từ chối; token đúng thì nhận được `board_update` và `candidate_assigned`.
  8. **Admin**: thêm, sửa, xoá user; `clean-data` với sai mật khẩu và đúng mật khẩu.
- Nếu tìm thấy bug: viết test tái hiện (phải thấy test fail trước), sửa code, rồi chạy lại toàn bộ test (TDD). Mỗi bug sửa trong một commit riêng.

## 5. Image Docker

`Dockerfile` ở thư mục gốc repo:

```
FROM node:20-slim AS frontend      # npm ci + vite build → /app/frontend/dist
FROM node:20-slim AS backend-deps  # npm ci --omit=dev trong backend/
FROM node:20-slim                  # runtime
  ENV NODE_ENV=production PORT=5000
  COPY backend/ (kèm node_modules từ stage deps), frontend/dist, config/
  USER node
  EXPOSE 5000
  HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/public/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  CMD ["node","backend/server.js"]
```

- Có LABEL `org.opencontainers.image.source=https://github.com/phamvietbach2006-max/k71-interview-system`. Label này liên kết package trên GHCR với repo, và được dùng làm bộ lọc khi dọn image.
- `.dockerignore` loại bỏ `node_modules`, `frontend/dist`, `.git`, `.env*`, các file tài liệu `.doc`/`.docx`/`.xlsx` ở thư mục gốc, `Theme/` và `huong_dan_su_dung_files/`.
- `config/` được đóng sẵn vào image. Muốn mount đè thì dùng volume kết hợp `ORG_CONFIG` hoặc `ORG_ASSETS_DIR` (cơ chế này `backend/config.js` đã hỗ trợ sẵn).

## 6. Bố cục trên VM

```
/opt/interview/                  (owner ubuntu)
├── .env                         quyền 600, không bao giờ commit
├── compose.yml                  CI copy từ deploy/compose.yml mỗi lần deploy
├── backup.sh  uninstall.sh      CI copy từ deploy/
├── data/mongo/                  bind mount /data/db
└── backups/                     interview-YYYYmmdd-HHMM.archive.gz
```

`deploy/compose.yml` có 2 service:

- `mongo`: dùng `mongo:8` (có image arm64; Neoverse-N1 là ARMv8.2, đủ yêu cầu). Chạy với `--wiredTigerCacheSizeGB 0.25`, `mem_limit: 768m`, **không publish port**. Có `MONGO_INITDB_ROOT_USERNAME/PASSWORD` lấy từ `.env`, healthcheck bằng `mongosh --eval "db.adminCommand('ping')"`, và `restart: unless-stopped`.
- `app`: dùng `ghcr.io/…:${IMAGE_TAG:-fofl}`, cổng `127.0.0.1:5000:5000`, `env_file: .env`, `mem_limit: 384m`, `restart: unless-stopped`, `depends_on: mongo (service_healthy)`. Có sẵn một dòng volume mount đè config, để dạng comment.
- `MONGODB_URI=mongodb://<user>:<pass>@mongo:27017/interview?authSource=admin`, đặt trong `.env`.
- Dùng network mặc định của project. Không có port nào mở ra ngoài, ngoài `127.0.0.1:5000`.

Mẫu `.env` cho VM: `deploy/.env.example`, gồm `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, `MONGODB_URI`, `JWT_SECRET`, `STAFF_PASSWORD` và `ADMIN_CLEAN_PASSWORD`.

## 7. nginx + certbot

- File `deploy/nginx/interview.conf` được đặt vào `/etc/nginx/sites-available/interview.conf`, rồi symlink sang `sites-enabled`. Bên trong có:
  - `server_name fofl-k71-phongvan.duckdns.org`, `proxy_pass http://127.0.0.1:5000`
  - `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection "upgrade"` (bắt buộc cho socket.io)
  - `proxy_read_timeout 3600s`, các header `X-Forwarded-*`
  - `gzip on` cho js, css và json
- Lấy chứng chỉ: `sudo certbot --nginx -d fofl-k71-phongvan.duckdns.org --cert-name interview`. Chứng chỉ riêng, không mở rộng chứng chỉ dùng chung.
- Chạy `nginx -t` trước mỗi lần reload.

## 8. CI/CD — `.github/workflows/deploy.yml`

- Trigger: `push` lên `fofl` và `workflow_dispatch`. Có `concurrency: deploy-fofl` để các lần deploy không chạy chồng lên nhau.
- Permissions: `contents: read` và `packages: write`.
- **Job `build`** chạy trên `ubuntu-24.04-arm`:
  1. checkout, rồi `docker/setup-buildx-action`.
  2. Build với `load: true`, cache `type=gha`.
  3. **Smoke test**: `docker network create`, chạy `mongo:8`, chạy image vừa build với env test, chờ trạng thái `healthy` (tối đa 60 giây), rồi `curl` kiểm tra `/api/public/config` trả 200 và `/api/users` trả 401.
  4. Đăng nhập GHCR bằng `GITHUB_TOKEN`, rồi push 2 tag `:${{ github.sha }}` và `:fofl`.
- **Job `deploy`** (`needs: build`, environment `production`):
  1. Ghi `VM_SSH_KEY` ra file và thêm `VM_HOST` vào `known_hosts` bằng `ssh-keyscan`.
  2. `scp deploy/compose.yml deploy/backup.sh deploy/uninstall.sh` vào `/opt/interview/`.
  3. Qua ssh: `cd /opt/interview && IMAGE_TAG=<sha> docker compose pull app && IMAGE_TAG=<sha> docker compose up -d --wait app`. Nếu `--wait` báo lỗi (app không healthy) thì job fail.
  4. Ghi tag vừa deploy vào `.env` (`IMAGE_TAG=<sha>`), để khi `restart` hay khởi động lại VM thì vẫn chạy đúng bản đó.
  5. Dọn image: `docker image ls ghcr.io/phamvietbach2006-max/k71-interview-system` rồi xoá mọi tag khác tag hiện tại, giữ lại một bản trước đó để rollback. **Không chạy `docker image prune`** trên toàn máy.
- Secrets đặt trong Environment `production`: `VM_HOST`, `VM_USER`, `VM_SSH_KEY`. `VM_SSH_KEY` là **một key CI riêng** (comment `ci@k71-interview`), khác với key cá nhân.
- Rollback: chạy `workflow_dispatch` lại trên commit cũ, hoặc trên VM chạy `IMAGE_TAG=<sha cũ> docker compose up -d app`.

## 9. Backup và gỡ bỏ

- `backup.sh` chạy `docker compose exec -T mongo mongodump --archive --gzip -u … -p …` và ghi ra `backups/`, rồi xoá các bản cũ hơn 14 bản gần nhất.
- Cron: `15 3 * * * /opt/interview/backup.sh >> /opt/interview/backups/backup.log 2>&1`. Dòng cron này có comment `# interview-backup` để dễ tìm và xoá.
- `uninstall.sh` hỏi xác nhận, rồi:
  1. Tạo một bản backup cuối và **copy ra `~/interview-final-backup-<ngày>.archive.gz`**.
  2. `docker compose down -v --rmi all`.
  3. Xoá dòng cron có comment `# interview-backup`.
  4. Xoá site nginx, chạy `nginx -t`, rồi reload nginx.
  5. `certbot delete --cert-name interview`.
  6. `sudo rm -rf /opt/interview`.

  Sau khi chạy xong, trên host chỉ còn lại file backup cuối mà người dùng chủ động giữ.
- Tài liệu có ghi các bước tương ứng để làm tay, nếu không muốn dùng script.

## 10. Tài liệu

- `docs/deploy-oracle.md` gồm các phần:
  1. Yêu cầu hệ thống.
  2. Setup lần đầu:
     - Cài Docker, dành cho VM mới.
     - Mở port trong **Security List/NSG của Oracle** và trong **iptables của VM**. Image Ubuntu của Oracle có sẵn rule `REJECT`, nên phải chèn rule mới *trước* rule đó, rồi lưu lại bằng `netfilter-persistent save`. Trên VM hiện tại 80/443 đã mở sẵn.
     - DuckDNS, tạo `/opt/interview` và `.env`, nginx, certbot, cron backup.
  3. Tạo key CI và điền GitHub secrets.
  4. Deploy lần đầu và rollback.
  5. Import dữ liệu trên VM: `docker compose run --rm app node backend/scripts/import-staff.js /import/file.xlsx`, với file được mount vào `/import`.
  6. Backup và khôi phục.
  7. Gỡ bỏ.
- README: thay phần Railway bằng phần Docker/Oracle và link tới `docs/deploy-oracle.md`; thêm cách chạy bằng Docker ở local.

## 11. Những việc thay đổi trên VM (mỗi bước đều hỏi người dùng trước khi làm)

1. `sudo mkdir /opt/interview && chown ubuntu`, rồi tạo `.env` với secret sinh ngẫu nhiên ngay trên VM. Secret không đi qua chat và không nằm trong repo.
2. Đặt file site nginx và chạy certbot. Việc này chỉ làm được sau khi DNS của DuckDNS đã trỏ đúng về VM.
3. Thêm dòng cron backup.
4. Thêm public key CI vào `authorized_keys`.

## 12. Tiêu chí hoàn thành

- Toàn bộ test E2E pass. Mỗi bug sửa đều có test đi kèm.
- CI xanh trên `fofl`, bước smoke test pass.
- `https://fofl-k71-phongvan.duckdns.org` mở được trang, đăng nhập được, và socket kết nối qua `wss`.
- 8 container của ultimate-tckt vẫn ở trạng thái `Up`, không bị khởi động lại, và các site cũ vẫn trả 200.
- Chạy `backup.sh` bằng tay thì sinh ra được file backup.
- `uninstall.sh` đã được đọc lại và kiểm tra bằng `--dry-run` (chỉ in ra các lệnh sẽ chạy), vì không chạy thật trên production.
