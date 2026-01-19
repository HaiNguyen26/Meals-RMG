# Thiết kế UI/UX – Đăng ký ăn trưa nội bộ

Tài liệu chuẩn hóa hệ thống màu sắc, typography, layout, trạng thái, và flow cho ứng dụng đăng ký ăn trưa nội bộ theo phong cách hiện đại – gọn – doanh nghiệp – dễ nhìn trong nhà ăn.

## 1) Color System (Corporate Modern)

### Palette chính

| Mục đích | Màu | Hex |
| --- | --- | --- |
| Primary | Xanh doanh nghiệp | #2563EB |
| Secondary | Xanh ngọc | #0EA5E9 |
| Success | Xanh lá dịu | #22C55E |
| Warning | Vàng nhạt | #FACC15 |
| Danger | Đỏ nhạt | #EF4444 |
| Background | Trắng xám | #F8FAFC |
| Card | Trắng | #FFFFFF |
| Text chính | Xám đậm | #0F172A |
| Text phụ | Xám | #64748B |
| Border | Xám rất nhạt | #E5E7EB |

### Token gợi ý (CSS variables)

```css
:root {
  --color-primary: #2563eb;
  --color-secondary: #0ea5e9;
  --color-success: #22c55e;
  --color-warning: #facc15;
  --color-danger: #ef4444;
  --color-bg: #f8fafc;
  --color-card: #ffffff;
  --color-text: #0f172a;
  --color-text-muted: #64748b;
  --color-border: #e5e7eb;
}
```

## 2) Font chữ & Typography

### Font đề xuất

- Inter (Google Font)
- Phổ biến cho dashboard, dễ đọc trên màn hình lớn

### Typo scale

| Thành phần | Size | Weight |
| --- | --- | --- |
| Title | 24px | 600 |
| Section | 18px | 500 |
| Body | 14–15px | 400 |
| Label | 12px | 400 |

## 3) Layout & Spacing

### Layout

- Grid 12 cột
- Max width: 1280px
- Sidebar mỏng (72px) hoặc topbar

### Spacing chuẩn

- Padding card: 16–20px
- Gap giữa card: 16px
- Border radius: 12px

## 4) Hiệu ứng & Motion

### Animation guideline

- Chỉ dùng micro-interaction
- Thời gian: 120–180ms
- Easing: ease-out

### Ví dụ

- Hover card → nổi nhẹ (shadow + translateY -2px)
- Button click → ripple mờ 120ms
- Realtime update → highlight nền xanh nhạt 0.6s
- Toast → trượt từ trên xuống (fade + slide)

### Không dùng

- Bounce
- Animation dài
- Loading phức tạp

## 5) Thiết kế từng màn hình (Style cụ thể)

### 👨‍💼 Trưởng phòng – Dashboard đăng ký suất ăn (CORE)

- 1 card trung tâm (focus 100%), không sidebar rườm rà
- Ngày cố định: Ngày mai
- Input number (stepper + / -), font số lớn 28–32px
- Ghi chú nhỏ: Tổng số người dự kiến ăn trưa
- CTA: nút [LƯU] (primary)

Hiệu ứng:

- Khi nhập số: border card đổi sang xanh
- Khi lưu thành công: card glow xanh nhạt 0.6s + toast xanh

Trạng thái sau 16:00:

- Input disabled
- Overlay mờ + icon 🔒
- Text: Đã khóa đăng ký cho ngày mai

### 🧾 Trưởng phòng – Lịch sử đăng ký (read-only)

- Table gọn: Ngày | Số suất | Thời gian cập nhật
- Zebra row nhẹ
- Không filter phức tạp
- Mục tiêu: đối chiếu, minh bạch nội bộ

### 🛠 Admin – Dashboard tổng

- KPI card lớn, số rất to
- Bảng tổng hợp: Phòng ban | Số suất | Cập nhật bởi
- CTA: [KHÓA ĐĂNG KÝ], [XUẤT EXCEL]
- Shadow nhẹ: `0 4px 12px rgba(0,0,0,0.04)`

### 🍳 Trưởng nhà ăn – Màn hình bếp (read-only)

- Font lớn (32–40px), ít chữ, contrast cao
- Không sidebar
- Tổng suất + chi tiết theo phòng ban

## 6) Trạng thái hệ thống (State Design)

| State | Thiết kế |
| --- | --- |
| Chưa đăng ký | Badge vàng nhạt |
| Đã đăng ký | Badge xanh |
| Bị khóa | Overlay mờ + icon 🔒 |
| Thành công | Toast xanh |
| Hệ thống khóa | Toast vàng |
| Lỗi | Toast đỏ nhạt |

## 7) Dark mode (Optional)

- Background: #020617
- Card: #020617
- Text: #E5E7EB
- Primary vẫn giữ xanh

Phù hợp trưởng nhà ăn xem ban sáng sớm.

## 8) Tổng kết phong cách

| Tiêu chí | Định hướng |
| --- | --- |
| Cảm giác | Chuyên nghiệp – sạch |
| Màu | Doanh nghiệp – dịu |
| UI | Card-based |
| UX | 1 thao tác / 1 quyết định |
| Hiệu ứng | Gần như không nhận ra |

---

## 🔁 FLOW TỔNG THỂ (END-TO-END)

Trưởng phòng → Nhập tổng suất ăn phòng → Hệ thống ghi nhận → Admin tổng hợp → 16:00 khóa đăng ký → Trưởng nhà ăn xem & nấu.

## 1) FLOW – TRƯỞNG PHÒNG (CORE)

Trước 16:00:

Login → Màn hình “Đăng ký ăn trưa – Phòng CNC” → Nhập tổng suất → [LƯU] → Toast: Đã cập nhật thành công.

Sau 16:00:

Login → Màn hình bị khóa 🔒 → Chỉ xem số đã đăng ký.

Rule:

- Mỗi phòng 1 bản ghi / ngày
- Không có dropdown, không có loại suất

## 2) FLOW – ADMIN

Login Admin → Dashboard tổng → Xem tổng suất + theo phòng → 16:00 → [KHÓA ĐĂNG KÝ] → Xuất Excel.

## 3) FLOW – TRƯỞNG NHÀ ĂN (READ-ONLY)

Login → Chọn ngày mai → Xem tổng suất + chi tiết theo phòng → Nấu ăn.

Đặc điểm: không form, không nút bấm, không rủi ro thao tác nhầm.

## 4) FLOW THỜI GIAN (TIME-BASED FLOW)

| Thời điểm | Trạng thái |
| --- | --- |
| 08:00 – 15:59 | Trưởng phòng đăng ký tự do |
| 16:00 | 🔒 Khóa |
| Sau 16:00 | Chỉ xem |
| Sáng hôm sau | Nhà ăn nấu |

---

## 🧩 STACK KỸ THUẬT ĐỀ XUẤT (CHỐT)

### 1) Frontend (Realtime UI)

- React 18
- Vite
- TypeScript
- UI: Ant Design (enterprise) + CSS-in-JS hoặc Tailwind (tuỳ team)
- Realtime: Socket.IO client + React Query

**Cách làm:** load data ban đầu bằng REST, realtime chỉ push delta (thay đổi).

### 2) Backend (Realtime Engine)

- NestJS + TypeScript
- REST API (CRUD, export, auth)
- WebSocket Gateway
- Socket.IO (WebSocket + fallback polling)
- Room theo date: `room:lunch:2026-01-17`

Logic khi user đăng ký ăn: ghi DB → emit event realtime.

### 3) Database & Cache

- PostgreSQL
- Redis Pub/Sub giữa nhiều instance backend để giữ realtime ổn khi scale

### 4) Auth & Role

- JWT (access + refresh)
- RBAC: `manager`, `admin`, `kitchen`
- Realtime event check role trước khi join room


