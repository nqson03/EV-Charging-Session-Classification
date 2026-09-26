# EV Session Analytics

Web phân loại phiên sạc xe điện theo tài liệu nghiệp vụ **v2.0 FINAL (12/09/2026)** và báo cáo KPI / trend.
Chạy hoàn toàn trên gói miễn phí của Cloudflare (Workers + D1 + KV), không cần thẻ.

**Không cần đăng nhập:** ai có link đều xem, upload, xoá ngày và sửa rule được. Muốn khoá lại thì bật Cloudflare Access (bước 6, tuỳ chọn) — không phải sửa code.

```
apps/web       React 19 + Vite + Tailwind v4 + RTK Query + Recharts   (giao diện, tiếng Anh)
apps/api       Cloudflare Worker (Hono) + D1                          (API, cũng phục vụ luôn file tĩnh của web)
packages/core  Rule engine + tính KPI, TypeScript thuần, dùng chung cho web và API
```

## Kiến trúc dữ liệu (đọc trước khi sửa)

- **File thô không bao giờ lên server.** Trình duyệt đọc file (.xlsx/.csv) trong Web Worker, gom nhóm theo các
  cột gốc *chưa phân loại* (ngày, trạm, firmware, `li_do_dung_sac`, eMSP rỗng hay không) rồi mới upload.
  83.142 dòng/ngày → ~115 dòng (`fact_segment`) + ~4.800 dòng (`fact_station`). Nhờ vậy nằm gọn trong giới hạn
  D1 free (100k dòng ghi/ngày, 5 GB).
- **Phân loại chỉ có một chỗ:** `packages/core/src/classify.ts`. Server lưu kết quả phân loại cho từng cặp
  (lý do dừng, eMSP rỗng) trong bảng nhỏ `reason_dim`; SQL chỉ join, không chứa logic nghiệp vụ.
- **Sửa rule → toàn bộ lịch sử tự phân loại lại**, không cần upload lại (chỉ tính lại `reason_dim`).
- Mỗi file = 1 ngày báo cáo (ngày xuất hiện nhiều nhất trong `thoi_gian_ket_thuc`, hoặc lấy từ tên sheet/file
  dạng `260922_…`, hoặc chọn tay). Upload lại cùng ngày = ghi đè. Server đối chiếu tổng số dòng trước khi commit.
- Firmware cũ/mới theo build stamp đầu chuỗi (mặc định từ `260421` là mới), model Core/Kern/AC đọc từ chuỗi version.
  Cả hai sửa được trên trang **Classification rules**.
- Trang Stations giới hạn 92 ngày/truy vấn (bảng trạm là bảng lớn nhất, tốn quota đọc D1 nhất). Mọi response
  được cache trong KV theo `data_version` (tăng mỗi lần ghi), nên xem lại dashboard gần như không tốn quota D1.

## Chạy local

Yêu cầu Node 22+, pnpm 10.

```bash
pnpm install
pnpm --filter @evsa/api db:migrate:local

pnpm dev:api        # terminal 1 — Worker + D1 local tại http://localhost:8787
pnpm dev:web        # terminal 2 — Vite tại http://localhost:5173 (proxy /api → 8787)
```

Mở http://localhost:5173 → **Data uploads** → kéo file vào.

## Test

```bash
pnpm test                                             # unit + golden test của core
# End-to-end API (cần pnpm dev:api đang chạy và file fixtures/private/Data_raw.xlsx):
API_URL=http://localhost:8787 pnpm --filter @evsa/api test:e2e
```

Golden test đối chiếu với một bản cài đặt độc lập bằng Python/pandas trên file thật 22/09/2026:
Success 90.48% · Failed 9.52% · EVCS 7.65% · Non-EVCS 1.87% · Top 3 EVCS: EVDisconnected 4.95%,
Not_Start_Charging 1.84%, TimeoutV2G 0.33% · 2 dòng DoorAccess Unclassified.
File khách hàng nằm trong `fixtures/private/` và **bị git-ignore** — không commit.

## Deploy lên Cloudflare (miễn phí)

Tất cả lệnh chạy trong `apps/api`.

1. **Đăng nhập:** `npx wrangler login`
2. **Tạo database:** `npx wrangler d1 create evsa` → copy `database_id` vào `wrangler.jsonc`.
3. **Tạo cache:** `npx wrangler kv namespace create CACHE` → copy `id` vào `wrangler.jsonc`.
   (Không muốn dùng cache thì xoá khối `kv_namespaces`; app vẫn chạy.)
4. **Tạo bảng:** `pnpm db:migrate:remote`
5. **Deploy:** từ thư mục gốc chạy `pnpm run deploy` (build web rồi `wrangler deploy`).
   URL có dạng `https://ev-session-analytics.<subdomain>.workers.dev`.
   Xong — gửi link cho khách là dùng được.
6. **(Tuỳ chọn) Bật đăng nhập bằng Cloudflare Access (free ≤ 50 người)** nếu sau này cần khoá web:
   - Dashboard → Workers & Pages → `ev-session-analytics` → Settings → Domains & Routes → dòng `workers.dev`
     → bật **Cloudflare Access**. Cloudflare tự tạo một Access application.
   - Zero Trust → Access → Applications → mở application vừa tạo → Policies: cho phép email của khách
     (hoặc cả domain, ví dụ `@company.com`). Đăng nhập mặc định bằng mã OTP gửi qua email.
   - Copy **Application Audience (AUD) Tag** và team domain (`https://<team>.cloudflareaccess.com`) vào
     `ACCESS_AUD` và `ACCESS_TEAM_DOMAIN` trong `wrangler.jsonc`, rồi `pnpm run deploy` lại.
   - Khi hai biến này có giá trị, Worker verify JWT của Access trên mọi request `/api/*` (không gọi API vòng qua được),
     và ghi email người upload / sửa rule vào lịch sử. Để trống = web mở.
   (Tên menu trên dashboard Cloudflare có thể khác đôi chút theo thời điểm.)
7. Tuỳ chọn: gắn domain riêng tại Settings → Domains & Routes, rồi bật Access cho domain đó theo cách tương tự.

### Giới hạn gói free (kiểm tra tháng 9/2026)

| Tài nguyên | Giới hạn | Mức dùng ước tính |
|---|---|---|
| D1 ghi | 100.000 dòng/ngày | ~5.000–10.000 mỗi lần upload |
| D1 đọc | 5 triệu dòng/ngày | Overview 30 ngày ≈ 3.500 dòng; Stations 30 ngày ≈ 145.000 dòng (có cache) |
| D1 dung lượng | 5 GB | ~1 MB/ngày dữ liệu |
| Workers | 100.000 request/ngày | file tĩnh không tính |
| KV | 100.000 đọc, 1.000 ghi/ngày | 1 ghi cho mỗi tổ hợp bộ lọc mới |

Từ 01/09/2026 Cloudflare chặn hẳn truy vấn D1 khi vượt quota ngày (reset 0h UTC), nên đừng bỏ KV cache.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/meta` | user, danh sách ngày đã upload, `data_version` |
| GET | `/api/report?from&to&period=day\|week\|month` | số đếm đã phân loại theo kỳ × firmware × nhãn |
| GET | `/api/stations?from&to` | theo trạm × nhãn (≤ 92 ngày) |
| POST | `/api/ingest/begin` · `/rows` · `/commit` | upload theo chunk, commit có đối chiếu tổng dòng |
| DELETE | `/api/uploads/:date` | xoá một ngày |
| GET/PUT/DELETE | `/api/rules[/:name]`, POST `/api/rules/reset` | mapping lý do dừng + nhật ký thay đổi |
| GET | `/api/firmware`, PUT `/api/settings/firmware`, PUT/DELETE `/api/firmware/:fw[/override]` | dòng firmware / model |
