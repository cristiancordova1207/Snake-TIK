-- Las estadísticas de descargas ya no se pueden leer con la clave pública: solo el administrador a través de snake-api.
revoke execute on function public.fluxy_stats(text, integer) from public, anon, authenticated;
grant execute on function public.fluxy_stats(text, integer) to service_role;
