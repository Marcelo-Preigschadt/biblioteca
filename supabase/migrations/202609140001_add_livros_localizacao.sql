alter table public.livros
  add column if not exists localizacao text;

alter table public.livros
  drop constraint if exists livros_localizacao_tamanho_check;

alter table public.livros
  add constraint livros_localizacao_tamanho_check
  check (localizacao is null or char_length(localizacao) <= 120);
