// A cancel is irreversible (the room goes back to everyone), so ask first.
for (const form of document.querySelectorAll<HTMLFormElement>("form[data-confirm]")) {
  form.addEventListener("submit", (event) => {
    if (!confirm(form.dataset.confirm ?? "Are you sure?")) event.preventDefault();
  });
}
