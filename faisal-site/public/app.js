const theme=document.querySelector('#theme');function setTheme(dark){document.body.classList.toggle('dark',dark);theme.setAttribute('aria-label',dark?'Aktifkan mode terang':'Aktifkan mode gelap')}let dark=matchMedia('(prefers-color-scheme: dark)').matches;try{const saved=localStorage.getItem('theme');if(saved)dark=saved==='dark'}catch{}setTheme(dark);theme.addEventListener('click',()=>{dark=!dark;setTheme(dark);try{localStorage.setItem('theme',dark?'dark':'light')}catch{}});const menu=document.querySelector('#menu'),nav=document.querySelector('#nav');menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});document.addEventListener('keydown',e=>{if(e.key==='Escape'){nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}});const search=document.querySelector('#search'),category=document.querySelector('#category');if (search) {
  const results = document.querySelector('#results');
  const cards = [...results.querySelectorAll('.card')];
  const more = document.querySelector('#study-more');
  const step = Number(results.dataset.pageSize) || cards.length || 1;
  let limit = step;
  function filter() {
    const query = search.value.trim().toLocaleLowerCase('id');
    let count = 0;
    for (const card of cards) {
      const matches = (!category.value || card.dataset.category === category.value)
        && (card.dataset.search + ' ' + card.dataset.category).toLocaleLowerCase('id').includes(query);
      card.hidden = !matches || ++count > limit;
    }
    document.querySelector('#empty').hidden = count > 0;
    document.querySelector('#count').textContent = count > limit
      ? limit + ' dari ' + count + ' hasil' : count + ' hasil';
    if (more) more.hidden = count <= limit;
  }
  function reset() { limit = step; filter(); }
  function revealLinkedCard() {
    const target = cards.find(card => card.id && '#' + card.id === location.hash);
    if (!target) return;
    search.value = '';
    category.value = '';
    limit = Math.max(limit, cards.indexOf(target) + 1);
    filter();
    target.scrollIntoView({ block: 'start' });
  }
  search.addEventListener('input', reset);
  category.addEventListener('change', reset);
  if (more) {
    more.addEventListener('click', () => {
      const previous = cards.filter(card => !card.hidden).length;
      limit += step;
      filter();
      const next = cards.filter(card => !card.hidden)[previous];
      if (next) {
        next.tabIndex = -1;
        next.focus();
      }
    });
    window.addEventListener('hashchange', revealLinkedCard);
  }
  filter();
  if (more) revealLinkedCard();
}
// Compatibility for old bookmarks, with a strict allowlist.
const old=location.hash.slice(1);if(['home','journal','shop','about'].includes(old))location.replace(old==='home'?'/':'/'+old+'/');else if(/^(article|product)\/[a-z0-9-]+$/.test(old)){const [kind,id]=old.split('/');location.replace('/'+(kind==='article'?'journal':'shop')+'/'+id+'/')}
