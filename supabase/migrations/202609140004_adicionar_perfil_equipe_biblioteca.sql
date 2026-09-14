alter table public.perfis
  drop constraint if exists perfis_tipo_check;

alter table public.perfis
  add constraint perfis_tipo_check
  check (tipo in ('aluno', 'professor', 'bibliotecaria', 'equipe', 'admin'));

create or replace function private.pode_operar_biblioteca()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.perfis
    where id = (select auth.uid())
      and tipo in ('bibliotecaria', 'equipe', 'admin')
  );
$$;

create or replace function public.definir_tipo_usuario(p_usuario_id uuid, p_tipo text)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if not (select private.eh_admin()) then
    raise exception using errcode = '42501', message = 'Apenas administradores podem alterar perfis';
  end if;

  if p_tipo not in ('aluno', 'professor', 'bibliotecaria', 'equipe') then
    raise exception using errcode = '22023', message = 'Tipo de usuário inválido';
  end if;

  update public.perfis
  set tipo = p_tipo,
      turma = case when p_tipo in ('aluno', 'equipe') then turma else null end
  where id = p_usuario_id
    and tipo <> 'admin';

  if not found then
    raise exception using errcode = 'P0002', message = 'Usuário não encontrado ou protegido';
  end if;

  return p_usuario_id;
end;
$$;

revoke all on function public.definir_tipo_usuario(uuid, text) from public;
revoke all on function public.definir_tipo_usuario(uuid, text) from anon;
grant execute on function public.definir_tipo_usuario(uuid, text) to authenticated;
