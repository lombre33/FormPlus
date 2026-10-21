document.getElementById('widget-url').textContent = new URL('poc/widget.html', location.href).href;
const input = document.getElementById('u'), out = document.getElementById('out');
// Le lien du formulaire est placé dans le fragment (#) : il reste dans le navigateur et n'est jamais envoyé à l'hébergeur de la page.
const build = () => new URL('poc/public-form.html#form=' + encodeURIComponent(input.value.trim()), location.href).href;
input.addEventListener('input', () => { out.textContent = input.value ? build() : 'poc/public-form.html#form=…'; });
document.getElementById('go').addEventListener('submit', (e) => { e.preventDefault(); if (input.value) location.href = build(); });
