# Triển khai lên Oracle VM bằng Docker

Hướng dẫn này đưa một đơn vị lên một VM Oracle Cloud (ARM Ampere A1, Ubuntu). Toàn bộ hệ thống chạy trong một compose stack tên `interview`, gồm `app` và `mongo:8`, đặt ở `/opt/interview`. Stack này không đụng tới các dự án khác trên cùng VM.

Mỗi lần push lên nhánh `fofl`, GitHub Actions sẽ:
1. build image arm64,
2. chạy smoke test với MongoDB thật,
3. đẩy image lên GHCR,
4. SSH vào VM, cập nhật stack và xoá image cũ của repo này.

Push lên nhánh khác chỉ chạy bước build và smoke test.

```
Internet ──443──▶ nginx (host) ──▶ 127.0.0.1:5000 app ──▶ mongo (mạng nội bộ compose, không mở port)
```

## 1. Yêu cầu

- VM Ubuntu 22.04/24.04, arm64 hoặc amd64, RAM trống khoảng 1.5 GB. Stack giới hạn RAM ở mức mongo 768 MB và app 384 MB.
- Docker Engine và Docker Compose v2.
- nginx và certbot (gói `python3-certbot-nginx`) chạy trên host.
- Một tên miền trỏ về IP public của VM, ví dụ `fofl-k71-phongvan.duckdns.org`.
- Quyền admin trên repo GitHub chạy CI. Chỉ admin mới tạo được environment, secret và đổi quyền hiển thị của package. Repo cá nhân không cho gán quyền admin cho collaborator, nên nếu bạn không phải chủ repo thì **fork** repo về tài khoản của mình và deploy từ fork. Image nằm ở `ghcr.io/<chủ repo chạy CI>/<tên repo viết thường>`; CI tự ghi `IMAGE` và `IMAGE_TAG` vào `.env`.

## 2. Setup VM lần đầu

Các bước dưới đây chạy trên VM với user `ubuntu`, trừ khi ghi khác.

### 2.1 Docker

Bỏ qua bước này nếu `docker compose version` đã chạy được.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # đăng xuất rồi đăng nhập lại để có hiệu lực
```

### 2.2 Mở port 80 và 443

Oracle chặn port ở **hai nơi**, nên phải mở cả hai:

1. **Security List hoặc NSG** của subnet, trên Oracle Console: vào *Networking → Virtual Cloud Networks → subnet → Security List → Add Ingress Rules*. Nguồn `0.0.0.0/0`, TCP, port 80 và port 443.
2. **iptables trên VM.** Image Ubuntu của Oracle có sẵn một rule `REJECT` ở cuối chain INPUT, nên rule ACCEPT phải chèn **trước** rule đó:

   ```bash
   sudo iptables -L INPUT --line-numbers      # tìm số dòng <n> của rule REJECT
   sudo iptables -I INPUT <n> -p tcp --dport 80 -m state --state NEW -j ACCEPT
   sudo iptables -I INPUT <n> -p tcp --dport 443 -m state --state NEW -j ACCEPT
   sudo netfilter-persistent save
   ```

App chỉ lắng nghe ở `127.0.0.1:5000`, nên **không** cần mở port 5000.

### 2.3 DNS

Trên https://www.duckdns.org, tạo subdomain rồi điền IP public của VM. Kiểm tra lại:

```bash
getent hosts fofl-k71-phongvan.duckdns.org
```

### 2.4 Thư mục và file `.env`

Mọi secret được sinh ngay trên VM. Không dán secret vào chat, email hay repo.

```bash
sudo install -d -o ubuntu -g ubuntu /opt/interview
mkdir -p /opt/interview/data/mongo /opt/interview/backups
cd /opt/interview
umask 077
cat > .env <<EOF
IMAGE=ghcr.io/<owner>/<repo>
IMAGE_TAG=fofl
MONGO_ROOT_USER=interview_root
MONGO_ROOT_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
STAFF_PASSWORD=$(openssl rand -base64 12 | tr -d '/+=')
ADMIN_CLEAN_PASSWORD=$(openssl rand -hex 12)
EOF
chmod 600 .env
```

Mẫu các biến nằm ở [`deploy/.env.example`](../deploy/.env.example). Để xem mật khẩu nhân sự và phát cho mọi người, chạy `grep STAFF_PASSWORD /opt/interview/.env`.

`compose.yml`, `backup.sh`, `uninstall.sh` và `remote-deploy.sh` do CI chép lên mỗi lần deploy. Vì vậy chỉ `.env` là do người quản trị tự quản lý.

### 2.5 nginx và HTTPS

```bash
# chép deploy/nginx/interview.conf từ repo lên VM, rồi:
sudo cp interview.conf /etc/nginx/sites-available/interview.conf
sudo ln -s /etc/nginx/sites-available/interview.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx --cert-name interview -d fofl-k71-phongvan.duckdns.org
```

Tham số `--cert-name interview` cho stack này một chứng chỉ riêng, không gộp vào chứng chỉ của dự án khác. Nhờ vậy lúc gỡ bỏ chỉ cần xoá đúng chứng chỉ này. File site đã có header `Upgrade`/`Connection` để socket.io dùng được WebSocket.

### 2.6 Backup hằng ngày

```bash
( crontab -l 2>/dev/null; echo '15 3 * * * /opt/interview/backup.sh >> /opt/interview/backups/backup.log 2>&1 # interview-backup' ) | crontab -
```

Job này chạy lúc 03:15 mỗi ngày và giữ lại 14 bản mới nhất. Dòng cron có tag `# interview-backup` để `uninstall.sh` tìm và xoá đúng dòng này.

### 2.7 Sao lưu liên tục kết quả ra GitHub

`export-results.sh` xuất các bảng `evaluations`, `candidates`, `users` thành JSON (mỗi bản ghi một dòng) vào `/opt/interview/results-backup/`. Script chỉ commit khi dữ liệu thay đổi, rồi push lên một repo **private** riêng. Cron chạy script 2 phút một lần. Push lỗi (mất mạng) thì commit vẫn nằm trên VM, lần chạy sau đẩy bù. Lịch sử git giữ mọi phiên bản, nên kể cả sau khi "Làm sạch dữ liệu" vẫn lấy lại được dữ liệu cũ.

Repo này chứa dữ liệu cá nhân của ứng viên: để private và chỉ cấp quyền cho người trong ban.

1. Tạo repo private rỗng, ví dụ `<owner>/fofl-interview-backup`.
2. Trên VM, tạo deploy key. Khoá bí mật nằm trong `/opt/interview` nên `uninstall.sh` xoá cùng:

   ```bash
   ssh-keygen -t ed25519 -N '' -C interview-results -f /opt/interview/results-key
   cat /opt/interview/results-key.pub
   ```

3. Thêm khoá công khai vào repo ở *Settings → Deploy keys*, **bật "Allow write access"**. Hoặc từ máy có `gh`: `gh repo deploy-key add results-key.pub --repo <owner>/fofl-interview-backup --allow-write --title interview-vm`.
4. Clone repo và bật cron:

   ```bash
   cd /opt/interview
   GIT_SSH_COMMAND="ssh -i $PWD/results-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
     git clone git@github.com:<owner>/fofl-interview-backup.git results-backup
   ./export-results.sh
   ( crontab -l 2>/dev/null; echo '*/2 * * * * /opt/interview/export-results.sh >> /opt/interview/backups/results.log 2>&1 # interview-results' ) | crontab -
   ```

Log nằm ở `/opt/interview/backups/results.log`: mỗi lần push có một dòng `pushed <commit>`, lỗi cũng ghi vào đây. Sau khi gỡ hệ thống, nhớ xoá deploy key trên GitHub.

## 3. Key CI và secret trên GitHub

1. Tạo một key riêng cho CI, trên máy của bạn (không phải trên VM):

   ```bash
   ssh-keygen -t ed25519 -N '' -C 'github-actions@interview' -f ./interview_ci
   ```

2. Thêm public key vào `~/.ssh/authorized_keys` của `ubuntu` trên VM:

   ```bash
   cat interview_ci.pub | ssh ubuntu@<IP> 'cat >> ~/.ssh/authorized_keys'
   ```

3. Trên GitHub, vào *Settings → Environments → New environment* và tạo environment `production`. Thêm 3 secret vào environment này:

   | Secret | Giá trị |
   |---|---|
   | `VM_HOST` | IP public của VM |
   | `VM_USER` | `ubuntu` |
   | `VM_SSH_KEY` | toàn bộ nội dung file `interview_ci` (private key) |

4. Xoá file key trên máy của bạn: `rm interview_ci interview_ci.pub`.

CI đăng nhập GHCR bằng `GITHUB_TOKEN`, nên không cần secret nào khác.

## 4. Deploy và rollback

**Deploy.** Merge vào `fofl` rồi push:

```bash
git checkout fofl && git merge <nhánh> && git push origin fofl
```

Theo dõi ở tab *Actions*. Job deploy làm các việc sau:
- chạy `remote-deploy.sh` trên VM: ghi `IMAGE`/`IMAGE_TAG=<sha>` vào `.env`, rồi chạy `docker compose pull` và `docker compose up -d --wait`,
- nếu app không healthy trong 120 giây, tự quay về tag cũ và báo job thất bại; `.prev_tag` chỉ được cập nhật khi deploy thành công,
- xoá image cũ của repo này, giữ lại tag hiện tại, tag `fofl` và tag trước đó.

Job không bao giờ chạy `docker system prune` trên toàn host.

**Lần deploy đầu tiên.** Mặc định GHCR để package ở chế độ private, nên lần đầu VM có thể pull thất bại với lỗi `denied`. Khi đó, admin repo vào *github.com → Packages → <tên repo> → Package settings → Change visibility → Public*, rồi chạy lại job.

**Rollback** về bản trước, chạy trên VM (image cũ vẫn còn trên máy nên không cần pull):

```bash
cd /opt/interview
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$(cat .prev_tag)/" .env
docker compose up -d --wait
```

Nếu muốn chạy một commit cụ thể, đặt `IMAGE_TAG=<sha đầy đủ>` rồi chạy `docker compose pull app && docker compose up -d --wait`. Lần push tiếp theo lên `fofl` sẽ ghi đè `IMAGE_TAG`.

**Đổi config không cần build lại image** (không bắt buộc):
1. Đặt `org.config.json` và `assets/` vào `/opt/interview/config/`.
2. Bỏ comment dòng `ORG_CONFIG` và phần `volumes` của service `app` trong `compose.yml`.

Lưu ý rằng CI chép đè `compose.yml` mỗi lần deploy. Vì vậy muốn giữ thay đổi lâu dài thì phải sửa file trong repo.

## 5. Import dữ liệu

Thường chỉ cần dùng nút **Nhập Excel** trên trang Admin, không phải vào VM. Cách dưới đây dùng cho lần khởi tạo, khi chưa có tài khoản admin nào.

Chép file Excel lên VM, vào `/opt/interview/import/`, rồi chạy script bên trong image. Script tự dùng `MONGODB_URI` của stack.

```bash
cd /opt/interview
mkdir -p import   # scp nhan_su.xlsx don_ban_a.xlsx ubuntu@<IP>:/opt/interview/import/

docker compose run --rm -v "$PWD/import:/import:ro" app \
  node backend/scripts/import-staff.js /import/nhan_su.xlsx

docker compose run --rm -v "$PWD/import:/import:ro" app \
  node backend/scripts/import-candidates.js /import/don_ban_a.xlsx --department BAN_A --code-column "MSSV"
```

Các tùy chọn (`--sheet`, `--replace`) giống như mô tả trong [README](../README.md#import-dữ-liệu). Import xong thì xoá file: `rm -r /opt/interview/import`.

## 6. Backup và khôi phục

Muốn backup ngay thì chạy `/opt/interview/backup.sh`. Thêm `--keep N` để giữ N bản. File được lưu ở `/opt/interview/backups/interview-YYYYmmdd-HHMMSS.archive.gz`.

Nên thỉnh thoảng chép bản backup ra ngoài VM:

```bash
scp ubuntu@<IP>:/opt/interview/backups/interview-*.archive.gz .
```

**Khôi phục.** Lệnh dưới đây ghi đè database hiện tại:

```bash
cd /opt/interview
docker compose exec -T mongo sh -c 'mongorestore --archive --gzip --drop \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  < backups/<file>.archive.gz
```

**Khôi phục từ repo sao lưu kết quả.** Lấy file JSON ở thời điểm muốn quay về (ví dụ `git -C results-backup show <commit>:evaluations.json > /tmp/evaluations.json`), rồi nạp đè từng bảng. Lệnh dưới đây xoá bảng hiện tại trước khi nạp:

```bash
cd /opt/interview
docker compose exec -T mongo sh -c 'mongoimport --quiet --drop --db interview --collection evaluations \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  < /tmp/evaluations.json
```

## 7. Gỡ bỏ

```bash
/opt/interview/uninstall.sh --dry-run   # xem trước sẽ xoá những gì
/opt/interview/uninstall.sh             # gõ "interview" để xác nhận
```

Script làm lần lượt các bước sau:
1. Backup lần cuối và chép ra `~/interview-final-backup-*.archive.gz`. Nếu mongo không chạy, script chép bản dump mới nhất đã có; nếu không có bản nào thì dừng lại, trừ khi thêm `--force`.
2. `docker compose down -v`, rồi xoá các image của repo này và `mongo:8` (bỏ qua nếu dự án khác đang dùng `mongo:8`).
3. Xoá dòng cron `# interview-backup`.
4. Xoá site nginx `interview.conf` rồi reload nginx.
5. Xoá chứng chỉ certbot `interview`.
6. `rm -rf /opt/interview`.

Script không đụng tới Docker, nginx hay chứng chỉ của dự án khác.

**Gỡ bằng tay**, nếu script không dùng được:

```bash
cd /opt/interview && docker compose down -v && docker image rm $(docker image ls "$(sed -n 's/^IMAGE=//p' .env)" -q | sort -u)
crontab -l | grep -v '# interview-backup' | crontab -
sudo rm /etc/nginx/sites-enabled/interview.conf /etc/nginx/sites-available/interview.conf && sudo systemctl reload nginx
sudo certbot delete --cert-name interview
sudo rm -rf /opt/interview
```

Sau đó dọn phía GitHub:
- xoá public key CI khỏi `~/.ssh/authorized_keys`,
- xoá environment `production`,
- xoá package trên GHCR.

## 8. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| nginx trả **502 Bad Gateway** | Container `app` chưa chạy hoặc chưa healthy | `cd /opt/interview && docker compose ps && docker compose logs --tail 100 app`. Kiểm tra `.env` có đủ biến không. |
| Trang tải được nhưng **không cập nhật realtime** | Thiếu header `Upgrade` ở nginx, hoặc một proxy khác chặn WebSocket | So file site đang dùng với `deploy/nginx/interview.conf`, rồi chạy `sudo nginx -t && sudo systemctl reload nginx`. Trong DevTools, request `socket.io/?EIO=4&transport=websocket` phải trả 101. |
| `compose up` báo **`set MONGO_ROOT_USER in .env`** | File `.env` thiếu biến hoặc sai tên biến | So với `deploy/.env.example`. |
| **`manifest unknown`** khi pull | `IMAGE_TAG` trỏ tới tag không có trên GHCR | Đặt `IMAGE_TAG=fofl` hoặc một sha đã build, rồi chạy `docker compose pull app`. |
| **`denied`** khi pull | Package GHCR đang để private | Đổi package sang Public (xem mục 4). |
| Job deploy lỗi **`Permission denied (publickey)`** | Sai `VM_SSH_KEY`, hoặc public key CI chưa có trong `authorized_keys` | Làm lại mục 3. |
| Không truy cập được từ ngoài, dù `curl -I http://127.0.0.1` trên VM vẫn chạy | Port chưa mở ở Security List hoặc ở iptables | Làm lại mục 2.2. |
| Mongo bị kill vì hết RAM (OOM) | VM thiếu RAM | Chạy `docker stats` để xem; giảm `--wiredTigerCacheSizeGB` hoặc thêm swap. |
