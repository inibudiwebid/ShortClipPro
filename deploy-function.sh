#!/bin/bash

# Script untuk mendeploy YouTube Downloader Edge Function
# Pastikan Anda sudah login ke Supabase CLI sebelum menjalankan script ini

echo "🚀 Memulai deployment YouTube Downloader Function..."

# Cek apakah Supabase CLI terinstall
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI tidak ditemukan. Silakan install terlebih dahulu."
    echo "   Installasi: https://supabase.com/docs/guides/cli/getting-started"
    exit 1
fi

# Cek apakah sudah login
if ! supabase status &> /dev/null; then
    echo "❌ Belum login ke Supabase. Silakan login terlebih dahulu."
    echo "   Jalankan: supabase login"
    exit 1
fi

# Konfigurasi
PROJECT_REF="wgprbuxiodvfkdnkcwwd"
FUNCTION_NAME="youtube-downloader"

echo "📋 Konfigurasi:"
echo "   Project Ref: $PROJECT_REF"
echo "   Function Name: $FUNCTION_NAME"
echo ""

# Tanya konfirmasi
read -p "Lanjutkan deployment? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment dibatalkan."
    exit 0
fi

# Deploy function
echo "📤 Mendeploy function..."
supabase functions deploy $FUNCTION_NAME --project-ref=$PROJECT_REF --no-verify-jwt

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment berhasil!"
    echo ""
    echo "📋 Langkah selanjutnya:"
    echo "   1. Buka dashboard Supabase: https://supabase.com/dashboard"
    echo "   2. Pergi ke 'Edge Functions'"
    echo "   3. Cari function '$FUNCTION_NAME'"
    echo "   4. Pastikan status: 'Deployed'"
    echo ""
    echo "🔗 URL Function:"
    echo "   https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION_NAME"
    echo ""
    echo "📝 Testing:"
    echo "   curl -X POST https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION_NAME \\"
    echo "     -H \"Authorization: Bearer <anon-key>\" \\"
    echo "     -H \"Content-Type: application/json\" \\"
    echo "     -d '{\"videoId\": \"dQw4w9WgXcQ\"}'"
else
    echo ""
    echo "❌ Deployment gagal!"
    echo ""
    echo "💡 Tips:"
    echo "   - Pastikan project Supabase dalam status 'ACTIVE'"
    echo "   - Cek DEPLOYMENT_GUIDE.md untuk troubleshooting"
    echo "   - Jalankan: supabase login jika belum login"
fi
