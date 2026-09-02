# Biblioteca Escolar

Sistema estático para acervo, reservas e circulação da biblioteca escolar. O frontend funciona no GitHub Pages e usa Supabase para autenticação, PostgreSQL e armazenamento das capas.

## Perfis e permissões

| Perfil | Acesso |
| --- | --- |
| Aluno | Consulta o acervo, reserva livros e acompanha os próprios prazos e atrasos. |
| Professor | Consulta o acervo, reserva livros e acompanha os próprios prazos e atrasos. |
| Bibliotecária | Cadastra e edita livros, envia/fotografa capas, registra empréstimos e devoluções e atende reservas. |
| Administrador | Visualiza e gerencia todo o sistema, incluindo a definição do perfil das contas. |

## 1. Preparar o Supabase

O banco já foi instalado no projeto `biblioteca` (`bpvkclssbaohjewcunji`). O arquivo [`supabase.sql`](supabase.sql) mantém o esquema completo. O arquivo [`migracao-v2.sql`](migracao-v2.sql) registra a atualização aplicada ao banco existente.

1. Em **Authentication → Providers → Email**, mantenha o provedor de e-mail ativado.
2. Para usar o sistema sem configurar um servidor SMTP, desative **Confirm email**. Se a confirmação permanecer ativada, configure as URLs da seção 3; caso contrário, o Supabase pode redirecionar o e-mail para `localhost`.
3. Em **Integrations → Data API**, confirme:
   - **Enable Data API**: ativado;
   - **Exposed schemas**: contém `public`.

## 2. Conectar o site ao projeto

O arquivo [`assets/js/config.js`](assets/js/config.js) já contém a URL e a chave publicável do projeto `biblioteca`.

Não use a **secret key** nem a chave **service_role** no site.

## 3. Configurar as URLs de autenticação

Em **Authentication → URL Configuration**, use:

- **Site URL**: `https://marcelo-preigschadt.github.io/biblioteca/`
- **Redirect URLs**:
  - `https://marcelo-preigschadt.github.io/biblioteca/`
  - `https://marcelo-preigschadt.github.io/biblioteca/index.html`

## 4. Administrador e bibliotecária

1. Abra o site e crie normalmente a conta que será administradora.
2. No **SQL Editor**, execute substituindo o e-mail:

```sql
update public.perfis
set tipo = 'admin'
where email = 'seu-email@exemplo.com';
```

3. Saia e entre novamente no site. As funções administrativas serão exibidas.

Contas criadas pela tela de cadastro recebem os perfis `aluno` ou `professor`. O perfil `admin` inicial é concedido diretamente no banco.

Para criar o acesso da bibliotecária:

1. A bibliotecária cria uma conta comum no site.
2. O administrador entra em **Usuários**.
3. Localiza a conta e seleciona **Bibliotecária**.

A senha é pessoal e não fica visível ao administrador.

## 5. Capas dos livros

O bucket público `capas-livros` aceita JPG, PNG e WebP de até 5 MB. As imagens podem ser escolhidas da galeria ou fotografadas pelo celular. Somente bibliotecária e administrador podem enviar, substituir ou apagar capas.

## 6. Ativar o GitHub Pages

No repositório, abra **Settings → Pages**:

1. Em **Build and deployment**, selecione **Deploy from a branch**.
2. Selecione a branch **main** e a pasta **/(root)**.
3. Clique em **Save**.

O endereço será <https://marcelo-preigschadt.github.io/biblioteca/>.

## Estrutura

- `index.html`: login;
- `cadastro.html`: cadastro de aluno ou professor;
- `painel.html`: resumo do acervo;
- `acervo.html`: catálogo, capas, resumos, reservas e gestão dos livros;
- `reservas.html`: reservas e acompanhamento dos prazos dos leitores;
- `emprestimos.html`: circulação para bibliotecária e administrador;
- `usuarios.html`: definição de acessos pelo administrador;
- `assets/css/style.css`: interface responsiva;
- `assets/js/app.js`: autenticação e operações no Supabase;
- `assets/js/config.js`: URL e chave pública do projeto;
- `supabase.sql`: instalação completa das tabelas, Storage, funções, permissões e RLS;
- `migracao-v2.sql`: atualização aplicada ao banco já existente.
