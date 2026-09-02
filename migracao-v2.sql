-- Atualiza o banco existente para bibliotecária, reservas, capas e resumo.

begin;

alter table public.perfis drop constraint if exists perfis_tipo_check;
alter table public.perfis add constraint perfis_tipo_check check (
  tipo in ('aluno', 'professor', 'bibliotecaria', 'admin')
);

alter table public.livros add column if not exists resumo text;
alter table public.livros add column if not exists capa_path text;
alter table public.livros add column if not exists atualizado_em timestamptz not null default now();

create table if not exists public.reservas (
  id bigint generated always as identity primary key,
  livro_id bigint not null references public.livros(id) on delete restrict,
  usuario_id uuid not null references public.perfis(id) on delete restrict,
  status text not null default 'ativa' check (status in ('ativa', 'atendida', 'cancelada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

create index if not exists emprestimos_usuario_ativos_idx
  on public.emprestimos(usuario_id, data_devolucao) where devolvido_em is null;
create index if not exists reservas_usuario_status_idx
  on public.reservas(usuario_id, status, criado_em desc);
create index if not exists reservas_livro_status_idx
  on public.reservas(livro_id, status, criado_em);
create unique index if not exists reservas_ativas_unicas_idx
  on public.reservas(livro_id, usuario_id) where status = 'ativa';

create or replace function private.pode_operar_biblioteca()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.perfis
    where id = (select auth.uid()) and tipo in ('bibliotecaria', 'admin')
  );
$$;

create or replace function private.pode_reservar()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.perfis
    where id = (select auth.uid()) and tipo in ('aluno', 'professor')
  );
$$;

revoke all on function private.pode_operar_biblioteca() from public, anon;
revoke all on function private.pode_reservar() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.pode_operar_biblioteca() to authenticated;
grant execute on function private.pode_reservar() to authenticated;

alter table public.reservas enable row level security;

drop policy if exists perfis_ler_proprio_ou_admin on public.perfis;
drop policy if exists perfis_ler_proprio_ou_equipe on public.perfis;
drop policy if exists perfis_atualizar_admin on public.perfis;
create policy perfis_ler_proprio_ou_equipe on public.perfis
  for select to authenticated
  using (id = (select auth.uid()) or (select private.pode_operar_biblioteca()));
create policy perfis_atualizar_admin on public.perfis
  for update to authenticated
  using ((select private.eh_admin()) and tipo <> 'admin')
  with check (
    (select private.eh_admin())
    and tipo in ('aluno', 'professor', 'bibliotecaria')
  );

drop policy if exists livros_inserir_admin on public.livros;
drop policy if exists livros_atualizar_admin on public.livros;
drop policy if exists livros_excluir_admin on public.livros;
drop policy if exists livros_inserir_equipe on public.livros;
drop policy if exists livros_atualizar_equipe on public.livros;
drop policy if exists livros_excluir_equipe on public.livros;
create policy livros_inserir_equipe on public.livros
  for insert to authenticated
  with check (
    (select private.pode_operar_biblioteca()) and criado_por = (select auth.uid())
  );
create policy livros_atualizar_equipe on public.livros
  for update to authenticated
  using ((select private.pode_operar_biblioteca()))
  with check ((select private.pode_operar_biblioteca()));
create policy livros_excluir_equipe on public.livros
  for delete to authenticated using ((select private.pode_operar_biblioteca()));

drop policy if exists emprestimos_ler_proprio_ou_admin on public.emprestimos;
drop policy if exists emprestimos_inserir_admin on public.emprestimos;
drop policy if exists emprestimos_atualizar_admin on public.emprestimos;
drop policy if exists emprestimos_ler_proprio_ou_equipe on public.emprestimos;
drop policy if exists emprestimos_inserir_equipe on public.emprestimos;
drop policy if exists emprestimos_atualizar_equipe on public.emprestimos;
create policy emprestimos_ler_proprio_ou_equipe on public.emprestimos
  for select to authenticated
  using (
    usuario_id = (select auth.uid()) or (select private.pode_operar_biblioteca())
  );
create policy emprestimos_inserir_equipe on public.emprestimos
  for insert to authenticated
  with check (
    (select private.pode_operar_biblioteca()) and criado_por = (select auth.uid())
  );
create policy emprestimos_atualizar_equipe on public.emprestimos
  for update to authenticated
  using ((select private.pode_operar_biblioteca()))
  with check ((select private.pode_operar_biblioteca()));

drop policy if exists reservas_ler_proprio_ou_equipe on public.reservas;
drop policy if exists reservas_criar_propria on public.reservas;
drop policy if exists reservas_atualizar_equipe on public.reservas;
drop policy if exists reservas_cancelar_propria on public.reservas;
create policy reservas_ler_proprio_ou_equipe on public.reservas
  for select to authenticated
  using (
    usuario_id = (select auth.uid()) or (select private.pode_operar_biblioteca())
  );
create policy reservas_criar_propria on public.reservas
  for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and status = 'ativa'
    and (select private.pode_reservar())
  );
create policy reservas_atualizar_equipe on public.reservas
  for update to authenticated
  using ((select private.pode_operar_biblioteca()))
  with check ((select private.pode_operar_biblioteca()));
create policy reservas_cancelar_propria on public.reservas
  for update to authenticated
  using (usuario_id = (select auth.uid()) and status = 'ativa')
  with check (usuario_id = (select auth.uid()) and status = 'cancelada');

create or replace function public.reservar_livro(p_livro_id bigint)
returns bigint language plpgsql security invoker set search_path = ''
as $$
declare
  v_reserva_id bigint;
begin
  if not (select private.pode_reservar()) then
    raise exception using errcode = '42501', message = 'Somente alunos e professores podem reservar livros';
  end if;
  if not exists (select 1 from public.livros where id = p_livro_id) then
    raise exception using errcode = 'P0002', message = 'Livro não encontrado';
  end if;
  if exists (
    select 1 from public.emprestimos
    where livro_id = p_livro_id
      and usuario_id = (select auth.uid())
      and devolvido_em is null
  ) then
    raise exception using errcode = 'P0001', message = 'Você já está com este livro emprestado';
  end if;
  insert into public.reservas (livro_id, usuario_id)
  values (p_livro_id, (select auth.uid())) returning id into v_reserva_id;
  return v_reserva_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'Este livro já está reservado por você';
end;
$$;

create or replace function public.cancelar_reserva(p_reserva_id bigint)
returns bigint language plpgsql security invoker set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
begin
  if v_usuario_id is null then
    raise exception using errcode = '42501', message = 'Sessão inválida';
  end if;
  update public.reservas
  set status = 'cancelada', atualizado_em = now(), finalizado_em = now()
  where id = p_reserva_id
    and status = 'ativa'
    and (
      usuario_id = v_usuario_id or (select private.pode_operar_biblioteca())
    );
  if not found then
    raise exception using errcode = 'P0002', message = 'Reserva ativa não encontrada';
  end if;
  return p_reserva_id;
end;
$$;

create or replace function public.registrar_emprestimo(
  p_livro_id bigint,
  p_usuario_id uuid,
  p_data_emprestimo date,
  p_data_devolucao date
)
returns bigint language plpgsql security invoker set search_path = ''
as $$
declare
  v_livro public.livros%rowtype;
  v_tipo text;
  v_emprestimo_id bigint;
begin
  if not (select private.pode_operar_biblioteca()) then
    raise exception using errcode = '42501', message = 'Apenas a equipe da biblioteca pode registrar empréstimos';
  end if;
  if p_data_devolucao <= p_data_emprestimo then
    raise exception using errcode = '22007', message = 'Data de devolução inválida';
  end if;
  select * into v_livro from public.livros where id = p_livro_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Livro não encontrado';
  end if;
  if v_livro.quantidade_emprestada >= v_livro.estoque_total then
    raise exception using errcode = 'P0001', message = 'Livro sem exemplares disponíveis';
  end if;
  select tipo into v_tipo from public.perfis where id = p_usuario_id;
  if v_tipo is null or v_tipo not in ('aluno', 'professor') then
    raise exception using errcode = 'P0001', message = 'O empréstimo deve ser registrado para aluno ou professor';
  end if;
  if exists (
    select 1 from public.emprestimos
    where livro_id = p_livro_id and usuario_id = p_usuario_id and devolvido_em is null
  ) then
    raise exception using errcode = '23505', message = 'Este leitor já possui um empréstimo ativo deste livro';
  end if;
  insert into public.emprestimos (
    livro_id, usuario_id, data_emprestimo, data_devolucao, criado_por
  ) values (
    p_livro_id, p_usuario_id, p_data_emprestimo, p_data_devolucao, (select auth.uid())
  ) returning id into v_emprestimo_id;
  update public.livros
  set quantidade_emprestada = quantidade_emprestada + 1, atualizado_em = now()
  where id = p_livro_id;
  update public.reservas
  set status = 'atendida', atualizado_em = now(), finalizado_em = now()
  where livro_id = p_livro_id and usuario_id = p_usuario_id and status = 'ativa';
  return v_emprestimo_id;
end;
$$;

create or replace function public.registrar_devolucao(p_emprestimo_id bigint)
returns bigint language plpgsql security invoker set search_path = ''
as $$
declare
  v_emprestimo public.emprestimos%rowtype;
begin
  if not (select private.pode_operar_biblioteca()) then
    raise exception using errcode = '42501', message = 'Apenas a equipe da biblioteca pode registrar devoluções';
  end if;
  select * into v_emprestimo
  from public.emprestimos where id = p_emprestimo_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Empréstimo não encontrado';
  end if;
  if v_emprestimo.devolvido_em is not null then return v_emprestimo.id; end if;
  update public.emprestimos set devolvido_em = now() where id = p_emprestimo_id;
  update public.livros
  set quantidade_emprestada = greatest(0, quantidade_emprestada - 1),
      atualizado_em = now()
  where id = v_emprestimo.livro_id;
  return v_emprestimo.id;
end;
$$;

create or replace function public.definir_tipo_usuario(p_usuario_id uuid, p_tipo text)
returns uuid language plpgsql security invoker set search_path = ''
as $$
begin
  if not (select private.eh_admin()) then
    raise exception using errcode = '42501', message = 'Apenas administradores podem alterar perfis';
  end if;
  if p_tipo not in ('aluno', 'professor', 'bibliotecaria') then
    raise exception using errcode = '22023', message = 'Tipo de usuário inválido';
  end if;
  update public.perfis
  set tipo = p_tipo,
      turma = case when p_tipo = 'aluno' then turma else null end
  where id = p_usuario_id and tipo <> 'admin';
  if not found then
    raise exception using errcode = 'P0002', message = 'Usuário não encontrado ou protegido';
  end if;
  return p_usuario_id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capas-livros', 'capas-livros', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists capas_livros_inserir_equipe on storage.objects;
drop policy if exists capas_livros_ler_equipe on storage.objects;
drop policy if exists capas_livros_atualizar_equipe on storage.objects;
drop policy if exists capas_livros_excluir_equipe on storage.objects;
create policy capas_livros_inserir_equipe on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capas-livros' and (select private.pode_operar_biblioteca()));
create policy capas_livros_ler_equipe on storage.objects
  for select to authenticated
  using (bucket_id = 'capas-livros' and (select private.pode_operar_biblioteca()));
create policy capas_livros_atualizar_equipe on storage.objects
  for update to authenticated
  using (bucket_id = 'capas-livros' and (select private.pode_operar_biblioteca()))
  with check (bucket_id = 'capas-livros' and (select private.pode_operar_biblioteca()));
create policy capas_livros_excluir_equipe on storage.objects
  for delete to authenticated
  using (bucket_id = 'capas-livros' and (select private.pode_operar_biblioteca()));

revoke all on table public.reservas from anon, authenticated;
revoke all on table public.perfis from anon, authenticated;
grant select, update(tipo, turma) on table public.perfis to authenticated;
grant select on table public.reservas to authenticated;
grant insert(livro_id, usuario_id, status) on table public.reservas to authenticated;
grant update(status, atualizado_em, finalizado_em) on table public.reservas to authenticated;
grant usage, select on sequence public.reservas_id_seq to authenticated;
revoke all on function public.reservar_livro(bigint) from public, anon, authenticated;
revoke all on function public.cancelar_reserva(bigint) from public, anon, authenticated;
revoke all on function public.registrar_emprestimo(bigint, uuid, date, date) from public, anon, authenticated;
revoke all on function public.registrar_devolucao(bigint) from public, anon, authenticated;
revoke all on function public.definir_tipo_usuario(uuid, text) from public, anon, authenticated;
grant execute on function public.reservar_livro(bigint) to authenticated;
grant execute on function public.cancelar_reserva(bigint) to authenticated;
grant execute on function public.registrar_emprestimo(bigint, uuid, date, date) to authenticated;
grant execute on function public.registrar_devolucao(bigint) to authenticated;
grant execute on function public.definir_tipo_usuario(uuid, text) to authenticated;

commit;
