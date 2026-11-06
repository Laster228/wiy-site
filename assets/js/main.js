/*
 * WIY — layout partials and page behaviour.
 * Header / footer / contact are rendered here so every page shares one source;
 * in the CMS they become theme partials.
 */
(function () {
  const { domains, products, news, bySlug, byDomain } = window.WIY;
  const body = document.body;
  const qs = new URLSearchParams(location.search);

  /* ---------- Icons (hollow, single-weight — QS icon style) ---------- */
  const I = {
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 12h17M14 6l6 6-6 6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M21 12H4M10 6l-6 6 6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3v13M6 10l6 6 6-6M4 21h16"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  };
  const url = (p) => `product.html?p=${p.slug}`;
  const domUrl = (id) => `products.html#${id}`;
  const esc = (s) => String(s).replace(/&(?!amp;)/g, '&amp;');

  /* ---------- Header ---------- */
  function header() {
    const megaProducts = (d) => `
      <div class="mega"><div class="container mega__in">
        <div class="mega__intro">
          <h3>${d.title}</h3><p>${d.lead}</p>
          <a class="more more--u" href="${domUrl(d.id)}">All ${d.title.toLowerCase()} systems ${I.arrow}</a>
        </div>
        <div class="mega__items">
          ${byDomain(d.id).map((p) => `
            <a class="mega-item" href="${url(p)}">
              <div class="mega-item__img"><img ${p.imageCover ? 'class="cover"' : ''} src="${p.image}" alt="" loading="lazy"></div>
              <div><b>${p.name}</b><span>${p.role}</span></div>
            </a>`).join('')}
        </div>
      </div></div>`;

    const company = `
      <div class="mega"><div class="container mega__in">
        <div class="mega__intro">
          <h3>Company</h3>
          <p>WIY Advanced Aerial Systems develops combat-proven unmanned systems for air defence and tactical operations. A Quantum Systems Group company.</p>
        </div>
        <div class="mega__list">
          ${[['About us', 'company.html'], ['Certifications', 'company.html#credentials'], ['Training & support', 'company.html#support'],
             ['News', 'news.html'], ['Careers', 'careers.html'], ['Partners', 'company.html#partners'],
             ['Contact us', 'contacts.html'], ['Talk to sales', 'contacts.html#contact'], ['Quantum Systems Group', 'https://quantum-systems.com']]
            .map(([t, h]) => `<a href="${h}">${esc(t)} ${I.arrow}</a>`).join('')}
        </div>
      </div></div>`;

    const cur = body.dataset.domain;
    const html = `
      <header class="hdr" id="hdr">
        <div class="container hdr__in">
          <a class="brand" href="index.html" aria-label="WIY Drones — home">
            <img class="logo-l" src="assets/img/logo-white.svg" alt="WIY Drones" width="79" height="30">
            <img class="logo-d" src="assets/img/logo-black.svg" alt="" width="79" height="30">
            <span class="brand__sep" aria-hidden="true"></span>
            <span class="brand__tag">Protecting<br>the sky.</span>
          </a>
          <ul class="menu">
            ${domains.map((d) => `<li data-mega><a class="menu__a" href="${domUrl(d.id)}" ${cur === d.id ? 'aria-current="page"' : ''}>${d.name}</a>${megaProducts(d)}</li>`).join('')}
          </ul>
          <div class="hdr__right">
            <ul class="menu"><li data-mega><a class="menu__a" href="company.html">Company</a>${company}</li></ul>
            <a class="icon-btn" href="products.html" aria-label="Search products">${I.search}</a>
            <button class="lang-btn" type="button" aria-label="Language">${I.globe}EN</button>
            <button class="burger" type="button" aria-label="Menu" aria-expanded="false"><i></i></button>
          </div>
        </div>
      </header>
      <nav class="mnav" aria-label="Mobile">
        ${domains.map((d) => `
          <details><summary>${d.title}${I.plus}</summary><ul>
            ${byDomain(d.id).map((p) => `<li><a href="${url(p)}">${p.name}<span>${p.role}</span></a></li>`).join('')}
            <li><a href="${domUrl(d.id)}"><b>All ${d.title.toLowerCase()}</b></a></li>
          </ul></details>`).join('')}
        <details><summary>Company${I.plus}</summary><ul>
          <li><a href="company.html">About us</a></li><li><a href="news.html">News</a></li>
          <li><a href="careers.html">Careers</a></li><li><a href="contacts.html">Contact</a></li>
        </ul></details>
        <a class="btn" href="contacts.html#contact">Talk to sales ${I.arrow}</a>
      </nav>`;
    document.getElementById('site-header').outerHTML = html;
  }

  function bindHeader() {
    const hdr = document.getElementById('hdr');
    const items = hdr.querySelectorAll('[data-mega]');
    let t;
    const close = () => { items.forEach((i) => i.classList.remove('is-open')); hdr.classList.remove('is-open'); };
    items.forEach((li) => {
      li.addEventListener('mouseenter', () => { clearTimeout(t); close(); li.classList.add('is-open'); hdr.classList.add('is-open'); });
      li.addEventListener('mouseleave', () => { t = setTimeout(close, 140); });
      li.addEventListener('focusin', () => { close(); li.classList.add('is-open'); hdr.classList.add('is-open'); });
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && close());

    const burger = hdr.querySelector('.burger');
    burger.addEventListener('click', () => {
      const open = document.documentElement.classList.toggle('is-nav-open');
      hdr.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });

    // Solid on scroll, hide on scroll-down / show on scroll-up (QS behaviour)
    let last = 0;
    const onScroll = () => {
      const y = scrollY;
      hdr.classList.toggle('is-solid', y > 40);
      const hide = y > last && y > 400 && !hdr.classList.contains('is-open');
      hdr.classList.toggle('is-hidden', hide);
      last = y;
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Footer ---------- */
  function footer() {
    const social = {
      LinkedIn: 'M4 9h3v11H4zM5.5 4a1.75 1.75 0 110 3.5 1.75 1.75 0 010-3.5zM10 9h2.9v1.6c.5-.9 1.6-1.8 3.3-1.8 3.4 0 4 2.2 4 5.1V20h-3v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V20h-3.3z',
      YouTube: 'M21.6 7.2a2.5 2.5 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 002.4 7.2 26 26 0 002 12a26 26 0 00.4 4.8 2.5 2.5 0 001.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 001.8-1.8A26 26 0 0022 12a26 26 0 00-.4-4.8zM10 15V9l5.2 3z',
      Telegram: 'M21.5 4.5L2.9 11.6c-1.3.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5zM9.4 14.2l9-5.7-7 6.6-.3 3z',
      Instagram: 'M12 7.3A4.7 4.7 0 1012 16.7 4.7 4.7 0 0012 7.3zm0 7.7a3 3 0 110-6 3 3 0 010 6zM17 6a1.1 1.1 0 100 2.2A1.1 1.1 0 0017 6zM16 3H8a5 5 0 00-5 5v8a5 5 0 005 5h8a5 5 0 005-5V8a5 5 0 00-5-5zm3.2 13a3.2 3.2 0 01-3.2 3.2H8A3.2 3.2 0 014.8 16V8A3.2 3.2 0 018 4.8h8A3.2 3.2 0 0119.2 8z',
      X: 'M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.5z',
      Facebook: 'M14 8h3V4h-3c-2.8 0-4.5 1.7-4.5 4.5V11H7v4h2.5v7h4v-7H16l.5-4h-3V8.8c0-.5.3-.8.5-.8z',
    };
    document.getElementById('site-footer').outerHTML = `
      <footer class="ftr">
        <div class="container">
          <div class="ftr__top">
            <div class="ftr__brand">
              <img src="assets/img/logo-white.svg" alt="WIY Drones" width="95" height="36">
              <p>WIY Advanced Aerial Systems — Ukrainian developer and manufacturer of interceptor, reconnaissance and strike UAVs and ground control systems.</p>
              <a class="ftr__group" href="https://quantum-systems.com" target="_blank" rel="noopener">A company of <img src="assets/img/qs-logo-white.svg" alt="Quantum Systems"></a>
            </div>
            <div><h4>Products</h4><ul>
              ${domains.map((d) => `<li><a href="${domUrl(d.id)}">${d.title}</a></li>`).join('')}
              <li><a href="products.html">All products</a></li>
            </ul></div>
            <div><h4>Company</h4><ul>
              <li><a href="company.html">About us</a></li><li><a href="news.html">News</a></li>
              <li><a href="careers.html">Careers</a></li><li><a href="company.html#credentials">Certifications</a></li>
              <li><a href="company.html#support">Training &amp; support</a></li>
            </ul></div>
            <div><h4>Get in contact</h4><ul>
              <li><a href="contacts.html#contact">Talk to sales</a></li><li><a href="contacts.html">Contact us</a></li>
              <li><a href="mailto:support@wiy.llc">support@wiy.llc</a></li>
            </ul></div>
          </div>
          <div class="ftr__news">
            <div class="soc">${Object.entries(social).map(([n, d]) => `<a href="#" aria-label="${n}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg></a>`).join('')}</div>
            <form onsubmit="event.preventDefault();this.querySelector('input').value='';this.querySelector('input').placeholder='Thank you for subscribing'">
              <label class="sr-only" for="nl">Email</label>
              <input id="nl" type="email" placeholder="Subscribe to our newsletter" required>
              <button type="submit">Subscribe ${I.arrow}</button>
            </form>
          </div>
          <div class="ftr__bottom">
            <span>© ${new Date().getFullYear()} WIY Advanced Aerial Systems LLC. All rights reserved.</span>
            <nav><a href="#">ISO certified</a><a href="#">NCAGE A44NJ</a><a href="#">Legal notice</a><a href="#">Privacy policy</a><a href="#">Terms</a></nav>
          </div>
          <div class="ftr__mark" aria-hidden="true"><img src="assets/img/logo-white.svg" alt=""></div>
        </div>
      </footer>`;
  }

  /* ---------- Contact partial ---------- */
  function contact(el) {
    el.outerHTML = `
      <section class="section bg-black" id="contact">
        <div class="container contact">
          <div class="contact__info">
            <span class="kicker">Talk to sales</span>
            <h2 class="t-h1">${el.dataset.title || 'Get in contact'}</h2>
            <p class="t-lead t-body">Leave your details and a short description of your request. We’ll send the latest product catalogue, prepare a commercial offer with a recommended configuration, and advise on deployment, training and service.</p>
            <dl>
              <div><dt>Sales</dt><dd><a href="mailto:wiydrones@gmail.com">wiydrones@gmail.com</a></dd></div>
              <div><dt>Support</dt><dd><a href="mailto:support@wiy.llc">support@wiy.llc</a></dd></div>
              <div><dt>NCAGE code</dt><dd>A44NJ</dd></div>
            </dl>
            <div class="verify">${I.shield}<span>Due to wartime conditions we verify every party we engage with. Please introduce yourself and your organisation — this is required for security.</span></div>
          </div>
          <form class="form" data-contact novalidate>
            <div class="form form__fields">
              <div class="form__row">
                <div class="field"><label for="f1">Full name *</label><input id="f1" name="name" required autocomplete="name"></div>
                <div class="field"><label for="f2">Organisation / unit *</label><input id="f2" name="org" required autocomplete="organization"></div>
              </div>
              <div class="form__row">
                <div class="field"><label for="f3">Email *</label><input id="f3" type="email" name="email" required autocomplete="email"></div>
                <div class="field"><label for="f4">Phone / Signal</label><input id="f4" type="tel" name="phone" autocomplete="tel"></div>
              </div>
              <div class="form__row">
                <div class="field"><label for="f5">I am</label><select id="f5" name="type">
                  <option>Defence forces unit</option><option>Government / procurement agency</option><option>Foreign MoD / armed forces</option><option>Foundation / volunteer organisation</option><option>Industry partner</option><option>Media</option></select></div>
                <div class="field"><label for="f6">System of interest</label><select id="f6" name="product"><option value="">Not decided yet</option>
                  ${domains.map((d) => `<optgroup label="${d.title}">${byDomain(d.id).map((p) => `<option value="${p.slug}">${p.name}</option>`).join('')}</optgroup>`).join('')}
                  <option value="custom">Custom / special project</option></select></div>
              </div>
              <div class="field"><label for="f7">Introduce yourself and your request *</label><textarea id="f7" name="message" required></textarea></div>
              <label class="check"><input type="checkbox" required> I agree to the processing of my personal data to respond to this request.</label>
              <div><button class="btn btn--light" type="submit">Send request ${I.arrow}</button></div>
            </div>
            <div class="form__ok" role="status"><b>Thank you.</b> Your request has been received — our team will contact you after verification.</div>
          </form>
        </div>
      </section>`;
  }
  function bindForms() {
    document.querySelectorAll('[data-contact]').forEach((f) => f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (f.reportValidity()) f.classList.add('is-sent');
    }));
  }

  /* ---------- Components ---------- */
  const tags = (p, glass) => `${p.status ? `<span class="tag ${glass ? 'tag--glass' : ''} ${p.status === 'In service' ? 'tag--live' : ''}">${p.status}</span>` : ''}${p.nsn ? `<span class="tag ${glass ? 'tag--glass' : ''}">NATO NSN</span>` : ''}`;
  const card = (p) => `
    <a class="card rv" href="${url(p)}">
      <div class="card__img"><div class="card__tags">${tags(p)}</div><img ${p.imageCover ? 'style="width:100%;height:100%;object-fit:cover;mix-blend-mode:normal"' : ''} src="${p.image}" alt="WIY ${p.name}" loading="lazy"></div>
      <div class="card__body">
        <div class="card__name">${p.name}${I.arrow}</div>
        <div class="card__role">${p.role}</div>
        <div class="card__kpis">${p.kpis.slice(0, 3).map(([v, u, l]) => `<div><b>${v}${u ? ' ' + u : ''}</b>${l}</div>`).join('')}</div>
      </div>
    </a>`;
  const post = (n) => `
    <a class="post rv" href="news.html">
      <div class="post__img"><img src="${n.image}" alt="" loading="lazy"></div>
      <time>${n.date} · ${n.source}</time>
      <h3>${n.title}</h3>
      <span class="more">Read more ${I.arrow}</span>
    </a>`;

  /* ---------- Home slider ---------- */
  function slider(root) {
    const slides = [...root.querySelectorAll('.slide')];
    const tabs = [...root.querySelectorAll('.hero__tab')];
    const DUR = 7000;
    let i = 0, timer;
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
      tabs.forEach((t, k) => { t.classList.remove('is-active'); if (k === i) { void t.offsetWidth; t.classList.add('is-active'); } });
      root.classList.toggle('is-light', slides[i].classList.contains('slide--light'));
      document.getElementById('hdr')?.classList.toggle('on-light', slides[i].classList.contains('slide--light'));
      clearTimeout(timer); timer = setTimeout(() => go(i + 1), DUR);
    };
    root.style.setProperty('--dur', DUR + 'ms');
    tabs.forEach((t, k) => t.addEventListener('click', () => go(k)));
    go(0);
  }

  /* ---------- Rail controls ---------- */
  function rails() {
    document.querySelectorAll('[data-rail]').forEach((wrap) => {
      const rail = wrap.querySelector('.rail');
      wrap.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => {
        rail.scrollBy({ left: rail.clientWidth * 0.75 * +b.dataset.dir, behavior: 'smooth' });
      }));
    });
  }

  /* ---------- Catalogue ---------- */
  function catalog(root) {
    const tabsEl = document.getElementById('tabs');
    const all = [{ id: 'all', title: 'All systems' }, ...domains];
    tabsEl.innerHTML = all.map((d) => `<button type="button" role="tab" data-id="${d.id}">${d.title}<sup>${d.id === 'all' ? products.length : byDomain(d.id).length}</sup></button>`).join('');
    root.innerHTML = domains.map((d) => `
      <section class="cat-group" id="${d.id}" data-group="${d.id}">
        <div class="head"><div class="head__l"><span class="kicker">${d.name}</span><h2 class="t-h2">${d.title}</h2></div><p class="t-body">${d.lead}</p></div>
        <div class="grid-cards">${byDomain(d.id).map(card).join('')}</div>
      </section>`).join('');
    const apply = (id) => {
      tabsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
      root.querySelectorAll('[data-group]').forEach((g) => { g.hidden = id !== 'all' && g.dataset.group !== id; });
      body.dataset.domain = id;
    };
    tabsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      apply(b.dataset.id); history.replaceState(null, '', b.dataset.id === 'all' ? 'products.html' : '#' + b.dataset.id);
      reveal();
    });
    const fromHash = () => { const h = location.hash.slice(1); apply(domains.some((d) => d.id === h) ? h : 'all'); };
    addEventListener('hashchange', () => { fromHash(); reveal(); scrollTo({ top: 0 }); });
    fromHash();
  }

  /* ---------- Product page ---------- */
  function product(root) {
    const p = bySlug(qs.get('p')) || bySlug('strila');
    const d = domains.find((x) => x.id === p.domain);
    body.dataset.domain = d.id;
    document.title = `${p.name} — ${p.role} | WIY Drones`;
    const studio = !p.hero || p.heroStudio;
    if (studio) document.getElementById('hdr')?.classList.add('on-light');
    const heroImg = p.hero || p.image;
    const related = products.filter((x) => x.domain === p.domain && x.slug !== p.slug);
    const sections = [['overview', 'Overview'], ['capabilities', 'Capabilities'], ...(p.flagship ? [['mission', 'Mission profile']] : []), ['specs', 'Specifications']];

    root.innerHTML = `
      <section class="phero ${studio ? 'phero--studio' : ''}">
        <img src="${heroImg}" alt="WIY ${p.name}">
        <div class="phero__body"><div class="container">
          <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><a href="${domUrl(d.id)}">${d.title}</a><span>/</span><span>${p.name}</span></nav>
          <div class="phero__tags">${tags(p, !studio)}</div>
          <h1 class="t-hero">${p.name}</h1>
          <p class="t-h3" style="font-weight:400;max-width:24ch">${p.headline}</p>
        </div></div>
      </section>

      <div class="subnav"><div class="container">
        <span class="subnav__name">${p.name}</span>
        <nav aria-label="On this page">${sections.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</nav>
        <a class="btn btn--sm" href="#contact">Request information</a>
      </div></div>

      <section class="section" id="overview">
        <div class="container intro">
          <h2 class="t-h2 rv balance">${p.tagline}</h2>
          <div class="intro__text rv rv-d1">${p.intro.map((t) => `<p>${t}</p>`).join('')}</div>
        </div>
      </section>

      ${p.flagship ? `<div class="bleed bleed--plain" data-parallax><img src="assets/img/photo/strila-field-antenna.webp" alt="STRILA interceptors on a snow field" loading="lazy"></div>` : ''}

      <section class="section ${p.flagship ? '' : 'pt-0'}">
        <div class="container">
          <div class="bignum">${p.kpis.map(([v, u, l], k) => `<div class="rv rv-d${k}"><strong>${v}${u ? `<small>${u}</small>` : ''}</strong><span>${l}</span></div>`).join('')}</div>
        </div>
      </section>

      ${p.story ? `
      <section class="section bg-gray">
        <div class="container split">
          <div class="split__media rv"><img src="${p.story.image}" alt="" loading="lazy"></div>
          <div class="split__body rv rv-d1"><h2 class="t-h1">${p.story.title}</h2><p class="t-lead t-body">${p.story.text}</p></div>
        </div>
      </section>` : ''}

      <section class="section" id="capabilities">
        <div class="container split" style="align-items:start">
          <div class="split__body" style="position:sticky;top:96px">
            <span class="kicker">Capabilities</span>
            <h2 class="t-h1">Key capabilities of ${p.name}</h2>
          </div>
          <div class="acc rv">
            ${p.capabilities.map(([t, x], k) => `<details ${k === 0 ? 'open' : ''}><summary>${t}${I.plus}</summary><div class="acc__body">${x}</div></details>`).join('')}
          </div>
        </div>
      </section>

      ${p.flagship ? `
      <section class="section bg-black" id="mission">
        <div class="container">
          <div class="head"><div class="head__l"><span class="kicker">Mission profile</span><h2 class="t-h1">Intercepting a loitering munition attack</h2></div>
            <p class="t-body">An integrated radar detects a Shahed threat at 8–10 km. STRILA navigates automatically toward the target sector, then the operator assumes manual control for a precise kinetic intercept.</p></div>
          <div class="diagram rv"><img src="assets/img/photo/mission-diagram.webp" alt="Mission diagram: detection, interception, or loiter and land" loading="lazy"></div>
          <ol class="ticks mt-l" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 32px;border:0">
            ${[['Detect', 'Radar detects and tracks the threat at 8–10 km.'], ['Launch', 'Ground launch — no rail, no fixed infrastructure.'], ['Cue', 'Semi-autonomous flight with OSD bearing, altitude and velocity.'], ['Intercept', 'Operator identifies on EO/IR and executes the kinetic kill.']]
              .map(([t, x], k) => `<li style="border-top:1px solid var(--line-inv)"><b>0${k + 1}</b><span><span style="color:#fff;font-weight:500">${t}</span><br>${x}</span></li>`).join('')}
          </ol>
        </div>
      </section>
      <section class="section">
        <div class="container split split--rev">
          <div class="split__media rv"><img src="assets/img/photo/gcs-osd.webp" alt="WIY ground control station interface" loading="lazy"></div>
          <div class="split__body rv rv-d1">
            <span class="kicker">Ground control station</span>
            <h2 class="t-h1">One platform. Total operational control.</h2>
            <p class="t-lead t-body">Purpose-built for STRILA combat operations: an antenna module and a protected control case with two monitors. Radar integration directs the interceptor automatically; OSD prompts show bearing, altitude and velocity in real time.</p>
            <a class="more more--u" href="product.html?p=wiy-gcs">Discover WIY GCS ${I.arrow}</a>
          </div>
        </div>
      </section>` : ''}

      ${p.gallery ? `<section class="section pt-0"><div class="container gallery">${p.gallery.map((g) => `<figure class="rv"><img src="${g}" alt="" loading="lazy"></figure>`).join('')}</div></section>` : ''}

      <section class="section bg-gray" id="specs">
        <div class="container specs">
          <div class="rv">
            <span class="kicker">Technical specification</span>
            <h2 class="t-h1 mt-s">${p.name} at a glance</h2>
            <div class="dl">
              <a href="#contact"><b>${p.name} tech sheet (EN)</b><span>PDF ${I.download}</span></a>
              <a href="#contact"><b>${p.name} brochure</b><span>PDF ${I.download}</span></a>
            </div>
          </div>
          <dl class="spec-table rv rv-d1">${p.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        </div>
      </section>

      ${related.length ? `
      <section class="section" data-rail>
        <div class="container">
          <div class="head"><div class="head__l"><span class="kicker">${d.name}</span><h2 class="t-h2">Explore more ${d.title.toLowerCase()} systems</h2></div>
            <div class="rail-ctrl"><button data-dir="-1" aria-label="Previous">${I.left}</button><button data-dir="1" aria-label="Next">${I.arrow}</button></div></div>
          <div class="rail">${related.map(card).join('')}</div>
        </div>
      </section>` : ''}`;

    const sel = document.querySelector('#f6'); if (sel) sel.value = p.slug;
  }

  /* ---------- Sub-nav active state ---------- */
  function subnav() {
    const links = [...document.querySelectorAll('.subnav nav a')];
    if (!links.length) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) links.forEach((l) => l.classList.toggle('is-active', l.hash === '#' + e.target.id));
    }), { rootMargin: '-40% 0px -55% 0px' });
    links.forEach((l) => { const s = document.querySelector(l.hash); if (s) io.observe(s); });
  }

  /* ---------- Reveal + parallax ---------- */
  let io;
  function reveal() {
    io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.rv:not(.in)').forEach((el) => io.observe(el));
  }
  function parallax() {
    const els = [...document.querySelectorAll('[data-parallax] > img')];
    if (!els.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tick = () => {
      els.forEach((img) => {
        const r = img.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
        img.style.transform = `translate3d(0, ${p * -8}%, 0)`;
      });
    };
    addEventListener('scroll', () => requestAnimationFrame(tick), { passive: true });
    tick();
  }

  /* ---------- Init ---------- */
  header();
  footer();
  document.querySelectorAll('[data-contact-section]').forEach(contact);

  const el = (id) => document.getElementById(id);
  if (el('catalog')) catalog(el('catalog'));
  if (el('product')) product(el('product'));
  if (el('home-products')) el('home-products').innerHTML = products.filter((p) => p.domain !== 'gcs').map(card).join('');
  if (el('home-news')) el('home-news').innerHTML = news.slice(0, 3).map(post).join('');
  if (el('news-list')) el('news-list').innerHTML = news.map(post).join('');
  if (el('hero')) slider(el('hero'));

  bindHeader();
  bindForms();
  rails();
  subnav();
  reveal();
  parallax();
})();
