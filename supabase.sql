-- Biblioteca Escolar Vicente Dutra
-- Execute este arquivo inteiro no SQL Editor do Supabase.

begin;

create schema if not exists private;

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 2 and 120),
  turma text,
  tipo text not null default 'aluno' check (tipo in ('aluno', 'professor', 'admin')),
  email text not null unique,
  criado_em timestamptz not null default now()
);

create table if not exists public.livros (
  id bigint generated always as identity primary key,
  titulo text not null check (char_length(trim(titulo)) between 1 and 180),
  autor text not null check (char_length(trim(autor)) between 1 and 160),
  categoria text,
  ano smallint check (ano is null or ano between 0 and 2100),
  estoque_total integer not null default 1 check (estoque_total between 1 and 9999),
  quantidade_emprestada integer not null default 0 check (
    quantidade_emprestada >= 0 and quantidade_emprestada <= estoque_total
  ),
  criado_por uuid not null references public.perfis(id) on delete restrict,
  criado_em timestamptz not null default now()
);

create table if not exists public.emprestimos (
  id bigint generated always as identity primary key,
  livro_id bigint not null references public.livros(id) on delete restrict,
  usuario_id uuid not null references public.perfis(id) on delete restrict,
  data_emprestimo date not null default current_date,
  data_devolucao date not null,
  devolvido_em timestamptz,
  criado_por uuid not null references public.perfis(id) on delete restrict,
  criado_em timestamptz not null default now(),
  constraint emprestimos_datas_validas check (data_devolucao > data_emprestimo)
);

create index if not exists perfis_tipo_idx on public.perfis(tipo);
create index if not exists livros_titulo_idx on public.livros(titulo);
create index if not exists livros_criado_por_idx on public.livros(criado_por);
create index if not exists emprestimos_usuario_idx on public.emprestimos(usuario_id);
create index if not exists emprestimos_livro_idx on public.emprestimos(livro_id);
create index if not exists emprestimos_criado_por_idx on public.emprestimos(criado_por);
create index if not exists emprestimos_ativos_idx
  on public.emprestimos(livro_id)
  where devolvido_em is null;

-- Cria automaticamente o perfil público após o cadastro no Supabase Auth.
create or replace function private.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_nome text;
  v_turma text;
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' or tg_op <> 'INSERT' then
    raise exception 'Função permitida somente pelo gatilho de cadastro';
  end if;

  v_tipo := case
    when new.raw_user_meta_data ->> 'tipo' in ('aluno', 'professor')
      then new.raw_user_meta_data ->> 'tipo'
    else 'aluno'
  end;

  v_nome := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário'
  );

  v_turma := case
    when v_tipo = 'aluno' then nullif(trim(new.raw_user_meta_data ->> 'turma'), '')
    else null
  end;

  insert into public.perfis (id, nome, turma, tipo, email)
  values (new.id, v_nome, v_turma, v_tipo, lower(new.email));

  return new;
end;
$$;

revoke all on function private.criar_perfil() from public, anon, authenticated;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function private.criar_perfil();

-- Verificação centralizada da permissão administrativa.
create or replace function private.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.perfis
      where id = (select auth.uid())
        and tipo = 'admin'
    );
$$;

revoke all on function private.eh_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.eh_admin() to authenticated;

alter table public.perfis enable row level security;
alter table public.livros enable row level security;
alter table public.emprestimos enable row level security;

drop policy if exists perfis_ler_proprio_ou_admin on public.perfis;
create policy perfis_ler_proprio_ou_admin
  on public.perfis for select
  to authenticated
  using (id = (select auth.uid()) or (select private.eh_admin()));

drop policy if exists livros_ler_autenticado on public.livros;
create policy livros_ler_autenticado
  on public.livros for select
  to authenticated
  using (true);

drop policy if exists livros_inserir_admin on public.livros;
create policy livros_inserir_admin
  on public.livros for insert
  to authenticated
  with check (
    (select private.eh_admin())
    and criado_por = (select auth.uid())
  );

drop policy if exists livros_atualizar_admin on public.livros;
create policy livros_atualizar_admin
  on public.livros for update
  to authenticated
  using ((select private.eh_admin()))
  with check ((select private.eh_admin()));

drop policy if exists livros_excluir_admin on public.livros;
create policy livros_excluir_admin
  on public.livros for delete
  to authenticated
  using ((select private.eh_admin()));

drop policy if exists emprestimos_ler_proprio_ou_admin on public.emprestimos;
create policy emprestimos_ler_proprio_ou_admin
  on public.emprestimos for select
  to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select private.eh_admin())
  );

drop policy if exists emprestimos_inserir_admin on public.emprestimos;
create policy emprestimos_inserir_admin
  on public.emprestimos for insert
  to authenticated
  with check (
    (select private.eh_admin())
    and criado_por = (select auth.uid())
  );

drop policy if exists emprestimos_atualizar_admin on public.emprestimos;
create policy emprestimos_atualizar_admin
  on public.emprestimos for update
  to authenticated
  using ((select private.eh_admin()))
  with check ((select private.eh_admin()));

-- Registra empréstimo e atualiza o estoque na mesma transação.
create or replace function public.registrar_emprestimo(
  p_livro_id bigint,
  p_usuario_id uuid,
  p_data_emprestimo date,
  p_data_devolucao date
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_livro public.livros%rowtype;
  v_tipo text;
  v_emprestimo_id bigint;
begin
  if not (select private.eh_admin()) then
    raise exception using errcode = '42501', message = 'Apenas administradores podem registrar empréstimos';
  end if;

  if p_data_devolucao <= p_data_emprestimo then
    raise exception using errcode = '22007', message = 'Data de devolução inválida';
  end if;

  select * into v_livro
  from public.livros
  where id = p_livro_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Livro não encontrado';
  end if;

  if v_livro.quantidade_emprestada >= v_livro.estoque_total then
    raise exception using errcode = 'P0001', message = 'Livro sem exemplares disponíveis';
  end if;

  select tipo into v_tipo
  from public.perfis
  where id = p_usuario_id;

  if v_tipo is distinct from 'aluno' then
    raise exception using errcode = 'P0001', message = 'Somente alunos podem receber empréstimos';
  end if;

  insert into public.emprestimos (
    livro_id, usuario_id, data_emprestimo, data_devolucao, criado_por
  ) values (
    p_livro_id, p_usuario_id, p_data_emprestimo, p_data_devolucao, (select auth.uid())
  ) returning id into v_emprestimo_id;

  update public.livros
  set quantidade_emprestada = quantidade_emprestada + 1
  where id = p_livro_id;

  return v_emprestimo_id;
end;
$$;

-- Registra a devolução sem permitir dupla baixa no estoque.
create or replace function public.registrar_devolucao(p_emprestimo_id bigint)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_emprestimo public.emprestimos%rowtype;
begin
  if not (select private.eh_admin()) then
    raise exception using errcode = '42501', message = 'Apenas administradores podem registrar devoluções';
  end if;

  select * into v_emprestimo
  from public.emprestimos
  where id = p_emprestimo_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Empréstimo não encontrado';
  end if;

  if v_emprestimo.devolvido_em is not null then
    return v_emprestimo.id;
  end if;

  update public.emprestimos
  set devolvido_em = now()
  where id = p_emprestimo_id;

  update public.livros
  set quantidade_emprestada = greatest(0, quantidade_emprestada - 1)
  where id = v_emprestimo.livro_id;

  return v_emprestimo.id;
end;
$$;

-- Permissões explícitas exigidas pela Data API.
revoke all on table public.perfis, public.livros, public.emprestimos from anon;
revoke all on table public.perfis, public.livros, public.emprestimos from authenticated;

grant select on table public.perfis to authenticated;
grant select, insert, update, delete on table public.livros to authenticated;
grant select, insert, update on table public.emprestimos to authenticated;
grant usage, select on sequence public.livros_id_seq to authenticated;
grant usage, select on sequence public.emprestimos_id_seq to authenticated;

revoke all on function public.registrar_emprestimo(bigint, uuid, date, date) from public, anon;
revoke all on function public.registrar_devolucao(bigint) from public, anon;
grant execute on function public.registrar_emprestimo(bigint, uuid, date, date) to authenticated;
grant execute on function public.registrar_devolucao(bigint) to authenticated;

commit;

-- Depois de criar uma conta pelo site, transforme-a em administradora:
-- update public.perfis set tipo = 'admin' where email = 'seu-email@exemplo.com';
