# Biblioteca Escolar

Sistema estático para cadastro de leitores, consulta do acervo e controle de empréstimos. O frontend funciona no GitHub Pages e usa Supabase para autenticação e banco PostgreSQL.

## 1. Preparar o Supabase

O banco já foi instalado no projeto `biblioteca` (`bpvkclssbaohjewcunji`). O arquivo [`supabase.sql`](supabase.sql) mantém o esquema completo versionado no repositório.

1. Em **Authentication → Providers → Email**, mantenha o provedor de e-mail ativado.
2. Para usar o sistema sem configurar um servidor SMTP, desative **Confirm email**. Se a confirmação permanecer ativada, configure SMTP e os usuários precisarão confirmar o e-mail antes do primeiro acesso.
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

## 4. Criar o administrador

1. Abra o site e crie normalmente a conta que será administradora.
2. No **SQL Editor**, execute substituindo o e-mail:

```sql
update public.perfis
set tipo = 'admin'
where email = 'seu-email@exemplo.com';
```

3. Saia e entre novamente no site. As funções administrativas serão exibidas.

Contas criadas pela tela de cadastro só podem receber os perfis `aluno` ou `professor`. O perfil `admin` somente pode ser concedido diretamente no banco.

## 5. Ativar o GitHub Pages

No repositório, abra **Settings → Pages**:

1. Em **Build and deployment**, selecione **Deploy from a branch**.
2. Selecione a branch **main** e a pasta **/(root)**.
3. Clique em **Save**.

O endereço será <https://marcelo-preigschadt.github.io/biblioteca/>.

## Estrutura

- `index.html`: login;
- `cadastro.html`: cadastro de aluno ou professor;
- `painel.html`: resumo do acervo;
- `acervo.html`: catálogo e gestão dos livros;
- `emprestimos.html`: consulta e devolução;
- `assets/css/style.css`: interface responsiva;
- `assets/js/app.js`: autenticação e operações no Supabase;
- `assets/js/config.js`: URL e chave pública do projeto;
- `supabase.sql`: tabelas, índices, funções, permissões e RLS.
