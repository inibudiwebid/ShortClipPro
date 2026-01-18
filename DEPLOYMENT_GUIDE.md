# Deployment Guide untuk YouTube Downloader Function

## Masalah yang Dihadapi

Project Supabase dalam status 'INACTIVE' sehingga tidak bisa mendeploy Edge Function.

## Solusi

### Langkah 1: Aktifkan Project Supabase

1. Buka dashboard Supabase: https://supabase.com/dashboard
2. Login dengan akun Anda
3. Pilih project yang sesuai (Chatbot UMKM - wgprbuxiodvfkdnkcwwd)
4. Klik "Settings" > "General"
5. Cari bagian "Project Status"
6. Klik "Activate Project" atau "Restart Project"
7. Tunggu hingga project aktif (status: 'ACTIVE')

### Langkah 2: Deploy Edge Function

Setelah project aktif, jalankan command berikut:

```bash
# Dari root directory project
supabase functions deploy youtube-downloader --project-ref=wgprbuxiodvfkdnkcwwd --no-verify-jwt
```

### Langkah 3: Verifikasi Deployment

1. Buka dashboard Supabase
2. Pergi ke "Edge Functions"
3. Cari function "youtube-downloader"
4. Pastikan status: "Deployed"

## Alternatif: Deploy Manual

Jika CLI tidak berfungsi, Anda bisa deploy manual melalui dashboard:

1. Buka dashboard Supabase
2. Pergi ke "Edge Functions"
3. Klik "New Function"
4. Upload file `supabase/functions/youtube-downloader/index.ts`
5. Konfigurasi:
   - Function Name: `youtube-downloader`
   - Verify JWT: `false`
   - Import Map: `supabase/functions/youtube-downloader/deno.json`
6. Klik "Deploy"

## Troubleshooting

### Error: "Project is INACTIVE"

**Solusi**: Aktifkan project melalui dashboard Supabase (lihat Langkah 1 di atas)

### Error: "entrypoint path does not exist"

**Solusi**: Pastikan file berada di lokasi yang benar:
- `supabase/functions/youtube-downloader/index.ts`
- `supabase/functions/youtube-downloader/deno.json`

### Error: "Cannot retrieve service for project"

**Solusi**: Project mungkin sedang dalam proses restart. Tunggu beberapa menit dan coba lagi.

## Testing Setelah Deployment

Setelah function berhasil di-deploy, test dengan:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/youtube-downloader \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"videoId": "dQw4w9WgXcQ"}'
```

Ganti `<project-ref>` dengan project reference Anda dan `<anon-key>` dengan anon key dari dashboard.

## Environment Variables

Pastikan environment variables sudah dikonfigurasi di file `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Anda bisa mendapatkan nilai ini dari dashboard Supabase:
1. Settings > API
2. Copy "URL" dan "anon public"
