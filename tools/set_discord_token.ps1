# Guarda el token del bot de Discord como secreto de Supabase (no queda en ningún archivo).
$t = Read-Host "Pega el token del bot (Developer Portal > Bot > Restablecer token)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($t))
npx --yes supabase secrets set "DISCORD_BOT_TOKEN=$plain" --project-ref dcepxcltgzipkmzpptzn
Read-Host "Listo. Pulsa Enter para cerrar"
