import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const page = document.body.dataset.page;
const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("COLE_AQUI") &&
  SUPABASE_PUBLISHABLE_KEY.length > 20 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("COLE_AQUI");

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

let context = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, type = "error", element = document.querySelector("#pageMessage")) {
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`;
  element.hidden = false;
  element.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearMessage(element = document.querySelector("#pageMessage")) {
  if (!element) return;
  element.hidden = true;
  element.textContent = "";
}

function setLoading(form, active) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = active;
  button.classList.toggle("is-loading", active);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function localDateIso(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
  if (!dateIso || !Number.isFinite(Number(days))) return "";
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + Number(days));
  return localDateIso(date);
}

function roleLabel(role) {
  return { admin: "Administrador", professor: "Professor", aluno: "Aluno" }[role] ?? "Usuário";
}

function friendlyError(error) {
  const message = String(error?.message ?? error ?? "Erro inesperado.");
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (lower.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (lower.includes("user already registered")) return "Este e-mail já está cadastrado.";
  if (lower.includes("password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (lower.includes("rate limit")) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos.";
  if (lower.includes("livro sem exemplares")) return "Não há exemplares disponíveis deste livro.";
  if (lower.includes("somente alunos")) return "O empréstimo deve ser registrado para um aluno.";
  if (lower.includes("data de devolução")) return "A devolução deve ser posterior ao empréstimo.";
  if (lower.includes("foreign key")) return "Este livro possui histórico de empréstimos e não pode ser excluído.";
  return message;
}

function requireConfiguration() {
  if (configured) return true;
  showMessage("O Supabase ainda não foi configurado. Preencha assets/js/config.js com a URL e a chave publicável do projeto.", "info");
  document.querySelectorAll("form button, [data-admin-only]").forEach((item) => {
    if (item.matches("button")) item.disabled = true;
  });
  return false;
}

function installPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.textContent = visible ? "Mostrar" : "Ocultar";
      button.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
    });
  });
}

async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function requireUser() {
  const session = await getSession();
  if (!session) {
    window.location.replace("index.html");
    return null;
  }

  const { data: profile, error } = await supabase
    .from("perfis")
    .select("id,nome,turma,tipo,email")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;
  return { session, user: session.user, profile, isAdmin: profile.tipo === "admin" };
}

function installCommonUi(current) {
  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = current.profile.nome));
  document.querySelectorAll("[data-user-role]").forEach((el) => (el.textContent = roleLabel(current.profile.tipo)));
  document.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = current.profile.email));
  document.querySelectorAll("[data-user-class]").forEach((el) => (el.textContent = current.profile.turma || "Não informada"));
  document.querySelectorAll("[data-admin-only]").forEach((el) => (el.hidden = !current.isAdmin));

  const accountButton = document.querySelector("#accountButton");
  const accountPanel = document.querySelector("#accountPanel");
  accountButton?.addEventListener("click", () => {
    const open = accountPanel.hidden;
    accountPanel.hidden = !open;
    accountButton.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (event) => {
    if (!accountPanel || !accountButton || accountPanel.hidden) return;
    if (!accountPanel.contains(event.target) && !accountButton.contains(event.target)) {
      accountPanel.hidden = true;
      accountButton.setAttribute("aria-expanded", "false");
    }
  });
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.replace("index.html");
    });
  });
}

async function initLogin() {
  installPasswordToggles();
  if (!requireConfiguration()) return;

  const session = await getSession();
  if (session) {
    window.location.replace("painel.html");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("cadastro") === "ok") {
    showMessage("Conta criada. Entre com seu e-mail e senha.", "success");
  }

  const form = document.querySelector("#loginForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    setLoading(form, true);
    try {
      const email = form.email.value.trim().toLowerCase();
      const password = form.senha.value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.replace("painel.html");
    } catch (error) {
      showMessage(friendlyError(error));
    } finally {
      setLoading(form, false);
    }
  });
}

async function initCadastro() {
  installPasswordToggles();
  if (!requireConfiguration()) return;

  if (await getSession()) {
    window.location.replace("painel.html");
    return;
  }

  const form = document.querySelector("#cadastroForm");
  const typeInputs = [...form.querySelectorAll('input[name="tipo"]')];
  const classField = document.querySelector("#turmaField");
  const classInput = document.querySelector("#turma");

  const syncProfileChoice = () => {
    const selected = form.tipo.value;
    form.querySelectorAll(".profile-option").forEach((label) => {
      label.classList.toggle("selected", label.querySelector("input").checked);
    });
    const student = selected === "aluno";
    classField.hidden = !student;
    classInput.required = student;
    if (!student) classInput.value = "";
  };
  typeInputs.forEach((input) => input.addEventListener("change", syncProfileChoice));
  syncProfileChoice();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    setLoading(form, true);
    try {
      const metadata = {
        nome: form.nome.value.trim(),
        turma: form.tipo.value === "aluno" ? form.turma.value.trim() : null,
        tipo: form.tipo.value,
      };
      const email = form.email.value.trim().toLowerCase();
      const password = form.senha.value;
      const emailRedirectTo = new URL("index.html", window.location.href).href;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata, emailRedirectTo },
      });
      if (error) throw error;

      if (data.session) {
        window.location.replace("painel.html");
      } else {
        form.reset();
        syncProfileChoice();
        showMessage("Cadastro realizado. Verifique seu e-mail para confirmar a conta.", "success");
      }
    } catch (error) {
      showMessage(friendlyError(error));
    } finally {
      setLoading(form, false);
    }
  });
}

async function initProtected(loader) {
  if (!requireConfiguration()) return;
  try {
    context = await requireUser();
    if (!context) return;
    installCommonUi(context);
    await loader(context);
  } catch (error) {
    showMessage(friendlyError(error));
  }
}

async function initPainel(current) {
  document.querySelector("#welcomeName").textContent = current.profile.nome.split(" ")[0];
  if (current.isAdmin) document.querySelector("#loanStatLabel").textContent = "Empréstimos ativos";

  const [booksResult, loansResult] = await Promise.all([
    supabase.from("livros").select("id,titulo,autor,categoria,ano,estoque_total,quantidade_emprestada").order("titulo"),
    supabase.from("emprestimos").select("id", { count: "exact", head: true }).is("devolvido_em", null),
  ]);
  if (booksResult.error) throw booksResult.error;
  if (loansResult.error) throw loansResult.error;

  const books = booksResult.data ?? [];
  const availableCopies = books.reduce(
    (total, book) => total + Math.max(0, book.estoque_total - book.quantidade_emprestada),
    0,
  );
  document.querySelector("#statTitles").textContent = books.length;
  document.querySelector("#statAvailable").textContent = availableCopies;
  document.querySelector("#statLoans").textContent = loansResult.count ?? 0;

  const container = document.querySelector("#availableBooks");
  const availableBooks = books.filter((book) => book.quantidade_emprestada < book.estoque_total).slice(0, 6);
  if (!availableBooks.length) {
    container.innerHTML = '<div class="empty-state">Nenhum exemplar disponível no momento.</div>';
    return;
  }
  container.innerHTML = availableBooks.map((book) => {
    const available = book.estoque_total - book.quantidade_emprestada;
    return `<article class="book-card">
      <span class="book-card-icon" aria-hidden="true">📖</span>
      <h3 title="${escapeHtml(book.titulo)}">${escapeHtml(book.titulo)}</h3>
      <p title="${escapeHtml(book.autor)}">${escapeHtml(book.autor)}</p>
      <footer><span>${escapeHtml(book.categoria || "Sem categoria")}</span><span>${available} ${available === 1 ? "disponível" : "disponíveis"}</span></footer>
    </article>`;
  }).join("");
}

async function fetchBooks() {
  const { data, error } = await supabase
    .from("livros")
    .select("id,titulo,autor,categoria,ano,estoque_total,quantidade_emprestada,criado_em")
    .order("titulo");
  if (error) throw error;
  return data ?? [];
}

function renderBooks(books, current) {
  const search = document.querySelector("#bookSearch").value.trim().toLocaleLowerCase("pt-BR");
  const filtered = books.filter((book) =>
    [book.titulo, book.autor, book.categoria, book.ano]
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(search)),
  );
  document.querySelector("#bookCount").textContent = `${filtered.length} título${filtered.length === 1 ? "" : "s"}`;
  const table = document.querySelector("#booksTable");
  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="${current.isAdmin ? 6 : 5}" class="empty-cell">Nenhum livro encontrado.</td></tr>`;
    return;
  }

  table.innerHTML = filtered.map((book) => {
    const available = Math.max(0, book.estoque_total - book.quantidade_emprestada);
    const status = available > 0
      ? `<span class="status available">Disponível</span>`
      : `<span class="status loaned">Emprestado</span>`;
    const actions = current.isAdmin
      ? `<td><div class="row-actions">
          <button class="button button-primary button-small" type="button" data-loan-book="${book.id}" data-title="${escapeHtml(book.titulo)}" ${available < 1 ? "disabled" : ""}>Emprestar</button>
          <button class="button button-danger button-small" type="button" data-delete-book="${book.id}" data-title="${escapeHtml(book.titulo)}">Excluir</button>
        </div></td>`
      : "";
    return `<tr>
      <td><div class="book-cell"><span class="book-cell-icon">📖</span><span><strong>${escapeHtml(book.titulo)}</strong><small>${escapeHtml(book.autor)}</small></span></div></td>
      <td>${escapeHtml(book.categoria || "—")}</td>
      <td>${escapeHtml(book.ano || "—")}</td>
      <td>${available} de ${book.estoque_total}</td>
      <td>${status}</td>${actions}
    </tr>`;
  }).join("");
}

async function fetchStudents() {
  const { data, error } = await supabase
    .from("perfis")
    .select("id,nome,turma")
    .eq("tipo", "aluno")
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

function installDialogs() {
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog)?.close());
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

async function initAcervo(current) {
  installDialogs();
  let books = await fetchBooks();
  const render = () => renderBooks(books, current);
  render();
  document.querySelector("#bookSearch").addEventListener("input", render);

  if (!current.isAdmin) return;

  const students = await fetchStudents();
  const studentSelect = document.querySelector("#loanStudent");
  studentSelect.innerHTML = '<option value="">Selecione o aluno</option>' + students.map((student) =>
    `<option value="${student.id}">${escapeHtml(student.nome)}${student.turma ? ` — ${escapeHtml(student.turma)}` : ""}</option>`,
  ).join("");

  const bookDialog = document.querySelector("#bookDialog");
  const bookForm = document.querySelector("#bookForm");
  document.querySelector("#openBookDialog").addEventListener("click", () => bookDialog.showModal());
  bookForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    setLoading(bookForm, true);
    const values = new FormData(bookForm);
    const payload = {
      titulo: values.get("titulo").trim(),
      autor: values.get("autor").trim(),
      categoria: values.get("categoria").trim() || null,
      ano: values.get("ano") ? Number(values.get("ano")) : null,
      estoque_total: Number(values.get("estoque_total")),
      criado_por: current.user.id,
    };
    try {
      const { error } = await supabase.from("livros").insert(payload);
      if (error) throw error;
      bookForm.reset();
      bookForm.estoque_total.value = 1;
      bookDialog.close();
      books = await fetchBooks();
      render();
      showMessage("Livro cadastrado com sucesso.", "success");
    } catch (error) {
      showMessage(friendlyError(error));
    } finally {
      setLoading(bookForm, false);
    }
  });

  const loanDialog = document.querySelector("#loanDialog");
  const loanForm = document.querySelector("#loanForm");
  const loanStart = document.querySelector("#loanStart");
  const loanDays = document.querySelector("#loanDays");
  const loanDue = document.querySelector("#loanDue");
  const syncDueDate = () => (loanDue.value = addDays(loanStart.value, loanDays.value));
  loanStart.value = localDateIso();
  syncDueDate();
  loanStart.addEventListener("change", syncDueDate);
  loanDays.addEventListener("input", syncDueDate);

  document.querySelector("#booksTable").addEventListener("click", async (event) => {
    const loanButton = event.target.closest("[data-loan-book]");
    if (loanButton) {
      document.querySelector("#loanBookId").value = loanButton.dataset.loanBook;
      document.querySelector("#loanBookTitle").textContent = loanButton.dataset.title;
      studentSelect.value = "";
      loanStart.value = localDateIso();
      loanDays.value = 7;
      syncDueDate();
      loanDialog.showModal();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-book]");
    if (!deleteButton) return;
    if (!window.confirm(`Excluir o livro “${deleteButton.dataset.title}”?`)) return;
    clearMessage();
    try {
      const { error } = await supabase.from("livros").delete().eq("id", deleteButton.dataset.deleteBook);
      if (error) throw error;
      books = await fetchBooks();
      render();
      showMessage("Livro excluído.", "success");
    } catch (error) {
      showMessage(friendlyError(error));
    }
  });

  loanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    setLoading(loanForm, true);
    try {
      const { error } = await supabase.rpc("registrar_emprestimo", {
        p_livro_id: Number(loanForm.livro_id.value),
        p_usuario_id: loanForm.usuario_id.value,
        p_data_emprestimo: loanForm.data_emprestimo.value,
        p_data_devolucao: loanForm.data_devolucao.value,
      });
      if (error) throw error;
      loanDialog.close();
      books = await fetchBooks();
      render();
      showMessage("Empréstimo registrado com sucesso.", "success");
    } catch (error) {
      showMessage(friendlyError(error));
    } finally {
      setLoading(loanForm, false);
    }
  });
}

async function fetchLoans() {
  const { data, error } = await supabase
    .from("emprestimos")
    .select(`
      id, data_emprestimo, data_devolucao, devolvido_em,
      livro:livros!emprestimos_livro_id_fkey(id,titulo,autor),
      leitor:perfis!emprestimos_usuario_id_fkey(id,nome,turma)
    `)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function isOverdue(loan) {
  return !loan.devolvido_em && loan.data_devolucao < localDateIso();
}

function renderLoans(loans, current) {
  const search = document.querySelector("#loanSearch").value.trim().toLocaleLowerCase("pt-BR");
  const filter = document.querySelector("#loanFilter").value;
  const filtered = loans.filter((loan) => {
    const matchesText = [loan.livro?.titulo, loan.livro?.autor, loan.leitor?.nome, loan.leitor?.turma]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(search));
    if (!matchesText) return false;
    if (filter === "ativos") return !loan.devolvido_em;
    if (filter === "devolvidos") return Boolean(loan.devolvido_em);
    if (filter === "atrasados") return isOverdue(loan);
    return true;
  });

  const table = document.querySelector("#loansTable");
  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="${current.isAdmin ? 6 : 4}" class="empty-cell">Nenhum empréstimo encontrado.</td></tr>`;
    return;
  }

  table.innerHTML = filtered.map((loan) => {
    const overdue = isOverdue(loan);
    const status = loan.devolvido_em
      ? '<span class="status returned">Devolvido</span>'
      : overdue
        ? '<span class="status overdue">Atrasado</span>'
        : '<span class="status loaned">Emprestado</span>';
    const reader = current.isAdmin
      ? `<td><strong>${escapeHtml(loan.leitor?.nome || "—")}</strong><br><small class="muted">${escapeHtml(loan.leitor?.turma || "Sem turma")}</small></td>`
      : "";
    const action = current.isAdmin
      ? `<td>${loan.devolvido_em ? "—" : `<button class="button button-primary button-small" type="button" data-return-loan="${loan.id}">Registrar devolução</button>`}</td>`
      : "";
    return `<tr>
      <td><div class="book-cell"><span class="book-cell-icon">📖</span><span><strong>${escapeHtml(loan.livro?.titulo || "Livro removido")}</strong><small>${escapeHtml(loan.livro?.autor || "")}</small></span></div></td>
      ${reader}<td>${formatDate(loan.data_emprestimo)}</td><td>${formatDate(loan.data_devolucao)}</td><td>${status}</td>${action}
    </tr>`;
  }).join("");
}

async function initEmprestimos(current) {
  if (current.isAdmin) document.querySelector("#loansHeading").textContent = "Todos os empréstimos";
  let loans = await fetchLoans();
  const render = () => renderLoans(loans, current);
  render();
  document.querySelector("#loanSearch").addEventListener("input", render);
  document.querySelector("#loanFilter").addEventListener("change", render);

  if (!current.isAdmin) return;
  document.querySelector("#loansTable").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-return-loan]");
    if (!button) return;
    button.disabled = true;
    clearMessage();
    try {
      const { error } = await supabase.rpc("registrar_devolucao", {
        p_emprestimo_id: Number(button.dataset.returnLoan),
      });
      if (error) throw error;
      loans = await fetchLoans();
      render();
      showMessage("Devolução registrada com sucesso.", "success");
    } catch (error) {
      button.disabled = false;
      showMessage(friendlyError(error));
    }
  });
}

const initializers = {
  login: initLogin,
  cadastro: initCadastro,
  painel: () => initProtected(initPainel),
  acervo: () => initProtected(initAcervo),
  emprestimos: () => initProtected(initEmprestimos),
};

initializers[page]?.();
