revoke all on function public.excluir_usuario(uuid) from public;
revoke all on function public.excluir_usuario(uuid) from anon;
grant execute on function public.excluir_usuario(uuid) to authenticated;
