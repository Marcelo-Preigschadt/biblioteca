import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const page = document.body.dataset.page;
const COVER_BUCKET = "capas-livros";
const MAX_COVER_SIZE = 5 * 1024 * 1024;
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
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

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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
  return {
    admin: "Administrador",
    bibliotecaria: "Bibliotecária",
    professor: "Professor",
    aluno: "Aluno",
  }[role] ?? "Usuário";
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
  if (lower.includes("já está reservado")) return "Este livro já está reservado por você.";
  if (lower.includes("já está com este livro")) return "Você já está com este livro emprestado.";
  if (lower.includes("já possui um empréstimo")) return "Este leitor já possui um empréstimo ativo deste livro.";
  if (lower.includes("data de devolução")) return "A devolução deve ser posterior ao empréstimo.";
  if (lower.includes("foreign key")) return "Este livro possui empréstimo ou reserva no histórico e não pode ser excluído.";
  if (lower.includes("row-level security") || lower.includes("permission denied")) return "Seu perfil não possui permissão para esta operação.";
  return message;
}

function requireConfiguration() {
  if (configured) return true;
  showMessage("O Supabase ainda não foi configurado em assets/js/config.js.", "info");
  document.querySelectorAll("form button").forEach((button) => (button.disabled = true));
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
  return {
    session,
    user: session.user,
    profile,
    isAdmin: profile.tipo === "admin",
    isStaff: ["bibliotecaria", "admin"].includes(profile.tipo),
    isReader: ["aluno", "professor"].includes(profile.tipo),
  };
}

function installCommonUi(current) {
  const initials = current.profile.nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = current.profile.nome));
  document.querySelectorAll("[data-user-initials]").forEach((el) => (el.textContent = initials || "VD"));
  document.querySelectorAll("[data-user-role]").forEach((el) => (el.textContent = roleLabel(current.profile.tipo)));
  document.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = current.profile.email));
  document.querySelectorAll("[data-user-class]").forEach((el) => (el.textContent = current.profile.turma || "Não informada"));
  document.querySelectorAll("[data-admin-only]").forEach((el) => (el.hidden = !current.isAdmin));
  document.querySelectorAll("[data-staff-only]").forEach((el) => (el.hidden = !current.isStaff));
  document.querySelectorAll("[data-reader-only]").forEach((el) => (el.hidden = !current.isReader));

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
  if (await getSession()) {
    window.location.replace("painel.html");
    return;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("cadastro") === "ok") showMessage("Conta criada. Entre com seu e-mail e senha.", "success");
  const form = document.querySelector("#loginForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    setLoading(form, true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.value.trim().toLowerCase(),
        password: form.senha.value,
      });
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
  const classField = document.querySelector("#turmaField");
  const classInput = document.querySelector("#turma");
  const syncProfileChoice = () => {
    form.querySelectorAll(".profile-option").forEach((label) => {
      label.classList.toggle("selected", label.querySelector("input").checked);
    });
    const student = form.tipo.value === "aluno";
    classField.hidden = !student;
    classInput.required = student;
    if (!student) classInput.value = "";
  };
  form.querySelectorAll('input[name="tipo"]').forEach((input) => input.addEventListener("change", syncProfileChoice));
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
      const emailRedirectTo = new URL("index.html", window.location.href).href;
      const { data, error } = await supabase.auth.signUp({
        email: form.email.value.trim().toLowerCase(),
        password: form.senha.value,
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
    const current = await requireUser();
    if (!current) return;
    installCommonUi(current);
    await loader(current);
  } catch (error) {
    showMessage(friendlyError(error));
  }
}

function getCoverUrl(path) {
  if (!path) return "";
  return supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}

function coverMarkup(book, className = "catalog-cover") {
  const url = getCoverUrl(book.capa_path);
  return url
    ? `<div class="${className}"><img src="${escapeHtml(url)}" alt="Capa de ${escapeHtml(book.titulo)}" loading="lazy"></div>`
    : `<div class="${className} cover-placeholder" aria-label="Livro sem capa"><span>SEM<br>CAPA</span></div>`;
}

async function fetchBooks() {
  const { data, error } = await supabase
    .from("livros")
    .select("id,titulo,autor,categoria,ano,resumo,capa_path,estoque_total,quantidade_emprestada,criado_em,atualizado_em")
    .order("titulo");
  if (error) throw error;
  return data ?? [];
}

async function fetchActiveReservationBookIds() {
  const { data, error } = await supabase.from("reservas").select("livro_id").eq("status", "ativa");
  if (error) throw error;
  return new Set((data ?? []).map((item) => Number(item.livro_id)));
}

async function reserveBook(bookId) {
  const { error } = await supabase.rpc("reservar_livro", { p_livro_id: Number(bookId) });
  if (error) throw error;
}

function compactBookCard(book, current, activeReservations) {
  const available = Math.max(0, book.estoque_total - book.quantidade_emprestada);
  const reserved = activeReservations.has(Number(book.id));
  const action = current.isReader
    ? `<button class="button button-primary button-small" type="button" data-reserve-book="${book.id}" ${reserved ? "disabled" : ""}>${reserved ? "Reservado" : "Reservar"}</button>`
    : `<a class="button button-ghost button-small" href="acervo.html">Gerenciar</a>`;
  return `<article class="book-card book-card-with-cover">
    ${coverMarkup(book, "book-card-cover")}
    <div class="book-card-copy"><h3>${escapeHtml(book.titulo)}</h3><p>${escapeHtml(book.autor)}</p>
    <footer><span>${available} ${available === 1 ? "disponível" : "disponíveis"}</span>${action}</footer></div>
  </article>`;
}

async function initPainel(current) {
  document.querySelector("#welcomeName").textContent = current.profile.nome.split(" ")[0];
  if (current.isStaff) {
    document.querySelector("#welcomeText").textContent = "Acompanhe reservas, circulação e situação do acervo.";
    document.querySelector("#welcomeAction").textContent = "Gerenciar acervo";
  }
  const [booksResult, reservationsResult, loansResult] = await Promise.all([
    supabase.from("livros").select("id,titulo,autor,capa_path,estoque_total,quantidade_emprestada").order("titulo"),
    supabase.from("reservas").select("id", { count: "exact", head: true }).eq("status", "ativa"),
    supabase.from("emprestimos").select("id,data_devolucao,devolvido_em"),
  ]);
  if (booksResult.error) throw booksResult.error;
  if (reservationsResult.error) throw reservationsResult.error;
  if (loansResult.error) throw loansResult.error;

  const books = booksResult.data ?? [];
  const loans = loansResult.data ?? [];
  const availableCopies = books.reduce(
    (total, book) => total + Math.max(0, book.estoque_total - book.quantidade_emprestada),
    0,
  );
  const overdue = loans.filter((loan) => !loan.devolvido_em && loan.data_devolucao < localDateIso()).length;
  document.querySelector("#statTitles").textContent = books.length;
  document.querySelector("#statAvailable").textContent = availableCopies;
  document.querySelector("#statReservations").textContent = reservationsResult.count ?? 0;
  document.querySelector("#statOverdue").textContent = overdue;
  if (current.isReader) {
    document.querySelector("#statLabelReservations").textContent = "Suas reservas ativas";
    document.querySelector("#statLabelOverdue").textContent = "Seus empréstimos atrasados";
  }

  const activeReservations = current.isReader ? await fetchActiveReservationBookIds() : new Set();
  const container = document.querySelector("#availableBooks");
  const highlights = books.slice(0, 6);
  if (!highlights.length) {
    container.innerHTML = '<div class="empty-state">Nenhum livro cadastrado no momento.</div>';
    return;
  }
  container.innerHTML = highlights.map((book) => compactBookCard(book, current, activeReservations)).join("");
  if (current.isReader) {
    container.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-reserve-book]");
      if (!button) return;
      button.disabled = true;
      try {
        await reserveBook(button.dataset.reserveBook);
        button.textContent = "Reservado";
        showMessage("Reserva realizada. Acompanhe o status na página Reservas.", "success");
      } catch (error) {
        button.disabled = false;
        showMessage(friendlyError(error));
      }
    });
  }
}

function renderBooks(books, current, activeReservations) {
  const search = document.querySelector("#bookSearch").value.trim().toLocaleLowerCase("pt-BR");
  const filtered = books.filter((book) =>
    [book.titulo, book.autor, book.categoria, book.ano, book.resumo]
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(search)),
  );
  document.querySelector("#bookCount").textContent = `${filtered.length} título${filtered.length === 1 ? "" : "s"}`;
  const grid = document.querySelector("#booksGrid");
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state">Nenhum livro encontrado.</div>';
    return;
  }
  grid.innerHTML = filtered.map((book) => {
    const available = Math.max(0, book.estoque_total - book.quantidade_emprestada);
    const reserved = activeReservations.has(Number(book.id));
    const status = available > 0
      ? `<span class="status available">${available} ${available === 1 ? "disponível" : "disponíveis"}</span>`
      : '<span class="status loaned">Sem exemplar livre</span>';
    const actions = current.isStaff
      ? `<div class="catalog-actions">
          <button class="button button-primary button-small" type="button" data-loan-book="${book.id}" ${available < 1 ? "disabled" : ""}>Emprestar</button>
          <button class="button button-ghost button-small" type="button" data-edit-book="${book.id}">Editar</button>
          <button class="button button-danger button-small" type="button" data-delete-book="${book.id}">Excluir</button>
        </div>`
      : `<button class="button button-primary button-block" type="button" data-reserve-book="${book.id}" ${reserved ? "disabled" : ""}>${reserved ? "Reserva ativa" : "Reservar este livro"}</button>`;
    return `<article class="catalog-card">
      ${coverMarkup(book)}
      <div class="catalog-copy"><div class="catalog-meta">${status}<span>${escapeHtml(book.categoria || "Sem categoria")}</span></div>
        <h3>${escapeHtml(book.titulo)}</h3><p class="catalog-author">${escapeHtml(book.autor)}${book.ano ? ` · ${book.ano}` : ""}</p>
        <p class="catalog-summary">${escapeHtml(book.resumo || "Resumo ainda não cadastrado.")}</p>${actions}
      </div>
    </article>`;
  }).join("");
}

async function fetchReaders() {
  const { data, error } = await supabase
    .from("perfis")
    .select("id,nome,turma,tipo")
    .in("tipo", ["aluno", "professor"])
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

function validateCover(file) {
  if (!file) return;
  if (!COVER_TYPES.has(file.type)) throw new Error("A capa deve ser uma imagem JPG, PNG ou WebP.");
  if (file.size > MAX_COVER_SIZE) throw new Error("A imagem da capa deve ter no máximo 5 MB.");
}

async function uploadCover(file, userId) {
  validateCover(file);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const randomPart = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${randomPart}.${extension}`;
  const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

async function removeCoverFile(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(COVER_BUCKET).remove([path]);
  if (error) throw error;
}

async function initAcervo(current) {
  installDialogs();
  let books = await fetchBooks();
  let activeReservations = current.isReader ? await fetchActiveReservationBookIds() : new Set();
  const render = () => renderBooks(books, current, activeReservations);
  render();
  document.querySelector("#bookSearch").addEventListener("input", render);

  const grid = document.querySelector("#booksGrid");
  if (current.isReader) {
    grid.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-reserve-book]");
      if (!button) return;
      button.disabled = true;
      try {
        await reserveBook(button.dataset.reserveBook);
        activeReservations.add(Number(button.dataset.reserveBook));
        render();
        showMessage("Livro reservado. A bibliotecária verá sua solicitação.", "success");
      } catch (error) {
        button.disabled = false;
        showMessage(friendlyError(error));
      }
    });
    return;
  }

  if (!current.isStaff) return;
  const readers = await fetchReaders();
  const readerSelect = document.querySelector("#loanReader");
  readerSelect.innerHTML = '<option value="">Selecione o leitor</option>' + readers.map((reader) =>
    `<option value="${reader.id}">${escapeHtml(reader.nome)} — ${roleLabel(reader.tipo)}${reader.turma ? ` (${escapeHtml(reader.turma)})` : ""}</option>`,
  ).join("");

  const bookDialog = document.querySelector("#bookDialog");
  const bookForm = document.querySelector("#bookForm");
  const coverInput = document.querySelector("#bookCover");
  const coverImage = document.querySelector("#coverPreviewImage");
  const coverEmpty = document.querySelector("#coverPreviewEmpty");
  let previewObjectUrl = "";
  let removeCurrentCover = false;

  const setCoverPreview = (url = "") => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = url.startsWith("blob:") ? url : "";
    coverImage.hidden = !url;
    coverEmpty.hidden = Boolean(url);
    coverImage.src = url;
  };
  const resetBookForm = () => {
    bookForm.reset();
    bookForm.elements.id.value = "";
    bookForm.capa_atual.value = "";
    bookForm.estoque_total.value = 1;
    document.querySelector("#bookDialogEyebrow").textContent = "NOVO ITEM";
    document.querySelector("#bookDialogTitle").textContent = "Cadastrar livro";
    removeCurrentCover = false;
    setCoverPreview();
  };
  const openEditBook = (book) => {
    resetBookForm();
    bookForm.elements.id.value = book.id;
    bookForm.capa_atual.value = book.capa_path || "";
    bookForm.titulo.value = book.titulo;
    bookForm.autor.value = book.autor;
    bookForm.categoria.value = book.categoria || "";
    bookForm.ano.value = book.ano || "";
    bookForm.estoque_total.value = book.estoque_total;
    bookForm.resumo.value = book.resumo || "";
    document.querySelector("#bookDialogEyebrow").textContent = "EDITAR ITEM";
    document.querySelector("#bookDialogTitle").textContent = "Editar livro";
    if (book.capa_path) setCoverPreview(getCoverUrl(book.capa_path));
    bookDialog.showModal();
  };

  document.querySelector("#openBookDialog").addEventListener("click", () => {
    resetBookForm();
    bookDialog.showModal();
  });
  coverInput.addEventListener("change", () => {
    const file = coverInput.files[0];
    if (!file) return;
    try {
      validateCover(file);
      removeCurrentCover = false;
      setCoverPreview(URL.createObjectURL(file));
    } catch (error) {
      coverInput.value = "";
      showMessage(friendlyError(error));
    }
  });
  document.querySelector("#removeCover").addEventListener("click", () => {
    coverInput.value = "";
    removeCurrentCover = true;
    setCoverPreview();
  });

  bookForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    setLoading(bookForm, true);
    const editingId = bookForm.elements.id.value ? Number(bookForm.elements.id.value) : null;
    const oldCover = bookForm.capa_atual.value || null;
    const file = coverInput.files[0];
    let uploadedCover = null;
    try {
      if (file) uploadedCover = await uploadCover(file, current.user.id);
      const payload = {
        titulo: bookForm.titulo.value.trim(),
        autor: bookForm.autor.value.trim(),
        categoria: bookForm.categoria.value.trim() || null,
        ano: bookForm.ano.value ? Number(bookForm.ano.value) : null,
        estoque_total: Number(bookForm.estoque_total.value),
        resumo: bookForm.resumo.value.trim() || null,
        capa_path: uploadedCover ?? (removeCurrentCover ? null : oldCover),
        atualizado_em: new Date().toISOString(),
      };
      const result = editingId
        ? await supabase.from("livros").update(payload).eq("id", editingId)
        : await supabase.from("livros").insert({ ...payload, criado_por: current.user.id });
      if (result.error) throw result.error;
      if (oldCover && oldCover !== payload.capa_path) {
        try { await removeCoverFile(oldCover); } catch { /* limpeza não bloqueia o cadastro */ }
      }
      resetBookForm();
      bookDialog.close();
      books = await fetchBooks();
      render();
      showMessage(editingId ? "Livro atualizado com sucesso." : "Livro cadastrado com sucesso.", "success");
    } catch (error) {
      if (uploadedCover) {
        try { await removeCoverFile(uploadedCover); } catch { /* mantém o erro original */ }
      }
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
  const openLoan = (book, readerId = "") => {
    document.querySelector("#loanBookId").value = book.id;
    document.querySelector("#loanBookTitle").textContent = book.titulo;
    readerSelect.value = readerId;
    loanStart.value = localDateIso();
    loanDays.value = 7;
    syncDueDate();
    loanDialog.showModal();
  };
  loanStart.addEventListener("change", syncDueDate);
  loanDays.addEventListener("input", syncDueDate);

  grid.addEventListener("click", async (event) => {
    const loanButton = event.target.closest("[data-loan-book]");
    if (loanButton) {
      const book = books.find((item) => item.id === Number(loanButton.dataset.loanBook));
      if (book) openLoan(book);
      return;
    }
    const editButton = event.target.closest("[data-edit-book]");
    if (editButton) {
      const book = books.find((item) => item.id === Number(editButton.dataset.editBook));
      if (book) openEditBook(book);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-book]");
    if (!deleteButton) return;
    const book = books.find((item) => item.id === Number(deleteButton.dataset.deleteBook));
    if (!book || !window.confirm(`Excluir o livro “${book.titulo}”?`)) return;
    clearMessage();
    try {
      const { error } = await supabase.from("livros").delete().eq("id", book.id);
      if (error) throw error;
      if (book.capa_path) {
        try { await removeCoverFile(book.capa_path); } catch { /* arquivo órfão pode ser limpo depois */ }
      }
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
      showMessage("Empréstimo registrado. Uma reserva correspondente foi atendida automaticamente.", "success");
    } catch (error) {
      showMessage(friendlyError(error));
    } finally {
      setLoading(loanForm, false);
    }
  });

  const params = new URLSearchParams(window.location.search);
  const loanBookId = Number(params.get("emprestar"));
  if (loanBookId) {
    const book = books.find((item) => item.id === loanBookId);
    if (book) openLoan(book, params.get("leitor") || "");
  }
}

async function fetchReservations() {
  const { data, error } = await supabase
    .from("reservas")
    .select(`
      id, status, criado_em, finalizado_em,
      livro:livros!reservas_livro_id_fkey(id,titulo,autor,capa_path,estoque_total,quantidade_emprestada),
      leitor:perfis!reservas_usuario_id_fkey(id,nome,turma,tipo)
    `)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function reservationStatus(status) {
  return {
    ativa: '<span class="status reserved">Ativa</span>',
    atendida: '<span class="status returned">Atendida</span>',
    cancelada: '<span class="status cancelled">Cancelada</span>',
  }[status] ?? escapeHtml(status);
}

function renderReservations(reservations, current) {
  const search = document.querySelector("#reservationSearch").value.trim().toLocaleLowerCase("pt-BR");
  const filter = document.querySelector("#reservationFilter").value;
  const filtered = reservations.filter((reservation) => {
    const matchesText = [reservation.livro?.titulo, reservation.livro?.autor, reservation.leitor?.nome, reservation.leitor?.turma]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(search));
    const matchesFilter = filter === "todas" ||
      (filter === "ativas" && reservation.status === "ativa") ||
      (filter === "atendidas" && reservation.status === "atendida") ||
      (filter === "canceladas" && reservation.status === "cancelada");
    return matchesText && matchesFilter;
  });
  const table = document.querySelector("#reservationsTable");
  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="${current.isStaff ? 5 : 4}" class="empty-cell">Nenhuma reserva encontrada.</td></tr>`;
    return;
  }
  table.innerHTML = filtered.map((reservation) => {
    const reader = current.isStaff
      ? `<td><strong>${escapeHtml(reservation.leitor?.nome || "—")}</strong><br><small class="muted">${roleLabel(reservation.leitor?.tipo)}${reservation.leitor?.turma ? ` · ${escapeHtml(reservation.leitor.turma)}` : ""}</small></td>`
      : "";
    let action = "—";
    if (reservation.status === "ativa") {
      const available = Math.max(0, (reservation.livro?.estoque_total || 0) - (reservation.livro?.quantidade_emprestada || 0));
      const loanLink = current.isStaff && available > 0
        ? `<a class="button button-primary button-small" href="acervo.html?emprestar=${reservation.livro.id}&leitor=${reservation.leitor.id}">Emprestar</a>`
        : "";
      action = `<div class="row-actions">${loanLink}<button class="button button-ghost button-small" type="button" data-cancel-reservation="${reservation.id}">Cancelar</button></div>`;
    }
    return `<tr>
      <td><div class="book-cell">${coverMarkup(reservation.livro, "book-cell-cover")}<span><strong>${escapeHtml(reservation.livro?.titulo || "Livro removido")}</strong><small>${escapeHtml(reservation.livro?.autor || "")}</small></span></div></td>
      ${reader}<td>${formatDateTime(reservation.criado_em)}</td><td>${reservationStatus(reservation.status)}</td><td>${action}</td>
    </tr>`;
  }).join("");
}

async function fetchLoans() {
  const { data, error } = await supabase
    .from("emprestimos")
    .select(`
      id, data_emprestimo, data_devolucao, devolvido_em,
      livro:livros!emprestimos_livro_id_fkey(id,titulo,autor,capa_path),
      leitor:perfis!emprestimos_usuario_id_fkey(id,nome,turma,tipo)
    `)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function isOverdue(loan) {
  return !loan.devolvido_em && loan.data_devolucao < localDateIso();
}

function loanStatus(loan) {
  if (loan.devolvido_em) return '<span class="status returned">Devolvido</span>';
  if (isOverdue(loan)) return '<span class="status overdue">Atrasado</span>';
  return '<span class="status loaned">Emprestado</span>';
}

function renderReaderLoans(loans) {
  const table = document.querySelector("#readerLoansTable");
  if (!loans.length) {
    table.innerHTML = '<tr><td colspan="4" class="empty-cell">Você não possui empréstimos no histórico.</td></tr>';
    return;
  }
  table.innerHTML = loans.map((loan) => `<tr>
    <td><div class="book-cell">${coverMarkup(loan.livro, "book-cell-cover")}<span><strong>${escapeHtml(loan.livro?.titulo || "Livro removido")}</strong><small>${escapeHtml(loan.livro?.autor || "")}</small></span></div></td>
    <td>${formatDate(loan.data_emprestimo)}</td><td>${formatDate(loan.data_devolucao)}</td><td>${loanStatus(loan)}</td>
  </tr>`).join("");
}

async function initReservas(current) {
  if (current.isStaff) {
    document.querySelector("#reservationsTitle").textContent = "Fila de reservas";
    document.querySelector("#reservationsHeading").textContent = "Solicitações dos leitores";
    document.querySelector("#reservationsDescription").textContent = "Ao registrar o empréstimo, a reserva é marcada como atendida.";
  }
  let reservations = await fetchReservations();
  const render = () => renderReservations(reservations, current);
  render();
  document.querySelector("#reservationSearch").addEventListener("input", render);
  document.querySelector("#reservationFilter").addEventListener("change", render);
  document.querySelector("#reservationsTable").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-cancel-reservation]");
    if (!button || !window.confirm("Cancelar esta reserva?")) return;
    button.disabled = true;
    try {
      const { error } = await supabase.rpc("cancelar_reserva", {
        p_reserva_id: Number(button.dataset.cancelReservation),
      });
      if (error) throw error;
      reservations = await fetchReservations();
      render();
      showMessage("Reserva cancelada.", "success");
    } catch (error) {
      button.disabled = false;
      showMessage(friendlyError(error));
    }
  });
  if (current.isReader) renderReaderLoans(await fetchLoans());
}

function renderLoans(loans) {
  const search = document.querySelector("#loanSearch").value.trim().toLocaleLowerCase("pt-BR");
  const filter = document.querySelector("#loanFilter").value;
  const filtered = loans.filter((loan) => {
    const matchesText = [loan.livro?.titulo, loan.livro?.autor, loan.leitor?.nome, loan.leitor?.turma]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(search));
    if (!matchesText) return false;
    if (filter === "ativos") return !loan.devolvido_em;
    if (filter === "devolvidos") return Boolean(loan.devolvido_em);
    if (filter === "atrasados") return isOverdue(loan);
    return true;
  });
  const table = document.querySelector("#loansTable");
  if (!filtered.length) {
    table.innerHTML = '<tr><td colspan="6" class="empty-cell">Nenhum empréstimo encontrado.</td></tr>';
    return;
  }
  table.innerHTML = filtered.map((loan) => `<tr>
    <td><div class="book-cell">${coverMarkup(loan.livro, "book-cell-cover")}<span><strong>${escapeHtml(loan.livro?.titulo || "Livro removido")}</strong><small>${escapeHtml(loan.livro?.autor || "")}</small></span></div></td>
    <td><strong>${escapeHtml(loan.leitor?.nome || "—")}</strong><br><small class="muted">${roleLabel(loan.leitor?.tipo)}${loan.leitor?.turma ? ` · ${escapeHtml(loan.leitor.turma)}` : ""}</small></td>
    <td>${formatDate(loan.data_emprestimo)}</td><td>${formatDate(loan.data_devolucao)}</td><td>${loanStatus(loan)}</td>
    <td>${loan.devolvido_em ? "—" : `<button class="button button-primary button-small" type="button" data-return-loan="${loan.id}">Registrar devolução</button>`}</td>
  </tr>`).join("");
}

async function initEmprestimos(current) {
  if (!current.isStaff) {
    window.location.replace("reservas.html");
    return;
  }
  let loans = await fetchLoans();
  const render = () => renderLoans(loans);
  render();
  document.querySelector("#loanSearch").addEventListener("input", render);
  document.querySelector("#loanFilter").addEventListener("change", render);
  document.querySelector("#loansTable").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-return-loan]");
    if (!button || !window.confirm("Confirmar a devolução deste livro?")) return;
    button.disabled = true;
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

async function fetchUsers() {
  const { data, error } = await supabase
    .from("perfis")
    .select("id,nome,email,turma,tipo,criado_em")
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

function renderUsers(users) {
  const search = document.querySelector("#userSearch").value.trim().toLocaleLowerCase("pt-BR");
  const filtered = users.filter((user) =>
    [user.nome, user.email, user.turma, roleLabel(user.tipo)]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(search)),
  );
  document.querySelector("#userCount").textContent = `${filtered.length} usuário${filtered.length === 1 ? "" : "s"}`;
  const table = document.querySelector("#usersTable");
  if (!filtered.length) {
    table.innerHTML = '<tr><td colspan="4" class="empty-cell">Nenhum usuário encontrado.</td></tr>';
    return;
  }
  table.innerHTML = filtered.map((user) => {
    const control = user.tipo === "admin"
      ? '<span class="status admin">Administrador protegido</span>'
      : `<select class="compact-select role-select" data-user-role-id="${user.id}" aria-label="Perfil de ${escapeHtml(user.nome)}">
          <option value="aluno" ${user.tipo === "aluno" ? "selected" : ""}>Aluno</option>
          <option value="professor" ${user.tipo === "professor" ? "selected" : ""}>Professor</option>
          <option value="bibliotecaria" ${user.tipo === "bibliotecaria" ? "selected" : ""}>Bibliotecária</option>
        </select>`;
    return `<tr><td><strong>${escapeHtml(user.nome)}</strong><br><small class="muted">Criado em ${formatDateTime(user.criado_em)}</small></td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.turma || "—")}</td><td>${control}</td></tr>`;
  }).join("");
}

async function initUsuarios(current) {
  if (!current.isAdmin) {
    window.location.replace("painel.html");
    return;
  }
  let users = await fetchUsers();
  const render = () => renderUsers(users);
  render();
  document.querySelector("#userSearch").addEventListener("input", render);
  document.querySelector("#usersTable").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-user-role-id]");
    if (!select) return;
    const user = users.find((item) => item.id === select.dataset.userRoleId);
    const oldRole = user?.tipo;
    select.disabled = true;
    clearMessage();
    try {
      const { error } = await supabase.rpc("definir_tipo_usuario", {
        p_usuario_id: select.dataset.userRoleId,
        p_tipo: select.value,
      });
      if (error) throw error;
      if (user) user.tipo = select.value;
      showMessage(`Acesso alterado para ${roleLabel(select.value)}.`, "success");
    } catch (error) {
      select.value = oldRole;
      showMessage(friendlyError(error));
    } finally {
      select.disabled = false;
    }
  });
}

const initializers = {
  login: initLogin,
  cadastro: initCadastro,
  painel: () => initProtected(initPainel),
  acervo: () => initProtected(initAcervo),
  reservas: () => initProtected(initReservas),
  emprestimos: () => initProtected(initEmprestimos),
  usuarios: () => initProtected(initUsuarios),
  sobre: () => initProtected(async () => {}),
};

initializers[page]?.();
