# 🚀 NebengJek – Backend System
NebengJek adalah sistem backend untuk layanan ojek online yang terinspirasi dari Gojek dan Grab. Proyek ini mengimplementasikan layanan booking, pencarian driver terdekat (matching), pelacakan real-time (tracking), dan notifikasi. Aplikasi ini dikembangkan menggunakan pendekatan Monorepo dengan framework NestJS

# 🏗️ Teknologi & Tools
|Fungsi|Teknologi|
|---|---|
|Bahasa Pemrograman|TypeScript|
|Framework Backend|NestJS (Monorepo)|
|Database|PostgreSQL, Redis|
|Message Broker|RabbitMQ (Async Communication)|
|Realtime Communication|WebSocket (NestJS Gateway)|
|Containerization|Docker + docker-compose|
|Autentikasi|JWT (JSON Web Token)|
|Testing|Jest + Supertest|
|Arsitektur Service|Microservices Modular dalam Monorepo|
|Cloud Deployment|AWS EC2 (opsional), juga bisa lokal|

# 📂 Struktur Monorepo
- **nebengjek/**
  - **libs/**
    - common/
    - interfaces/
  - **docs/**
    - diagrams/
    - contracts/
    - pictures/
  - **apps/**
    - notification-service/
    - matching-service/
    - booking-service/
    - user-service/
    - api-gateway/
    - tracking-service/
  - docker-compose.yml
  - README.md
  - .env.example
  - .gitignore

# 🔐 Password Hashing
- Menggunakan `bcrypt` untuk keamanan
- Salt rounds: 10 (default)
- Digunakan untuk pengamanan akun user & driver

# 🧩 Komponen Utama
1. User Service
    * Registrasi & login user / driver
    * Profile & role (penumpang/driver)
    * Generate JWT token
2. Booking Service
    * Buat booking
    * Update status booking (requested, accepted, completed)
    * Cancel atau timeout
3. Matching Service
    * Ambil lokasi user dari request
    * Cari driver terdekat dari Redis
    * Mengirim pesan ke driver
4. Notification Service
    * WebSocket handler
    * Kirim update real-time posisi atau status booking ke user atau driver
5. Tracking Service
    * Driver update lokasi
    * User fetch lokasi driver secara real-time

# 🗺️ High-Level Architecture
Deskripsi:
* API Gateway menangani routing dari client
* Setiap service berkomunikasi via REST/gRPC atau RabbitMQ
* Redis menyimpan posisi driver real-time
* PostgreSQL menyimpan data utama
* WebSocket untuk komunikasi real-time

# 🔍 ERD (Entity Relationship Diagram)
Entity yang dirancang:
* User (Passenger, Driver)
* Booking
* Trip
* Driver Profile
* Notification

![ERD](docs/pictures/erd.png)

# ⚙️ Menjalankan Proyek
##  Local Setup
1. Install semua library:

    `npm install`

    jangan lupa `.env` di tambahkan dan di isi semua value yang dibutuhkan

2. Generate prisma:

    `npx prisma generate`

    jika belum ada table nya, dapat menjalankan migration dengan cara `npx prisma migrate dev`, jika di database tersebut sebelumnya sudah ada schema public, dapat menjalankan `npx prisma migrate reset` (hati-hati dengan perintah ini, ini akan menghapus semua data di database).

    Dan jika butuh data seeder dan menjalankan seeder dengan cara `npx prisma db seed`

3. Jalankan aplikasi:

    `nx run-many --target=serve --all`
    atau jika ingin menjalankan satu service bisa menggunakan (misal service user):

    `npm run start:user`

    `docker-compose up -d api-gateway user-service` contoh untuk menjalankan service user beserta api-gateway nya

4. Cek dokumentasi API (Swagger) di:

    `localhost:3000/api` (API Gateway)

# 🧪 End-to-End Testing (E2E)
Berikut ini beberapa skenario E2E yang akan diuji:
|Skema|Deskripsi|
|---|---|
|Register & Login|User dan Driver bisa register & auth|
|Booking Order|User buat booking|
|Matching Driver|Sistem cari driver tersedia|
|Accept Order|Driver menerima|
|Tracking|User melihat lokasi driver real-time|
|Complete Trip|Trip selesai dan status diupdate|

# 📌 Asumsi Proyek
* Lokasi dari Telkomsel disimulasikan menggunakan dummy koordinat
* Matching menggunakan perhitungan jarak sederhana (haversine/Euclidean)
* Transaksi real money tidak diimplementasikan
* Beberapa data disimpan sementara di Redis (misalnya lokasi driver)
* Event async diatur via RabbitMQ basic queue

# 🤝 Tim & Kontribusi
Disiapkan untuk keperluan assesment backend engineer 2025.
Ditulis dan dikembangkan secara mandiri.