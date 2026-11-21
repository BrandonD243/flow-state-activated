/* ==========================================================================
   Flow State Activated: interactions
   1. Hover breathing: [data-breathe] elements breathe while hovered
   2. Cursor aura: a soft glow that drifts after the pointer
   3. Header state, breath rail progress and current section
   4. Scroll reveal
   5. Contact form (placeholder)
   ========================================================================== */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ------------------------------------------------------------------------
     1. Hover breathing
     Each hovered element gets a --breath custom property between 0 and 1.
     It leans in as soon as you arrive, then breathes: a slow inhale, a
     longer exhale. When you leave, it settles back to rest gradually.
     ------------------------------------------------------------------------ */

  const INHALE = 2600;          // ms
  const EXHALE = 3400;          // ms
  const CYCLE = INHALE + EXHALE;
  const ARRIVE_LEVEL = 0.25;    // how far an element leans in the moment you arrive
  const ENTER_RATE = 1 / 260;   // how quickly it wakes up
  const LEAVE_RATE = 1 / 900;   // how slowly it settles back down

  const easeInOut = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
  const breathAt = (ms) => {
    const t = ms % CYCLE;
    return t < INHALE ? easeInOut(t / INHALE) : 1 - easeInOut((t - INHALE) / EXHALE);
  };

  const states = new WeakMap();
  const active = new Set();
  let frame = 0;
  let lastTime = 0;

  function step(now) {
    const dt = Math.min(now - lastTime, 50);
    lastTime = now;

    for (const el of active) {
      const s = states.get(el);
      const engaged = s.hover || s.focus;
      const rate = engaged ? ENTER_RATE : LEAVE_RATE;
      s.amp += ((engaged ? 1 : 0) - s.amp) * (1 - Math.exp(-dt * rate));
      s.t += dt;

      if (!engaged && s.amp < 0.003) {
        s.amp = 0;
        s.t = 0;
        el.style.removeProperty('--breath');
        active.delete(el);
        continue;
      }

      const value = s.amp * (ARRIVE_LEVEL + (1 - ARRIVE_LEVEL) * breathAt(s.t));
      el.style.setProperty('--breath', value.toFixed(4));
    }

    frame = active.size ? requestAnimationFrame(step) : 0;
  }

  function engage(el, key, on) {
    let s = states.get(el);
    if (!s) {
      s = { hover: false, focus: false, amp: 0, t: 0 };
      states.set(el, s);
    }
    s[key] = on;
    active.add(el);
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(step);
    }
  }

  // Exposed so elements added later (e.g. new workshop cards) can opt in.
  function bindBreathing(root = document) {
    if (reduceMotion) return;
    root.querySelectorAll('[data-breathe]:not([data-breathe-bound])').forEach((el) => {
      el.setAttribute('data-breathe-bound', '');
      el.addEventListener('pointerenter', () => engage(el, 'hover', true));
      el.addEventListener('pointerleave', () => engage(el, 'hover', false));
      el.addEventListener('focusin', (e) => {
        if (e.target.matches(':focus-visible')) engage(el, 'focus', true);
      });
      el.addEventListener('focusout', () => engage(el, 'focus', false));
    });
  }

  bindBreathing();
  window.FlowState = { bindBreathing };

  /* ------------------------------------------------------------------------
     2. Cursor aura
     ------------------------------------------------------------------------ */

  const aura = document.querySelector('.aura');

  if (aura && finePointer && !reduceMotion) {
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0, prev = 0;

    const follow = (now) => {
      const dt = Math.min(now - prev, 50);
      prev = now;
      const k = 1 - Math.exp(-dt / 240);
      x += (tx - x) * k;
      y += (ty - y) * k;
      aura.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(follow) : 0;
    };

    window.addEventListener('pointermove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!aura.classList.contains('is-visible')) {
        x = tx;
        y = ty;
        aura.classList.add('is-visible');
      }
      if (!raf) {
        prev = performance.now();
        raf = requestAnimationFrame(follow);
      }
    }, { passive: true });

    document.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget) aura.classList.remove('is-visible');
    });
  }

  /* ------------------------------------------------------------------------
     3. Header state, breath rail progress, current section
     ------------------------------------------------------------------------ */

  const header = document.querySelector('.site-header');
  const rail = document.querySelector('.breath-rail');
  let scrollQueued = false;

  const onScroll = () => {
    scrollQueued = false;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
    if (rail) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      rail.style.setProperty('--progress', max > 0 ? (window.scrollY / max).toFixed(4) : '0');
    }
  };

  window.addEventListener('scroll', () => {
    if (!scrollQueued) {
      scrollQueued = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  onScroll();

  const navLinks = [...document.querySelectorAll('.breath-rail a, .site-nav a')];
  const setCurrent = (id) => {
    navLinks.forEach((a) => {
      if (a.hash === `#${id}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };

  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setCurrent(entry.target.id);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    document.querySelectorAll('main section[id]').forEach((s) => sectionObserver.observe(s));
  }

  /* ------------------------------------------------------------------------
     4. Scroll reveal
     ------------------------------------------------------------------------ */

  const revealables = document.querySelectorAll('[data-reveal]');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach((el) => el.classList.add('is-revealed'));
  } else {
    const revealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    revealables.forEach((el) => revealObserver.observe(el));
  }

  /* ------------------------------------------------------------------------
     5. Contact form
     TODO: connect to a form service (Formspree, Netlify Forms, etc.) or your
     own endpoint. For now it just shows a thank-you message.
     ------------------------------------------------------------------------ */

  const form = document.querySelector('.contact');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      form.reset();
      form.querySelector('.contact__thanks').hidden = false;
    });
  }

  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
})();
