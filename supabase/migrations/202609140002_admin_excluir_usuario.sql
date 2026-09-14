create or replace function public.excluir_usuario(p_usuario_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
begin
  if not private.eh_admin() then
    raise exception using errcode = '42501', message = 'Apenas administradores podem excluir usuários';
  end if;

  if p_usuario_id = auth.uid() then
    raise exception using errcode = '42501', message = 'O administrador não pode excluir a própria conta';
  end if;

  select tipo
    into v_tipo
  from public.perfis
  where id = p_usuario_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Usuário não encontrado';
  end if;

  if v_tipo = 'admin' then
    raise exception using errcode = '42501', message = 'Contas de administrador são protegidas';
  end if;

  if exists (select 1 from public.emprestimos where usuario_id = p_usuario_id or criado_por = p_usuario_id)
     or exists (select 1 from public.reservas where usuario_id = p_usuario_id)
     or exists (select 1 from public.livros where criado_por = p_usuario_id) then
    raise exception using errcode = '23503', message = 'Usuário possui histórico no acervo e não pode ser excluído';
  end if;

  delete from auth.users where id = p_usuario_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Conta de autenticação não encontrada';
  end if;

  return p_usuario_id;
end;
$$;

revoke all on function public.excluir_usuario(uuid) from public;
grant execute on function public.excluir_usuario(uuid) to authenticated;

update public.perfis
set tipo = 'aluno'
where email = 'joao-4483469@estudante.rs.gov.br'
  and nome = 'João Pedro Rodrigues Machado'
  and tipo <> 'admin';
